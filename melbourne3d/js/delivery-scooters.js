// Delivery scooters (Melbourne only): a few small food-delivery riders (a scooter with an insulated box on the back) ride the
// CBD's main roads like traffic. Each has its own virtual leader on the road network's lanes (the way js/bikies.js drives
// its pack: js/road-network.js edges, moves and connectors; takes turns, slows for cars and for the player in the way), and
// the scooter is drawn at the leader's point. The rider is a person seated with js/people.js setRider (plain: no bikie vest).
//
// Cost: 3 meshes per scooter (dark parts, body, box; all merged), 5 scooters on High/Medium, 3 on Low, 2 on Low-lite.
// Beyond 250 m a scooter is hidden and paused; once it has been paused 5 s it is re-placed 150-240 m from the player
// (so they stay around you). The person is only posed within 110 m.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';
import { LITE, QUALITY } from './quality.js';

export const CONFIG = {
  count: LITE ? 2 : QUALITY === 'low' ? 3 : 5,
  speed: 10, turnSpeed: 6, // m/s on the straight / round a corner
  showDist: 250, poseDist: 110, respawnAfter: 5, spawnRange: [150, 240],
  models: ['Male_Adult_07', 'Female_Adult_09', 'Male_Adult_14', 'Male_Adult_12', 'Female_Adult_06'],
  boxes: [0xff2d78, 0x00ccbc, 0xff8000, 0x1fa3ff, 0xffd200] // pink, teal, orange, blue, yellow bags
};
const SEAT = { y: 0.62, z: -0.22 };
const mat = (c, o = {}) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.6, ...o });
const DARK = mat(0x15171a, { roughness: 0.7 });
const BODIES = [0xe8e8ea, 0x2c3e50, 0xb0392e, 0x3d7a4f, 0xd9d2c0].map((c) => mat(c, { roughness: 0.35, metalness: 0.3 }));
const BOXES = CONFIG.boxes.map((c) => mat(c, { roughness: 0.8 }));
// forward +z, origin on the ground between the wheels
const cyl = (r, h, x, y, z) => new THREE.CylinderGeometry(r, r, h, 10).rotateZ(Math.PI / 2).translate(x, y, z);
const GEO_DARK = mergeGeometries([
  cyl(0.19, 0.09, 0, 0.19, 0.55), cyl(0.19, 0.09, 0, 0.19, -0.5), // tyres
  new THREE.BoxGeometry(0.5, 0.04, 0.04).translate(0, 0.98, 0.42), // handlebar
  new THREE.BoxGeometry(0.06, 0.62, 0.06).translate(0, 0.66, 0.46), // steering column
  new THREE.BoxGeometry(0.36, 0.1, 0.5).translate(0, 0.62, -0.28) // seat
]);
const GEO_BODY = mergeGeometries([
  new THREE.BoxGeometry(0.34, 0.1, 0.7).translate(0, 0.24, 0.05), // floorboard
  new THREE.BoxGeometry(0.3, 0.36, 0.5).translate(0, 0.4, -0.55), // rear body
  new THREE.BoxGeometry(0.28, 0.4, 0.14).translate(0, 0.45, 0.5) // front shield
]);
const GEO_BOX = new THREE.BoxGeometry(0.46, 0.44, 0.46).translate(0, 0.98, -0.62);

export function buildScooter(seed = 0) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(GEO_DARK, DARK), new THREE.Mesh(GEO_BODY, BODIES[seed % BODIES.length]), new THREE.Mesh(GEO_BOX, BOXES[seed % BOXES.length]));
  const grips = [-1, 1].map((s) => { const o = new THREE.Object3D(); o.position.set(-s * 0.25, 0.98, 0.42); g.add(o); return o; });
  return { group: g, grips };
}

