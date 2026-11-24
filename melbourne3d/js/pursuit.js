// A car tailing the player (a mission's pursuer): it drives the route the player actually drove (a trail of points
// dropped every few metres), so it never needs the AI road network and can't cut through buildings, and it works in
// any suburb. It slows for the bends ahead and stops for traffic in front of it, keeps a gap behind the player, and is
// "lost" once the player stays far enough clear for long enough (missions.js decides that from distance()).
import * as THREE from 'three/webgpu';
import { terrainHeight } from './terrain.js';

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
  let info = null;
  let gapStop = STOP; // this one's own closest following distance (police units keep different gaps)

  /** Start tailing from (x, z, heading): a dark sedan by default */
  async function start({ x, z, heading: h = 0, file = 'comodo', color = 0x2b2f33, speed = 30, wait = false, stopGap = STOP, seed = null }) {
    const my = ++token;
    active = true;
    leaving = 0;
    parked = wait;
    pos = { x, y: terrainHeight(x, z), z };
    heading = h;
    v = 0;
    vMax = speed;
    trail = seed ? seed.map((q) => ({ x: q.x, y: q.y ?? terrainHeight(q.x, q.z), z: q.z })) : []; // (a unit starts on the route the player drove)
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
    leaving = 0;
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
  /** A parked pursuer pulls out: it starts following from here (from `seed`, a route of points, when given) */
  function release(seed = null) { parked = false; leaving = 0; trail = seed ? seed.map((q) => ({ x: q.x, y: q.y ?? terrainHeight(q.x, q.z), z: q.z })) : []; v = 0; }
  /** Stop where it is and wait (its officers are out: js/police.js), solid */
  function park() { parked = true; leaving = 0; v = 0; }
  /** Pull away along its heading and be gone: the unit has finished here (js/police.js) */
  function driveOff() { parked = false; leaving = 0.001; trail = []; }
  let leaving = 0; // seconds spent driving off (0: not leaving)
  function update(dt) {
    if (!active) return;
    if (leaving > 0) {
      leaving += dt;
      v = Math.min(16, v + 4.5 * dt);
      pos = { x: pos.x + Math.sin(heading) * v * dt, y: pos.y, z: pos.z + Math.cos(heading) * v * dt };
      pos.y = terrainHeight(pos.x, pos.z);
      place(dt);
      if (leaving > 7) stop();
      return;
    }
    if (parked) return; // waiting at the kerb: still solid (box(), js/vehicle-solids.js)
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
    info = { want: +want.toFixed(1), ahead: ahead === Infinity ? null : +ahead.toFixed(1), gap: +gap.toFixed(1), bend: +bend.toFixed(2), trail: trail.length, dt: +dt.toFixed(3) };
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
  }
  // The pursuer is solid: js/vehicle-solids.js collides the player's car or bike with box() (an oriented box with the
  // pursuer's mass and speed) and hands back its speed after a hit through bump()
  const solidKey = { kind: 'police' };
  function place(dt) {
    if (!car) return;
    const fx = Math.sin(heading) * 2, fz = Math.cos(heading) * 2, hF = terrainHeight(pos.x + fx, pos.z + fz), hB = terrainHeight(pos.x - fx, pos.z - fz);
    car.root.position.set(pos.x, Math.max((hF + hB) / 2, pos.y || 0), pos.z);
    car.root.rotation.set(-Math.atan2(hF - hB, 4), heading, 0); // (nose up on a rise)
    for (const w of car.wheels) w.rotation.x += (v * dt) / 0.33;
  }

  return {
    start,
    stop,
    release,
    park,
    driveOff,
    get leaving() { return leaving > 0; },
    /** The car's model group (null until it has loaded) */
    get root() { return car ? car.root : null; },
    get parked() { return parked; },
    update,
    get active() { return active; },
    get position() { return pos; },
    get speed() { return v; },
    get info() { return info; },
    get heading() { return heading; },
    /** Straight-line distance to the player */
    distance() { const p = player().position; return Math.hypot(p.x - pos.x, p.z - pos.z); },
    /** Its footprint, for the player on foot to bump into */
    box() {
      return active && car ? { key: solidKey, kind: 'police', x: pos.x, z: pos.z, yaw: heading, halfL: 2.3, halfW: 0.95, speed: v, mass: 1800,
        bump: (s) => { v = Math.max(0, Math.min(v, s)); } } : null;
    }
  };
}
