// Graphics quality: 'low', 'medium' or 'high', chosen once at start-up from ?quality=, the player's saved choice, or
// the graphics hardware. Laptop and phone GPUs (integrated Intel, AMD APUs, Mali, Adreno, software renderers) start on
// Low; discrete NVIDIA / AMD / Intel Arc cards on High; anything else on Medium. Changing it reloads the page.
//
//   low:    60% render scale, no antialiasing, no screen-space reflections, bloom or grade pass (direct render with
//           tone mapping), no sun shadows, short draw distance, simpler trees sooner, 70 cars and 140 people
//   medium: 85% render scale, bloom and grade but no reflections, 1024 px shadow cascades, 130 cars and 240 people
//   high:   Slop New York's full pipeline
// Every level also scales its resolution down (and back up) by itself to hold a playable frame rate (main.js).

const LEVELS = ['low', 'medium', 'high'];
const KEY = 'gta-melbourne-quality';

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

function choose() {
  const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
  if (LEVELS.includes(fromUrl)) return { level: fromUrl, source: 'url', gpu: '' };
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (LEVELS.includes(saved)) return { level: saved, source: 'saved', gpu: '' };
  const gpu = detectGpu();
  let level = gpu.level;
  const mobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const memory = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (mobile || (memory && memory <= 4)) level = 'low';
  return { level, source: 'detected', gpu: gpu.name };
}

const picked = choose();
export const QUALITY = picked.level;
export const QUALITY_SOURCE = picked.source;
export const GPU_NAME = picked.gpu;

const SETTINGS = {
  low: {
    pixelRatio: 0.6, minPixelRatio: 0.4, antialias: false, postFX: 'none', shadows: false, shadowTile: 0,
    cameraFar: 3500, fogScale: 2.2, cars: 70, buses: 4, peds: 140, treeLod: 0.45, treeDist: 0.35, cullScale: 0.5
  },
  medium: {
    pixelRatio: 0.85, minPixelRatio: 0.5, antialias: false, postFX: 'bloom', shadows: true, shadowTile: 1024,
    cameraFar: 12000, fogScale: 1.3, cars: 130, buses: 8, peds: 240, treeLod: 0.75, treeDist: 0.65, cullScale: 0.8
  },
  high: {
    pixelRatio: 1.0, minPixelRatio: 0.6, antialias: true, postFX: 'full', shadows: true, shadowTile: 2048,
    cameraFar: 60000, fogScale: 1.0, cars: 200, buses: 12, peds: 340, treeLod: 1.0, treeDist: 1.0, cullScale: 1.0
  }
};
export const Q = SETTINGS[QUALITY];

/** Save a level and reload with it */
export function setQuality(level) {
  if (!LEVELS.includes(level)) return;
  try { localStorage.setItem(KEY, level); } catch { /* storage unavailable */ }
  const url = new URL(location.href);
  url.searchParams.delete('quality');
  location.href = url.toString();
}
export const QUALITY_LEVELS = LEVELS;
