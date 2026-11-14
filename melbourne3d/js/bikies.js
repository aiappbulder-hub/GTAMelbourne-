// Bikies: a pack of chopper riders on the streets. Free roam only (a pack rides in every few minutes), or on a job's
// call (js/missions.js `bikies: true` on a targets step).
//
//  - The bike: a procedural chopper (buildBike). The rider is a person (js/people.js setRider: the seated clip, both hands
//    solved onto the bars); his body is an armed hostile of js/combat.js flagged `mounted`, so the player's shots, punches
//    and blasts hit him like any gunman, and he fights on foot with combat's behaviour once he gets off.
//  - The route: a virtual leader follows the road network's lanes as traffic does (js/road-network.js edges, moves and
//    connectors; it takes turns, crosses the bridges, slows for cars and the player in its way) and leaves a trail of
//    points; each bike follows that trail at its place in a staggered formation (so they stay on the road wherever the
//    leader does), steering and leaning by how the trail bends.
//  - The fight: a shot at them, a hit, a punch, a blast, or a bike rammed by the player's car turns the pack hostile.
//    The leader turns for the player, each bike pulls up within 20 m of him (or after 7 s), the rider gets off and fights
//    on foot. A rider killed on the bike comes off it and the bike goes down. The encounter is over when every rider is dead.
//  - The police are kept out of jobs by js/wanted.js as ever; in free roam the wanted system applies as normal.
import * as THREE from 'three/webgpu';

