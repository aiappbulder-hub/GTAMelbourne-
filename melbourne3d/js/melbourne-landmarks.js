import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LANDMARK_SITES } from './city-config.js';
import { terrainRange } from './terrain.js';

// Melbourne's landmarks: the old game's Blender models (models/landmarks/*.json, made by tools/make_landmarks.py)
// stood on their real sites (js/melbourne-geodata.js `landmarks`, from OpenStreetMap). The models were built in the old
// game's map units, so each is sized here from the real building: footprint (long side x short side, metres), height,
// and which grid axis the long side runs along. The surveyed buildings standing where a landmark goes are left out
// (buildings.js), through the colliders returned here.

const LANDMARKS = [
  // id, OSM site, long x short (m), height (m), long side along ('x' = the grid's east-west, 'z' = north-south)
  ['flinders', 'Flinders Street Station', 220, 34, 40, 'x'],
  ['eureka', 'Eureka Tower', 50, 42, 297, 'x'],
  ['stpauls', "St Paul's Cathedral", 76, 44, 98, 'x'],
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
  await Promise.all(LANDMARKS.map(async ([id, site, long, short, height, axis]) => {
    const s = LANDMARK_SITES[site];
    if (!s) return;
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
    if (axis === 'z') pivot.rotation.y = Math.PI / 2;
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
  }));
  console.info(`[landmarks] ${group.children.length} Melbourne landmarks placed`);
  return { group, colliders };
}
