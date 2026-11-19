import * as THREE from 'three/webgpu';
import {
  float, vec2, vec3, vec4, texture, positionWorld, normalWorldGeometry, cameraViewMatrix,
  abs, step, mix, clamp, sign, normalize
} from 'three/tsl';
import { QUALITY, HEAVY_FX } from './quality.js';

// Photo-scanned PBR materials (CC0 ambientCG, see CREDITS.md) shared by the road, footpath, park and facade materials.
// Every layer is sampled in world space (so UVs never stretch on merged meshes), mipmapped and anisotropic, and is
// applied as a *detail* layer: colour as ratio-to-mean modulation of the existing procedural colour (so wet/stain/paint
// logic is kept), roughness as a ratio, normal as a perturbation added to the existing normal.
//   ?nopbr      disables everything (before/after comparisons)
//   quality low colour only (no normal / roughness maps)

export const PBR_ON = typeof location === 'undefined' || (HEAVY_FX && !new URLSearchParams(location.search).has('nopbr'));
export const PBR_FULL = PBR_ON && QUALITY !== 'low';

const BASE = new URL('../assets/pbr/', import.meta.url).href;
// Linear-space mean colour and mean roughness of each set
const MEAN = {
  asphalt: [[0.193, 0.193, 0.193], 0.524],
  paver: [[0.363, 0.336, 0.277], 0.527],
  cobble: [[0.105, 0.111, 0.111], 0.721],
  grass: [[0.125, 0.159, 0.035], 0.263],
  brick: [[0.253, 0.168, 0.105], 0.599],
  concrete: [[0.482, 0.482, 0.482], 0.516],
  render: [[0.682, 0.653, 0.627], 0.79],
  tiles: [[0.275, 0.106, 0.057], 0.677],
  corrugated: [[0.23, 0.228, 0.227], 0.474]
};

const _loader = new THREE.TextureLoader();
const _cache = new Map();
function loadTex(name, file) {
  const key = name + '/' + file;
  let t = _cache.get(key);
  if (!t) {
    t = _loader.load(BASE + key + '.jpg');
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = file === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    _cache.set(key, t);
  }
  return t;
}

export function pbrTexture(name, file) { return loadTex(name, file); }

function build(name, uvNode, deltaWorld, strength, normalK) {
  const [mc, mr] = MEAN[name];
  const c = texture(loadTex(name, 'color'), uvNode).rgb;
  const ratio = clamp(c.div(vec3(mc[0], mc[1], mc[2])), 0.25, 2.6);
  const out = { colorRatio: mix(vec3(1.0), ratio, strength), roughRatio: float(1.0), normalDelta: vec3(0.0), raw: c };
  if (PBR_FULL) {
    const r = texture(loadTex(name, 'rough'), uvNode).r;
    out.roughRatio = mix(float(1.0), clamp(r.div(mr), 0.4, 1.6), strength);
    const n = texture(loadTex(name, 'normal'), uvNode).rg.mul(2.0).sub(1.0).mul(normalK);
    out.normalDelta = cameraViewMatrix.mul(vec4(deltaWorld(n), 0.0)).xyz;
  }
  return out;
}

/** Up-facing ground layer in world xz, `metres` per texture repeat. */
export function pbrGround(name, metres, strength = 1.0, normalK = 0.8) {
  return build(name, positionWorld.xz.div(metres), (n) => vec3(n.x, 0.0, n.y), strength, normalK);
}

/** Wall layer: world xy or zy picked by facing, `metres` per repeat (u across, v up). */
export function pbrWall(name, metres, strength = 1.0, normalK = 0.8) {
  const ng = normalWorldGeometry;
  const alongX = step(abs(ng.x), abs(ng.z)); // 1 when the wall faces +-z (runs along x)
  const u = mix(positionWorld.z, positionWorld.x, alongX);
  const uvNode = vec2(u, positionWorld.y).div(metres);
  const sg = mix(sign(ng.x), sign(ng.z), alongX);
  return build(name, uvNode, (n) => mix(vec3(0.0, n.y, n.x.mul(sg)), vec3(n.x.mul(sg), n.y, 0.0), alongX), strength, normalK);
}

/** Add a layer's normal perturbation to an existing view-space normal. */
export function pbrNormal(baseViewNormal, layer, amount = 1.0) {
  return normalize(baseViewNormal.add(layer.normalDelta.mul(amount)));
}
