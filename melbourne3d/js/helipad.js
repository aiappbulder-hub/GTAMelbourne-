// The Melbourne heliport: a floating pad on the Yarra's north bank, just west of the Spencer Street Bridge by Batman Park
// (the river bend opposite Crown's Southbank promenade), reached over a short gangway from the quay.
//
//  - The pad: a pontoon 15 m square, a white ring and "H" on dark concrete, a yellow-and-black edge, flotation drums
//    under it; 16 edge lights that come on at dusk. Solid ground (controllerManager.extraGround, like the bridges' decks
//    and St Kilda's pier), at the same level as the gangway and nearly that of the quay.
//  - The helicopter (the player's, js/controllers.js `helicopter` entity) is parked on it. F beside it, on foot, climbs in
//    (the flight is the existing updateHelicopter: Space / E up, Q / C down, W S pitch, A D yaw); F once it has
//    landed (low, slow) climbs out beside it and leaves it where it is. If it's left in the air, or put down in the
//    river, it is back on the pad a few seconds after the player leaves it.
//  - A helipad icon (blue disc, white H) on the minimap and the full map (js/nyc-map.js `extraIcons`).
import * as THREE from 'three/webgpu';
import { inWater } from './melbourne-config.js';
import { cityUniforms } from './tsl-materials.js';

const PAD_HALF = 7.5; // the pad is 15 m square
const PAD_Y = 0.2; // its top (the quay's land deck is at 0, kerb islands 0.22)
const GANGWAY_HALF = 1.3;
const BOARD_REACH = 9; // metres from the helicopter's middle, on foot, to climb in
const LAND_Y = 1.5; // the helicopter is landed at or below this height above the pad / ground
const LAND_SPEED = 6; // and slower than this (m/s)
const WEST_OF_BRIDGE_X = -1196; // the pad's middle: the Spencer Street Bridge's deck is at x -1170 .. -1137

// Where the north bank is along x: the first water going south from the quay (z increases southwards)
function bankZ(x) {
  for (let z = 380; z < 520; z += 0.5) if (inWater(x, z)) return z;
  return 440;
}

