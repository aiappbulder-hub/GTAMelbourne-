// Every weapon in one table: the player's numbers (js/gameplay.js), the numbers armed hostiles shoot with
// (js/combat.js: `npc`), the low-poly model built in code (js/people.js draws it in a hand) and the HUD icon (drawn from
// the same parts). Models are built pointing down +z with the origin in the shooting hand's palm (y up); `muzzle` and
// `support` (where the other hand holds it) are distances along z.
//
//   slot     the number key; Tab / the wheel / the GUN button cycle in table order
//   rate     seconds between shots; mag, reload (s); range (m); pellets; spread (radians, half-angle, the player's)
//   dmg      per pellet / hit. People in the crowd go down at any hit; the hostile's `hp` is spent
//   blast    rockets: { r: radius m, dmg: at the centre, falls off to 0 at r }, speed m/s
//   npc      what a hostile shoots with: rate, burst (shots), err (aim error, radians, at 20 m standing still),
//            dmg (to the player per hit), range, sight
import * as THREE from 'three/webgpu';

const metal = { color: 0x1b1c1e, roughness: 0.35, metalness: 0.8 };
const dark = { color: 0x2b2d31, roughness: 0.45, metalness: 0.6 };
const grip = { color: 0x2b2420, roughness: 0.7, metalness: 0 };
const olive = { color: 0x4a5a3a, roughness: 0.6, metalness: 0.3 };
const MATS = { metal, dark, grip, olive };
// a part: ['b', w, h, d, x, y, z, mat] (a box) or ['c', radius, length, x, y, z, mat] (a cylinder along z)
const B = (w, h, d, x, y, z, m = 'metal') => ['b', w, h, d, x, y, z, m];
const C = (r, len, x, y, z, m = 'metal') => ['c', r, len, x, y, z, m];

