// CityLink rave: an underground party on the ground under the elevated CityLink viaduct (way 50 of js/melbourne-freeways.js,
// deck about 11 m up) beside the Yarra near Punt Road and Batman Avenue. Centre (1265, 1935). The job "Bass Drop" (B4,
// js/missions.js, start it with __city.missions.startNow(16)) starts on the dance floor.
//
// A DJ booth on a riser at the north end with a sound-stack either side, a truss on four poles with strips of coloured light
// pulsing to a 126 bpm beat (the strips and floor tiles are emissive, in three colours), slow laser beams, and one real
// point light. A crowd of cast people (12; 6 on LITE) idles, bobs and cheers to the beat within 120 m. The venue's music
// is the house set (js/music.js api.venue) on foot within 45 m. Shown at night (lightingSystem.uNightFactor) or while the job runs.
//
// Cost: 8 meshes merged by material (dark, cone, three LED colours, sign, beams), no shadows, hidden when not wanted; one
// PointLight (intensity 0 when off).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';
import { LITE } from './quality.js';

const CX = 1265, CZ = 1935;
// along the deck there (from that way: (1272.7, 1967.9) to (1258.9, 1909.3)): local z runs along it, local x across
const DX = 1258.9 - 1272.7, DZ = 1909.3 - 1967.9, DL = Math.hypot(DX, DZ);
const YAW = Math.atan2(DX / DL, DZ / DL);
const SIN = Math.sin(YAW), COS = Math.cos(YAW);
const GY = terrainHeight(CX, CZ) + 0.22; // the ground (where the player stands is about 0.67)
/** A point on the rave floor (a across the deck, b along it, towards the DJ) in world metres */
export function ravePoint(a, b) { return { x: CX + a * COS + b * SIN, z: CZ - a * SIN + b * COS }; }
const P = (a, b, label) => ({ ...ravePoint(a, b), y: GY, label, territory: 'EAST' });
export const RAVE_PLACES = {
  RAVE: P(0, -5.5, 'Under the CityLink viaduct, the rave off Punt Rd'),
  RAVE_DJ: P(0, 6.2, 'Under the CityLink viaduct, in front of the DJ booth'),
  RAVE_THIEF: { x: 1236, z: 1840, label: 'Batman Ave, by the river path', territory: 'EAST' }
};
const BPM = 126;

