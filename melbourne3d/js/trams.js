import * as THREE from 'three/webgpu';
import { terrainHeight, drapeGeometry } from './terrain.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from './geodata.js';
import { Q } from './quality.js';

// Melbourne's trams (js/melbourne-geodata.js `trams` and `tramTracks`, from OpenStreetMap):
// - the rails of every at-grade track, as pairs of steel strips set into the road, and the overhead wire above them;
// - trams running the real routes (86, 96, 109, 11, 12, 30, 35, 48, 58, 70...), stopping about every 300 m and, at a
//   terminus, turning onto the route's line in the other direction. The tram is the old game's model
//   (models/custom/tram.json, made in Blender by tools/make_models.py), its parts merged by material into one
//   instanced mesh each, so all the trams together cost a handful of draw calls.

const GAUGE = 1.435;
const RAIL_W = 0.075;
const RAIL_Y = 0.012;
const WIRE_Y = 5.6;
const CRUISE = 11; // m/s (40 km/h)
const ACCEL = 1.1;
const STOP_EVERY = 300;
const DWELL = 7;
// A tram looks down its track: anyone (or any car) within this far of its front, near the rails, and it brakes to a
// stop until they're clear
const FRONT = 6.6; // from a tram's middle to its nose (m): the model is 12.9 m long
const LOOK = 16;
const TRAM_HALF_L = 6.5, TRAM_HALF_W = 1.4;
const CLEAR = 1.9; // half the width it needs (m)

const toPts = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push(new THREE.Vector2(flat[i], flat[i + 1]));
  return out;
};

function buildTracks(group) {
  const rails = [];
  const wires = [];
  for (const flat of GEO.tramTracks || []) {
    const P = toPts(flat);
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      const d = b.clone().sub(a);
      const L = d.length();
      if (L < 0.05) continue;
      d.divideScalar(L);
      const nx = -d.y, nz = d.x;
      for (const side of [-GAUGE / 2, GAUGE / 2]) {
        const o0 = side - RAIL_W / 2, o1 = side + RAIL_W / 2;
        const ax0 = a.x + nx * o0, az0 = a.y + nz * o0, ax1 = a.x + nx * o1, az1 = a.y + nz * o1;
        const bx0 = b.x + nx * o0, bz0 = b.y + nz * o0, bx1 = b.x + nx * o1, bz1 = b.y + nz * o1;
        rails.push(ax0, RAIL_Y, az0, bx1, RAIL_Y, bz1, bx0, RAIL_Y, bz0, ax0, RAIL_Y, az0, ax1, RAIL_Y, az1, bx1, RAIL_Y, bz1);
      }
      wires.push(a.x, WIRE_Y, a.y, b.x, WIRE_Y, b.y);
    }
  }
  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rails, 3));
  railGeo.computeVertexNormals();
  // the strips are wound either way round: make every normal point up
  const n = railGeo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  drapeGeometry(railGeo, { maxEdge: 12.5, lift: 0.03 }); // along the hills (js/terrain.js)
  const railMesh = new THREE.Mesh(railGeo, new THREE.MeshStandardNodeMaterial({ color: 0x8a8c8f, metalness: 0.85, roughness: 0.32 }));
  railMesh.receiveShadow = true;
  railMesh.name = 'TramRails';
  group.add(railMesh);
  const wireGeo = new THREE.BufferGeometry();
  for (let i = 0; i < wires.length; i += 3) wires[i + 1] += terrainHeight(wires[i], wires[i + 2]);
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const wireMesh = new THREE.LineSegments(wireGeo, new THREE.LineBasicNodeMaterial({ color: 0x1d1f22 }));
  wireMesh.name = 'TramWires';
  group.add(wireMesh);
  return { rails: rails.length / 18, wires: wires.length / 6 };
}

