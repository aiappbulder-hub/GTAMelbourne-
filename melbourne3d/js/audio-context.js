// The game's one AudioContext. Music, voices, the city's sound, the police siren, gunshots and the intro score all play
// through it. Several contexts each have to be unlocked and resumed on their own (a browser caps them, suspends the ones
// made outside a user gesture, and an unlock handler on one leaves the others silent), so there is exactly one:
//  - it is created on the first user gesture (or the first call after one) and never closed
//  - every gesture (pointer, touch, click, key) resumes it until it is running, and again if the browser interrupts it
//  - nothing but the browser's own policy suspends it: muting music or sound is a gain, never a suspend
const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
let shared = null;
let gestured = false;

function tryResume() {
  if (shared && shared.state !== 'running' && shared.state !== 'closed') shared.resume().catch(() => { /* a later gesture retries */ });
}

/** The shared context, or null before the first user gesture / without Web Audio. Pass force to create it anyway. */
export function sharedAudioContext({ force = false } = {}) {
  if (!Ctor) return null;
  if (!shared || shared.state === 'closed') {
    if (!gestured && !force) return null;
    try { shared = new Ctor({ latencyHint: 'interactive' }); } catch { shared = null; return null; }
  }
  tryResume();
  return shared;
}

/** True once the player has pressed, tapped or clicked anything */
export const audioGestured = () => gestured;

if (typeof window !== 'undefined' && Ctor) {
  const onGesture = (event) => {
    if (event.type === 'keydown' && (event.metaKey || event.ctrlKey)) return;
    gestured = true;
    sharedAudioContext();
    tryResume();
  };
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryResume(); });
}
