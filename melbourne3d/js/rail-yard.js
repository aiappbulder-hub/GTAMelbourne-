// Flinders Street rail yard: the bare ground behind the station and out toward Jolimont, painted as one flat decal.
// The OSM rail-yard polygons (GEO.railYards: the strip behind the station, and the Jolimont yard east of Fed Square,
// clipped at YARD_EAST_CLIP) are draped on the terrain a few cm up; a procedural TSL material draws ballast, sleepers
// and parallel rails from a per-vertex (along, across) metre coordinate, so one mesh = one draw call, no textures.
import * as THREE from 'three/webgpu';
import { Fn, vec3, float, uv, mix, smoothstep, fract, abs, max, fwidth, floor, sin, dot, vec2 } from 'three/tsl';
import { GEO } from './melbourne-geodata.js';
import { drapeGeometry } from './terrain.js';

const YARD_EAST_CLIP = 760;
// [yard index, track direction (radians from +x toward +z)]
const YARDS = [[8, 0.06], [9, 0.50]];
const SPACING = 4.4; // track centre to track centre

function clipEast(ring, xmax) { // Sutherland-Hodgman against x <= xmax
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ina = a[0] <= xmax, inb = b[0] <= xmax;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (xmax - a[0]) / (b[0] - a[0]); out.push([xmax, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export function buildRailYard() {
  const pos = [], nor = [], uvs = [], idx = [];
  for (const [yi, ang] of YARDS) {
    const y = GEO.railYards[yi];
    if (!y) continue;
    let ring = [];
    for (let i = 0; i < y.ring.length; i += 2) ring.push([y.ring[i], y.ring[i + 1]]);
    ring = clipEast(ring, YARD_EAST_CLIP);
    if (ring.length < 3) continue;
    const ca = Math.cos(ang), sa = Math.sin(ang), base = pos.length / 3;
    for (const [x, z] of ring) {
      pos.push(x, 0, z); nor.push(0, 1, 0);
      uvs.push(x * ca + z * sa, -x * sa + z * ca);
    }
    const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [a, b, c] of tris) {
      const ax = ring[a][0], az = ring[a][1];
      const cross = (ring[b][0] - ax) * (ring[c][1] - az) - (ring[b][1] - az) * (ring[c][0] - ax);
      if (cross > 0) idx.push(base + a, base + c, base + b); else idx.push(base + a, base + b, base + c);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  drapeGeometry(g, { maxEdge: 30, lift: 0.04 });

  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.colorNode = Fn(() => {
    const p = uv();
    const along = p.x, across = p.y;
    const lane = fract(across.div(SPACING)).sub(0.5).mul(SPACING); // metres from the nearest track's centre
    const aa = max(fwidth(across), 0.02);
    const fade = smoothstep(0.35, 1.0, aa); // far away the detail averages out
    const grain = fract(sin(dot(floor(vec2(along, across).mul(4.0)), vec2(12.9898, 78.233))).mul(43758.5453));
    const dirt = vec3(0.30, 0.27, 0.23).mul(grain.mul(0.35).add(0.8));
    const gravel = vec3(0.45, 0.43, 0.40).mul(grain.mul(0.5).add(0.75));
    const bed = float(1).sub(smoothstep(1.85, 2.0, abs(lane))); // ballast shoulder either side of the track
    const sleeperPhase = abs(fract(along.div(0.62)).sub(0.5)).mul(0.62);
    const sleeper = float(1).sub(smoothstep(0.13, aa.mul(0.8).add(0.13), sleeperPhase)).mul(float(1).sub(smoothstep(1.3, aa.add(1.3), abs(lane))));
    const rail = float(1).sub(smoothstep(0.07, aa.add(0.07), abs(abs(lane).sub(0.72))));
    let c = mix(dirt, gravel, bed);
    c = mix(c, vec3(0.20, 0.14, 0.10).mul(grain.mul(0.3).add(0.85)), sleeper.mul(float(1).sub(fade)));
    c = mix(c, vec3(0.55, 0.50, 0.46), rail.mul(float(1).sub(fade.mul(0.6))));
    return mix(c, mix(dirt, gravel, 0.7).mul(0.95), fade.mul(0.5));
  })();
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'FlindersRailYard';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
