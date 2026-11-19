// Melbourne's water: the Yarra, Victoria Harbour, Albert Park Lake and Port Phillip Bay (one TSL material on the big
// water plane at y = -1.6, replacing the New York harbour material for Melbourne).
//
// - Two scrolling tileable normal maps (assets/textures/water_normal.png, MIT, from streets-gl, see CREDITS.md) at
//   different scales and directions, faded to calm with distance so far water doesn't shimmer.
// - A region mask baked once on a canvas from the geodata (R: land / quay proximity for the bank tint and edge foam,
//   G: "inside the coast" so open bay water reads bluer and choppier, B: park lakes: calm and green). It stands in for
//   a depth texture, which this renderer doesn't expose to materials.
// - Fresnel blend of a murky green-brown body (the Yarra) with the sky: the scene's HDRI environment through the PBR
//   specular when present, plus an analytic sky-gradient reflection that works without it. Sun glints are a tight
//   lobe on the wave normal. At night, warm streaks along the banks stand in for reflected city lights, and the
//   pipeline's SSR (high quality) reflects the real ones.
// - ?quality=low: one normal layer, no mask, no streaks.
//
// The sparkle lobe, normal-map layering and distance filtering follow the approach of streets-gl's water shader
// (MIT); the overall structure is original. Bay vertex displacement is not done: the plane is two triangles.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, color, positionWorld, normalize, cameraPosition, cameraViewMatrix, time, texture, mix, clamp,
  smoothstep, pow, dot, max, reflect, length, sin, fract, floor
} from 'three/tsl';
import { Q, QUALITY } from './quality.js';
import { cityUniforms } from './tsl-materials.js';

const MASK_X0 = -6200, MASK_X1 = 3400, MASK_Z0 = -3600, MASK_Z1 = 7000;
const MASK_PX = 1024;

let _normalMap = null;
function getNormalMap() {
  if (_normalMap) return _normalMap;
  _normalMap = new THREE.TextureLoader().load(new URL('../assets/textures/water_normal.png', import.meta.url).href);
  _normalMap.wrapS = _normalMap.wrapT = THREE.RepeatWrapping;
  _normalMap.anisotropy = 8;
  _normalMap.colorSpace = THREE.NoColorSpace;
  return _normalMap;
}