const MODELS = ['Male_Adult_04', 'Male_Adult_10'];
const WEAPONS = ['pistol', 'uzi', 'pistol', 'shotgun', 'uzi', 'pistol'];
// formation slots: metres behind the virtual leader, and to the side (m)
const SLOTS = [[3, 0], [9, -1.1], [9, 1.1], [15, -1.1], [15, 1.1], [21, 0]];
const WHEELBASE = 1.95;
const SEAT = { y: 0.74, z: -0.34 };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------------------------------------------------------------
// The bike model: forward is +z, the origin on the ground between the wheels
const M = {
  tyre: new THREE.MeshStandardNodeMaterial({ color: 0x0c0c0d, roughness: 0.9, metalness: 0 }),
  chrome: new THREE.MeshStandardNodeMaterial({ color: 0xc8ccd2, roughness: 0.18, metalness: 1 }),
  black: new THREE.MeshStandardNodeMaterial({ color: 0x141416, roughness: 0.45, metalness: 0.6 }),
  engine: new THREE.MeshStandardNodeMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.85 }),
  seat: new THREE.MeshStandardNodeMaterial({ color: 0x1d1511, roughness: 0.85, metalness: 0 }),
  lamp: new THREE.MeshBasicNodeMaterial({ color: 0xfff1c0 }),
  tail: new THREE.MeshBasicNodeMaterial({ color: 0xff2a1a })
};
const TANKS = [0x8c1d1d, 0x1c2a4a, 0x2b2b2d, 0x6a3d12, 0x1f4a2b, 0x7a7a2a].map((c) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.25, metalness: 0.7 }));
const G = {
  tyre: new THREE.CylinderGeometry(0.34, 0.34, 0.13, 22),
  tyreWide: new THREE.CylinderGeometry(0.34, 0.34, 0.22, 22),
  rim: new THREE.CylinderGeometry(0.22, 0.22, 0.15, 14),
  hub: new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8),
  spoke: new THREE.BoxGeometry(0.02, 0.4, 0.02),
  tank: new THREE.SphereGeometry(0.5, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  sph: new THREE.SphereGeometry(1, 12, 8)
};
// a rod from a to b of radius r
const rod = (parent, a, b, r, mat) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(G.cyl, mat);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.scale.set(r, d.length(), r);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
};
const blob = (parent, geo, mat, x, y, z, sx, sy, sz) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
};
function wheel(wide) {
  const w = new THREE.Group(), spin = new THREE.Group();
  const t = new THREE.Mesh(wide ? G.tyreWide : G.tyre, M.tyre);
  t.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(G.rim, M.chrome);
  rim.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(G.hub, M.chrome);
  hub.rotation.z = Math.PI / 2;
  spin.add(t, rim, hub);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(G.spoke, M.chrome); s.rotation.x = (i * Math.PI) / 4; spin.add(s); } // (they show the spin)
  t.castShadow = true;
  w.add(spin);
  return { group: w, spin };
}
/** A chopper: two wheels, frame, tank, raked forks, ape-hanger bars, exhausts and a headlight. { group, wheelF, wheelR, steer, grips } */
export function buildBike(seed = 0) {
  const g = new THREE.Group();
  g.name = 'Chopper';
  const rear = wheel(true), front = wheel(false);
  rear.group.position.set(0, 0.34, -0.97);
  front.group.position.set(0, 0.34, 0.98);
  g.add(rear.group, front.group);
  // frame, engine, tank, seat
  rod(g, [0, 0.42, -0.95], [0, 0.55, 0.0], 0.03, M.black);
  rod(g, [0, 0.55, 0.0], [0, 0.98, 0.5], 0.032, M.black); // the backbone up to the steering head
  rod(g, [0, 0.4, 0.05], [0, 0.95, 0.5], 0.03, M.black); // the downtube
  rod(g, [0, 0.62, -0.95], [0, 0.78, -0.35], 0.025, M.black);
  blob(g, G.box, M.engine, 0, 0.5, 0.08, 0.4, 0.34, 0.5);
  for (const s of [-1, 1]) blob(g, G.cyl, M.engine, s * 0.2, 0.62, 0.1, 0.07, 0.22, 0.07).rotation.z = s * 1.1; // cylinder heads
  blob(g, G.tank, TANKS[seed % TANKS.length], 0, 0.9, 0.2, 0.2, 0.17, 0.38);
  blob(g, G.box, M.seat, 0, 0.67, -0.38, 0.3, 0.1, 0.58);
  blob(g, G.box, M.black, 0, 0.78, -0.82, 0.3, 0.025, 0.4).rotation.x = -0.22; // the rear fender
  blob(g, G.sph, M.tail, 0, 0.74, -1.02, 0.04, 0.04, 0.04);
  // exhausts: two drag pipes down each side
  for (const s of [-1, 1]) {
    rod(g, [s * 0.2, 0.42, 0.3], [s * 0.27, 0.36, -0.05], 0.035, M.chrome);
    rod(g, [s * 0.27, 0.36, -0.05], [s * 0.3, 0.4, -1.12], 0.045, M.chrome);
    blob(g, G.cyl, M.black, s * 0.3, 0.4, -1.13, 0.05, 0.03, 0.05).rotation.x = Math.PI / 2;
  }
  // the steering: the head at (0, 1.0, 0.5), forks raked out to the front axle, risers and ape hangers
  const steer = new THREE.Group();
  steer.position.set(0, 1.0, 0.5);
  g.add(steer);
  const toLocal = (x, y, z) => [x, y - 1.0, z - 0.5];
  for (const s of [-1, 1]) {
    rod(steer, toLocal(s * 0.08, 0.98, 0.52), toLocal(s * 0.08, 0.34, 0.98), 0.022, M.chrome); // the fork leg (raked)
    rod(steer, toLocal(s * 0.08, 0.98, 0.52), toLocal(s * 0.11, 1.16, 0.46), 0.02, M.chrome); // the riser
    rod(steer, toLocal(s * 0.11, 1.16, 0.46), toLocal(s * 0.42, 1.24, 0.42), 0.018, M.black); // the bar out
  }
  rod(steer, toLocal(-0.11, 1.16, 0.46), toLocal(0.11, 1.16, 0.46), 0.018, M.black);
  blob(steer, G.sph, M.lamp, ...toLocal(0, 0.98, 0.7), 0.1, 0.1, 0.09); // the headlight
  blob(steer, G.cyl, M.black, ...toLocal(0, 0.98, 0.64), 0.11, 0.07, 0.11).rotation.x = Math.PI / 2;
  const grips = [-1, 1].map((s) => { // (the bar ends: the rider's hands go here; -1 is the bike's left, +x)
    const o = new THREE.Object3D();
    o.position.set(...toLocal(-s * 0.42, 1.24, 0.42));
    steer.add(o);
    return o;
  });
  // the front wheel turns with the forks: its group is in the steering's frame
  steer.attach(front.group);
  g.updateMatrixWorld(true);
  return { group: g, wheelF: front, wheelR: rear, steer, grips };
}

