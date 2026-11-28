// Player options kept in localStorage (every access in try/catch): police on/off and which sound layers play.
// Police is ON by default (?police=0 turns it off for the page). The radio (js/music.js) is not covered here.
const PREFIX = 'gta-melbourne3d-opt-';
const DEFAULTS = {
  police: true,
  engine: true,     // your own vehicle's engine
  ambience: false,  // wind, other traffic's engines, crossing ticks, bike packs: the continuous city drone
  voices: false,    // overheard pedestrian chatter and passers-by remarks (story dialogue is not affected)
  sirens: true,     // siren sounds (only exist while police are on)
  footsteps: true,
  horns: true       // horns and crashes
};
// number options: [default, min, max]
const NUMBERS = {
  aimSens: [0.0026, 0.001, 0.006] // mouse aim sensitivity, radians per pixel (js/gameplay.js)
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
  /** A number option, within its range (its default when unset or unreadable) */
  num(key) {
    if (!(key in cache)) {
      const [d, lo, hi] = NUMBERS[key];
      let v = d;
      try { const r = parseFloat(localStorage.getItem(PREFIX + key)); if (Number.isFinite(r)) v = Math.min(hi, Math.max(lo, r)); } catch (e) { /* storage blocked */ }
      cache[key] = v;
    }
    return cache[key];
  },
  setNum(key, value) {
    const [, lo, hi] = NUMBERS[key];
    const v = Math.min(hi, Math.max(lo, +value || NUMBERS[key][0]));
    cache[key] = v;
    try { localStorage.setItem(PREFIX + key, String(v)); } catch (e) { /* storage blocked */ }
    for (const fn of listeners) { try { fn(key, v); } catch (e) { console.error(e); } }
  },
  numRange(key) { return NUMBERS[key]; },
  toggle(key) { this.set(key, !this.get(key)); return this.get(key); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};