// Bakes the region mask (see header). Returns a DataTexture, or null when canvases are unavailable.
function bakeMask(GEO) {
  if (typeof document === 'undefined' || !GEO || !GEO.landOuter) return null;
  const S = MASK_PX;
  const sx = S / (MASK_X1 - MASK_X0), sz = S / (MASK_Z1 - MASK_Z0);
  const layer = (draw, blurPx) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff';
    const path = (flat, close = true) => {
      for (let i = 0; i < flat.length; i += 2) {
        const x = (flat[i] - MASK_X0) * sx, y = (flat[i + 1] - MASK_Z0) * sz;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      if (close) g.closePath();
    };
    draw(g, path);
    if (blurPx > 0) {
      const b = document.createElement('canvas');
      b.width = b.height = S;
      const bg = b.getContext('2d');
      bg.filter = `blur(${blurPx}px)`;
      bg.drawImage(c, 0, 0);
      return bg.getImageData(0, 0, S, S).data;
    }
    return g.getImageData(0, 0, S, S).data;
  };
  // R: dry land (water outlines cut out) blurred ~45 m: 1 on land, fading over the first metres of water
  const land = layer((g, path) => {
    g.beginPath(); path(GEO.landOuter);
    for (const r of GEO.waterOutlines || []) path(r);
    g.fill('evenodd');
  }, 4);
  // G: inside the coast (rivers and lakes count as inside), blurred ~340 m: 0 out in the bay
  const inside = layer((g, path) => { g.beginPath(); path(GEO.landOuter); g.fill(); }, 32);
  // B: park lakes
  const lakes = layer((g, path) => {
    for (const w of GEO.water || []) {
      if (!/Lake/i.test(w.name || '') || !w.rings || !w.rings[0]) continue;
      g.beginPath(); path(w.rings[0]); g.fill();
    }
  }, 2);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = land[i * 4]; data[i * 4 + 1] = inside[i * 4]; data[i * 4 + 2] = lakes[i * 4]; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** @param {object} GEO the geodata (js/geodata.js) */
export function createMelbourneWaterMaterial(GEO) {
  const high = QUALITY === 'high';
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.0, roughness: 0.12 });
  const nmap = getNormalMap();
  const maskTex = high || QUALITY === 'medium' ? bakeMask(GEO) : null;

  const P = positionWorld.xz;
  const viewVec = cameraPosition.sub(positionWorld);
  const dist = length(viewVec);
  const viewDir = normalize(viewVec);

  // Region mask: x = bank proximity, y = inside the coast, z = park lake
  const m = maskTex
    ? texture(maskTex, vec2(P.x.sub(MASK_X0).div(MASK_X1 - MASK_X0), P.y.sub(MASK_Z0).div(MASK_Z1 - MASK_Z0))).rgb
    : vec3(0.0, 1.0, 0.0);
  const bank = m.x, lake = m.z;
  const bay = float(1.0).sub(smoothstep(0.08, 0.7, m.y)).mul(float(1.0).sub(lake)); // open Port Phillip Bay

  // Dual scrolling normal maps: broad slow swell + fine ripples running another way; bay is bigger and choppier
  const slopeAt = (scale, dir, speed) => {
    const uvs = P.div(scale).add(dir.mul(time.mul(speed / scale)));
    const n = texture(nmap, uvs).xy.mul(2.0).sub(1.0);
    return n;
  };
  const far = smoothstep(80.0, 900.0, dist); // fade fine detail to calm so distant water doesn't shimmer
  const bayScale = mix(float(1.0), float(2.4), bay);
  const s1 = slopeAt(7.0, vec2(0.8, 0.35), 0.55);
  const slope = s1.mul(mix(float(0.55), float(0.2), far)).mul(bayScale).toVar();
  if (QUALITY !== 'low') {
    const s2 = slopeAt(2.3, vec2(-0.45, 0.9), 0.4);
    const s3 = slopeAt(31.0, vec2(0.3, -0.6), 0.9); // long bay swell
    slope.addAssign(s2.mul(mix(float(0.32), float(0.04), far)).mul(mix(float(1.0), float(0.6), bay)));
    slope.addAssign(s3.mul(mix(float(0.15), float(0.5), bay)));
  }
  const calm = float(1.0).sub(lake.mul(0.5)); // lakes: gentler
  const waterNormal = normalize(vec3(slope.x.negate().mul(calm), 1.0, slope.y.negate().mul(calm)));
  mat.normalNode = cameraViewMatrix.transformDirection(waterNormal);
  mat.roughnessNode = clamp(mix(float(0.1), float(0.35), far).add(bay.mul(0.04)), 0.06, 0.5);

  const cosT = clamp(dot(waterNormal, viewDir), 0.0, 1.0);
  const fresnel = pow(float(1.0).sub(cosT), 4.0).mul(0.97).add(0.03);

  // Body: murky green-brown Yarra, bluer bay, green lakes; shallower (lighter, greener) toward the banks
  mat.colorNode = Fn(() => {
    const yarra = mix(color(0x2b2c1c), color(0x4a4a2c), smoothstep(0.3, 0.9, bank));
    const bayDeep = mix(color(0x143a4c), color(0x2d7482), smoothstep(0.1, 0.6, bank.mul(0.6).add(m.y.mul(0.4))));
    const lakeC = mix(color(0x233a22), color(0x3a5330), bank);
    const body = mix(mix(yarra, bayDeep, bay), lakeC, lake);
    return body;
  })();

  // Reflection of the sky without relying on the environment: gradient on the reflected ray, so water is never a void
  const R = reflect(viewDir.negate(), waterNormal);
  const skyRefl = mix(cityUniforms.uSkyHorizonColor, cityUniforms.uSkyTopColor, smoothstep(0.0, 0.7, max(R.y, 0.0)));
  const sunDir = normalize(cityUniforms.uSkySunDir);
  const sunUp = smoothstep(-0.02, 0.12, sunDir.y);
  const glint = pow(max(dot(R, sunDir), 0.0), high ? 900.0 : 300.0).mul(high ? 40.0 : 14.0).mul(sunUp);
  const glintWide = pow(max(dot(R, sunDir), 0.0), 40.0).mul(0.5).mul(sunUp);
  const night = smoothstep(0.55, 1.35, cityUniforms.uInteriorGlow);

  mat.emissiveNode = Fn(() => {
    const out = skyRefl.mul(fresnel).mul(0.55).toVar();
    out.addAssign(cityUniforms.uSunColor.mul(glint.add(glintWide)).mul(fresnel.mul(0.6).add(0.4)));
    if (QUALITY !== 'low') {
      // Foam / pale edge along quay walls and shores
      const edge = smoothstep(0.82, 1.0, bank);
      const fN = texture(nmap, P.div(3.1).add(vec2(time.mul(0.02), 0.0))).x;
      const foam = edge.mul(smoothstep(0.35, 0.9, fN)).mul(0.18).mul(float(1.0).sub(lake));
      out.addAssign(vec3(foam).mul(max(cityUniforms.uSkyHorizonColor, vec3(0.25))).mul(float(1.0).sub(night.mul(0.85))));
      // Night: warm vertical streaks of bank lights (stretched noise along the view direction) near the shores
      const nearBank = smoothstep(0.15, 0.85, bank).mul(float(1.0).sub(bay));
      const side = P.x.mul(0.9).add(P.y.mul(0.35));
      const cell = floor(side.div(7.0));
      const h = fract(sin(cell.mul(127.1)).mul(43758.5453));
      const tint = mix(color(0xffb36a), color(0xffe2b0), fract(h.mul(7.3)));
      const lit = smoothstep(0.55, 0.9, h);
      const along = smoothstep(0.0, 1.0, texture(nmap, vec2(side.div(9.0), time.mul(0.05).add(dist.mul(0.004)))).x);
      out.addAssign(tint.mul(lit.mul(along.mul(0.6).add(0.4))).mul(nearBank).mul(fresnel.mul(2.5).add(0.15)).mul(night).mul(1.4));
    }
    return out;
  })();

  return mat;
}
