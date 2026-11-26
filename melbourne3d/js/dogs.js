// Dogs (Melbourne only): a fenced off-leash dog park in Fawkner Park (South Yarra) with dogs running, chasing a thrown ball
// and playing while owners stand about, plus dogs on leads walking beside pedestrians on the footpaths near the player.
//
// Cost: every dog is drawn from five InstancedMeshes shared by the whole pack (body, head, tail, all legs, and the
// dalmatians' spots), the lead is one LineSegments, the ball one mesh and the park's fence, posts, bowl and benches one merged
// mesh: about 9 draw calls however many dogs there are. A dog is five boxes-worth of low-poly parts animated procedurally
// (trot / gallop leg swing, wagging tail, sitting, sniffing). Owners are js/people.js cast actors (cast.setActor).
// Count of dogs: Low-lite 6 park + 4 street, Low 7 + 5, Medium 9 + 8, High 12 + 12.
//
// The park dogs sleep (hidden, not simulated) when the player is over 230 m from the park. Street dogs are bound to
// a pedestrian of js/pedestrian-system.js (one the player is 25..110 m from) and follow it on its footpath; when the owner
// despawns, or goes out of range, the dog is released and picks up another one. A car that hits a dog only makes it yelp
// and bolt (no gore), it then disappears a few seconds later.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';
import { LITE, QUALITY } from './quality.js';

export const CONFIG = {
  // the off-leash area inside Fawkner Park (the park's ring is in js/melbourne-geodata.js: x 67..745, z 2597..3641)
  park: { cx: 300, cz: 3000, hx: 21, hz: 14, gap: 1.7 }, // half extents; the gate gap is 2 x gap wide, in the south (+z) fence
  parkDogs: LITE ? 6 : QUALITY === 'low' ? 7 : QUALITY === 'medium' ? 9 : 12,
  streetDogs: LITE ? 4 : QUALITY === 'low' ? 5 : QUALITY === 'medium' ? 8 : 12,
  owners: LITE ? 3 : QUALITY === 'low' ? 4 : 6,
  parkWake: 230, // the park's dogs are simulated while the player is within this
  poseDist: 130, // owners are posed (and their models fetched) within this
  models: ['Male_Adult_04', 'Female_Adult_04', 'Male_Adult_10', 'Female_Adult_06', 'Male_Adult_05', 'Female_Adult_02']
};

// [name, scale x/y/z, coats]
const BREEDS = [
  { name: 'kelpie', s: [1, 1, 1], coats: [0x4a3022, 0x2a2420, 0x6b4630] },
  { name: 'lab', s: [1.1, 1.08, 1.12], coats: [0xd9b45c, 0x1f1f22, 0x5a3a24] },
  { name: 'greyhound', s: [0.8, 1.16, 1.22], coats: [0x9a9a9e, 0xb98a5c, 0x3a3a40] },
  { name: 'terrier', s: [0.62, 0.62, 0.62], coats: [0xece6d6, 0x8a6a4a, 0xc9b79a] },
  { name: 'dalmatian', s: [1.0, 1.06, 1.06], coats: [0xf3f0e8], spots: true }
];

// ---------------------------------------------------------------------------------------------------------------------
// The dog: forward +z, y up, standing on y = 0 (a lab is 0.9 m long, 0.7 m to the head). Parts carry vertex colours (they
// multiply the dog's instance colour: 1 = coat, darker for ears, nose, eyes and paws).
function bx(w, h, l, x, y, z, c = [1, 1, 1]) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const GEO = {
  body: mergeGeometries([bx(0.26, 0.25, 0.34, 0, 0.47, -0.02), bx(0.24, 0.28, 0.22, 0, 0.49, 0.2), bx(0.22, 0.22, 0.2, 0, 0.46, -0.2)]),
  head: mergeGeometries([
    bx(0.15, 0.15, 0.17, 0, 0.66, 0.37), bx(0.085, 0.075, 0.13, 0, 0.63, 0.5), bx(0.05, 0.04, 0.03, 0, 0.645, 0.57, [0.12, 0.12, 0.12]),
    bx(0.035, 0.09, 0.06, 0.07, 0.72, 0.34, [0.62, 0.62, 0.62]), bx(0.035, 0.09, 0.06, -0.07, 0.72, 0.34, [0.62, 0.62, 0.62]),
    bx(0.025, 0.025, 0.02, 0.055, 0.69, 0.456, [0.05, 0.05, 0.05]), bx(0.025, 0.025, 0.02, -0.055, 0.69, 0.456, [0.05, 0.05, 0.05])
  ]),
  tail: bx(0.045, 0.045, 0.3, 0, 0.56, -0.45),
  leg: mergeGeometries([bx(0.07, 0.36, 0.07, 0, -0.18, 0), bx(0.075, 0.04, 0.1, 0, -0.34, 0.015, [0.85, 0.85, 0.85])]),
  spots: (() => {
    const p = [[0.132, 0.5, 0.15, 0.012, 0.07, 0.06], [-0.132, 0.44, -0.1, 0.012, 0.06, 0.07], [0.132, 0.46, -0.16, 0.012, 0.05, 0.05], [-0.132, 0.53, 0.2, 0.012, 0.06, 0.06],
      [0.03, 0.598, -0.1, 0.07, 0.012, 0.06], [-0.05, 0.64, 0.15, 0.06, 0.012, 0.07], [0.06, 0.64, 0.24, 0.05, 0.012, 0.05], [-0.06, 0.57, -0.24, 0.06, 0.012, 0.05]];
    return mergeGeometries(p.map(([x, y, z, w, h, l]) => bx(w, h, l, x, y, z)));
  })()
};
const HIP_Y = 0.37, FRONT_Z = 0.2, HIND_Z = -0.18, HIP_X = 0.09;
const LEGS = [[-HIP_X, FRONT_Z, 0], [HIP_X, FRONT_Z, 1], [-HIP_X, HIND_Z, 2], [HIP_X, HIND_Z, 3]]; // x, z, id (0/3 swing together when trotting)
const NECK = new THREE.Vector3(0, 0.62, 0.3), TAIL_ROOT = new THREE.Vector3(0, 0.56, -0.3), REAR = new THREE.Vector3(0, 0.36, -0.2);

