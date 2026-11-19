// Player options kept in localStorage (every access in try/catch): police on/off and which sound layers play.
// Police is OFF by default (or ?police=1 turns it on for the page). The radio (js/music.js) is not covered here.
const PREFIX = 'gta-melbourne3d-opt-';
const DEFAULTS = {
  police: false,
  engine: true,     // your own vehicle's engine
  ambience: false,  // wind, other traffic's engines, crossing ticks, bike packs: the continuous city drone
  voices: false,    // overheard pedestrian chatter and passers-by remarks (story dialogue is not affected)
  sirens: true,     // siren sounds (only exist while police are on)
  footsteps: true,
  horns: true       // horns and crashes
};
const listeners = new Set();
const cache = {};
let urlPolice = null;
try { const q = new URLSearchParams(location.search).get('police'); if (q !== null) urlPolice = q !== '0'; } catch (e) { /* no url */ }

function load(key) {
  try { const v = localStorage.getItem(PREFIX + key); if (v === '1') return true; if (v === '0') return false; } catch (e) { /* storage blocked */ }
  return DEFAULTS[key];
}
export const settings = {
  keys: Object.keys(DEFAULTS),
  get(key) {
    if (key === 'police' && urlPolice !== null) return urlPolice;
    if (!(key in cache)) cache[key] = load(key);
    return cache[key];
  },
  set(key, value) {
    cache[key] = !!value;
    if (key === 'police') urlPolice = null;
    try { localStorage.setItem(PREFIX + key, value ? '1' : '0'); } catch (e) { /* storage blocked */ }
    for (const fn of listeners) { try { fn(key, !!value); } catch (e) { console.error(e); } }
  },
  toggle(key) { this.set(key, !this.get(key)); return this.get(key); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};