export function createDeliveryScooters({ scene, trafficSystem, controllerManager: cm, cast = null }) {
  const network = trafficSystem.network;
  const { edges, connector, curvePoint } = network;
  const group = new THREE.Group();
  group.name = 'DeliveryScooters';
  scene.add(group);
  const rand = (a, b) => a + Math.random() * (b - a);
  const out = { x: 0, z: 0, dx: 0, dz: 1 };
  const mainRoad = (e) => e.axis === 'ave' || e.lanes.length >= 2 || e.half >= 7;
  const pointOf = (L) => {
    if (L.conn) curvePoint(L.conn, Math.max(0, L.cs), out);
    else { const e = L.edge; out.x = e.sx + e.dx * L.s + e.rx * e.lanes[L.lane]; out.z = e.sz + e.dz * L.s + e.rz * e.lanes[L.lane]; out.dx = e.dx; out.dz = e.dz; }
    return out;
  };
  const chooseMove = (L) => {
    const e = L.edge;
    let total = 0;
    const w = e.moves.map((m) => { let k = m.turn === 'S' ? 3 : 1; if (!mainRoad(m.to)) k *= 0.05; if (!m.to.moves.length) k *= 0.02; total += k; return k; });
    let r = Math.random() * total, pick = e.moves[0] || null;
    for (let i = 0; i < e.moves.length; i++) { pick = e.moves[i]; r -= w[i]; if (r <= 0) break; }
    return pick;
  };
  const laneFor = (m, lane) => {
    if (m.out[lane] >= 0) return m.out[lane];
    let best = -1;
    for (let i = 0; i < m.out.length; i++) if (m.out[i] >= 0 && (best < 0 || Math.abs(i - lane) < Math.abs(best - lane))) best = i;
    return best;
  };
  function advance(L, dt) {
    let ds = L.speed * dt;
    while (ds > 0 && !L.dead) {
      if (!L.conn) {
        if (!L.move) { L.move = chooseMove(L); if (!L.move) { L.dead = true; break; } }
        const room = L.edge.len - L.s;
        if (ds < room) { L.s += ds; break; }
        ds -= Math.max(0, room); L.s = L.edge.len;
        const j = laneFor(L.move, L.lane);
        if (j < 0) { L.dead = true; break; }
        L.out = j; L.conn = connector(L.edge, L.lane, L.move.to, j); L.cs = 0;
      } else {
        const room = L.conn.len - L.cs;
        if (ds < room) { L.cs += ds; break; }
        ds -= Math.max(0, room);
        L.edge = L.move.to; L.lane = L.out; L.s = 0; L.conn = null; L.move = chooseMove(L);
      }
    }
  }
  function place(S, pp) {
    for (let tries = 0; tries < 500; tries++) {
      const e = edges[(Math.random() * edges.length) | 0];
      if (!e.moves.length || !mainRoad(e) || e.len < 60) continue;
      const lane = (Math.random() * e.lanes.length) | 0, s = rand(10, e.len - 20);
      const x = e.sx + e.dx * s + e.rx * e.lanes[lane], z = e.sz + e.dz * s + e.rz * e.lanes[lane];
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d < CONFIG.spawnRange[0] || d > CONFIG.spawnRange[1]) continue;
      S.L = { edge: e, lane, s, conn: null, cs: 0, out: 0, move: null, speed: 0, dead: false };
      S.heading = null; S.paused = 0; S.x = x; S.z = z;
      return true;
    }
    return false;
  }
  const scooters = [];
  for (let i = 0; i < CONFIG.count; i++) {
    const parts = buildScooter(i);
    parts.group.visible = false;
    group.add(parts.group);
    scooters.push({ i, parts, L: null, heading: null, lean: 0, paused: 0, x: 0, z: 0, key: `delivscooter${i}`, model: CONFIG.models[i % CONFIG.models.length], posed: false, wait: 0 });
  }
  function update(dt) {
    dt = Math.min(dt, 0.1);
    const pp = cm.getActiveEntity().position;
    for (const S of scooters) {
      if (!S.L || S.L.dead) { S.wait -= dt; if (S.wait <= 0) { if (!place(S, pp)) S.wait = 2; } if (!S.L || S.L.dead) continue; }
      const L = S.L, p0 = pointOf(L), fx = p0.dx, fz = p0.dz, lx = p0.x, lz = p0.z;
      const d = Math.hypot(lx - pp.x, lz - pp.z);
      const g = S.parts.group;
      if (d >= CONFIG.showDist) {
        S.paused += dt;
        if (g.visible) { g.visible = false; cast?.setRider(S.key, null, null); S.posed = false; }
        if (S.paused > CONFIG.respawnAfter) { S.L = null; S.wait = 0; }
        continue;
      }
      S.paused = 0;
      // speed from the road ahead: a corner, a car, the player in the way
      let want = CONFIG.speed;
      if (L.conn) want = CONFIG.turnSpeed;
      else if (L.move && L.move.turn !== 'S' && L.edge.len - L.s < 18) want = CONFIG.turnSpeed;
      for (const c of trafficSystem.cars) {
        if (c.driven || !(c.edge || c.parked)) continue;
        const ax = c.x - lx, az = c.z - lz, along = ax * fx + az * fz;
        if (along < 0.5 || along > 14 || Math.abs(ax * fz - az * fx) > 2.2) continue;
        want = Math.min(want, along < 5 ? 0 : Math.max(0, (c.speed || 0) * 0.9 + (along - 5) * 0.5));
      }
      { const ax = pp.x - lx, az = pp.z - lz, along = ax * fx + az * fz; if (along > 0.5 && along < 12 && Math.abs(ax * fz - az * fx) < 2) want = Math.min(want, along < 5 ? 0 : 3); }
      L.speed += Math.max(-9 * dt, Math.min(4 * dt, want - L.speed));
      advance(L, dt);
      const p = pointOf(L);
      const hd = Math.atan2(p.dx, p.dz);
      if (S.heading === null) S.heading = hd;
      const dy = Math.atan2(Math.sin(hd - S.heading), Math.cos(hd - S.heading));
      S.heading += dy * Math.min(1, dt * 10);
      S.lean += (Math.max(-0.35, Math.min(0.35, -(dy / Math.max(dt, 1e-3)) * L.speed / 9.8)) - S.lean) * Math.min(1, dt * 6);
      S.x = p.x; S.z = p.z;
      g.visible = true;
      const sx = Math.sin(S.heading) * 0.7, sz = Math.cos(S.heading) * 0.7, hF = terrainHeight(p.x + sx, p.z + sz), hB = terrainHeight(p.x - sx, p.z - sz);
      g.position.set(p.x, (hF + hB) / 2, p.z);
      g.rotation.set(-Math.atan2(hF - hB, 1.4), S.heading, S.lean, 'YXZ');
      g.updateMatrixWorld(true);
      if (d < CONFIG.poseDist) { cast?.setRider(S.key, S.model, { parent: g, seat: SEAT, grips: S.parts.grips, dt, plain: true }); S.posed = true; }
      else if (S.posed) { cast?.setRider(S.key, null, null); S.posed = false; }
    }
  }
  return {
    update, group, scooters,
    /** For checks: the nearest visible scooter { x, z, heading, dist } or null */
    nearest() {
      const pp = cm.getActiveEntity().position;
      let best = null;
      for (const S of scooters) if (S.parts.group.visible) { const d = Math.hypot(S.x - pp.x, S.z - pp.z); if (!best || d < best.dist) best = { x: S.x, z: S.z, heading: S.heading, dist: d }; }
      return best;
    }
  };
}