// scratch
const _root = new THREE.Matrix4(), _G = new THREE.Matrix4(), _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _m = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** out = T(p) * R(rx, ry) * T(-p) (a turn about a pivot) */
function about(out, p, rx, ry) {
  out.makeTranslation(p.x, p.y, p.z);
  _b.makeRotationFromEuler(_e.set(rx, ry, 0));
  out.multiply(_b);
  _b.makeTranslation(-p.x, -p.y, -p.z);
  return out.multiply(_b);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------------------------------
// The ground under the park, sampled once with downward rays onto the city grid (lawn, paths, kerbs) into a coarse grid
const _ray = new THREE.Raycaster(), _dn = new THREE.Vector3(0, -1, 0), _org = new THREE.Vector3();
function parkGround(scene, P) {
  const targets = [];
  scene.getObjectByName('MelbourneCityGrid')?.traverse((o) => { if (o.isMesh && !(o.material && o.material.transparent)) targets.push(o); });
  const STEP = 3, x0 = P.cx - P.hx - 6, z0 = P.cz - P.hz - 6, nx = Math.ceil((2 * P.hx + 12) / STEP) + 1, nz = Math.ceil((2 * P.hz + 12) / STEP) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * STEP, z = z0 + j * STEP, t = terrainHeight(x, z);
      let best = t;
      if (targets.length) {
        _org.set(x, t + 6, z);
        _ray.set(_org, _dn);
        for (const h of _ray.intersectObjects(targets, false)) if (h.point.y > best && h.point.y < t + 0.6) best = h.point.y;
      }
      H[j * nx + i] = best;
    }
  }
  return (x, z) => {
    const fx = clamp((x - x0) / STEP, 0, nx - 1.001), fz = clamp((z - z0) / STEP, 0, nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    return H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + nx] * (1 - u) * v + H[k + nx + 1] * u * v;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The park's fixtures (one merged mesh with vertex colours): a low white fence with a gate gap, signboard, water bowl, benches
function buildFixtures(P, gy) {
  const parts = [];
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
  const add = (geo, x, y, z, yaw, col) => { // geo: unit-origin geometry already sized; placed at (x, y, z) facing yaw
    geo = geo.clone();
    mat.compose(pos.set(x, y, z), q.setFromEuler(eu.set(0, yaw, 0)), sc.set(1, 1, 1));
    geo.applyMatrix4(mat);
    const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(col, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };
  const unit = (w, h, l, oy = 0) => new THREE.BoxGeometry(w, h, l).translate(0, oy, 0);
  const WHITE = [0.9, 0.89, 0.84], GREY = [0.55, 0.6, 0.62];
  // a rail between two ground points at heights above the ground (sloped to follow the lawn)
  const rail = (ax, az, bx2, bz, hgt, w, col) => {
    const ay = gy(ax, az) + hgt, by = gy(bx2, bz) + hgt, dx = bx2 - ax, dz = bz - az, dy = by - ay, L = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(w, w, L);
    mat.compose(pos.set((ax + bx2) / 2, (ay + by) / 2, (az + bz) / 2), q.setFromEuler(eu.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0)), sc.set(1, 1, 1));
    g.applyMatrix4(mat);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const post = (x, z, h = 1.05) => add(unit(0.1, h, 0.1, h / 2), x, gy(x, z), z, 0, WHITE);
  // perimeter, going round: north (z -hz) west to east, east, south (+z) with the gate gap, west
  const { cx, cz, hx, hz, gap } = P, X0 = cx - hx, X1 = cx + hx, Z0 = cz - hz, Z1 = cz + hz;
  const side = (ax, az, bx2, bz, gapAt = null) => {
    const L = Math.hypot(bx2 - ax, bz - az), n = Math.ceil(L / 3), ux = (bx2 - ax) / L, uz = (bz - az) / L;
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([ax + (bx2 - ax) * (i / n), az + (bz - az) * (i / n)]);
    if (gapAt !== null) { // replace the points by the two runs either side of the gap
      const a = [], b = [];
      for (const p of pts) { const t = (p[0] - ax) * ux + (p[1] - az) * uz; if (t < gapAt - gap - 0.5) a.push(p); else if (t > gapAt + gap + 0.5) b.push(p); }
      a.push([ax + ux * (gapAt - gap), az + uz * (gapAt - gap)]); b.unshift([ax + ux * (gapAt + gap), az + uz * (gapAt + gap)]);
      for (const run of [a, b]) { for (const p of run) post(p[0], p[1], p === a[a.length - 1] || p === b[0] ? 1.35 : 1.05); for (let i = 0; i < run.length - 1; i++) for (const h of [0.4, 0.85]) rail(run[i][0], run[i][1], run[i + 1][0], run[i + 1][1], h, 0.05, WHITE); }
    } else {
      for (const p of pts) post(p[0], p[1]);
      for (let i = 0; i < pts.length - 1; i++) for (const h of [0.4, 0.85]) rail(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], h, 0.05, WHITE);
    }
  };
  side(X0, Z0, X1, Z0); side(X1, Z0, X1, Z1); side(X1, Z1, X0, Z1, X1 - X0 > 0 ? (X1 - X0) / 2 : null); side(X0, Z1, X0, Z0);
  // signboard beside the gate: blue board on two posts
  const sx = cx + gap + 2.4, sz = Z1 + 0.5;
  add(unit(0.08, 1.5, 0.08, 0.75), sx - 0.6, gy(sx, sz), sz, 0, GREY); add(unit(0.08, 1.5, 0.08, 0.75), sx + 0.6, gy(sx, sz), sz, 0, GREY);
  add(unit(1.4, 0.7, 0.05, 0), sx, gy(sx, sz) + 1.25, sz, 0, [0.12, 0.34, 0.62]); add(unit(1.0, 0.12, 0.06, 0), sx, gy(sx, sz) + 1.4, sz + 0.01, 0, [0.95, 0.95, 0.95]);
  add(unit(0.4, 0.22, 0.06, 0), sx, gy(sx, sz) + 1.15, sz + 0.01, 0, [0.9, 0.7, 0.2]);
  // water bowl on a short post (east side) with a tap
  const bxp = cx + hx - 2.2, bzp = cz + 4;
  add(new THREE.CylinderGeometry(0.3, 0.26, 0.12, 12).translate(0, 0.08, 0), bxp, gy(bxp, bzp), bzp, 0, GREY);
  add(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 12).translate(0, 0.14, 0), bxp, gy(bxp, bzp), bzp, 0, [0.25, 0.5, 0.8]);
  add(unit(0.07, 0.75, 0.07, 0.375), bxp + 0.5, gy(bxp, bzp), bzp, 0, GREY);
  add(unit(0.06, 0.06, 0.28, 0), bxp + 0.5, gy(bxp, bzp) + 0.74, bzp - 0.12, 0, GREY);
  // benches (facing into the area): one on the south side west of the gate, one on the north side
  const bench = (x, z, yaw) => {
    const y = gy(x, z), cs = Math.cos(yaw), sn = Math.sin(yaw);
    add(unit(1.6, 0.06, 0.45), x, y + 0.45, z, yaw, [0.45, 0.3, 0.18]);
    add(unit(1.6, 0.38, 0.05), x - sn * 0.21, y + 0.72, z - cs * 0.21, yaw, [0.45, 0.3, 0.18]);
    for (const s of [-1, 1]) add(unit(0.08, 0.45, 0.4, 0.225), x + cs * 0.7 * s, y, z - sn * 0.7 * s, yaw, GREY);
  };
  bench(cx - 11, Z1 - 1.0, Math.PI); bench(cx + 9, Z0 + 1.0, 0);
  const geo = mergeGeometries(parts);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.name = 'DogParkFixtures';
  mesh.castShadow = !LITE;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------------
export function createDogs({ scene, controllerManager: cm, cast = null, getAudio = () => null, getPeds = () => [], getCars = () => [] }) {
  const P = CONFIG.park;
  const root = new THREE.Group();
  root.name = 'Dogs';
  scene.add(root);
  const gy = parkGround(scene, P);
  root.add(buildFixtures(P, gy));

  // ---- the shared meshes
  const N = CONFIG.parkDogs + CONFIG.streetDogs;
  const coatMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92 });
  const mkIM = (geo, cnt, mat = coatMat) => {
    const m = new THREE.InstancedMesh(geo, mat, cnt);
    m.frustumCulled = false;
    m.castShadow = !LITE;
    m.receiveShadow = false;
    for (let i = 0; i < cnt; i++) { m.setMatrixAt(i, ZERO); if (mat === coatMat) m.setColorAt(i, _c.set(0xffffff)); }
    root.add(m);
    return m;
  };
  const bodyIM = mkIM(GEO.body, N), headIM = mkIM(GEO.head, N), tailIM = mkIM(GEO.tail, N), legIM = mkIM(GEO.leg, N * 4);
  const spotIM = mkIM(GEO.spots, N, new THREE.MeshStandardNodeMaterial({ color: 0x1a1a1a, roughness: 0.95 }));
  spotIM.count = N;
  // the tennis ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardNodeMaterial({ color: 0xc9e52a, roughness: 0.8 }));
  ball.frustumCulled = false; ball.visible = false; root.add(ball);
  // the leads: one segment per street dog (owner's hand to the collar)
  const leadPos = new THREE.BufferAttribute(new Float32Array(CONFIG.streetDogs * 6), 3);
  leadPos.setUsage(THREE.DynamicDrawUsage);
  const leadGeo = new THREE.BufferGeometry(); leadGeo.setAttribute('position', leadPos);
  const lead = new THREE.LineSegments(leadGeo, new THREE.LineBasicNodeMaterial({ color: 0xb02a22 }));
  lead.frustumCulled = false; lead.visible = false; root.add(lead);

  // ---- the dogs
  const dogs = [];
  const mkDog = (kind, i) => {
    const bi = kind === 'park' ? (i % BREEDS.length) : Math.floor(Math.random() * BREEDS.length), br = BREEDS[bi];
    const coat = br.coats[Math.floor(Math.random() * br.coats.length)];
    const d = {
      kind, idx: dogs.length, breed: br, coat, scale: br.s, x: 0, y: 0, z: 0, yaw: Math.random() * 6.28, v: 0, phase: Math.random() * 6.28,
      sit: 0, sniff: 0, mode: 'stand', t: rnd(0.5, 3), tx: 0, tz: 0, job: null, jobT: 0, target: null, speed: 2, wagSeed: Math.random() * 10,
      active: false, ped: null, side: Math.random() < 0.5 ? 1 : -1, flee: 0, fx: 0, fz: 0, happy: 0.5, woofT: rnd(2, 8), carrying: false, sniffT: 0
    };
    dogs.push(d);
    return d;
  };
  const parkDogs = [], streetDogs = [];
  for (let i = 0; i < CONFIG.parkDogs; i++) parkDogs.push(mkDog('park', i));
  for (let i = 0; i < CONFIG.streetDogs; i++) streetDogs.push(mkDog('street', i));
  // coat colours (the dalmatians' spots are the instances k = 0.. of spotIM, rewritten each frame)
  for (const d of dogs) for (const [m, ids] of [[bodyIM, [d.idx]], [headIM, [d.idx]], [tailIM, [d.idx]], [legIM, [0, 1, 2, 3].map((l) => d.idx * 4 + l)]]) for (const i of ids) m.setColorAt(i, _c.set(d.coat));
  const parkHome = () => ({ x: P.cx + rnd(-P.hx + 3, P.hx - 3), z: P.cz + rnd(-P.hz + 3, P.hz - 3) });
  for (const d of parkDogs) { const h = parkHome(); d.x = h.x; d.z = h.z; d.active = true; }

  // ---- sound: a bark and a yelp, synthesised (js/audio-system.js's context and mix)
  let lastWoof = -9;
  function voice(kind, d) {
    const au = getAudio();
    const ctx = au?.context;
    if (!ctx || ctx.state !== 'running' || !au.mix) return;
    const pp = cm.getActiveEntity().position;
    const dist = Math.hypot(d.x - pp.x, d.z - pp.z);
    if (dist > 70 || ctx.currentTime - lastWoof < 0.35) return;
    lastWoof = ctx.currentTime;
    const t0 = ctx.currentTime, big = clamp(1.25 - d.scale[2] * 0.55, 0.5, 1.2); // small dogs: higher
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = o2.type = 'sawtooth';
    const gv = 0.22 / (1 + dist / 6);
    if (kind === 'yelp') {
      o.frequency.setValueAtTime(700 * big, t0); o.frequency.exponentialRampToValueAtTime(1500 * big, t0 + 0.09); o.frequency.exponentialRampToValueAtTime(600 * big, t0 + 0.32);
      o2.frequency.value = 0; f.frequency.value = 2200; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gv, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    } else {
      o.frequency.setValueAtTime(330 * big, t0); o.frequency.exponentialRampToValueAtTime(190 * big, t0 + 0.13);
      o2.frequency.setValueAtTime(662 * big, t0); o2.frequency.exponentialRampToValueAtTime(380 * big, t0 + 0.13);
      f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gv, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    }
    f.type = 'bandpass'; f.Q.value = 1.2;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(au.mix);
    o.start(t0); o2.start(t0); o.stop(t0 + 0.4); o2.stop(t0 + 0.4);
  }

  // ---- movement: turn towards (tx, tz) and move at `speed`; returns the distance left
  function steer(d, tx, tz, speed, dt, turn = 7) {
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      const want = Math.atan2(dx, dz), da = angDiff(want, d.yaw);
      d.yaw += clamp(da, -turn * dt, turn * dt);
      const sp = Math.min(speed * Math.max(0.15, Math.cos(da)), dist / Math.max(dt, 1e-3));
      d.x += Math.sin(d.yaw) * sp * dt; d.z += Math.cos(d.yaw) * sp * dt;
      d.v += (sp - d.v) * Math.min(1, dt * 8);
    } else d.v += (0 - d.v) * Math.min(1, dt * 8);
    return dist;
  }
  const inPark = (d, m = 0.7) => { d.x = clamp(d.x, P.cx - P.hx + m, P.cx + P.hx - m); d.z = clamp(d.z, P.cz - P.hz + m, P.cz + P.hz - m); };
  const stand = (d, dt) => { d.v += (0 - d.v) * Math.min(1, dt * 8); };

  // ---- the ball (a thrower at owner 0 throws it, two dogs fetch it, one brings it back, the other plays chase)
  const owners = [];
  const OW = [[-16, 4], [17, -3], [-3, -12.2], [4, 11.4], [12, -11], [-12, 10]];
  for (let i = 0; i < CONFIG.owners; i++) owners.push({ key: `dogowner${i}`, model: CONFIG.models[i % CONFIG.models.length], x: P.cx + OW[i][0], z: P.cz + OW[i][1], heading: 0, posed: false });
  const thrower = owners[0];
  const B = { state: 'held', x: thrower.x, y: 1.1, z: thrower.z, vx: 0, vy: 0, vz: 0, timer: 3, carrier: null };
  function throwBall() {
    const gyb = gy(thrower.x, thrower.z), T = 1.2;
    const tx = P.cx + rnd(-3, P.hx - 5), tz = P.cz + rnd(-P.hz + 4, P.hz - 4);
    B.x = thrower.x; B.z = thrower.z; B.y = gyb + 1.5;
    B.vx = (tx - B.x) / T; B.vz = (tz - B.z) / T; B.vy = 0.5 * 9.8 * T - (B.y - gy(tx, tz)) / T;
    B.state = 'air'; B.carrier = null;
    const free = parkDogs.filter((d) => !d.job).sort(() => Math.random() - 0.5);
    for (const d of free.slice(0, 2)) { d.job = 'fetch'; d.jobT = 14; d.mode = 'run'; }
  }
  function updateBall(dt) {
    if (B.state === 'held') {
      B.x = thrower.x + Math.sin(thrower.heading) * 0.3; B.z = thrower.z + Math.cos(thrower.heading) * 0.3; B.y = gy(thrower.x, thrower.z) + 1.1;
      if ((B.timer -= dt) <= 0 && parkDogs.some((d) => !d.job)) { throwBall(); B.timer = rnd(5, 9); }
    } else if (B.state === 'air' || B.state === 'roll') {
      B.vy -= 9.8 * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      const g = gy(B.x, B.z) + 0.07;
      if (B.y < g) {
        B.y = g;
        if (Math.abs(B.vy) > 1.2) { B.vy *= -0.45; B.vx *= 0.75; B.vz *= 0.75; B.state = 'air'; } else { B.vy = 0; B.state = 'roll'; }
      }
      if (B.state === 'roll') { const k = Math.exp(-1.6 * dt); B.vx *= k; B.vz *= k; }
      B.x = clamp(B.x, P.cx - P.hx + 0.5, P.cx + P.hx - 0.5); B.z = clamp(B.z, P.cz - P.hz + 0.5, P.cz + P.hz - 0.5);
      if (B.state === 'roll' && Math.hypot(B.vx, B.vz) < 0.15 && !parkDogs.some((d) => d.job === 'fetch') && (B.timer -= dt) < -8) { B.state = 'held'; B.timer = 3; } // (nobody fetched it: the owner picks it up)
    } else if (B.state === 'carried' && B.carrier) {
      const d = B.carrier, s = d.scale[2];
      B.x = d.x + Math.sin(d.yaw) * 0.56 * s; B.z = d.z + Math.cos(d.yaw) * 0.56 * s; B.y = d.y + 0.58 * d.scale[1];
    }
    ball.visible = true;
    ball.position.set(B.x, B.y, B.z);
  }

  // ---- AI
  function pickNext(d) {
    const r = Math.random();
    if (r < 0.34) { const h = parkHome(); d.tx = h.x; d.tz = h.z; d.mode = 'trot'; d.speed = rnd(1.6, 2.4); d.t = 12; }
    else if (r < 0.52) { d.mode = 'sniff'; d.t = rnd(2.5, 5); }
    else if (r < 0.66) { d.mode = 'sit'; d.t = rnd(3, 6); }
    else if (r < 0.88) { const h = parkHome(); d.tx = h.x; d.tz = h.z; d.mode = 'run'; d.speed = rnd(4.5, 6.2); d.t = 8; }
    else {
      const o = parkDogs.filter((q) => q !== d && !q.job);
      if (o.length) { const q = o[Math.floor(Math.random() * o.length)]; d.job = 'chase'; d.target = q; d.jobT = rnd(4, 6); d.mode = 'run'; q.job = 'flee'; q.jobT = d.jobT; q.target = d; q.mode = 'run'; const h = parkHome(); q.tx = h.x; q.tz = h.z; }
      else { d.mode = 'stand'; d.t = 1.5; }
    }
  }
  function thinkPark(d, dt) {
    if (d.job === 'fetch') {
      d.jobT -= dt; d.mode = 'run';
      if (B.state === 'carried' && B.carrier !== d) { d.job = 'chase'; d.target = B.carrier; d.jobT = 10; return; }
      if (B.state === 'held') { d.job = null; d.mode = 'stand'; d.t = 2; return; }
      if (B.state === 'carried') return;
      const dist = steer(d, B.x, B.z, 6.6, dt, 9);
      if (dist < 0.55 && B.y < d.y + 0.9) { B.state = 'carried'; B.carrier = d; d.job = 'return'; d.jobT = 12; voice('woof', d); }
      else if (d.jobT <= 0) { d.job = null; d.t = 0; }
      return;
    }
    if (d.job === 'return') {
      d.mode = 'run'; d.jobT -= dt;
      const dist = steer(d, thrower.x, thrower.z, 5.6, dt, 8);
      if (dist < 1.7 || d.jobT <= 0) { B.state = 'held'; B.carrier = null; B.timer = rnd(3, 5); d.job = null; d.mode = 'sit'; d.t = 3.5; d.happy = 1; }
      return;
    }
    if (d.job === 'chase') {
      d.mode = 'run'; d.jobT -= dt;
      const q = d.target; steer(d, q.x, q.z, 5.4, dt, 8);
      if (d.jobT <= 0 || (B.state === 'held' && B.carrier === null && q.job !== 'return')) { d.job = null; d.target = null; d.mode = 'stand'; d.t = rnd(1, 2.5); }
      return;
    }
    if (d.job === 'flee') {
      d.mode = 'run'; d.jobT -= dt;
      if (steer(d, d.tx, d.tz, 5.8, dt, 7) < 1.5) { const h = parkHome(); d.tx = h.x; d.tz = h.z; }
      if (d.jobT <= 0) { d.job = null; d.target = null; d.mode = 'stand'; d.t = rnd(1, 2.5); }
      return;
    }
    d.t -= dt;
    if (d.mode === 'trot' || d.mode === 'run') {
      const dist = steer(d, d.tx, d.tz, d.speed, dt);
      if (dist < 0.8 || d.t <= 0) { d.mode = 'stand'; d.t = rnd(0.6, 1.5); }
    } else {
      stand(d, dt);
      if (d.t <= 0) pickNext(d);
    }
  }

  // street dogs: follow their pedestrian
  const claimed = new Set();
  function bindStreet(d, peds, pp) {
    const n = peds.length;
    for (let k = 0, s = Math.floor(Math.random() * n); k < n; k++) {
      const p = peds[(s + k) % n];
      if (!p.placed || p.dead || p.role !== 'civilian' || claimed.has(p) || p.v < 0.3) continue;
      const dd = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (dd < 25 || dd > 110) continue;
      d.ped = p; claimed.add(p);
      d.fx = p.ux * p.dir; d.fz = p.uz * p.dir;
      d.x = p.x - d.fz * d.side * 0.9 + d.fx * 0.4; d.z = p.z + d.fx * d.side * 0.9 + d.fz * 0.4;
      d.yaw = Math.atan2(d.fx, d.fz); d.v = 0; d.flee = 0; d.job = null; d.active = true; d.mode = 'trot'; d.t = rnd(6, 14);
      return true;
    }
    return false;
  }
  function releaseStreet(d) { if (d.ped) claimed.delete(d.ped); d.ped = null; }
  function thinkStreet(d, dt, pp) {
    if (d.flee > 0) { // struck by a car: bolts away, then disappears
      d.flee -= dt;
      steer(d, d.x + d.fx * 10, d.z + d.fz * 10, 7.5, dt, 10);
      d.mode = 'run';
      if (d.flee <= 0) { d.active = false; }
      return;
    }
    const p = d.ped;
    if (!p) return;
    if (!p.placed || p.dead || Math.hypot(p.x - pp.x, p.z - pp.z) > 135) { releaseStreet(d); d.active = false; return; }
    if (p.v > 0.1) { d.fx = p.ux * p.dir; d.fz = p.uz * p.dir; }
    // beside the owner (a metre to their side and a little ahead)
    const tx = p.x - d.fz * d.side * 0.95 + d.fx * (0.45 + Math.min(0.5, p.v * 0.25)), tz = p.z + d.fx * d.side * 0.95 + d.fz * (0.45 + Math.min(0.5, p.v * 0.25));
    const dist = Math.hypot(tx - d.x, tz - d.z);
    if (p.v < 0.2 && dist < 0.5) { // owner has stopped: sniff about or sit
      stand(d, dt); d.t -= dt;
      if (d.t <= 0) { d.mode = d.mode === 'sniff' ? 'sit' : d.mode === 'sit' ? 'stand' : 'sniff'; d.t = rnd(2, 5); }
    } else { d.mode = 'trot'; steer(d, tx, tz, Math.min(6.5, 0.4 + p.v + dist * 2.4), dt, 9); d.t = rnd(1, 2); }
    if (dist > 14) { d.x = tx; d.z = tz; } // (a teleporting ped: never left behind)
  }

  // struck by the player's car or any moving one
  function hitCheck(d, pp, ent, car) {
    if (d.flee > 0) return;
    const test = (x, z, sp, r) => {
      if (Math.abs(sp) < 3) return false;
      const dx = d.x - x, dz = d.z - z;
      if (dx * dx + dz * dz > r * r) return false;
      const l = Math.hypot(dx, dz) || 1; d.fx = dx / l; d.fz = dz / l;
      return true;
    };
    let hit = false;
    if (car && test(ent.position.x, ent.position.z, ent.speed || 0, 2.3)) hit = true;
    if (!hit && Math.hypot(d.x - pp.x, d.z - pp.z) < 40) for (const v of getCars()) { if (!v.parked && test(v.x, v.z, v.speed || 0, 2.2)) { hit = true; break; } }
    if (!hit) return;
    d.flee = 4; d.job = null; releaseStreet(d); voice('yelp', d);
    if (d.kind === 'park') { d.flee = 0; d.job = 'flee'; d.jobT = 5; d.tx = P.cx + rnd(-P.hx, P.hx) * 0.8; d.tz = P.cz + rnd(-P.hz, P.hz) * 0.8; d.mode = 'run'; }
  }

  // ---- drawing
  let spotN = 0;
  function writeDog(d, k, t) {
    const [sx, sy, sz] = d.scale, y0 = d.y;
    if (d.active === false) { for (const m of [bodyIM, headIM, tailIM]) m.setMatrixAt(k, ZERO); for (let l = 0; l < 4; l++) legIM.setMatrixAt(k * 4 + l, ZERO); return; }
    _root.compose(_v.set(d.x, y0, d.z), _q.setFromEuler(_e.set(0, d.yaw, 0)), _s.set(sx, sy, sz));
    // pose: speed gives the gait (trot < 3.2 m/s, gallop above), modes the sit and the sniff
    const v = d.v, run = clamp((v - 2.6) / 1.8, 0, 1), moving = clamp(v / 0.5, 0, 1);
    const tgtSit = d.mode === 'sit' && v < 0.4 ? 1 : 0, tgtSniff = d.mode === 'sniff' && v < 0.6 ? 1 : 0;
    d.sit += (tgtSit - d.sit) * 0.08; d.sniff += (tgtSniff - d.sniff) * 0.1;
    const sit = d.sit, sn = d.sniff;
    const swing = (0.42 + run * 0.5) * moving, ph = d.phase;
    const bob = Math.abs(Math.sin(ph)) * (0.025 + run * 0.03) * moving * (1 - sit), pitch = (Math.sin(ph * (run > 0.5 ? 1 : 2)) * 0.05 * run + sn * 0.12) - 0.85 * sit;
    _G.makeTranslation(0, bob - 0.3 * sit, 0).multiply(about(_a, REAR, pitch, 0));
    _m.copy(_root).multiply(_G); bodyIM.setMatrixAt(k, _m);
    // head: nose down to sniff, looks about a little, forward when sitting
    const look = Math.sin(t * 0.9 + d.wagSeed) * 0.35 * (sit + sn), nod = sn * (0.95 + Math.sin(t * 5 + d.wagSeed) * 0.12) + sit * 0.55 + Math.sin(ph * 2) * 0.05 * run;
    about(_a, NECK, nod, look); _m.copy(_root).multiply(_G).multiply(_a); headIM.setMatrixAt(k, _m);
    // tail: up when happy, wagging faster the happier
    const happy = clamp(d.happy + run * 0.5 + (d.job ? 0.4 : 0), 0, 1), wag = Math.sin(t * (10 + happy * 12) + d.wagSeed) * (0.25 + happy * 0.55);
    about(_a, TAIL_ROOT, 0.45 + run * 0.15 - happy * 0.1 + sit * 0.35, wag); _m.copy(_root).multiply(_G).multiply(_a); tailIM.setMatrixAt(k, _m);
    // legs: a trot swings the diagonal pairs together, a gallop the two fronts and the two hinds
    for (const [lx, lz, id] of LEGS) {
      const front = id < 2, gal = id === 0 || id === 1 ? ph : ph + 2.2, trot = id === 0 || id === 3 ? ph : ph + Math.PI;
      const a = (Math.sin(run > 0.5 ? gal : trot)) * swing;
      _v.set(lx, HIP_Y, lz).applyMatrix4(_G);
      const kk = THREE.MathUtils.lerp(1, clamp(_v.y / HIP_Y, 0.2, 1.15), sit);
      _m.copy(_root).multiply(_a.makeTranslation(_v.x, _v.y, _v.z)).multiply(_b.makeRotationX(a - pitch * (front ? 1 : 0.6))).multiply(_a.makeScale(1, kk, 1));
      legIM.setMatrixAt(k * 4 + id, _m);
    }
    if (d.breed.spots) { _m.copy(_root).multiply(_G); spotIM.setMatrixAt(spotN++, _m); }
  }

  let t = 0, bindT = 0;
  function update(dt, camPos) {
    dt = Math.min(dt, 0.1);
    t += dt;
    const ent = cm.getActiveEntity(), pp = ent.position, car = cm.activeMode !== 'person';
    const dpark = Math.hypot(pp.x - P.cx, pp.z - P.cz);
    // -- the park
    const parkAwake = dpark < CONFIG.parkWake;
    if (parkAwake) {
      for (const d of parkDogs) {
        if (!d.active) { d.active = true; const h = parkHome(); d.x = h.x; d.z = h.z; d.job = null; d.mode = 'stand'; d.t = rnd(0.2, 2); }
        thinkPark(d, dt); inPark(d);
        d.happy += ((d.job ? 1 : 0.45) - d.happy) * dt;
        d.woofT -= dt; if (d.woofT <= 0) { d.woofT = rnd(3, 10); if (d.mode === 'run' || d.job) voice('woof', d); }
        hitCheck(d, pp, ent, car);
      }
      updateBall(dt);
    } else {
      for (const d of parkDogs) d.active = false;
      ball.visible = false;
    }
    // owners
    for (const o of owners) {
      const on = dpark < CONFIG.poseDist;
      if (!on) { if (o.posed) { cast?.setActor(o.key, null, null); o.posed = false; } continue; }
      const f = o === thrower ? B : parkDogs[0];
      const want = Math.atan2(f.x - o.x, f.z - o.z);
      o.heading = o.heading + angDiff(want, o.heading) * Math.min(1, dt * 2.5);
      cast?.setActor(o.key, o.model, { x: o.x, y: gy(o.x, o.z), z: o.z, heading: o.heading, ease: 3 }, 'idle');
      o.posed = true;
    }
    // -- street dogs
    const peds = getPeds();
    bindT -= dt;
    if (bindT <= 0 && peds.length) {
      bindT = 0.8;
      for (const d of streetDogs) { if (!d.ped && d.flee <= 0 && !d.active) bindStreet(d, peds, pp); }
    }
    let leads = 0;
    for (const d of streetDogs) {
      if (!d.active) { leadPos.setXYZ(leads * 2, 0, 0, 0); leadPos.setXYZ(leads * 2 + 1, 0, 0, 0); leads++; continue; }
      thinkStreet(d, dt, pp);
      hitCheck(d, pp, ent, car);
      d.woofT -= dt; if (d.woofT <= 0) { d.woofT = rnd(8, 25); if (Math.random() < 0.5) voice('woof', d); }
      const p = d.ped;
      if (p) { // lead: owner's hand to the collar
        const hx = p.x + d.fz * d.side * 0.2, hz = p.z - d.fx * d.side * 0.2;
        const hy = terrainHeight(p.x, p.z) + 0.22 + 0.95;
        leadPos.setXYZ(leads * 2, hx, hy, hz);
        leadPos.setXYZ(leads * 2 + 1, d.x + Math.sin(d.yaw) * 0.32 * d.scale[2], d.y + 0.58 * d.scale[1], d.z + Math.cos(d.yaw) * 0.32 * d.scale[2]);
      } else { leadPos.setXYZ(leads * 2, 0, 0, 0); leadPos.setXYZ(leads * 2 + 1, 0, 0, 0); }
      leads++;
    }
    leadPos.needsUpdate = true;
    lead.visible = true;
    // -- ground heights, the gait clock and the drawing
    spotN = 0;
    for (let k = 0; k < dogs.length; k++) {
      const d = dogs[k];
      if (d.active) {
        const onPark = d.kind === 'park';
        const gh = onPark ? gy(d.x, d.z) : terrainHeight(d.x, d.z) + (d.ped && d.ped.node && d.ped.t > 2 && d.ped.t < d.ped.len - 2 ? 0.012 : 0.22);
        d.y += (gh - d.y) * Math.min(1, dt * 14);
        if (Math.abs(d.y - gh) > 1) d.y = gh;
        d.phase += d.v * (d.v > 3.2 ? 1.9 : 4.6) * dt;
      }
      writeDog(d, k, t);
    }
    for (let i = spotN; i < N; i++) spotIM.setMatrixAt(i, ZERO);
    for (const m of [bodyIM, headIM, tailIM, legIM, spotIM]) m.instanceMatrix.needsUpdate = true;
  }
  return {
    update, group: root, dogs, parkDogs, streetDogs, ball: B, owners, centre: { x: P.cx, z: P.cz },
    stats: () => ({ park: parkDogs.filter((d) => d.active).length, street: streetDogs.filter((d) => d.active).length, bound: streetDogs.filter((d) => d.ped).length })
  };
}