export function createCitylinkRave({ scene, cast = null, lightingSystem = null }) {
  const root = new THREE.Group();
  root.name = 'CitylinkRave';
  root.position.set(CX, GY, CZ);
  root.rotation.y = YAW;
  root.visible = false;
  scene.add(root);

  const std = (o) => new THREE.MeshStandardNodeMaterial({ roughness: 0.7, ...o });
  const led = (c) => std({ color: 0x111111, emissive: new THREE.Color(c), emissiveIntensity: 0.2, roughness: 0.4 });
  const M = {
    dark: std({ color: 0x1b1c20, roughness: 0.55, metalness: 0.5 }),
    cone: std({ color: 0x3a3c42, roughness: 0.4, metalness: 0.7 }),
    pink: led(0xff2aa0), cyan: led(0x20d8ff), lime: led(0xb4ff30)
  };
  const geos = new Map(Object.keys(M).map((k) => [k, []]));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  function add(mat, g, x, y, z, rx = 0, ry = 0, rz = 0) {
    g = g.index ? g.toNonIndexed() : g;
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s));
    geos.get(mat).push(g);
  }
  const box = (mat, x, y, z, sx, sy, sz, rx, ry, rz) => add(mat, new THREE.BoxGeometry(sx, sy, sz), x, y, z, rx, ry, rz);
  const LEDS = ['pink', 'cyan', 'lime'];

  // floor mat and an LED dance floor of tiles (checkered in three colours)
  box('dark', 0, -0.17, 1, 14, 0.1, 24);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) box(LEDS[(i + j) % 3], (i - 2) * 1.5, -0.1, -4 + j * 1.5, 1.4, 0.03, 1.4);
  // the DJ's riser and booth (facing the crowd, -z), with a pulsing front panel and the decks on top
  box('dark', 0, 0.2, 9.3, 6, 0.4, 2.8);
  box('dark', 0, 1.05, 9.3, 3.4, 1.0, 1.0);
  box('pink', 0, 1.0, 8.78, 3.0, 0.7, 0.04);
  box('cone', 0, 1.6, 9.3, 3.2, 0.05, 0.8);
  for (const x of [-0.8, 0.8]) add('cyan', new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16), x, 1.66, 9.3);
  box('dark', 0, 1.7, 9.55, 0.5, 0.08, 0.35);
  // sound stacks: sub, mid and top, with cones and a rim of light
  for (const s of [-1, 1]) {
    const x = s * 4.4;
    box('dark', x, 0.7, 9.3, 1.5, 1.2, 1.2);
    box('dark', x, 1.8, 9.3, 1.2, 1.0, 1.0);
    box('dark', x, 2.6, 9.3, 0.9, 0.6, 0.8);
    add('cone', new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), x, 0.7, 8.68, Math.PI / 2, 0, 0);
    add('cone', new THREE.CylinderGeometry(0.33, 0.33, 0.06, 16), x, 1.8, 8.8, Math.PI / 2, 0, 0);
    add('cone', new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), x, 2.6, 8.9, Math.PI / 2, 0, 0);
    box(s > 0 ? 'cyan' : 'lime', x, 0.12, 8.66, 1.5, 0.08, 0.04);
  }
  // the truss: four poles, two beams across, strips of light hung along it
  for (const [x, z] of [[-6.2, 0], [6.2, 0], [-6.2, 8], [6.2, 8]]) box('dark', x, 2.3, z, 0.14, 4.6, 0.14);
  for (const z of [0, 8]) box('dark', 0, 4.6, z, 12.6, 0.14, 0.14);
  for (const x of [-6.2, 6.2]) box('dark', x, 4.6, 4, 0.14, 0.14, 8);
  [[0, 4.4, 0.0, 'pink', 12], [0, 4.4, 8, 'cyan', 12], [-6.0, 4.4, 4, 'lime', 8], [6.0, 4.4, 4, 'pink', 8], [0, 4.3, 4, 'lime', 11]].forEach(([x, y, z, c, L]) => {
    box(c, x, y, z, Math.abs(x) > 5 ? 0.1 : L, 0.1, Math.abs(x) > 5 ? L : 0.1);
  });
  for (let i = 0; i < 6; i++) box(LEDS[i % 3], -5 + i * 2, 4.35, 2 + (i % 2) * 4, 0.3, 0.3, 0.3); // par cans
  // the sign over the booth
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  {
    const g = c.getContext('2d');
    g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#ff2aa0'; g.lineWidth = 5; g.strokeRect(6, 6, 500, 84);
    g.fillStyle = '#20d8ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 50px Arial, sans-serif'; g.fillText('BASS DROP', 256, 50);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  M.sign = std({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.3, roughness: 0.6 });
  geos.set('sign', []);
  add('sign', new THREE.PlaneGeometry(4.4, 4.4 * 96 / 512), 0, 3.0, 8.5, 0, Math.PI, 0);

  const meshes = [];
  for (const [k, list] of geos) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), M[k]);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    meshes.push(mesh);
  }
  for (const list of geos.values()) for (const g of list) g.dispose();

  // laser beams: thin additive boxes fanning out from the truss to the floor, swivelling slowly
  const beamMat = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  const bg = [];
  const cols = [new THREE.Color(0xff2aa0), new THREE.Color(0x20d8ff), new THREE.Color(0xb4ff30)];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.BoxGeometry(0.04, 0.04, 14).toNonIndexed();
    g.translate(0, 0, 7);
    g.rotateX(0.5 + (i % 3) * 0.12); // down towards the floor
    g.rotateY((i / 9) * Math.PI * 2);
    const col = cols[i % 3], n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) col.toArray(a, k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    bg.push(g);
  }
  const beams = new THREE.Mesh(mergeGeometries(bg), beamMat);
  beams.position.set(0, 4.3, 4);
  beams.frustumCulled = false;
  root.add(beams);
  meshes.push(beams);
  for (const g of bg) g.dispose();

  const light = new THREE.PointLight(0xff2aa0, 0, 26, 1.6);
  light.position.set(0, 3.8, 3);
  root.add(light);
  root.updateMatrixWorld(true);

  // the crowd: facing the DJ, in a loose arc (ids that exist in assets/people)
  const IDS = ['Male_Adult_03', 'Female_Adult_04', 'Male_Adult_04', 'Female_Adult_09', 'Male_Adult_14', 'Female_Adult_06'];
  const N = LITE ? 6 : 12;
  const crowd = [];
  for (let i = 0; i < N; i++) {
    const row = i % 3, k = Math.floor(i / 3), a = (k - (N / 3 - 1) / 2) * 1.9 + (row - 1) * 0.5 + ((i * 7) % 5) * 0.12, b = -1.5 + row * 2.2 + ((i * 3) % 4) * 0.2;
    const p = ravePoint(a, b);
    crowd.push({ key: `rave_${i}`, id: IDS[i % IDS.length], x: p.x, z: p.z, face: Math.atan2(ravePoint(0, 9.3).x - p.x, ravePoint(0, 9.3).z - p.z), ph: i * 1.37 });
  }
  const DJ = { key: 'rave_dj', id: 'Male_Adult_18', ...ravePoint(0, 9.3), face: YAW + Math.PI };

  let clock = 0, crowdOn = false, lastOn = null;
  const dist2 = (p) => (p.x - CX) ** 2 + (p.z - CZ) ** 2;
  /** Each frame: camPos, player (positions), music (js/music.js), job (the running job's name or null), busy (a cut scene) */
  function update(dt, { camPos, player, music = null, job = null } = {}) {
    clock += dt;
    const nf = lightingSystem?.uNightFactor?.value ?? 0;
    const missionOn = job === 'Bass Drop';
    const wanted = (nf > 0.4 || missionOn) && (!camPos || dist2(camPos) < 600 * 600);
    root.visible = wanted;
    if (lastOn !== wanted) { lastOn = wanted; light.intensity = 0; }
    const ph = (clock * BPM) / 60, beat = Math.pow(Math.max(0, Math.cos(ph * Math.PI)), 2); // a kick every beat
    if (wanted) {
      const bar = Math.floor(ph / 4);
      for (let i = 0; i < 3; i++) {
        const on = 0.35 + 0.65 * ((Math.floor(ph / 2) + i) % 3 === 0 ? beat : 0.25 + 0.25 * Math.sin(clock * (2 + i)));
        M[LEDS[i]].emissiveIntensity = 0.3 + on * 5;
      }
      M.sign.emissiveIntensity = 0.5 + beat * 1.5;
      beamMat.opacity = 0.1 + 0.15 * beat;
      beams.rotation.y = clock * 0.35;
      light.color.setHex([0xff2aa0, 0x20d8ff, 0xb4ff30, 0xff2aa0][bar % 4]);
      light.intensity = 40 + beat * 160;
    }
    const near = wanted && !!player && dist2(player) < 120 * 120;
    if (cast && (near || crowdOn)) {
      for (const p of crowd) {
        if (!near) { cast.setActor(p.key, p.id, null); continue; }
        const t = ph + p.ph, slot = Math.floor(clock / 7 + p.ph);
        const cheer = slot % 4 === (Math.floor(p.ph) % 4) && (clock / 7 + p.ph) % 1 < 0.2;
        cast.setActor(p.key, p.id, { x: p.x, y: GY + Math.abs(Math.sin(t * Math.PI)) * 0.05, z: p.z, heading: p.face + Math.sin(t * Math.PI / 2) * 0.35 }, cheer ? 'cheer' : 'idle');
      }
      // the DJ plays on his own when the job isn't staging him
      if (!near || missionOn) cast.setActor(DJ.key, DJ.id, null);
      else cast.setActor(DJ.key, DJ.id, { x: DJ.x, y: GY + 0.4, z: DJ.z, heading: DJ.face }, 'idle');
      crowdOn = near;
    }
    if (music) {
      const on = wanted && !!player && dist2(player) < 45 * 45;
      if (on) { if (music.venue !== 'house') music.venue = 'house'; owns = true; } else if (owns) { owns = false; if (music.venue === 'house') music.venue = null; }
    }
  }
  let owns = false;
  console.info('[rave] CityLink rave under the viaduct at', CX, CZ, `(${meshes.length} meshes)`);
  return { group: root, update, places: RAVE_PLACES, centre: { x: CX, z: CZ }, groundY: GY };
}