export const WEAPONS = [
  { id: 'pistol', slot: 1, name: 'Pistol', mag: 12, rate: 0.28, reload: 1.2, range: 60, pellets: 1, spread: 0.012, dmg: 34, auto: false, sound: 'pistol',
    muzzle: 0.17, support: 0, hand: { fwd: 0.07, down: 0.03 }, twoHanded: false,
    npc: { rate: 0.5, burst: 3, err: 0.05, dmg: 8, range: 45, sight: 38 },
    parts: [B(0.03, 0.04, 0.19, 0, 0.055, 0.075), B(0.026, 0.03, 0.12, 0, 0.025, 0.03), B(0.028, 0.115, 0.04, 0, -0.035, -0.02, 'grip'), B(0.02, 0.012, 0.05, 0, 0.0, 0.045)] },
  { id: 'uzi', slot: 2, name: 'Uzi', mag: 32, rate: 0.085, reload: 1.6, range: 45, pellets: 1, spread: 0.05, dmg: 16, auto: true, sound: 'uzi',
    muzzle: 0.27, support: 0.1, hand: { fwd: 0.06, down: 0.03 }, hold: { f: 0.3, s: -0.1, u: -0.12 }, twoHanded: true,
    npc: { rate: 0.13, burst: 6, err: 0.085, dmg: 4, range: 38, sight: 34 },
    parts: [B(0.05, 0.07, 0.26, 0, 0.05, 0.1), C(0.008, 0.1, 0, 0.055, 0.28), B(0.03, 0.16, 0.035, 0, -0.07, 0.05), B(0.03, 0.1, 0.035, 0, -0.03, -0.03, 'grip'), B(0.02, 0.02, 0.1, 0, 0.09, 0.08)] },
  { id: 'shotgun', slot: 3, name: 'Shotgun', mag: 6, rate: 0.85, reload: 2.2, range: 26, pellets: 8, spread: 0.11, dmg: 15, auto: false, sound: 'shotgun',
    muzzle: 0.6, support: 0.3, hand: { fwd: 0.06, down: 0.03 }, hold: { f: 0.34, s: -0.11, u: -0.1 }, twoHanded: true,
    npc: { rate: 1.1, burst: 1, err: 0.06, dmg: 9, range: 24, sight: 30, pellets: 4 },
    parts: [C(0.016, 0.64, 0, 0.06, 0.3), C(0.014, 0.42, 0, 0.025, 0.31), B(0.045, 0.045, 0.16, 0, 0.0, 0.3, 'grip'), B(0.045, 0.07, 0.2, 0, 0.05, 0.02), B(0.04, 0.1, 0.3, 0, 0.0, -0.25, 'grip'), B(0.028, 0.08, 0.035, 0, -0.04, 0.0, 'grip')] },
  { id: 'm4', slot: 4, name: 'M4 Rifle', mag: 30, rate: 0.11, reload: 1.9, range: 90, pellets: 1, spread: 0.012, dmg: 26, auto: true, sound: 'm4',
    muzzle: 0.62, support: 0.38, hand: { fwd: 0.06, down: 0.03 }, hold: { f: 0.36, s: -0.11, u: -0.1 }, twoHanded: true, kick: 0.012,
    npc: { rate: 0.16, burst: 4, err: 0.04, dmg: 5, range: 60, sight: 45 },
    parts: [B(0.045, 0.075, 0.3, 0, 0.055, 0.1, 'dark'), B(0.052, 0.052, 0.28, 0, 0.05, 0.4, 'dark'), C(0.008, 0.16, 0, 0.055, 0.58), B(0.042, 0.085, 0.24, 0, 0.035, -0.2), B(0.02, 0.03, 0.22, 0, 0.105, 0.12), B(0.03, 0.15, 0.05, 0, -0.08, 0.1), B(0.03, 0.1, 0.04, 0, -0.04, -0.025, 'grip')] },
  { id: 'rocket', slot: 5, name: 'Rocket Launcher', mag: 1, rate: 1.4, reload: 2.6, range: 140, pellets: 1, spread: 0.004, dmg: 120, auto: false, sound: 'rocket',
    speed: 42, blast: { r: 9, dmg: 150 }, muzzle: 0.6, support: 0.28, hand: { fwd: 0.04, down: 0.06 }, hold: { f: 0.3, s: -0.04, u: -0.02 }, twoHanded: true, kick: 0.05,
    npc: { rate: 3, burst: 1, err: 0.08, dmg: 30, range: 70, sight: 45, rocket: true },
    parts: [C(0.055, 1.0, 0, 0.12, 0.1, 'olive'), C(0.072, 0.1, 0, 0.12, -0.42, 'dark'), C(0.04, 0.1, 0, 0.12, 0.62, 'dark'), B(0.03, 0.1, 0.04, 0, -0.03, 0, 'grip'), B(0.03, 0.1, 0.04, 0, -0.03, 0.28, 'grip'), B(0.02, 0.04, 0.16, 0, 0.2, 0.1)] },
  { id: 'fists', slot: 6, name: 'Fists', melee: true, mag: Infinity, rate: 0.38, reload: 0, range: 1.9, pellets: 1, spread: 0, dmg: 24, auto: false, sound: 'punch',
    muzzle: 0, support: 0, hand: { fwd: 0, down: 0 }, twoHanded: false, npc: null, parts: [] }
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

const matCache = new Map();
const material = (name) => {
  if (!matCache.has(name)) matCache.set(name, new THREE.MeshStandardNodeMaterial(MATS[name]));
  return matCache.get(name);
};
/** A weapon's model: a Group pointing down +z (empty for fists) */
export function buildWeaponModel(id) {
  const g = new THREE.Group();
  g.name = `Gun:${id}`;
  for (const p of WEAPON_BY_ID[id].parts) {
    let m;
    if (p[0] === 'b') { m = new THREE.Mesh(new THREE.BoxGeometry(p[1], p[2], p[3]), material(p[7])); m.position.set(p[4], p[5], p[6]); }
    else { m = new THREE.Mesh(new THREE.CylinderGeometry(p[1], p[1], p[2], 10), material(p[6])); m.rotation.x = Math.PI / 2; m.position.set(p[3], p[4], p[5]); }
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** The HUD icon: an SVG of the model from the side, muzzle to the right (fists: a fist) */
export function weaponIconSVG(id) {
  const w = WEAPON_BY_ID[id];
  if (!w.parts.length) return '<svg viewBox="0 0 40 24" width="40" height="24"><rect x="9" y="6" width="22" height="13" rx="5" fill="currentColor"/><rect x="11" y="3" width="4" height="6" rx="2" fill="currentColor"/><rect x="16" y="2" width="4" height="6" rx="2" fill="currentColor"/><rect x="21" y="3" width="4" height="6" rx="2" fill="currentColor"/></svg>';
  // each part as a rect: z along the screen's x, y up
  const rects = w.parts.map((p) => (p[0] === 'b' ? { l: p[6] - p[3] / 2, r: p[6] + p[3] / 2, t: p[5] + p[2] / 2, b: p[5] - p[2] / 2 } : { l: p[5] - p[2] / 2, r: p[5] + p[2] / 2, t: p[4] + p[1], b: p[4] - p[1] }));
  const x0 = Math.min(...rects.map((r) => r.l)), x1 = Math.max(...rects.map((r) => r.r));
  const y0 = Math.min(...rects.map((r) => r.b)), y1 = Math.max(...rects.map((r) => r.t));
  const k = Math.min(52 / (x1 - x0), 22 / (y1 - y0));
  const out = rects.map((r) => `<rect x="${((r.l - x0) * k + 2).toFixed(1)}" y="${((y1 - r.t) * k + 1).toFixed(1)}" width="${((r.r - r.l) * k).toFixed(1)}" height="${Math.max(1.5, (r.t - r.b) * k).toFixed(1)}" fill="currentColor"/>`).join('');
  return `<svg viewBox="0 0 56 24" width="56" height="24">${out}</svg>`;
}
