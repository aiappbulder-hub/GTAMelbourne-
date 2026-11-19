// Graphics quality: 'low', 'medium' or 'high': ?quality= or the player's saved choice (the Graphics menu in the
// toolbar), else High on every device. Changing it reloads the page. Dynamic resolution (main.js) keeps High playable
// on weaker GPUs; Low and Medium are there to pick when it isn't enough.
//
//   low:    60% render scale, no antialiasing, no screen-space reflections, bloom or grade pass (direct render with
//           tone mapping), no sun shadows, short draw distance, simpler trees sooner, 70 cars and 140 people
//   medium: 85% render scale, bloom and grade but no reflections, 1024 px shadow cascades, 130 cars and 240 people
//   high:   Slop New York's full pipeline
// Every level also scales its resolution down (and back up) by itself to hold a playable frame rate (main.js).

const LEVELS = ['low', 'medium', 'high'];
const KEY = 'gta-melbourne-quality';
const AUTO_KEY = 'gta-melbourne-quality-auto';

function detectGpu() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { name: '', level: 'low' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    let level = 'medium';
    if (/NVIDIA|GeForce|Quadro|RTX|GTX|Radeon RX|Radeon Pro|Arc\b|Intel\(R\) Arc/i.test(name)) level = 'high';
    if (/Intel|HD Graphics|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Software|Microsoft Basic|Radeon\(TM\) (Graphics|R[2-7]|Vega)|Radeon Graphics/i.test(name)) level = 'low';
    return { name, level };
  } catch {
    return { name: '', level: 'low' };
  }
}

export const IS_MOBILE = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent || '') ||
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 1);

function choose() {
  const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
  if (LEVELS.includes(fromUrl)) return { level: fromUrl, source: 'url', gpu: '' };
  let saved = null, auto = null;
  try { saved = localStorage.getItem(KEY); auto = localStorage.getItem(AUTO_KEY); } catch { /* storage unavailable */ }
  // A manual pick (the Graphics menu) wins and is never stepped down automatically
  if (LEVELS.includes(saved)) return { level: saved, source: 'saved', gpu: '' };
  // Result of an earlier automatic step-down that needed a rebuild (so it doesn't loop on every visit)
  if (LEVELS.includes(auto)) return { level: IS_MOBILE && auto === 'high' ? 'low' : auto, source: 'auto', gpu: '' };
  // No choice yet: phones, tablets and touch devices start on Low; otherwise the GPU decides (weak or unknown: Low or
  // Medium, discrete: High). The auto step-down (main.js) lowers it further if the frame rate stays under 40.
  const gpu = detectGpu();
  return { level: IS_MOBILE ? 'low' : gpu.level, source: 'default', gpu: gpu.name };
}

const picked = choose();
export const QUALITY = picked.level;
export const QUALITY_SOURCE = picked.source;
export const GPU_NAME = picked.gpu;

const SETTINGS = {
  low: {
    pixelRatio: 0.6, minPixelRatio: 0.4, antialias: false, postFX: 'none', shadows: false, shadowTile: 0,
    cameraFar: 3500, fogScale: 2.2, cars: 70, buses: 4, peds: 140, treeLod: 0.45, treeDist: 0.35, cullScale: 0.5, viewDist: 1500
  },
  medium: {
    pixelRatio: 0.85, minPixelRatio: 0.5, antialias: false, postFX: 'bloom', shadows: true, shadowTile: 1024,
    cameraFar: 12000, fogScale: 1.3, cars: 130, buses: 8, peds: 240, treeLod: 0.75, treeDist: 0.65, cullScale: 0.8, viewDist: 2500
  },
  high: {
    pixelRatio: 1.0, minPixelRatio: 0.6, antialias: true, postFX: 'full', shadows: true, shadowTile: 2048,
    cameraFar: 60000, fogScale: 1.0, cars: 200, buses: 12, peds: 340, treeLod: 1.0, treeDist: 1.0, cullScale: 1.0, viewDist: Infinity
  }
};
export const Q = { ...SETTINGS[QUALITY] };
// Phones and tablets render at 75% of the tier's resolution (the pixel ratio is already capped at 1)
if (IS_MOBILE) { Q.pixelRatio = Math.min(1, Q.pixelRatio) * 0.75; Q.minPixelRatio = Math.min(Q.minPixelRatio, Q.pixelRatio) * 0.75; }
// Today's heavy extras (PBR facades and roofs, HDRI lighting, new trees and water, GTAO) are High only
export const HEAVY_FX = QUALITY === 'high';

/** Manual pick (URL or the Graphics menu): never stepped down automatically */
export const MANUAL_QUALITY = QUALITY_SOURCE === 'url' || QUALITY_SOURCE === 'saved';
/** Sustained-low-fps threshold: 25 on phones, 40 elsewhere */
export const LOW_FPS = IS_MOBILE ? 25 : 40;

/** Remember an automatic step-down (kept apart from the player's own choice) */
export function rememberAutoQuality(level) {
  try { localStorage.setItem(AUTO_KEY, level); } catch { /* storage unavailable */ }
}
/** The next tier down from `level`, or null */
export function lowerTier(level) { const i = LEVELS.indexOf(level); return i > 0 ? LEVELS[i - 1] : null; }
/** Reload with an automatic tier (only for what cannot be applied live: high -> medium) */
export function reloadWithAutoQuality(level) {
  rememberAutoQuality(level);
  const url = new URL(location.href);
  url.searchParams.delete('quality');
  location.href = url.toString();
}
/** Apply a tier's cheap settings live onto Q (view distance, fog, camera far, render scale, shadows flag) */
export function applyTierLive(level) {
  const t = SETTINGS[level];
  const px = IS_MOBILE ? 0.75 : 1;
  Object.assign(Q, { viewDist: t.viewDist, fogScale: t.fogScale, cameraFar: t.cameraFar, shadows: t.shadows, postFX: t.postFX, treeDist: t.treeDist, cullScale: t.cullScale });
  Q.pixelRatio = Math.min(1, t.pixelRatio) * px;
  Q.minPixelRatio = Math.min(t.minPixelRatio, Q.pixelRatio) * px;
}

/** Save a level and reload with it */
export function setQuality(level) {
  if (!LEVELS.includes(level)) return;
  try { localStorage.setItem(KEY, level); } catch { /* storage unavailable */ }
  const url = new URL(location.href);
  url.searchParams.delete('quality');
  location.href = url.toString();
}
export const QUALITY_LEVELS = LEVELS;
