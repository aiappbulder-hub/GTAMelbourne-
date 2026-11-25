// Arbory Afloat: the floating bar moored on the Yarra at Flinders Walk, right below Flinders Street Station (Arbory Bar
// is on the old platform 11 above it). A timber pontoon on dark floats a few metres off the north bank's quay, reached by
// two gangways: a bar counter with a back bar and stools under a shade sail, four tables under green and white
// umbrellas, planters, rails, an ARBORY AFLOAT sign over each end, and festoon lights strung pole to pole that glow at
// night. Walkable (controllerManager.extraGround). A bartender and a few patrons are there when you are close, and the
// music turns to the deck's house set when you're on foot by it (js/music.js api.venue). The job "Arbory Afloat"
// (js/missions.js) starts at the bar.
//
// Cost: everything is merged into one mesh per material (8 draw calls), hidden beyond 700 m; no lights (the bulbs are
// emissive, the bloom does the rest). Built in its own frame: x along the bank (east), z out over the river, y up.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';

// The north bank's quay below the station, from the Yarra's outline in js/melbourne-geodata.js: (-223.4, 357.4) to
// (-154.6, 365.1)
const BANK_A = [-223.4, 357.4], BANK_B = [-154.6, 365.1];
const BL = Math.hypot(BANK_B[0] - BANK_A[0], BANK_B[1] - BANK_A[1]);
const UX = (BANK_B[0] - BANK_A[0]) / BL, UZ = (BANK_B[1] - BANK_A[1]) / BL; // along the bank (downstream is -u)
const NX = -UZ, NZ = UX; // out over the river (south)
const ALONG = 38; // metres from BANK_A to the middle of the pontoon
const OFF = 8; // metres from the quay edge out to the pontoon's middle
const HL = 13, HW = 5; // half length and half width of the deck
export const DECK_Y = -0.9; // the deck's top (the river is at -1.6)
const GANG = [-8, 8]; // the gangways' positions along the deck
const GANG_LAND = -OFF - 0.6; // where a gangway lands on the quay (local z)
const CX = BANK_A[0] + UX * ALONG + NX * OFF, CZ = BANK_A[1] + UZ * ALONG + NZ * OFF;
const YAW = Math.atan2(-UZ, UX); // the group's turn: local x to u, local z to n

/** A point on the deck (local a along the bank, b out over the river) in world metres */
export function arboryPoint(a, b) { return { x: CX + UX * a + NX * b, z: CZ + UZ * a + NZ * b }; }
const toLocal = (x, z) => { const dx = x - CX, dz = z - CZ; return { a: dx * UX + dz * UZ, b: dx * NX + dz * NZ }; };
// where people stand (the story's places for the job; y: on the deck)
const P = (a, b, label) => ({ ...arboryPoint(a, b), y: DECK_Y, label, territory: 'GRID' });
export const ARBORY_PLACES = {
  ARBORY: P(6.2, 0.4, 'Arbory Afloat, the floating bar below Flinders Street Station'),
  ARBORY_JULES: P(4.6, -0.6, 'Arbory Afloat, the end of the bar'),
  ARBORY_DECK: P(-6, 2.5, 'Arbory Afloat, the tables on the river side'),
  ARBORY_WALK: { ...arboryPoint(GANG[1], GANG_LAND - 2.5), label: 'Flinders Walk, at the top of the gangway', territory: 'GRID' }
};