// One geometry per material, in the tram's own frame (the model is 13 m long along z)
async function loadTramParts() {
  const url = new URL('../../models/custom/tram.json', import.meta.url).href;
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const byMat = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = o.material.name || o.material.uuid;
    if (!byMat.has(key)) byMat.set(key, { material: o.material, geos: [] });
    byMat.get(key).geos.push(g.index ? g.toNonIndexed() : g);
  });
  return [...byMat.values()].map(({ material, geos }) => ({ material, geometry: mergeGeometries(geos, false) }));
}

class Line {
  constructor(route) {
    this.ref = route.ref;
    this.name = route.name;
    this.pts = toPts(route.pts);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.next = null; // the line a tram carries on along at the end of this one
  }
  sample(s, out) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m;
      else hi = m;
    }
    const t = (s - this.cum[lo]) / Math.max(1e-6, this.cum[hi] - this.cum[lo]);
    return out.copy(this.pts[lo]).lerp(this.pts[hi], t);
  }
}

export async function createTramSystem(scene) {
  const group = new THREE.Group();
  group.name = 'Trams';
  scene.add(group);
  const tracks = buildTracks(group);

  const lines = (GEO.trams || []).map((r) => new Line(r)).filter((l) => l.length > 400);
  // At a line's end, carry on along a line of the same route that starts within 80 m (the way back from a terminus)
  for (const l of lines) {
    const end = l.pts[l.pts.length - 1];
    let best = null, bd = 80;
    for (const m of lines) {
      if (m === l || m.ref !== l.ref) continue;
      const d = m.pts[0].distanceTo(end);
      if (d < bd) { bd = d; best = m; }
    }
    l.next = best;
  }

  let parts = [];
  try {
    parts = await loadTramParts();
  } catch (e) {
    console.warn('[trams] model failed to load', e);
  }
  const maxTrams = { low: 14, medium: 26, high: 40 }[Q.cars >= 200 ? 'high' : Q.cars >= 130 ? 'medium' : 'low'];
  const spacing = Q.cars >= 200 ? 650 : Q.cars >= 130 ? 900 : 1400;
  const trams = [];
  for (const l of lines) {
    const n = Math.max(1, Math.floor(l.length / spacing));
    for (let k = 0; k < n && trams.length < maxTrams * 2; k++) trams.push({ line: l, s: (k + 0.37) * (l.length / n), v: CRUISE * 0.5, dwell: 0 });
  }
  // keep an even spread when there are more slots than the quality allows
  while (trams.length > maxTrams) trams.splice(Math.floor(Math.random() * trams.length), 1);

  const meshes = parts.map(({ material, geometry }) => {
    const m = new THREE.InstancedMesh(geometry, material, Math.max(1, trams.length));
    m.count = trams.length;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false; // the trams move: their bounds would go stale
    m.name = 'TramBodies';
    group.add(m);
    return m;
  });

  const A = new THREE.Vector2(), B = new THREE.Vector2(), M4 = new THREE.Matrix4(), Qn = new THREE.Quaternion();
  const EUL = new THREE.Euler(), POS = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  function place(i, t) {
    const l = t.line;
    l.sample(t.s + 4, A);
    l.sample(t.s - 4, B);
    const yaw = Math.atan2(A.x - B.x, A.y - B.y);
    const hA = terrainHeight(A.x, A.y), hB = terrainHeight(B.x, B.y);
    Qn.setFromEuler(EUL.set(-Math.atan2(hA - hB, 8), yaw, 0, 'YXZ')); // the body follows the slope
    POS.set((A.x + B.x) / 2, (hA + hB) / 2, (A.y + B.y) / 2);
    t.cx = POS.x; t.cz = POS.z; t.yaw = yaw; // its footprint (for the traffic and the player, footprints())
    M4.compose(POS, Qn, ONE);
    for (const m of meshes) m.setMatrixAt(i, M4);
  }
  trams.forEach((t, i) => place(i, t));
  for (const m of meshes) m.instanceMatrix.needsUpdate = true;

  // Is there someone or something on the track in the next LOOK metres ahead of tram t? Returns the distance, or Infinity
  const P = new THREE.Vector2();
  function blockedAhead(t, obs) {
    if (!obs) return Infinity;
    let first = Infinity;
    // something already in the way of its body (a car stopped across the tracks): stay put
    if (t.cx !== undefined) {
      const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
      const inBody = (x, z, w) => { const dx = x - t.cx, dz = z - t.cz, a = dx * fx + dz * fz, s = dx * fz - dz * fx; return Math.abs(a) < TRAM_HALF_L + 0.5 && Math.abs(s) < TRAM_HALF_W + w; };
      for (const c of obs.cars) if ((c.edge || c.parked) && Math.abs(c.x - t.cx) < 10 && Math.abs(c.z - t.cz) < 10 && inBody(c.x, c.z, c.halfWidth || 0.9)) return FRONT;
      if (obs.player && inBody(obs.player.x, obs.player.z, 0.9)) return FRONT;
    }
    for (let d = FRONT; d <= FRONT + LOOK && d < first; d += 2) {
      t.line.sample(Math.min(t.s + d, t.line.length), P);
      const test = (x, z) => (x - P.x) * (x - P.x) + (z - P.y) * (z - P.y) < CLEAR * CLEAR;
      for (const q of obs.peds) if (q.placed && !q.dead && Math.abs(q.x - P.x) < 3 && Math.abs(q.z - P.y) < 3 && test(q.x, q.z)) { first = d; break; }
      if (first < Infinity) break;
      for (const c of obs.cars) if ((c.edge || c.parked) && Math.abs(c.x - P.x) < 4 && Math.abs(c.z - P.y) < 4 && test(c.x, c.z)) { first = d; break; }
      if (first < Infinity) break;
      if (obs.player && test(obs.player.x, obs.player.z)) first = d;
    }
    return first;
  }

  function update(dt, obstacles = null) {
    if (!meshes.length) return;
    dt = Math.min(dt, 0.1);
    const obs = obstacles ? obstacles() : null;
    trams.forEach((t, i) => {
      if (t.dwell > 0) {
        t.dwell -= dt;
      } else {
        // brake for the next stop (and for anyone on the track ahead), dwell there, then pull away
        const nextStop = (Math.floor(t.s / STOP_EVERY) + 1) * STOP_EVERY;
        const toStop = Math.min(nextStop, t.line.length) - t.s;
        const ahead = (t.check = (t.check || 0) - dt) <= 0 ? (t.check = 0.25, t.ahead = blockedAhead(t, obs)) : t.ahead ?? Infinity;
        const room = Math.max(0, ahead - FRONT - 2.5);
        const vMax = Math.min(CRUISE, Math.sqrt(2 * ACCEL * Math.max(0, toStop)) + 0.3, ahead < Infinity ? Math.sqrt(2 * 2.5 * room) : Infinity);
        if (t.v > vMax) t.v = Math.max(vMax, t.v - 3.5 * dt); // the brakes are firmer than the pull-away
        t.v = Math.min(vMax, t.v + ACCEL * dt);
        t.s += t.v * dt;
        if (toStop < 0.4 && t.s < t.line.length - 1) {
          t.s = nextStop + 0.5;
          t.v = 0;
          t.dwell = DWELL;
        }
      }
      if (t.s >= t.line.length) {
        const next = t.line.next;
        t.line = next || t.line;
        t.s = 0;
        t.v = 0;
        t.dwell = next ? DWELL * 2 : 0;
      }
      place(i, t);
    });
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  console.info(`[trams] ${lines.length} route lines (${new Set(lines.map((l) => l.ref)).size} routes), ${trams.length} trams, ${tracks.rails} rail pieces`);
  /** Each tram's footprint (centre, heading, half length and width, speed), near (x, z) */
  function footprints(x = 0, z = 0, r = Infinity) {
    const out = [];
    for (const t of trams) {
      if (t.cx === undefined || Math.abs(t.cx - x) > r || Math.abs(t.cz - z) > r) continue;
      out.push({ x: t.cx, z: t.cz, yaw: t.yaw, halfL: TRAM_HALF_L, halfW: TRAM_HALF_W, speed: t.v });
    }
    return out;
  }
  return { group, update, trams, lines, footprints };
}