// ---------------------------------------------------------------------------------------------------------------------
export function createBikies({ scene, trafficSystem, controllerManager: cm, gameplay, missionSystem, cameraSystem = null, audioSystem = null, cast = null }) {
  const combat = gameplay.combat;
  const network = trafficSystem.network;
  const { edges, connector, curvePoint } = network;
  const group = new THREE.Group();
  group.name = 'Bikies';
  scene.add(group);
  const mainRoad = (e) => e.axis === 'ave' || e.lanes.length >= 2 || e.half >= 7;
  const player = () => cm.getActiveEntity().position;
  const flag = (c) => document.body.classList.contains(c);
  const inView = (() => {
    const f = new THREE.Frustum(), pm = new THREE.Matrix4(), s = new THREE.Sphere();
    return (x, z, r = 6) => {
      const cam = cameraSystem?.camera;
      if (!cam) return false;
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      f.setFromProjectionMatrix(pm);
      s.set(new THREE.Vector3(x, 1, z), r);
      return f.intersectsSphere(s);
    };
  })();

  let pack = null, clock = 0, nextAt = 70 + Math.random() * 50, serial = 0, lastShot = null, packsMade = 0;

  // -------------------------------------------------------------------------------------------------------------------
  // The virtual leader on the lanes
  const out = { x: 0, z: 0, dx: 0, dz: 1 };
  function pointOf(L) {
    if (L.free) { out.x = L.fx; out.z = L.fz; out.dx = Math.sin(L.fh); out.dz = Math.cos(L.fh); return out; }
    if (L.conn) curvePoint(L.conn, Math.max(0, L.cs), out);
    else {
      const e = L.edge;
      out.x = e.sx + e.dx * L.s + e.rx * e.lanes[L.lane];
      out.z = e.sz + e.dz * L.s + e.rz * e.lanes[L.lane];
      out.dx = e.dx;
      out.dz = e.dz;
    }
    return out;
  }
  function chooseMove(L) {
    const e = L.edge, pp = player();
    let total = 0;
    const w = e.moves.map((m) => {
      let k = m.turn === 'S' ? 3 : 1;
      if (!mainRoad(m.to)) k *= 0.04;
      if (!m.to.moves.length) k *= 0.02;
      // towards the player: the road's direction against the way to him from where it starts
      const gx = pp.x - m.to.sx, gz = pp.z - m.to.sz, gl = Math.hypot(gx, gz) || 1;
      k *= Math.exp((L.hostile ? 1.6 : 0.7) * ((m.to.dx * gx + m.to.dz * gz) / gl));
      total += k;
      return k;
    });
    let r = Math.random() * total, pick = e.moves[0] || null;
    for (let i = 0; i < e.moves.length; i++) { pick = e.moves[i]; r -= w[i]; if (r <= 0) break; }
    return pick;
  }
  function laneFor(m, lane) {
    if (m.out[lane] >= 0) return m.out[lane];
    let best = -1;
    for (let i = 0; i < m.out.length; i++) if (m.out[i] >= 0 && (best < 0 || Math.abs(i - lane) < Math.abs(best - lane))) best = i;
    return best;
  }
  function advance(L, dt) {
    let ds = L.speed * dt;
    if (L.free) { // no road: straight at the player (a job's pack where the network does not reach), turning at most 1.4 rad/s
      const pp = player();
      L.fh += clamp(wrap(Math.atan2(pp.x - L.fx, pp.z - L.fz) - L.fh), -1.4 * dt, 1.4 * dt);
      L.fx += Math.sin(L.fh) * ds;
      L.fz += Math.cos(L.fh) * ds;
      ds = 0;
    }
    while (ds > 0 && !L.dead) {
      if (!L.conn) {
        if (!L.move) { L.move = chooseMove(L); if (!L.move) { L.dead = true; break; } }
        const room = L.edge.len - L.s;
        if (ds < room) { L.s += ds; ds = 0; break; }
        ds -= Math.max(0, room);
        L.s = L.edge.len;
        const j = laneFor(L.move, L.lane);
        if (j < 0) { L.dead = true; break; }
        L.out = j;
        L.conn = connector(L.edge, L.lane, L.move.to, j);
        L.cs = 0;
      } else {
        const room = L.conn.len - L.cs;
        if (ds < room) { L.cs += ds; ds = 0; break; }
        ds -= Math.max(0, room);
        L.edge = L.move.to;
        L.lane = L.out;
        L.s = 0;
        L.conn = null;
        L.move = chooseMove(L);
      }
    }
    const p = pointOf(L);
    const last = L.trail[L.trail.length - 1];
    const d = last ? Math.hypot(p.x - last.x, p.z - last.z) : 99;
    if (d >= 0.5) {
      L.cum += last ? d : 0;
      L.trail.push({ x: p.x, z: p.z, cum: L.cum });
      if (L.trail.length > 700) L.trail.splice(0, 100);
    }
  }
  /** The trail's point u metres along (cum), interpolated: writes into o and returns it */
  function trailAt(L, u, o) {
    const t = L.trail;
    let lo = 0, hi = t.length - 1;
    if (u >= t[hi].cum) { o.x = t[hi].x; o.z = t[hi].z; return o; }
    if (u <= t[0].cum) { o.x = t[0].x; o.z = t[0].z; return o; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid].cum <= u) lo = mid; else hi = mid; }
    const k = (u - t[lo].cum) / Math.max(1e-6, t[hi].cum - t[lo].cum);
    o.x = t[lo].x + (t[hi].x - t[lo].x) * k;
    o.z = t[lo].z + (t[hi].z - t[lo].z) * k;
    return o;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Spawning
  /** A place on the road network from which a pack can set off: { e, lane, s } on a main road, d metres (a range) from (cx, cz), out of sight */
  function pickSpawn(cx, cz, dMin, dMax, hidden = true, loose = false) {
    let best = null;
    for (let tries = 0; tries < 900; tries++) {
      const e = edges[(Math.random() * edges.length) | 0];
      if (!e.moves.length || (!loose && !mainRoad(e)) || e.len < (loose ? 45 : 80)) continue;
      const lane = (Math.random() * e.lanes.length) | 0;
      const s = loose ? rand(Math.min(30, e.len * 0.6), e.len - 8) : rand(34, e.len - 22);
      const x = e.sx + e.dx * s + e.rx * e.lanes[lane], z = e.sz + e.dz * s + e.rz * e.lanes[lane];
      const d = Math.hypot(x - cx, z - cz);
      if (d < dMin || d > dMax) continue;
      if (hidden && inView(x, z, 14)) continue;
      // facing the player is better (they ride past him): prefer lanes that run towards him
      const toward = ((cx - x) * e.dx + (cz - z) * e.dz) / (d || 1);
      const score = toward + Math.random() * 0.4;
      if (!best || score > best.score) best = { e, lane, s, x, z, score };
    }
    return best;
  }
  /** A leader on open ground (no road within reach): from a clear line 100-130 m out, heading for (cx, cz); null if every direction is walled */
  function makeFreeLeader(cx, cz) {
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 16; k++) {
      const a = a0 + k * (Math.PI / 8);
      let clear = true;
      for (let d = 6; d <= 125 && clear; d += 3) {
        const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
        if ((cm.getGroundHeight(x, z, 'person') ?? -9) < -0.3) { clear = false; break; }
        for (const c of cm.nearColliders(x, z, 1.2)) if ((c.minY ?? 0) - (c.groundY ?? 0) < 2 && (c.maxY === undefined || c.maxY > 0.3) && x > c.minX - 1.2 && x < c.maxX + 1.2 && z > c.minZ - 1.2 && z < c.maxZ + 1.2) { clear = false; break; }
      }
      if (!clear) continue;
      const fh = a + Math.PI, x0 = cx + Math.sin(a) * 125, z0 = cz + Math.cos(a) * 125;
      const L = { free: true, fx: x0, fz: z0, fh, speed: 9, dead: false, trail: [], cum: 0, hostile: true, edge: { len: 1e9 }, s: 0 };
      for (let d = 30; d >= 0; d -= 0.5) L.trail.push({ x: x0 - Math.sin(fh) * d, z: z0 - Math.cos(fh) * d, cum: 30 - d });
      L.cum = 30;
      return L;
    }
    return null;
  }
  function makeLeader(sp) {
    const L = { edge: sp.e, lane: sp.lane, s: sp.s, conn: null, cs: 0, out: 0, move: null, speed: 9, dead: false, trail: [], cum: 0, hostile: false };
    // the trail already runs behind it, down the lane from the edge's start
    for (let s = 0; s <= sp.s; s += 0.5) {
      L.trail.push({ x: sp.e.sx + sp.e.dx * s + sp.e.rx * sp.e.lanes[sp.lane], z: sp.e.sz + sp.e.dz * s + sp.e.rz * sp.e.lanes[sp.lane], cum: s });
    }
    L.cum = L.trail[L.trail.length - 1].cum;
    return L;
  }
  /**
   * A pack rides in. opts: { n (4-6), hostile (already after the player: a job's), near: { x, z } and range [min, max] of
   * where it starts from that point (default: the player, 130-240 m, out of sight), weapons }
   * Returns the riders (armed hostiles, js/combat.js) or [] when no road was found.
   */
  function spawnPack(opts = {}) {
    if (pack) removePack(pack, 'respawn');
    const n = clamp(opts.n || 4 + ((Math.random() * 3) | 0), 1, SLOTS.length);
    const pp = player(), c = opts.near || pp;
    const range = opts.range || [130, 240];
    let sp = pickSpawn(c.x, c.z, range[0], range[1], opts.hidden !== false) || pickSpawn(c.x, c.z, range[0] * 0.5, range[1] * 1.6, false) || pickSpawn(c.x, c.z, 30, opts.job ? 200 : 420, false, true);
    let L = null;
    if (sp) L = makeLeader(sp);
    else if (opts.job) L = makeFreeLeader(c.x, c.z);
    if (!L) return [];
    sp = sp || { x: L.fx, z: L.fz };
    L.hostile = !!opts.hostile;
    pack = { id: ++packsMade, L, bikes: [], hostile: !!opts.hostile, hostileT: 0, age: 0, job: !!opts.job, over: false, overT: 0, brakeAll: false };
    const weapons = opts.weapons || WEAPONS;
    for (let i = 0; i < n; i++) {
      const parts = buildBike(serial + i);
      parts.group.visible = false;
      group.add(parts.group);
      const g = combat.spawn({ x: sp.x, z: sp.z, weapon: weapons[i % weapons.length], model: MODELS[i % MODELS.length], hp: 70 });
      g.mounted = true;
      g.biker = true;
      g.bikeSerial = serial + i;
      pack.bikes.push({ i, parts, g, u: L.cum - SLOTS[i][0], speed: L.speed, lat: 0, x: sp.x, z: sp.z, heading: 0, lean: 0, steer: 0, yaw: null, state: 'ride', t: 0, key: `bikie${serial + i}`, spin: 0, slideT: 0, vx: 0, vz: 0 });
    }
    serial += n;
    return pack.bikes.map((b) => b.g);
  }
  function removePack(p, why = '?') {
    for (const b of p.bikes) {
      group.remove(b.parts.group);
      cast?.setRider(b.key, null, null);
      if (b.g.mounted) { // still on the bike: no one
        cast?.setGunman(b.g.key, b.g.model, null);
        const k = combat.list.indexOf(b.g);
        if (k >= 0) combat.list.splice(k, 1);
        b.g.dead = true;
      }
    }
    if (pack === p) pack = null;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The fight
  function goHostile(why) {
    if (!pack || pack.hostile) return;
    pack.hostile = true;
    pack.L.hostile = true;
    pack.hostileT = 0;
    pack.why = why;
    const pp = player();
    trafficSystem.scarePeds?.(pp.x, pp.z, 60, 10);
    for (const b of pack.bikes) if (b.g.mounted && !b.g.dead) b.g.alert = true;
  }
  function dismount(b) {
    const g = b.g, pp = player();
    const side = Math.sign((pp.x - b.x) * Math.cos(b.heading) - (pp.z - b.z) * Math.sin(b.heading)) || 1; // the player's side
    g.mounted = false;
    g.x = b.x + Math.cos(b.heading) * 0.9 * side;
    g.z = b.z - Math.sin(b.heading) * 0.9 * side;
    g.heading = Math.atan2(pp.x - g.x, pp.z - g.z);
    g.alert = true;
    g.react = 0.25;
    g.phase = 'idle';
    b.state = 'parked';
    cast?.setRider(b.key, null, null);
  }
  function fall(b, speed) {
    const g = b.g;
    g.mounted = false; // (hp is 0: combat draws him dead where he was thrown)
    g.dead = true;
    g.deadT = 0;
    g.alert = true;
    g.heading = b.heading + (Math.random() - 0.5);
    b.state = 'down';
    b.slideT = 0;
    b.vx = Math.sin(b.heading) * speed;
    b.vz = Math.cos(b.heading) * speed;
    b.side = Math.random() < 0.5 ? 1 : -1;
    cast?.setRider(b.key, null, null);
  }

  // does the player's last shot pass close to a bike?
  function shotNear() {
    const s = gameplay.state.lastShot;
    if (!s || s === lastShot) return false;
    lastShot = s;
    const [fx, , fz] = s.from, dx = s.x - fx, dz = s.z - fz, l2 = dx * dx + dz * dz || 1;
    for (const b of pack.bikes) {
      const t = clamp(((b.x - fx) * dx + (b.z - fz) * dz) / l2, 0, 1);
      if (Math.hypot(fx + dx * t - b.x, fz + dz * t - b.z) < 3.2) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The frame
  const tmp = { x: 0, z: 0 }, tmp2 = { x: 0, z: 0 };
  function stepPack(dt) {
    const P = pack, L = P.L, pp = player();
    P.age += dt;
    // the leader: its speed from the road ahead (a corner, a car, the player in its way)
    let want = P.hostile ? 11 : 13.5;
    if (L.conn) want = Math.min(want, 7.5);
    else if (L.move && L.move.turn !== 'S' && L.edge.len - L.s < 22) want = Math.min(want, 8);
    const p = pointOf(L), fx = p.dx, fz = p.dz;
    const lx = p.x, lz = p.z;
    for (const c of trafficSystem.cars) {
      if (c.driven || !(c.edge || c.parked)) continue;
      const ax = c.x - lx, az = c.z - lz, along = ax * fx + az * fz;
      if (along < 0.5 || along > 16 || Math.abs(ax * fz - az * fx) > 2.4) continue;
      want = Math.min(want, along < 6 ? 0 : Math.max(0, (c.speed || 0) * 0.9 + (along - 6) * 0.5));
    }
    { // the player on foot or in a car in the way
      const ax = pp.x - lx, az = pp.z - lz, along = ax * fx + az * fz;
      if (along > 0.5 && along < 14 && Math.abs(ax * fz - az * fx) < 2.2 && !P.hostile) want = Math.min(want, along < 6 ? 0 : 4);
    }
    // hostile: the leader stops when a rider is near the player, or when it has gone as far as it can
    const near = P.bikes.some((b) => b.state === 'ride' && Math.hypot(b.x - pp.x, b.z - pp.z) < 24);
    const wait = Math.hypot(lx - pp.x, lz - pp.z) < 110 ? 7 : 22; // (a long way off: it keeps coming for longer)
    if (P.hostile && (near || P.hostileT > wait)) want = 0;
    L.speed += clamp(want - L.speed, -9 * dt, 4 * dt);
    if (!L.dead) advance(L, dt);
    else L.speed = 0;
    if (P.hostile) P.hostileT += dt;
    // the bikes
    let aliveRiders = 0, anyHurt = false;
    for (const b of P.bikes) {
      const g = b.g;
      if (!g.dead) aliveRiders++;
      if (g.hp < g.maxHp || g.alert && b.state === 'ride' && g.mounted && !P.hostile) anyHurt = true;
      if (b.state === 'ride' || b.state === 'brake') {
        if (g.dead && g.mounted) { fall(b, Math.max(b.speed, 2) * 0.5); }
        else {
          const slot = SLOTS[b.i];
          const wantU = L.cum - slot[0];
          let v = clamp(L.speed + 1.4 * (wantU - b.u), 0, 20);
          if (b.state === 'ride' && P.hostile && (Math.hypot(b.x - pp.x, b.z - pp.z) < 20 || P.hostileT > wait) && L.speed < 3) b.state = 'brake';
          if (b.state === 'brake') v = 0;
          b.speed += clamp(v - b.speed, -7 * dt, 5 * dt);
          b.u = Math.min(b.u + b.speed * dt, L.cum - 0.2);
          // the position: on the trail, a lane-width to its side (smoothed), heading along the trail
          const a = trailAt(L, b.u + 1.2, tmp), c = trailAt(L, b.u - 1.2, tmp2);
          let dx = a.x - c.x, dz = a.z - c.z;
          const dl = Math.hypot(dx, dz) || 1;
          dx /= dl; dz /= dl;
          b.lat += (slot[1] - b.lat) * Math.min(1, dt * 1.5);
          const mid = trailAt(L, b.u, tmp);
          b.x = mid.x - dz * b.lat; // (+lat is to the right of travel)
          b.z = mid.z + dx * b.lat;
          const hd = Math.atan2(dx, dz);
          if (b.yaw === null) b.heading = hd;
          const dyaw = b.yaw === null ? 0 : wrap(hd - b.yaw);
          b.yaw = hd;
          b.heading = b.heading + wrap(hd - b.heading) * Math.min(1, dt * 12);
          const rate = dt > 0 ? dyaw / dt : 0;
          b.lean += (clamp(-rate * Math.max(b.speed, 1) / 9.8, -0.55, 0.55) - b.lean) * Math.min(1, dt * 6);
          b.steer += (clamp(rate * 0.5, -0.45, 0.45) - b.steer) * Math.min(1, dt * 8);
          if (b.state === 'brake' && b.speed < 0.4) { b.state = 'stopping'; b.t = 0; }
        }
      }
      if (b.state === 'stopping') {
        b.t += dt;
        b.lean *= 0.9;
        b.speed = 0;
        if (b.t > 0.6 && !g.dead) dismount(b);
        else if (g.dead && g.mounted) fall(b, 0);
      } else if (b.state === 'down') {
        b.slideT += dt;
        const k = Math.exp(-2.2 * dt);
        b.vx *= k; b.vz *= k;
        b.x += b.vx * dt; b.z += b.vz * dt;
        b.speed = Math.hypot(b.vx, b.vz);
        b.lean += (b.side * 1.5 - b.lean) * Math.min(1, dt * 9);
        if (b.slideT < 0.9) { g.x = b.x - b.vx * 0.15; g.z = b.z - b.vz * 0.15; }
      } else if (b.state === 'parked') {
        b.speed = 0;
        b.lean += (0.22 - b.lean) * Math.min(1, dt * 4);
      }
      if (g.mounted) { g.x = b.x; g.z = b.z; g.y = 0; g.heading = b.heading; }
      // a rammed bike (the player's car)
      if (cm.activeMode === 'car' && b.state !== 'down') {
        const e = cm.getActiveEntity();
        b.rammedT = Math.max(0, (b.rammedT || 0) - dt);
        if (!b.rammedT && Math.hypot(e.position.x - b.x, e.position.z - b.z) < 2.5 && Math.abs(e.speed || 0) > 4) {
          b.rammedT = 1.5;
          goHostile('rammed');
          if (g.mounted && !g.dead) combat.hurt(g, 40 + Math.abs(e.speed) * 6, e.position.x, e.position.z);
          if (g.dead && g.mounted) fall(b, Math.abs(e.speed) * 0.6);
        }
      }
    }
    if (!P.hostile && (anyHurt || shotNear())) goHostile('shot');
    P.alive = aliveRiders;
    if (!aliveRiders && !P.over) { P.over = true; P.overT = 0; }
    if (P.over) P.overT += dt;
    // gone: all riders dead for a while, too far from the player for a peaceful pack, or no road left
    const far = Math.hypot(L.cum > 0 ? lx - pp.x : 0, lz - pp.z);
    if (P.over && P.overT > 20) return removePack(P, 'over');
    if (!P.hostile && (L.dead || (P.age > 14 && far > 330) || P.age > 260) && !P.job) return removePack(P, 'peaceful gone');
    if (P.hostile && !P.job && P.bikes.every((b) => !b.g.mounted) && far > 260) return removePack(P, 'hostile far');
  }

  function drawPack(dt) {
    const pp = player();
    for (const b of pack.bikes) {
      const pg = b.parts.group;
      const d = Math.hypot(b.x - pp.x, b.z - pp.z);
      const show = d < 230 && b.state !== 'gone';
      pg.visible = show;
      if (!show) continue;
      pg.position.set(b.x, 0, b.z);
      pg.rotation.set(0, b.heading, b.lean, 'YXZ');
      const spin = b.speed * dt / 0.34;
      b.parts.wheelF.spin.rotation.x += spin;
      b.parts.wheelR.spin.rotation.x += spin;
      b.parts.steer.rotation.y = b.steer;
      pg.updateMatrixWorld(true);
      if (b.g.mounted && !b.g.dead && d < 120) cast?.setRider(b.key, b.g.model, { parent: pg, seat: SEAT, grips: b.parts.grips, dt });
    }
  }

  // The engine: a low burble (two detuned saw oscillators through a low-pass, wobbled) louder with the nearest bike, higher with its speed
  let eng = null;
  function engine(dt) {
    const c = audioSystem?.context;
    if (!pack || !c || c.state !== 'running' || !audioSystem.master) { if (eng) eng.out.gain.setTargetAtTime(0, c?.currentTime || 0, 0.1); return; }
    if (!eng) {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), out2 = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 420; out2.gain.value = 0;
      lfo.frequency.value = 11; lg.gain.value = 0.45; lfo.connect(lg); lg.connect(out2.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(out2); out2.connect(audioSystem.master);
      o1.start(); o2.start(); lfo.start();
      eng = { o1, o2, out: out2, base: 0 };
    }
    const pp = player();
    let d = 999, v = 0;
    for (const b of pack.bikes) { const dd = Math.hypot(b.x - pp.x, b.z - pp.z); if (dd < d && b.state !== 'parked' && b.state !== 'down') { d = dd; v = b.speed; } }
    const lvl = d < 160 ? 0.07 * (1 - d / 160) ** 2 : 0;
    eng.o1.frequency.setTargetAtTime(38 + v * 3.2, c.currentTime, 0.1);
    eng.o2.frequency.setTargetAtTime(19.5 + v * 1.6, c.currentTime, 0.1);
    eng.out.gain.setTargetAtTime(lvl, c.currentTime, 0.1);
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    clock += dt;
    const busy = flag('cinematic') || flag('cutscene') || flag('in-room') || !!missionSystem?.busy;
    const onJob = !!missionSystem?.onJob;
    if (pack) {
      // riders cleared from the world (respawn, a new job): the pack goes with them
      if (pack.bikes.every((b) => !combat.list.includes(b.g))) removePack(pack, 'riders cleared');
      else if (onJob && !pack.job && !pack.hostile) removePack(pack, 'job'); // free roam's pack does not ride into a story job
    }
    if (pack) { stepPack(dt); if (pack) drawPack(dt); }
    else if (!onJob && !busy && !gameplay.state.dying && cm.activeMode !== 'heli') {
      nextAt -= dt;
      if (nextAt <= 0) { nextAt = 150 + Math.random() * 150; spawnPack(); }
    }
    try { engine(dt); } catch { /* no audio */ }
  }

  return {
    update, spawnPack, group,
    /** the pack riding now (or null) */
    get pack() { return pack; },
    /** a pack set off at once: for scripts (the first free-roam pack otherwise comes after a minute or two) */
    cancel() { if (pack) removePack(pack); },
    state() {
      if (!pack) return { active: false };
      return { active: true, hostile: pack.hostile, why: pack.why || null, over: pack.over, alive: pack.alive ?? pack.bikes.length, bikes: pack.bikes.length, job: pack.job };
    },
    debug() {
      if (!pack) return null;
      return { hostile: pack.hostile, over: pack.over, leader: { x: pack.L.trail.at(-1).x, z: pack.L.trail.at(-1).z, speed: +pack.L.speed.toFixed(1), cum: +pack.L.cum.toFixed(1), dead: pack.L.dead },
        bikes: pack.bikes.map((b) => ({ i: b.i, x: +b.x.toFixed(2), z: +b.z.toFixed(2), speed: +b.speed.toFixed(1), state: b.state, mounted: !!b.g.mounted, dead: b.g.dead, hp: b.g.hp, shots: b.g.shotsFired, alert: b.g.alert, phase: b.g.phase })) };
    }
  };
}
