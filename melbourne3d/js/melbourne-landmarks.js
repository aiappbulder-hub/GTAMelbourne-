import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LANDMARK_SITES } from './city-config.js';
import { terrainRange } from './terrain.js';
import { buildRailYard } from './rail-yard.js';

// Melbourne's landmarks: the old game's Blender models (models/landmarks/*.json, made by tools/make_landmarks.py)
// stood on their real sites (js/melbourne-geodata.js `landmarks`, from OpenStreetMap). The models were built in the old
// game's map units, so each is sized here from the real building: footprint (long side x short side, metres), height,
// and which grid axis the long side runs along. The surveyed buildings standing where a landmark goes are left out
// (buildings.js), through the colliders returned here.

const LANDMARKS = [
  // id, OSM site, long x short (m), height (m), long side along ('x' = the grid's east-west, 'z' = north-south)
  ['eureka', 'Eureka Tower', 50, 42, 297, 'x'],
  // (St Paul's: its OSM footprint is 31 m across Swanston St's side by 83 m along it, Flinders Lane to Flinders St; a box
  // turned the other way used to stand 25 m across Rutledge and Hosier Lanes)
  ['stpauls', "St Paul's Cathedral", 82, 31, 98, 'z'],
  ['mcg', 'Melbourne Cricket Ground', 235, 205, 75, 'x'],
  ['parliament', 'Parliament House', 115, 80, 32, 'z'],
  ['reb', 'Royal Exhibition Building', 155, 92, 68, 'x'],
  ['shrine', 'Shrine of Remembrance', 82, 80, 30, 'x'],
  ['arts', 'Arts Centre Melbourne', 30, 30, 162, 'x'],
  ['rialto', 'Rialto', 46, 44, 251, 'x'],
  ['fedsq', 'Federation Square', 150, 110, 26, 'x']
];

export async function buildMelbourneLandmarks(scene) {
  const group = new THREE.Group();
  group.name = 'MelbourneLandmarks';
  scene.add(group);
  const colliders = [];
  const loader = new GLTFLoader();
  const plinthMat = new THREE.MeshStandardNodeMaterial({ color: 0x8b877e, roughness: 0.9 });
  const box = new THREE.Box3(), size = new THREE.Vector3();
  await Promise.all([buildFlindersStreetStation(group, colliders, plinthMat), ...LANDMARKS.map(async ([id, site, long, short, height, axis]) => {
    const s0 = LANDMARK_SITES[site];
    if (!s0) return;
    // the OSM site's centre is pulled east by the gardens behind; stand the front steps on Spring St (x 691.9) instead
    const s = id === 'parliament' ? { ...s0, x: 691.9 + 10.05 + 4.6 + 2 + 40 } // road half + footpath + 2 m forecourt + half its 80 m depth : s0;
    let gltf;
    try {
      gltf = await loader.loadAsync(new URL(`../../models/landmarks/${id}.json`, import.meta.url).href);
    } catch (e) {
      console.warn(`[landmarks] ${id} failed to load`, e);
      return;
    }
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    box.setFromObject(model);
    box.getSize(size);
    const modelLongX = size.x >= size.z;
    // scale the model's long side to `long`, its short side to `short`, its height to `height`
    const sx = (modelLongX ? long : short) / size.x;
    const sz = (modelLongX ? short : long) / size.z;
    const holder = new THREE.Group();
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    model.position.set(-cx, -box.min.y, -cz);
    holder.add(model);
    holder.scale.set(sx, height / size.y, sz);
    const pivot = new THREE.Group();
    pivot.add(holder);
    // turn it when its long side should run along the other axis
    // model front (columns, steps) is local +z; Parliament's front faces west down Bourke St (-x), so turn it -PI/2
    if (axis === 'z') pivot.rotation.y = id === 'parliament' ? -Math.PI / 2 : Math.PI / 2;
    const hx = (axis === 'x' ? long : short) / 2, hz = (axis === 'x' ? short : long) / 2;
    // on a hill: lifted rigidly to the highest ground under it (less 0.3 m), on a plinth down to the lowest
    const { lo, hi } = terrainRange({ minX: s.x - hx, maxX: s.x + hx, minZ: s.z - hz, maxZ: s.z + hz });
    const base = Math.max(lo, hi - 0.3);
    pivot.position.set(s.x, base, s.z);
    group.add(pivot);
    if (base - lo > 0.05) {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 - 0.4, base - lo + 0.5, hz * 2 - 0.4), plinthMat);
      plinth.position.set(s.x, (base + lo - 0.5) / 2, s.z);
      plinth.receiveShadow = plinth.castShadow = true;
      group.add(plinth);
    }
    colliders.push({ minX: s.x - hx, maxX: s.x + hx, minZ: s.z - hz, maxZ: s.z + hz, minY: lo - 3, groundY: lo - 3, maxY: base + height, landmark: id });
  })]);
  const yard = buildRailYard(); // the painted tracks behind Flinders Street Station
  if (yard) group.add(yard);
  console.info(`[landmarks] ${group.children.length} Melbourne landmarks placed`);
  return { group, colliders };
}

