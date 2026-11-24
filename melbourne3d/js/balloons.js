// Hot air balloons drifting over the city, as on a Melbourne morning. Two instanced draw calls (envelopes, baskets).
// They drift with the wind across a wide box around the camera, wrapping at its edges (shrunk to nothing there, far out
// in the haze), and are put away at night.
import * as THREE from 'three/webgpu';

const COUNT = 7;
const HALF = 1500;      // half-width of the drift box round the camera (m)
const FADE = 1150;      // they shrink from here to HALF so the wrap is never seen
const WIND = new THREE.Vector2(2.6, 1.1); // m/s, a light northerly-westerly

const COLOURS = [0xd8322b, 0xf2b31b, 0x2a6fd1, 0x2f9e4f, 0x8a3fc2, 0xf06a1d, 0x1fa6b5];

function envelopeGeometry() {
  // A teardrop profile (radius, height) from the mouth up to the crown, turned into a lathe.
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14; // 0 = mouth, 1 = crown
    const y = 2 + t * 20;
    const r = t < 0.6 ? 1.6 + Math.sin((t / 0.6) * Math.PI * 0.5) ** 1.3 * 7.4 : 9 * Math.cos(((t - 0.6) / 0.4) * Math.PI * 0.5) ** 0.6;
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  const g = new THREE.LatheGeometry(pts, 16).toNonIndexed();
  // Gores: alternate light and dark panels so the instance colour shows as two-tone stripes.
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    let ax = 0, az = 0;
    for (let k = 0; k < 3; k++) { ax += pos.getX(i + k); az += pos.getZ(i + k); }
    const gore = Math.floor(((Math.atan2(az, ax) + Math.PI) / (Math.PI * 2)) * 16) % 16;
    const v = gore % 2 ? 1 : 0.45;
    for (let k = 0; k < 3; k++) col.set([v, v, v], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function basketGeometry() {
  const basket = new THREE.BoxGeometry(1.4, 1.1, 1.4).translate(0, -1.6, 0);
  // Four cables from the basket corners up to the mouth, as thin boxes.
  const parts = [basket];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    const c = new THREE.BoxGeometry(0.06, 3.2, 0.06);
    c.rotateZ(-x * 0.35); c.rotateX(z * 0.35);
    c.translate(x * 1.6, 0.5, z * 1.6);
    parts.push(c);
  }
  const merged = new THREE.BufferGeometry();
  const arrays = parts.map((p) => p.toNonIndexed());
  const n = arrays.reduce((s, p) => s + p.attributes.position.count, 0);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const p of arrays) { P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
  merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return merged;
}

export function createBalloons({ scene, lightingSystem = null }) {
  const envMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const basketMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.95 });
  const envelopes = new THREE.InstancedMesh(envelopeGeometry(), envMat, COUNT);
  const baskets = new THREE.InstancedMesh(basketGeometry(), basketMat, COUNT);
  for (const m of [envelopes, baskets]) {
    m.frustumCulled = false; // spread across kilometres; two draw calls either way
    m.castShadow = false; m.receiveShadow = false;
    m.name = 'hot-air-balloons';
    scene.add(m);
  }

  // Each balloon: an offset in the drift box, a height, its own wind wobble.
  const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(91);
  const balloons = [];
  for (let i = 0; i < COUNT; i++) {
    balloons.push({
      x: (rng() * 2 - 1) * HALF * 0.8, z: (rng() * 2 - 1) * HALF * 0.8,
      y: 140 + rng() * 160, phase: rng() * 100, spin: (rng() - 0.5) * 0.05, yaw: rng() * Math.PI * 2,
      speed: 0.7 + rng() * 0.6, scale: 1.4 + rng() * 0.6,
    });
    envelopes.setColorAt(i, new THREE.Color(COLOURS[i % COLOURS.length]));
  }
  envelopes.instanceColor.needsUpdate = true;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let t = 0;

  function update(dt, camPos) {
    const night = lightingSystem?.uNightFactor?.value ?? 0;
    const show = night < 0.55;
    envelopes.visible = baskets.visible = show;
    if (!show || !camPos) return;
    t += dt;
    for (let i = 0; i < COUNT; i++) {
      const b = balloons[i];
      b.x += WIND.x * b.speed * dt; b.z += WIND.y * b.speed * dt; b.yaw += b.spin * dt;
      // Keep each balloon inside the box round the camera, wrapping at the edges.
      let dx = ((b.x - camPos.x + HALF) % (2 * HALF) + 2 * HALF) % (2 * HALF) - HALF;
      let dz = ((b.z - camPos.z + HALF) % (2 * HALF) + 2 * HALF) % (2 * HALF) - HALF;
      b.x = camPos.x + dx; b.z = camPos.z + dz;
      const edge = Math.max(Math.abs(dx), Math.abs(dz));
      const k = edge < FADE ? 1 : Math.max(0, 1 - (edge - FADE) / (HALF - FADE));
      const y = b.y + Math.sin(t * 0.07 + b.phase) * 12;
      e.set(Math.sin(t * 0.3 + b.phase) * 0.02, b.yaw, Math.cos(t * 0.25 + b.phase) * 0.02);
      q.setFromEuler(e);
      s.setScalar(b.scale * k);
      p.set(b.x, y, b.z);
      m4.compose(p, q, s);
      envelopes.setMatrixAt(i, m4);
      baskets.setMatrixAt(i, m4);
    }
    envelopes.instanceMatrix.needsUpdate = true;
    baskets.instanceMatrix.needsUpdate = true;
  }

  return { update, envelopes, baskets };
}