export function createArboryAfloat({ scene, controllerManager = null, cast = null, lightingSystem = null }) {
  const root = new THREE.Group();
  root.name = 'ArboryAfloat';
  root.position.set(CX, 0, CZ);
  root.rotation.y = YAW;
  scene.add(root);
  const quayY = terrainHeight(arboryPoint(GANG[1], GANG_LAND).x, arboryPoint(GANG[1], GANG_LAND).z) + 0.22;

  const std = (o) => new THREE.MeshStandardNodeMaterial({ roughness: 0.8, ...o });
  const M = {
    timber: std({ color: 0x9a7350, roughness: 0.85 }),
    float: std({ color: 0x33383d, roughness: 0.6 }),
    dark: std({ color: 0x24262a, roughness: 0.45, metalness: 0.6 }),
    green: std({ color: 0x245c44, roughness: 0.7 }),
    canvas: std({ color: 0xf2eee4, roughness: 0.9, side: THREE.DoubleSide }),
    leaf: std({ color: 0x3d6b2c, roughness: 0.95 }),
    bulb: std({ color: 0xfff1cf, emissive: new THREE.Color(0xffc56b), emissiveIntensity: 0.2, roughness: 0.3 })
  };
  const geos = new Map(Object.keys(M).map((k) => [k, []]));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  function add(mat, g, x, y, z, rx = 0, ry = 0, rz = 0) {
    g = g.index ? g.toNonIndexed() : g;
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s));
    geos.get(mat).push(g);
  }
  const box = (mat, x, y, z, sx, sy, sz, rx, ry, rz) => add(mat, new THREE.BoxGeometry(sx, sy, sz), x, y, z, rx, ry, rz);
  const cyl = (mat, x, y, z, r0, r1, h, seg = 8) => add(mat, new THREE.CylinderGeometry(r0, r1, h, seg), x, y, z);
  const Y = DECK_Y;

  // the pontoon: floats, the deck and its edge boards
  box('float', 0, -1.55, 0, HL * 2 + 0.4, 1.0, HW * 2 + 0.4);
  box('timber', 0, Y - 0.08, 0, HL * 2, 0.16, HW * 2);
  for (const s of [-1, 1]) box('dark', 0, Y - 0.2, s * (HW + 0.18), HL * 2 + 0.4, 0.3, 0.12);
  // rails: posts and a top rail on the river side and the ends; the bank side open at the gangways
  const railRun = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
    box('dark', (x0 + x1) / 2, Y + 1.05, (z0 + z1) / 2, L, 0.06, 0.06, 0, ry, 0);
    box('dark', (x0 + x1) / 2, Y + 0.55, (z0 + z1) / 2, L, 0.03, 0.03, 0, ry, 0);
    const n = Math.max(1, Math.round(L / 2));
    for (let i = 0; i <= n; i++) box('dark', x0 + ((x1 - x0) * i) / n, Y + 0.53, z0 + ((z1 - z0) * i) / n, 0.06, 1.06, 0.06);
  };
  const E = HL - 0.1, W = HW - 0.1;
  railRun(-E, W, E, W);
  railRun(-E, -W, -E, W);
  railRun(E, -W, E, W);
  railRun(-E, -W, GANG[0] - 1.1, -W);
  railRun(GANG[0] + 1.1, -W, GANG[1] - 1.1, -W);
  railRun(GANG[1] + 1.1, -W, E, -W);
  // the gangways: a ramp from the quay down to the deck, with handrails
  for (const g of GANG) {
    const z0 = GANG_LAND, z1 = -HW, L = Math.hypot(z1 - z0, Y - quayY), tilt = Math.atan2(quayY - Y, z1 - z0);
    box('timber', g, (quayY + Y) / 2 - 0.05, (z0 + z1) / 2, 1.9, 0.1, L, tilt, 0, 0);
    for (const s of [-1, 1]) {
      box('dark', g + s * 0.95, (quayY + Y) / 2 + 0.95, (z0 + z1) / 2, 0.05, 0.05, L, tilt, 0, 0);
      box('dark', g + s * 0.95, quayY + 0.48, z0 + 0.1, 0.06, 0.96, 0.06);
      box('dark', g + s * 0.95, Y + 0.48, z1, 0.06, 0.96, 0.06);
    }
    // an arch over the deck end with the sign on it (the sign itself: below)
    for (const s of [-1, 1]) box('green', g + s * 1.05, Y + 1.4, z1 + 0.2, 0.12, 2.8, 0.12);
    box('green', g, Y + 2.8, z1 + 0.2, 2.3, 0.14, 0.14);
  }

  // the bar: a counter facing the river with a green front and a pale top, a back bar with shelves and bottles
  const BZ = -1.9; // the counter's front face
  box('green', 0, Y + 0.53, BZ - 0.3, 8, 1.06, 0.6);
  box('canvas', 0, Y + 1.1, BZ - 0.25, 8.3, 0.06, 0.8);
  box('timber', 0, Y + 0.12, BZ + 0.05, 8, 0.06, 0.12); // the foot rail
  box('timber', 0, Y + 0.45, -4.2, 8, 0.9, 0.5);
  for (const h of [1.25, 1.7]) box('timber', 0, Y + h, -4.35, 8, 0.05, 0.3);
  for (let i = 0; i < 30; i++) {
    const x = -3.8 + i * 0.26, h = 0.24 + ((i * 7) % 5) * 0.03, sh = i % 2 ? 1.7 : 1.25;
    add(i % 3 ? 'leaf' : 'dark', new THREE.CylinderGeometry(0.04, 0.045, h, 6), x, Y + sh + 0.025 + h / 2, -4.33);
  }
  // the shade sail over the bar, on four posts
  for (const [x, z] of [[-4.8, -4.7], [4.8, -4.7], [-4.8, -0.6], [4.8, -0.6]]) cyl('dark', x, Y + 1.65, z, 0.06, 0.06, 3.3, 6);
  box('canvas', 0, Y + 3.2, -2.65, 10, 0.04, 4.6, 0.1, 0, 0);
  // stools at the counter (tall: drinkers lean on them standing)
  for (let i = 0; i < 6; i++) {
    const x = -3.2 + i * 1.28;
    cyl('dark', x, Y + 0.38, BZ + 0.55, 0.03, 0.03, 0.76, 6);
    cyl('green', x, Y + 0.78, BZ + 0.55, 0.2, 0.2, 0.06, 10);
    cyl('dark', x, Y + 0.02, BZ + 0.55, 0.18, 0.2, 0.04, 10);
  }
  // tables on the river side under umbrellas, low stools round them (people sit on those)
  const seats = [];
  const TABLES = [[-9.5, 2.3], [-4.2, 2.6], [4.2, 2.6], [9.5, 2.3]];
  TABLES.forEach(([x, z], k) => {
    cyl('timber', x, Y + 0.73, z, 0.55, 0.55, 0.05, 12);
    cyl('dark', x, Y + 0.36, z, 0.05, 0.05, 0.72, 6);
    cyl('dark', x, Y + 1.3, z, 0.035, 0.035, 2.6, 6);
    add(k % 2 ? 'green' : 'canvas', new THREE.ConeGeometry(1.55, 0.55, 8, 1, true), x, Y + 2.45, z);
    for (const a of [0.4, 2.5, 4.6]) {
      const sx = x + Math.cos(a) * 0.95, sz = z + Math.sin(a) * 0.95;
      cyl('dark', sx, Y + 0.21, sz, 0.03, 0.03, 0.42, 6);
      cyl('timber', sx, Y + 0.44, sz, 0.2, 0.2, 0.05, 10);
      // (the seated clips put the pelvis 0.46 m behind the figure's root, as at the Short Black: js/stkilda.js)
      const face = Math.atan2(x - sx, z - sz);
      seats.push({ a: sx + Math.sin(face) * 0.46, b: sz + Math.cos(face) * 0.46, face });
    }
  });
  // planters along the river rail and at the ends
  for (const [x, z, sx, sz] of [[-6.8, 4.45, 2.4, 0.6], [0, 4.45, 3.2, 0.6], [6.8, 4.45, 2.4, 0.6], [-12.3, 0, 0.6, 3], [12.3, 0, 0.6, 3]]) {
    box('timber', x, Y + 0.3, z, sx, 0.6, sz);
    const shrub = new THREE.IcosahedronGeometry(1, 0); // a clipped shrub
    shrub.scale(sx * 0.5, 0.45, sz * 0.5);
    add('leaf', shrub, x, Y + 0.78, z);
  }
  // festoon lights: poles at the corners and the middles, strings sagging between them, bulbs every 0.7 m
  const POLES = [[-E, -W], [0, -W + 0.1], [E, -W], [E, W], [0, W], [-E, W]];
  for (const [x, z] of POLES) cyl('dark', x, Y + 1.9, z, 0.05, 0.06, 3.8, 6);
  const strings = [[0, 3], [1, 4], [2, 5], [0, 5], [2, 3], [0, 4], [1, 5], [1, 3], [2, 4]];
  for (const [i, j] of strings) {
    const [x0, z0] = POLES[i], [x1, z1] = POLES[j], L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 0.7);
    let px = x0, py = Y + 3.7, pz = z0;
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = Y + 3.7 - Math.sin(Math.PI * t) * (0.25 + L * 0.03);
      const sl = Math.hypot(x - px, y - py, z - pz);
      const seg = new THREE.BoxGeometry(0.015, 0.015, sl);
      seg.lookAt(new THREE.Vector3(x - px, y - py, z - pz));
      seg.translate((x + px) / 2, (y + py) / 2, (z + pz) / 2);
      geos.get('dark').push(seg.toNonIndexed());
      if (k < n) add('bulb', new THREE.IcosahedronGeometry(0.07, 0), x, y - 0.1, z);
      px = x; py = y; pz = z;
    }
  }
  // the sign: ARBORY AFLOAT in cream on bottle green, on both gangway arches (both faces) and over the back bar
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  {
    const g = c.getContext('2d');
    g.fillStyle = '#1d4a37'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#e8dcb5'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 84);
    g.fillStyle = '#f3ead0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px Georgia, serif'; g.fillText('ARBORY  AFLOAT', 256, 50);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  M.sign = std({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.05, roughness: 0.6 });
  geos.set('sign', []);
  const signAt = (x, y, z, ry, w = 2.2) => add('sign', new THREE.PlaneGeometry(w, w * 96 / 512), x, y, z, 0, ry, 0);
  for (const g of GANG) { signAt(g, Y + 3.15, -HW + 0.13, Math.PI); signAt(g, Y + 3.15, -HW + 0.27, 0); }
  signAt(0, Y + 2.35, -4.43, 0, 3.4);

  // one mesh per material
  const meshes = [];
  for (const [k, list] of geos) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list, false), M[k]);
    mesh.castShadow = k !== 'bulb' && k !== 'sign';
    mesh.receiveShadow = k === 'timber' || k === 'float';
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    meshes.push(mesh);
  }
  for (const list of geos.values()) for (const g of list) g.dispose();
  root.updateMatrixWorld(true);
  root.matrixAutoUpdate = false;

  // walkable: the deck, and the two gangways down from the quay (people only)
  const ground = (x, z, mode) => {
    if (mode !== 'person') return null;
    const { a, b } = toLocal(x, z);
    if (Math.abs(a) < HL && Math.abs(b) < HW) return Y;
    for (const g of GANG) {
      if (Math.abs(a - g) < 1.0 && b <= -HW && b >= GANG_LAND) return quayY + ((Y - quayY) * (b - GANG_LAND)) / (-HW - GANG_LAND);
    }
    return null;
  };
  if (controllerManager) (controllerManager.extraGround ||= []).push(ground);

  // the people on the deck: a bartender behind the bar, a drinker at the counter, one at a table
  const W2 = (a, b, face) => { const p = arboryPoint(a, b); return { x: p.x, y: Y, z: p.z, heading: face + YAW }; };
  // (a heading in the deck's frame: 0 faces out over the river; the world heading adds the deck's turn)
  // (three people, not more: each is a skinned figure drawn every frame; ?nocrew leaves them out)
  const CREW = new URLSearchParams(location.search).has('nocrew') ? [] : [
    { key: 'arb_bar', id: 'Female_Adult_04', at: [-1.5, -3.3], face: 0, anims: ['idle', 'talk', 'idle', 'laugh'] },
    { key: 'arb_p1', id: 'Male_Adult_14', at: [-2.4, BZ + 0.9], face: Math.PI, anims: ['talk', 'idle', 'laugh'] },
    { key: 'arb_p2', id: 'Female_Adult_06', seat: 5, anims: ['sit_listen', 'sit_talk'] }
  ];
  // the story's own people standing at the bar in a job's scene are left room: a crew member in the way stands down
  let clock = 0, peopleOn = false, lastNight = -1, owns = false;
  const near = (p, r) => (p.x - CX) ** 2 + (p.z - CZ) ** 2 < r * r;
  /** Each frame: camPos (the camera), player (the player's position), music (js/music.js, for the deck's set) */
  function update(dt, { camPos, player, music = null, busy = false } = {}) {
    clock += dt;
    root.visible = !camPos || near(camPos, 700);
    const nf = lightingSystem?.uNightFactor?.value ?? 0;
    if (Math.abs(nf - lastNight) > 0.01) {
      lastNight = nf;
      M.bulb.emissiveIntensity = 0.15 + nf * 6;
      M.sign.emissiveIntensity = 0.05 + nf * 0.6;
    }
    const want = !!player && near(player, 50) && !busy;
    if (cast && (want || peopleOn)) {
      for (const [i, p] of CREW.entries()) {
        if (!want) { cast.setActor(p.key, p.id, null); continue; }
        const anim = p.anims[Math.floor(clock / 4 + i * 1.7) % p.anims.length];
        let pose;
        if (p.seat !== undefined) { const s = seats[p.seat]; pose = W2(s.a, s.b, s.face); } else pose = W2(p.at[0], p.at[1], p.face);
        cast.setActor(p.key, p.id, pose, anim);
      }
      peopleOn = want;
    }
    // the deck's music: house, on foot within 45 m
    if (music) {
      const v = player && near(player, 45) && controllerManager?.activeMode === 'person' ? 'house' : null;
      if (v) { music.venue = v; owns = true; } else if (owns) { owns = false; if (music.venue === 'house') music.venue = null; } // (only clears its own: the rave sets it too)
    }
  }
  console.info('[arbory] Arbory Afloat moored at', CX.toFixed(1), CZ.toFixed(1), `(${meshes.length} meshes)`);
  return { group: root, update, ground, places: ARBORY_PLACES, centre: { x: CX, z: CZ }, deckY: Y };
}