// Flinders Street Station: its own model (tools/fss/build_fss.py in Blender, from the OSM footprint, metres, placed relative
// to the site centre; tools/fss/paint_textures.py paints its trim sheet). One material, two levels of detail (one draw call
// each): FSS_LOD0 near, FSS_LOD1 (plain masses) beyond FSS_FAR. The material "FSS" carries an emissive map of lit windows
// and clocks that js/melb-night.js turns up after dark.
const FSS_FAR = 520;
const FSS_BOXES = [ // colliders from the footprint: the long Flinders St wing and the dome pavilion at Swanston St
  { minX: -332.5, maxX: -71, minZ: 248.6, maxZ: 266.8, height: 36 },
  { minX: -71, maxX: -22.5, minZ: 248.6, maxZ: 280.4, height: 44 }
];
async function buildFlindersStreetStation(group, colliders, plinthMat) {
  const s = LANDMARK_SITES['Flinders Street Station'];
  if (!s) return;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  try {
    gltf = await loader.loadAsync(new URL('../assets/landmarks/flinders-station.glb', import.meta.url).href);
  } catch (e) {
    console.warn('[landmarks] flinders station failed to load', e);
    return;
  }
  const lod = new THREE.LOD();
  lod.name = 'FlindersStreetStation';
  const near = gltf.scene.getObjectByName('FSS_LOD0'), far = gltf.scene.getObjectByName('FSS_LOD1');
  if (!near) return;
  // (gltfpack keeps the named nodes; the mesh may be the node itself or its child)
  for (const n of [near, far]) {
    if (!n) continue;
    n.removeFromParent();
    n.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = n === near;
      if (m.material.map) m.material.map.anisotropy = 4;
    });
  }
  lod.addLevel(near, 0);
  if (far) lod.addLevel(far, FSS_FAR);
  // on a hill: lifted rigidly to the highest ground under the footprint (less 0.3 m); the model's own stone skirt reaches
  // 6 m down to the lowest, following the footprint (a plinth box only if the ground falls further)
  const box = { minX: -332.5, maxX: -22.5, minZ: 248.6, maxZ: 280.4 };
  // (sampled all over the footprint: the corners and centre alone missed the ridge along Flinders St, which stood 1.2 m
  // above the base and buried the ground floor)
  const pts = [];
  for (let x = box.minX; x <= box.maxX + 0.01; x += 8) for (let z = box.minZ; z <= box.maxZ + 0.01; z += 4) pts.push({ x, z });
  const { lo, hi } = terrainRange(pts);
  const base = Math.max(lo, hi - 0.3);
  lod.position.set(s.x, base, s.z);
  group.add(lod);
  for (const b of FSS_BOXES) {
    if (base - lo > 5.8) {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX - 0.4, base - lo + 0.5, b.maxZ - b.minZ - 0.4), plinthMat);
      plinth.position.set((b.minX + b.maxX) / 2, (base + lo - 0.5) / 2, (b.minZ + b.maxZ) / 2);
      plinth.receiveShadow = true;
      group.add(plinth);
    }
    colliders.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, minY: lo - 3, groundY: lo - 3, maxY: base + b.height, landmark: 'flinders' });
  }
}
