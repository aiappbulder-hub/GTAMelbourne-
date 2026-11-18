// Area title cards: a GTA-style district name fades in bottom-right for ~3 s when the player enters a new district.
// Uses districtAt (melbourne-config.js). Hysteresis: a new district must hold for HOLD seconds before its card shows,
// so driving along a border doesn't flicker; going back to the district already shown does nothing.
import { districtAt } from './city-config.js';

const NAMES = {
  cbd: 'CBD', docklands: 'Docklands', southbank: 'Southbank', south_wharf: 'South Wharf', domain: 'The Domain', richmond: 'Richmond',
  fitzroy: 'Fitzroy', east_melbourne: 'East Melbourne', north_melbourne: 'North Melbourne', carlton: 'Carlton', st_kilda: 'St Kilda',
  albert_park: 'Albert Park', middle_park: 'Middle Park', st_kilda_road: 'St Kilda Road', collingwood: 'Collingwood',
  fishermans_bend: 'Fishermans Bend', south_yarra: 'South Yarra', port_melbourne: 'Port Melbourne', south_melbourne: 'South Melbourne'
};
const HOLD = 1.2, SHOW = 3.2;

export function createAreaCards({ controllerManager }) {
  const style = document.createElement('style');
  style.textContent = `.gm-area { position: fixed; right: 28px; bottom: 120px; z-index: 29; pointer-events: none; opacity: 0; transition: opacity .6s ease;
  color: #fff; font: 800 clamp(24px, 4.2vw, 46px)/1 Inter, system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase; text-align: right;
  text-shadow: 0 2px 0 #000, 0 0 14px rgba(0,0,0,.8); }
.gm-area.on { opacity: 1; }`;
  document.head.append(style);
  const el = document.createElement('div');
  el.className = 'gm-area';
  document.body.append(el);
  let shown = null, cand = null, candT = 0, showT = 0;
  const api = {
    /** The id of the district last announced */
    get current() { return shown; },
    get text() { return el.textContent; },
    get visible() { return el.classList.contains('on'); },
    update(dt0) {
      const now = performance.now(), dt = Math.min(2, (now - (api._t || now)) / 1000); api._t = now; // wall time, so slow frames don't stretch the hold
      const e = controllerManager.getActiveEntity();
      if (showT > 0) { showT -= dt; if (showT <= 0) el.classList.remove('on'); }
      if (!e || e.position.y > 1000 || document.body.classList.contains('cinematic')) return;
      const d = districtAt(e.position.x, e.position.z);
      if (d === shown) { cand = null; return; }
      if (d !== cand) { cand = d; candT = 0; return; }
      candT += dt;
      if (candT < HOLD) return;
      shown = d; cand = null;
      el.textContent = NAMES[d] || d;
      el.classList.add('on');
      showT = SHOW;
    }
  };
  return api;
}