export function createHelipad({ scene, controllerManager: cm, mapSystem = null, selectMode = null }) {
  // --- Where: the highest bank z over the pad's width, so the pad stands wholly on the water, with a 4 m gap to the quay
  let bank = -Infinity;
  for (let x = WEST_OF_BRIDGE_X - PAD_HALF; x <= WEST_OF_BRIDGE_X + PAD_HALF; x += 1) bank = Math.max(bank, bankZ(x));
  const cx = WEST_OF_BRIDGE_X;
  const cz = bank + 4 + PAD_HALF; // pad's middle
  const quayZ = bankZ(cx); // the quay's edge at the gangway
  const group = new THREE.Group();
  group.name = 'Heliport';

  // --- The paint: dark concrete, a yellow edge band, the white ring and H
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3f44';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#f2c230';
  g.lineWidth = 14;
  g.strokeRect(10, 10, 492, 492);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 16;
  g.beginPath();
  g.arc(256, 256, 190, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.fillRect(176, 160, 28, 192); // the H
  g.fillRect(308, 160, 28, 192);
  g.fillRect(176, 238, 160, 28);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const concrete = new THREE.MeshStandardNodeMaterial({ color: 0x8d8f91, roughness: 0.9 });
  const paint = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.85 });
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x4a5560, roughness: 0.55, metalness: 0.5 });
  const drum = new THREE.MeshStandardNodeMaterial({ color: 0xd9d4c4, roughness: 0.7 });

  // slab (a box 0.5 m thick whose top is PAD_Y), the painted top, flotation drums under it
  const slab = new THREE.Mesh(new THREE.BoxGeometry(PAD_HALF * 2, 0.5, PAD_HALF * 2), concrete);
  slab.position.set(cx, PAD_Y - 0.25, cz);
  slab.castShadow = slab.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(PAD_HALF * 2, PAD_HALF * 2), paint);
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, PAD_Y + 0.012, cz);
  top.receiveShadow = true;
  group.add(slab, top);
  for (const sx of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, PAD_HALF * 1.8, 14), drum);
    d.rotation.x = Math.PI / 2;
    d.position.set(cx + sx * (PAD_HALF - 2.2), -0.5, cz);
    group.add(d);
  }
  // mooring posts at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 8), steel);
    post.position.set(cx + sx * (PAD_HALF + 0.1), PAD_Y + 0.6, cz + sz * (PAD_HALF + 0.1));
    group.add(post);
  }

  // --- The gangway: from the quay's edge across the gap to the pad's north edge, with handrails
  const gx0 = cx, gz0 = quayZ - 1.5, gz1 = cz - PAD_HALF + 0.3;
  const gl = gz1 - gz0;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(GANGWAY_HALF * 2, 0.16, gl), steel);
  deck.position.set(gx0, PAD_Y - 0.08, (gz0 + gz1) / 2);
  deck.receiveShadow = true;
  group.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, gl), steel);
    rail.position.set(gx0 + s * GANGWAY_HALF, PAD_Y + 1.0, (gz0 + gz1) / 2);
    group.add(rail);
    for (let t = 0; t <= gl + 0.01; t += 2) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), steel);
      st.position.set(gx0 + s * GANGWAY_HALF, PAD_Y + 0.5, gz0 + t);
      group.add(st);
    }
  }

  // --- Edge lights: little domes round the rim and along the gangway, lit from dusk
  const lightMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff3b0 });
  const lights = new THREE.Group();
  const lamp = (x, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lightMat);
    m.position.set(x, PAD_Y + 0.1, z);
    lights.add(m);
  };
  for (let k = 0; k <= 4; k++) {
    const o = -PAD_HALF + 0.5 + (k * (PAD_HALF * 2 - 1)) / 4;
    lamp(cx + o, cz - PAD_HALF + 0.5); lamp(cx + o, cz + PAD_HALF - 0.5);
    if (k > 0 && k < 4) { lamp(cx - PAD_HALF + 0.5, cz + o); lamp(cx + PAD_HALF - 0.5, cz + o); }
  }
  for (let t = 1; t < gl; t += 3) { lamp(gx0 - GANGWAY_HALF, gz0 + t); lamp(gx0 + GANGWAY_HALF, gz0 + t); }
  group.add(lights);
  const glowLight = new THREE.PointLight(0xfff0c0, 0, 40, 2);
  glowLight.position.set(cx, PAD_Y + 4, cz);
  group.add(glowLight);
  scene.add(group);

  // --- Solid ground: the pad and the gangway; the quay beyond is the city's own
  const onPad = (x, z) => {
    if (Math.abs(x - cx) <= PAD_HALF && Math.abs(z - cz) <= PAD_HALF) return PAD_Y;
    if (Math.abs(x - gx0) <= GANGWAY_HALF + 0.2 && z >= gz0 && z <= gz1 + 0.5) return PAD_Y;
    return null;
  };
  (cm.extraGround ||= []).push(onPad);

  // --- The helicopter, parked on the pad
  const heli = cm.entities.helicopter;
  const park = () => {
    heli.position.set(cx, PAD_Y + 0.05, cz);
    heli.heading = Math.PI; // nose to the river
    heli.speed = heli.verticalSpeed = heli.pitchAngle = heli.rollAngle = 0;
    heli.tiltPivot.rotation.x = heli.tiltPivot.rotation.z = 0;
    heli.mesh.position.copy(heli.position);
    heli.mesh.rotation.y = heli.heading;
  };
  park();

  // --- The map icon
  if (mapSystem) mapSystem.extraIcons.push({ x: cx, z: cz, kind: 'helipad' });

  // --- Getting in and out
  const person = cm.entities.person;
  const aloft = () => heli.position.y - (cm.getGroundHeight(heli.position.x, heli.position.z, 'car') ?? 0);
  const landed = () => aloft() < LAND_Y && Math.abs(heli.speed) < LAND_SPEED && Math.abs(heli.verticalSpeed) < 3;
  const near = () => cm.activeMode === 'person' && Math.hypot(person.position.x - heli.position.x, person.position.z - heli.position.z) < BOARD_REACH &&
    Math.abs(person.position.y - heli.position.y) < 4;
  function board() {
    heli.speed = heli.verticalSpeed = 0;
    if (selectMode) selectMode('helicopter'); else cm.setMode('helicopter');
  }
  function leave() {
    if (!landed()) return false;
    const a = heli.heading, side = 4.6; // out on the pilot's side: to the right of the nose
    const x = heli.position.x - Math.cos(a) * side, z = heli.position.z + Math.sin(a) * side;
    heli.speed = heli.verticalSpeed = 0;
    heli.position.y = Math.max(heli.position.y, (cm.getGroundHeight(heli.position.x, heli.position.z, 'car') ?? 0) + 0.05);
    cm.placePerson(x, cm.getGroundHeight(x, z, 'person') ?? 0, z, a + Math.PI);
    if (selectMode) selectMode('person');
    return true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    if (cm.activeMode === 'helicopter') leave();
    else if (near()) board();
  });

  // --- Lost helicopters come home: left in the air, or put down in the river, a few seconds after the player leaves it
  let lostFor = 0;
  function update(dt) {
    const glow = cityUniforms && cityUniforms.uInteriorGlow ? cityUniforms.uInteriorGlow.value : 0.48;
    const night = glow > 0.6;
    lights.visible = night;
    glowLight.intensity = night ? 40 : 0;
    if (cm.activeMode === 'helicopter') { lostFor = 0; return; }
    const away = Math.hypot(heli.position.x - cx, heli.position.z - cz) > PAD_HALF + 1;
    const lost = aloft() > 3 || (away && inWater(heli.position.x, heli.position.z) && !onPad(heli.position.x, heli.position.z)) || heli.position.y < -5;
    if (lost) { lostFor += dt; if (lostFor > 4) { park(); lostFor = 0; } } else lostFor = 0;
  }

  return { update, park, board, leave, pad: { x: cx, z: cz, y: PAD_Y, half: PAD_HALF }, gangway: { x: gx0, z0: gz0, z1: gz1 }, quayZ, heli, landed };
}
