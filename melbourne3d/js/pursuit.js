// A car tailing the player (a mission's pursuer): it drives the route the player actually drove (a trail of points
// dropped every few metres), so it never needs the AI road network and can't cut through buildings, and it works in
// any suburb. It slows for the bends ahead and stops for traffic in front of it, keeps a gap behind the player, and is
// "lost" once the player stays far enough clear for long enough (missions.js decides that from distance()).
import * as THREE from 'three/webgpu';

const CRUMB = 3; // metres between trail points
const GAP = 18; // how close it follows (metres of trail)
const STOP = 8; // never closer than this

export function createPursuer({ scene, controllerManager, traffic = () => null }) {
  const models = new Map();
  async function loadModel(file, color) {
    if (!models.has(file)) {
      models.set(file, (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        return new GLTFLoader().loadAsync(new URL(`../../models/custom/${file}.json`, import.meta.url).href);
      })());
    }
    const gltf = await models.get(file);
    const body = gltf.scene.clone(true);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.material && o.material.name === 'Body') { o.material = o.material.clone(); o.material.color.setHex(color); }
    });
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.add(body);
    const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].map((n) => body.getObjectByName(n)).filter(Boolean);
    return { root, wheels };
  }

  let car = null; // { root, wheels }
  let active = false;
  let trail = []; // [{ x, y, z }]; trail[0] is the next point the pursuer drives to
  let pos = { x: 0, y: 0, z: 0 }, heading = 0, v = 0, vMax = 30;
  let token = 0;
  let parked = false; // waiting at the kerb until release()
  let gapStop = STOP; // this one's own closest following distance (police units keep different gaps)

  /** Start tailing from (x, z, heading): a dark sedan by default */
  async function start({ x, z, heading: h = 0, file = 'comodo', color = 0x2b2f33, speed = 30, wait = false, stopGap = STOP, seed = null }) {
    const my = ++token;
    active = true;
    parked = wait;
    pos = { x, y: 0, z };
    heading = h;
    v = 0;
    vMax = speed;
    trail = seed ? seed.map((q) => ({ x: q.x, y: q.y || 0, z: q.z })) : []; // (a unit starts on the route the player drove)
    gapStop = stopGap;
    if (seed && seed.length > 1) heading = Math.atan2(seed[1].x - seed[0].x, seed[1].z - seed[0].z);
    if (!car || car.file !== file) {
      if (car) scene.remove(car.root);
      const m = await loadModel(file, color);
      if (my !== token) return; // stopped (or restarted) while the model loaded
      car = { ...m, file };
    }
    car.root.visible = true;
    if (!car.root.parent) scene.add(car.root);
    place(0);
  }
  function stop() {
    token++;
    active = false;
    trail = [];
    if (car) car.root.visible = false;
  }

  const player = () => controllerManager.getActiveEntity();
  // metres of trail between the pursuer and the player
  function trailLength() {
    let L = 0, a = pos;
    for (const b of trail) { L += Math.hypot(b.x - a.x, b.z - a.z); a = b; }
    const p = player().position;
    return L + Math.hypot(p.x - a.x, p.z - a.z);
  }
  // the sharpest turn in the trail over the next `ahead` metres (radians)
  function bendAhead(ahead) {
    let L = 0, worst = 0, h0 = heading, a = pos;
    for (const b of trail) {
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < 0.01) continue;
      const h = Math.atan2(b.x - a.x, b.z - a.z);
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(h - h0), Math.cos(h - h0))));
      L += d;
      a = b;
      if (L > ahead) break;
    }
    return worst;
  }
  // how far ahead the nearest car in the traffic is, in the pursuer's path (Infinity: none within 30 m)
  function carAhead() {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best = Infinity;
    for (const c of traffic()?.cars || []) {
      if (c.driven || !(c.edge || c.parked)) continue;
      const dx = c.x - pos.x, dz = c.z - pos.z;
      const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along > 1 && along < 30 && side < 2.2) best = Math.min(best, along);
    }
    return best;
  }
  /** A parked pursuer pulls out: it starts following from here */
  function release() { parked = false; trail = []; v = 0; }
  function update(dt) {
    if (!active) return;
    if (parked) { collide(); return; } // waiting at the kerb: still solid
    // drop a trail point wherever the player has got to
    const p = player().position;
    const last = trail.length ? trail[trail.length - 1] : pos;
    if (Math.hypot(p.x - last.x, p.z - last.z) >= CRUMB) trail.push({ x: p.x, y: p.y, z: p.z });
    if (!car) return;
    // how fast: its top speed, less for a bend ahead, less again if it's caught up or there's a car in front
    const bend = bendAhead(Math.max(20, v * 1.6));
    let want = vMax * (1 - Math.min(0.72, bend / (Math.PI * 0.6)));
    const gap = trailLength();
    const mine = Math.abs(controllerManager.activeMode === 'car' ? player().speed || 0 : 0);
    // brake in time to stop STOP metres behind the player, and match their speed once in the gap
    want = Math.min(want, mine + Math.sqrt(2 * 8 * Math.max(0, gap - gapStop)));
    if (gap < GAP) want = Math.min(want, gap < (GAP + gapStop) / 2 ? Math.min(mine, 2) : mine);
    // and for a car in front: brake to stop 6 m behind it
    const ahead = carAhead();
    if (ahead < Infinity) want = Math.min(want, Math.sqrt(2 * 8 * Math.max(0, ahead - 6)));
    v += Math.max(-11 * dt, Math.min(5.5 * dt, want - v));
    v = Math.max(0, v);
    // drive along the trail
    let move = Math.min(v * dt, Math.max(0, gap - gapStop), Math.max(0, ahead - 5));
    while (move > 0 && trail.length) {
      const b = trail[0], d = Math.hypot(b.x - pos.x, b.z - pos.z);
      if (d <= move) { pos = { x: b.x, y: b.y, z: b.z }; trail.shift(); move -= d; continue; }
      pos = { x: pos.x + ((b.x - pos.x) / d) * move, y: pos.y + (b.y - pos.y) * (move / d), z: pos.z + ((b.z - pos.z) / d) * move };
      move = 0;
    }
    // face where it's going (smoothly)
    const t = trail[0];
    if (t && Math.hypot(t.x - pos.x, t.z - pos.z) > 0.5) {
      const h = Math.atan2(t.x - pos.x, t.z - pos.z);
      heading += Math.atan2(Math.sin(h - heading), Math.cos(h - heading)) * Math.min(1, dt * 6);
    }
    place(dt);
    collide();
  }
  // The pursuer is solid: the player's car can't drive through it. Two oriented boxes; if they overlap, the player is
  // pushed out along the axis of least overlap and loses speed in the hit (the pursuer just keeps to its trail)
  const PH = { L: 2.3, W: 0.95 }; // the pursuer's half length and width
  function collide() {
    if (!active || !car || !car.root.visible || controllerManager.activeMode !== 'car') return;
    const pe = player();
    const dx = pe.position.x - pos.x, dz = pe.position.z - pos.z;
    if (Math.abs(dx) > 7 || Math.abs(dz) > 7) return;
    const ph = pe.heading || 0, PL = 2.25, PW = 0.95;
    const axes = [[Math.sin(heading), Math.cos(heading)], [Math.cos(heading), -Math.sin(heading)], [Math.sin(ph), Math.cos(ph)], [Math.cos(ph), -Math.sin(ph)]];
    let best = Infinity, nx = 0, nz = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = axes[i];
      const rA = PH.L * Math.abs(ax * axes[0][0] + az * axes[0][1]) + PH.W * Math.abs(ax * axes[1][0] + az * axes[1][1]);
      const rB = PL * Math.abs(ax * axes[2][0] + az * axes[2][1]) + PW * Math.abs(ax * axes[3][0] + az * axes[3][1]);
      const d = dx * ax + dz * az, overlap = rA + rB - Math.abs(d);
      if (overlap <= 0) return; // a separating axis: no contact
      if (overlap < best) { best = overlap; const sg = d >= 0 ? 1 : -1; nx = ax * sg; nz = az * sg; }
    }
    pe.position.x += nx * best;
    pe.position.z += nz * best;
    if (pe.mesh) pe.mesh.position.copy(pe.position);
    // the part of the player's velocity going into the pursuer is lost (a bump, not a wall)
    const fx = Math.sin(ph), fz = Math.cos(ph);
    const into = -(nx * fx + nz * fz) * (pe.speed || 0);
    if (into > 0.5) pe.speed = (pe.speed || 0) * 0.55;
    pe.vx = (pe.vx || 0) + nx * Math.min(3, best * 4);
    pe.vz = (pe.vz || 0) + nz * Math.min(3, best * 4);
  }
  function place(dt) {
    if (!car) return;
    car.root.position.set(pos.x, Math.max(0, pos.y || 0), pos.z);
    car.root.rotation.set(0, heading, 0);
    for (const w of car.wheels) w.rotation.x += (v * dt) / 0.33;
  }

  return {
    start,
    stop,
    release,
    get parked() { return parked; },
    update,
    get active() { return active; },
    get position() { return pos; },
    get speed() { return v; },
    get heading() { return heading; },
    /** Straight-line distance to the player */
    distance() { const p = player().position; return Math.hypot(p.x - pos.x, p.z - pos.z); },
    /** Its footprint, for the player on foot to bump into */
    box() { return active && car ? { x: pos.x, z: pos.z, yaw: heading, halfL: 2.3, halfW: 0.95 } : null; }
  };
}
