import * as THREE from 'three/webgpu';
import { PLACES } from './story/places.js';
import { STORY_CAST } from './people.js';

// Interiors: the Quiet Room, Gus's bar at Flinders Lane x Elizabeth St (story place HQ, MILESTONES.md).
//
// The room is a sealed box built here in code (one merged, vertex-lit mesh, no textures but two signs), hung 1500 m
// above the street over the bar's real footprint, so nothing of the city is ever in view or in earshot (the sky,
// the traffic and the rain are all a kilometre below the floor) and its places keep real map coordinates (the story's
// QR_* places carry y = ROOM.y). The street door is on the building's Elizabeth St face. F at either door fades to
// black and moves the player through; the way in and out is only ever on foot, never in a car or a cut scene.
//
//  - Ground: registered through controllerManager.extraGround, only while the player is inside (so the real street
//    under the room's map position is never lifted).
//  - Walls and furniture: AABB colliders (minY/maxY at the room's height), joined to controllerManager.colliders.
//  - Camera: main.js calls postCamera() after the follow/cut camera; it pulls the camera in along the line to the
//    player until it is inside the room, so it never leaves through a wall or the ceiling.
//  - While inside: the sun is off and the hemisphere light warm (the people are lit by it), rain hidden, the minimap
//    hidden, the police called off, and nobody can take a car or talk to a passer-by (body.in-room).
//  - Jobs: a step with `enter: true` is done when the player is inside; `inside: true` steps are played inside; when a
//    job moves on to a step that is neither, the player is shown out. A saved game inside is saved at the street door.

export const ROOM = { y: 1500, x0: -214.5, x1: -200.5, z0: 131.5, z1: 141.5, h: 3.2 };
const DOOR_OUT = { x: -215.82, z: 137 }; // the street door, on the building's west (Elizabeth St) face
const STAND_OUT = { x: PLACES.QR_DOOR.x, z: PLACES.QR_DOOR.z, heading: -Math.PI / 2 }; // where you step out: facing the street
const DOOR_IN = { x: ROOM.x0, z: 136.5 };
const ARRIVE = { x: ROOM.x0 + 2.0, z: 136.5, heading: Math.PI / 2 };
const REACH_OUT = 2.6, REACH_IN = 2.0;
const FADE = 0.32; // seconds each way

// ---------------------------------------------------------------------------------------------------------------
// A tiny mesh builder: boxes and cylinders cut into 0.5 m cells, each vertex lit once (lamps with a falloff, an
// ambient, a darkening near walls and under furniture), so the room reads as lit by its lamps without any light
// in the scene.
// ---------------------------------------------------------------------------------------------------------------
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function makeBuilder(lights, ambient, occluders, shade = true) {
  const pos = [], nor = [], col = [], idx = [];
  const { x0, x1, z0, z1, y: Y, h } = ROOM;
  function lightAt(x, y, z, nx, ny, nz) {
    let r = ambient[0], g = ambient[1], b = ambient[2];
    for (const L of lights) {
      const dx = L.x - x, dy = L.y - y, dz = L.z - z, d = Math.hypot(dx, dy, dz);
      if (d >= L.r) continue;
      let f = 1 - d / L.r;
      f *= f;
      const lam = Math.max(0, (nx * dx + ny * dy + nz * dz) / (d || 1)) * 0.78 + 0.22;
      const k = L.i * f * lam * 2.2;
      r += L.c[0] * k; g += L.c[1] * k; b += L.c[2] * k;
    }
    // a darker corner against a wall or the ceiling, and under the furniture
    const ly = y - Y;
    const wall = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    if (!shade) return [r, g, b];
    let ao = 0.7 + 0.3 * Math.min(1, Math.max(0, wall) / 0.9);
    ao *= 0.78 + 0.22 * Math.min(1, Math.max(0, h - ly) / 0.7);
    if (ny > 0.5 && ly < 0.05) for (const o of occluders) if (x > o.x0 - 0.3 && x < o.x1 + 0.3 && z > o.z0 - 0.3 && z < o.z1 + 0.3) { ao *= 0.62; break; }
    return [r * ao, g * ao, b * ao];
  }
  // one flat grid of (nu x nv) cells from o along u and v, facing n; the colour is [r,g,b], a function of the point,
  // or `emit` (not lit)
  function grid(o, u, v, nu, nv, n, color, emit) {
    const base = pos.length / 3;
    const flip = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2] < 0;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv;
      const x = o[0] + u[0] * s + v[0] * t, y = o[1] + u[1] * s + v[1] * t, z = o[2] + u[2] * s + v[2] * t;
      const alb = typeof color === 'function' ? color(x, y, z) : color;
      const c = emit ? alb : lightAt(x, y, z, n[0], n[1], n[2]).map((k, q) => k * alb[q]);
      pos.push(x, y, z); nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const cells = (len, step) => Math.max(1, Math.round(len / step));
  const api = {
    // an axis-aligned box; faces: which sides to build ('+x-x+y-y+z-z'), step: the cell size
    box(a, b, color, { emit = false, step = 0.5, faces = '+x-x+y-y+z-z' } = {}) {
      const [ax, ay, az] = a, [bx, by, bz] = b, dx = bx - ax, dy = by - ay, dz = bz - az;
      const nx = cells(dx, step), ny = cells(dy, step), nz = cells(dz, step);
      if (faces.includes('+x')) grid([bx, ay, az], [0, 0, dz], [0, dy, 0], nz, ny, [1, 0, 0], color, emit);
      if (faces.includes('-x')) grid([ax, ay, az], [0, 0, dz], [0, dy, 0], nz, ny, [-1, 0, 0], color, emit);
      if (faces.includes('+y')) grid([ax, by, az], [dx, 0, 0], [0, 0, dz], nx, nz, [0, 1, 0], color, emit);
      if (faces.includes('-y')) grid([ax, ay, az], [dx, 0, 0], [0, 0, dz], nx, nz, [0, -1, 0], color, emit);
      if (faces.includes('+z')) grid([ax, ay, bz], [dx, 0, 0], [0, dy, 0], nx, ny, [0, 0, 1], color, emit);
      if (faces.includes('-z')) grid([ax, ay, az], [dx, 0, 0], [0, dy, 0], nx, ny, [0, 0, -1], color, emit);
    },
    // a (tapering) vertical cylinder, smooth-shaded
    cyl(cx, cz, y0, y1, r0, r1, color, { seg = 8, emit = false, cap = true } = {}) {
      const base = pos.length / 3;
      const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const n = [ca, slope, sa], m = Math.hypot(...n);
        for (const [y, r] of [[y0, r0], [y1, r1]]) {
          const x = cx + ca * r, z = cz + sa * r;
          const c = emit ? color : lightAt(x, y, z, n[0] / m, n[1] / m, n[2] / m).map((q, i) => q * color[i]);
          pos.push(x, y, z); nor.push(n[0] / m, n[1] / m, n[2] / m); col.push(c[0], c[1], c[2]);
        }
      }
      for (let k = 0; k < seg; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      if (cap && r1 > 0.001) {
        const t = pos.length / 3, c = emit ? color : lightAt(cx, y1, cz, 0, 1, 0).map((q, i) => q * color[i]);
        pos.push(cx, y1, cz); nor.push(0, 1, 0); col.push(c[0], c[1], c[2]);
        for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; pos.push(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1); nor.push(0, 1, 0); col.push(c[0], c[1], c[2]); }
        for (let k = 0; k < seg; k++) idx.push(t, t + 2 + k, t + 1 + k);
      }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
    get verts() { return pos.length / 3; }
  };
  return api;
}

// a small canvas sign: text on a board (the street sign), or glowing text on black (the neon)
function signTexture(text, { fg, bg, glow = 0, font = '700 64px "Playfair Display", Georgia, serif', w = 768, h = 160 }) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = fg; g.shadowBlur = glow; }
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + 3);
  if (glow) g.fillText(text, w / 2, h / 2 + 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createInteriors({ scene, controllerManager, cameraSystem, lightingSystem = null, cast = null, voices = null }) {
  const cm = controllerManager;
  const { x0, x1, z0, z1, y: Y, h: H } = ROOM;
  const ref = { missionSystem: null, wanted: null, empire: null };
  let inside = false; // the player is in the room (or is being moved into it)

  // ---- the furniture: one list, used for the mesh, the colliders and the darkening under it ----------------------
  const solids = []; // { x0, x1, z0, z1, h }
  const solid = (ax, az, bx, bz, hh) => { solids.push({ x0: ax, z0: az, x1: bx, z1: bz, h: hh }); return solids[solids.length - 1]; };
  // the bar counter, the back bar, tables, stools, the booth, the jukebox
  const BAR = solid(-204.15, 133.2, -203.0, 141.0, 1.1);
  solid(-201.25, 132.5, x1, 140.6, 1.0); // the back-bar cabinet under the bottles
  const STOOLS = [134.4, 135.9, 137.4, 138.9].map((z) => [-204.88, z]);
  for (const [x, z] of STOOLS) solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0.8);
  const TABLES = [[-210.6, 133.0], [-207.4, 133.8]];
  for (const [x, z] of TABLES) { solid(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 1.2); }
  const TSTOOLS = [[-211.65, 133.0], [-209.55, 133.0], [-207.4, 132.6 + 2.0], [-206.4, 133.8]];
  for (const [x, z] of TSTOOLS) solid(x - 0.23, z - 0.23, x + 0.23, z + 0.23, 0.8);
  solid(-212.4, 140.15, -208.4, z1, 1.3); // the booth bench against the south wall
  solid(-212.0, 138.9, -208.8, 139.75, 1.2); // its table
  solid(-212.2, 137.85, -211.6, 138.45, 0.9); solid(-209.2, 137.85, -208.6, 138.45, 0.9); // the chairs across from it
  solid(-206.7, 140.85, -205.3, z1, 2.0); // the jukebox
  solid(-203.4, 131.5, -202.1, 131.9, 2.2); // (the office door's frame, so nobody stands in it)

  // ---- lamps (baked) ------------------------------------------------------------------------------------------------
  const WARM = [1.0, 0.66, 0.34];
  const lights = [
    { x: -204.9, y: Y + 2.2, z: 134.6, c: WARM, i: 1.45, r: 3.8 },
    { x: -204.9, y: Y + 2.2, z: 136.5, c: WARM, i: 1.45, r: 3.8 },
    { x: -204.9, y: Y + 2.2, z: 138.4, c: WARM, i: 1.45, r: 3.8 },
    { x: -210.4, y: Y + 1.7, z: 139.3, c: [0.7, 0.95, 0.5], i: 1.5, r: 3.2 }, // the booth lamp
    { x: -201.4, y: Y + 1.9, z: 136.5, c: [1.0, 0.6, 0.25], i: 1.2, r: 4.5 }, // the back bar
    { x: -206.0, y: Y + 1.2, z: 140.2, c: [0.9, 0.35, 0.8], i: 0.9, r: 3.0 }, // the jukebox
    { x: -201.0, y: Y + 2.6, z: 136.5, c: [1.0, 0.35, 0.45], i: 0.8, r: 3.8 }, // the neon
    { x: -213.8, y: Y + 1.7, z: 136.5, c: [0.45, 0.6, 1.0], i: 0.65, r: 3.2 }, // the street door
    { x: -208.5, y: Y + 2.9, z: 133.5, c: WARM, i: 0.7, r: 5.0 },
    { x: -208.5, y: Y + 2.9, z: 139.0, c: WARM, i: 0.55, r: 5.0 }
  ];
  const B = makeBuilder(lights, [0.42, 0.31, 0.24], solids);

  // ---- the shell ----------------------------------------------------------------------------------------------------
  const T = 0.3;
  const WOOD = C(0x6b4426), DARK = C(0x2a1a10), PLANK = [C(0x5b3a20), C(0x4f321b), C(0x63401f), C(0x47301c)];
  // floor: planks running east-west, 0.2 m wide, cut into 0.5 m cells so each one takes the lamp light
  B.box([x0, Y - 0.3, z0], [x1, Y, z1], (x, y, z) => {
    const row = Math.floor((z - z0) / 0.2), seg = Math.floor((x - x0 + hash(row, 1) * 2.4) / 2.2);
    const p = PLANK[Math.floor(hash(row, seg) * 4)], v = 0.86 + hash(row + 7, seg) * 0.28;
    const gap = (z - z0) % 0.2 < 0.012 ? 0.55 : 1;
    return [p[0] * v * gap, p[1] * v * gap, p[2] * v * gap];
  }, { step: 0.2, faces: '+y' });
  // (the floor planks get 0.2 m cells in z but that is 50 x 70 cells: fine for one mesh)
  // ceiling: dark pressed tin with three beams
  B.box([x0, Y + H, z0], [x1, Y + H + T, z1], C(0x3a2a20), { faces: '-y', step: 1 });
  for (const bx of [-211, -207, -203]) B.box([bx - 0.12, Y + H - 0.28, z0], [bx + 0.12, Y + H, z1], DARK, { step: 1, faces: '-y+x-x' });
  // walls: dark green panelling to 1.1 m, a timber rail, then deep red paper (the west wall's door is below)
  const PAN = C(0x1f3a2e), PAPER = C(0x7a2d28), RAIL = C(0x8a5a2e), BASE = C(0x1c120c);
  const paper = (x, y, z) => { const v = 0.9 + hash(Math.floor(x * 2), Math.floor(z * 2)) * 0.2; return [PAPER[0] * v, PAPER[1] * v, PAPER[2] * v]; };
  // each wall in three bands: panelling, a rail, paper (the inner face only)
  for (const [[ax, az, bx, bz], face] of [[[x0 - T, z0 - T, x0, z1 + T], '+x'], [[x1, z0 - T, x1 + T, z1 + T], '-x'], [[x0, z0 - T, x1, z0], '+z'], [[x0, z1, x1, z1 + T], '-z']]) {
    B.box([ax, Y, az], [bx, Y + 1.05, bz], PAN, { step: 0.4, faces: face });
    B.box([ax, Y + 1.05, az], [bx, Y + 1.2, bz], RAIL, { step: 1, faces: face });
    B.box([ax, Y + 1.2, az], [bx, Y + H, bz], paper, { step: 0.4, faces: face });
  }
  // skirting
  B.box([x0, Y, z0], [x1, Y + 0.16, z0 + 0.05], BASE, { faces: '+z', step: 1 });
  B.box([x0, Y, z1 - 0.05], [x1, Y + 0.16, z1], BASE, { faces: '-z', step: 1 });
  B.box([x0, Y, z0], [x0 + 0.05, Y + 0.16, z1], BASE, { faces: '+x', step: 1 });
  B.box([x1 - 0.05, Y, z0], [x1, Y + 0.16, z1], BASE, { faces: '-x', step: 1 });

  // ---- the street door (west wall) and the exit sign -----------------------------------------------------------------
  const zc = DOOR_IN.z;
  B.box([x0, Y, zc - 0.62], [x0 + 0.1, Y + 2.35, zc - 0.5], C(0x1b110a), { faces: '+x+z-z+y', step: 1 }); // frame
  B.box([x0, Y, zc + 0.5], [x0 + 0.1, Y + 2.35, zc + 0.62], C(0x1b110a), { faces: '+x+z-z+y', step: 1 });
  B.box([x0, Y + 2.2, zc - 0.62], [x0 + 0.1, Y + 2.35, zc + 0.62], C(0x1b110a), { faces: '+x-y', step: 1 });
  B.box([x0 + 0.02, Y, zc - 0.5], [x0 + 0.06, Y + 2.2, zc + 0.5], C(0x4a2c18), { faces: '+x', step: 0.35 }); // the leaf
  B.box([x0 + 0.06, Y + 1.15, zc - 0.34], [x0 + 0.075, Y + 2.05, zc + 0.34], [0.35, 0.5, 0.75], { faces: '+x', emit: true, step: 1 }); // glass, the street's blue
  B.box([x0 + 0.06, Y + 1.0, zc + 0.36], [x0 + 0.12, Y + 1.04, zc + 0.46], C(0xd2a24a), { step: 1 }); // a brass handle
  B.box([x0 + 0.06, Y + 2.42, zc - 0.28], [x0 + 0.1, Y + 2.62, zc + 0.28], [0.1, 0.85, 0.3], { faces: '+x', emit: true, step: 1 }); // EXIT

  // ---- the bar --------------------------------------------------------------------------------------------------------
  const BARWOOD = C(0x35200f), TOP = C(0x6e4524), BRASS = C(0xc59a43);
  B.box([-204.15, Y, 133.2], [-203.0, Y + 1.0, 141.0], BARWOOD, { step: 0.4 }); // body
  B.box([-204.4, Y + 1.0, 133.05], [-202.85, Y + 1.1, 141.15], TOP, { step: 0.4 }); // top
  B.box([-204.24, Y + 0.16, 133.4], [-204.1, Y + 0.2, 140.8], BRASS, { step: 1, faces: '-x+y' }); // the foot rail
  for (let z = 133.7; z < 140.9; z += 1.8) B.box([-204.3, Y + 0.12, z - 0.02], [-204.18, Y + 0.24, z + 0.02], BRASS, { step: 1, faces: '-x' });
  for (const z of [135.4, 136.2, 137.0]) { B.box([-203.7, Y + 1.1, z - 0.03], [-203.64, Y + 1.38, z + 0.03], BRASS, { step: 1 }); B.box([-203.76, Y + 1.34, z - 0.03], [-203.52, Y + 1.4, z + 0.03], BRASS, { step: 1 }); } // taps
  for (const [x, z] of STOOLS) { // stools: a seat on a post and a foot ring
    B.cyl(x, z, Y + 0.7, Y + 0.78, 0.23, 0.23, C(0x7a1f1f), { seg: 10 });
    B.cyl(x, z, Y, Y + 0.7, 0.03, 0.03, BRASS, { seg: 6, cap: false });
    B.cyl(x, z, Y + 0.05, Y + 0.09, 0.2, 0.2, BRASS, { seg: 8, cap: false });
  }
  // the back bar: a mirror, three shelves of bottles, a cabinet
  B.box([x1 - 0.06, Y + 1.0, 132.5], [x1, Y + 2.5, 140.6], [0.5, 0.58, 0.56], { faces: '-x', step: 0.5 });
  B.box([x1 - 0.7, Y, 132.5], [x1 - 0.05, Y + 1.0, 140.6], BARWOOD, { step: 0.5 });
  B.box([x1 - 0.75, Y + 1.0, 132.5], [x1 - 0.02, Y + 1.04, 140.6], TOP, { step: 0.5 });
  const BOTTLES = [C(0xb8742a), C(0x2f6b3a), C(0x6fa9a0), C(0x9a1f24), C(0xd8c98a), C(0x3b5a96), C(0xa4642a)];
  for (const sy of [1.45, 1.9, 2.35]) {
    B.box([x1 - 0.34, Y + sy - 0.03, 132.5], [x1 - 0.04, Y + sy, 140.6], WOOD, { step: 1 });
    for (let z = 132.75, n = 0; z < 140.4; z += 0.26, n++) {
      const col = BOTTLES[Math.floor(hash(n, sy * 10) * BOTTLES.length)], tall = 0.2 + hash(n, sy) * 0.1;
      const k = col.map((v) => Math.min(1, v * 1.5 + 0.06)); // glass catches the lamps: a little extra
      B.cyl(x1 - 0.2, z, Y + sy, Y + sy + tall, 0.045, 0.045, k, { seg: 6, emit: true });
      B.cyl(x1 - 0.2, z, Y + sy + tall, Y + sy + tall + 0.1, 0.017, 0.017, k, { seg: 5, emit: true });
    }
  }
  // glasses on the counter
  for (const z of [134.6, 138.2, 139.0]) B.cyl(-203.55, z, Y + 1.1, Y + 1.2, 0.035, 0.045, [0.8, 0.85, 0.85], { seg: 6, emit: true });

  // ---- tables, stools, the booth ----------------------------------------------------------------------------------
  const TABLE = C(0x4a2e18);
  for (const [x, z] of TABLES) {
    B.cyl(x, z, Y + 0.72, Y + 0.78, 0.45, 0.45, TABLE, { seg: 10 });
    B.cyl(x, z, Y, Y + 0.72, 0.05, 0.05, DARK, { seg: 6, cap: false });
    B.cyl(x, z, Y, Y + 0.04, 0.25, 0.25, DARK, { seg: 8 });
    B.cyl(x, z, Y + 0.78, Y + 0.84, 0.03, 0.02, [0.95, 0.75, 0.4], { seg: 5, emit: true }); // a candle
  }
  for (const [x, z] of TSTOOLS) {
    B.cyl(x, z, Y + 0.42, Y + 0.48, 0.21, 0.21, C(0x7a1f1f), { seg: 8 });
    B.cyl(x, z, Y, Y + 0.42, 0.03, 0.03, BRASS, { seg: 5, cap: false });
  }
  const LEATHER = C(0x6a1c1c);
  B.box([-212.4, Y + 0.05, 140.15], [-208.4, Y + 0.46, z1], DARK, { step: 1 }); // the booth: a bench along the wall
  B.box([-212.4, Y + 0.46, 140.15], [-208.4, Y + 0.56, z1 - 0.28], LEATHER, { step: 0.5 });
  B.box([-212.4, Y + 0.56, z1 - 0.28], [-208.4, Y + 1.3, z1], LEATHER, { step: 0.5 });
  B.box([-212.4, Y + 1.3, z1 - 0.3], [-208.4, Y + 1.36, z1], DARK, { step: 1 });
  B.box([-212.0, Y + 0.72, 138.9], [-208.8, Y + 0.78, 139.75], TABLE, { step: 0.4 });
  for (const x of [-211.2, -209.6]) B.box([x - 0.04, Y, 139.2], [x + 0.04, Y + 0.72, 139.45], DARK, { step: 1 });
  for (const x0c of [-212.2, -209.2]) { // two chairs across the table
    B.box([x0c, Y + 0.42, 137.85], [x0c + 0.6, Y + 0.5, 138.45], LEATHER, { step: 0.5 });
    B.box([x0c, Y, 137.85], [x0c + 0.06, Y + 0.42, 137.91], DARK, { step: 1 }); B.box([x0c + 0.54, Y, 137.85], [x0c + 0.6, Y + 0.42, 137.91], DARK, { step: 1 });
    B.box([x0c, Y + 0.5, 137.85], [x0c + 0.6, Y + 1.0, 137.92], LEATHER, { step: 0.5 });
  }
  // lamps hung from the beams: three over the bar, the green one over the booth
  const lamp = (x, z, y, shade, bulb) => {
    B.box([x - 0.008, y, z - 0.008], [x + 0.008, Y + H - 0.28, z + 0.008], DARK, { step: 1, faces: '+x+z' });
    B.cyl(x, z, y, y + 0.22, 0.26, 0.05, shade, { seg: 10, cap: true });
    B.cyl(x, z, y - 0.03, y + 0.02, 0.07, 0.04, bulb, { seg: 6, emit: true });
  };
  for (const z of [134.6, 136.5, 138.4]) lamp(-204.9, z, Y + 2.1, C(0x1a2a22), [1.5, 1.1, 0.6]);
  lamp(-210.4, 139.3, Y + 1.65, C(0x1f5a3a), [1.4, 1.5, 0.8]); // the booth lamp

  // ---- the jukebox, the office door, the phone, pictures -------------------------------------------------------------
  const JB = C(0x4a1a2a);
  B.box([-206.6, Y, 140.9], [-205.4, Y + 1.35, z1], JB, { step: 0.4 });
  B.cyl(-206.0, 141.0, Y + 1.35, Y + 1.35 + 0.01, 0.6, 0.6, JB, { seg: 3, cap: false });
  B.box([-206.5, Y + 1.0, 140.86], [-205.5, Y + 1.5, 140.9], [1.5, 0.75, 0.2], { faces: '-z', emit: true, step: 1 }); // the amber window
  B.box([-206.5, Y + 0.45, 140.86], [-205.5, Y + 0.95, 140.9], [0.15, 0.7, 0.8], { faces: '-z', emit: true, step: 1 });
  B.box([-206.55, Y + 1.5, 140.88], [-205.45, Y + 1.56, 140.92], [1.2, 0.3, 0.7], { faces: '-z', emit: true, step: 1 });
  const DOORC = C(0x3b2415);
  B.box([-203.5, Y, z0 + 0.02], [-202.0, Y + 2.15, z0 + 0.08], DOORC, { faces: '+z', step: 0.4 }); // the back office door
  B.box([-203.6, Y, z0], [-203.5, Y + 2.25, z0 + 0.12], DARK, { faces: '+z+x', step: 1 }); B.box([-202.0, Y, z0], [-201.9, Y + 2.25, z0 + 0.12], DARK, { faces: '+z-x', step: 1 });
  B.box([-203.6, Y + 2.15, z0], [-201.9, Y + 2.25, z0 + 0.12], DARK, { faces: '+z-y', step: 1 });
  B.box([-203.28, Y + 1.3, z0 + 0.08], [-202.22, Y + 1.9, z0 + 0.1], [0.45, 0.55, 0.4], { faces: '+z', emit: true, step: 1 }); // frosted glass
  B.box([-202.25, Y + 1.0, z0 + 0.08], [-202.15, Y + 1.04, z0 + 0.2], BRASS, { step: 1 }); // handle
  B.box([-203.0, Y + 1.98, z0 + 0.08], [-202.5, Y + 2.08, z0 + 0.1], BRASS, { faces: '+z', step: 1 }); // OFFICE plate
  // the office phone on the wall: a black box with a handset and a dial
  B.box([-205.5, Y + 1.25, z0], [-204.95, Y + 1.7, z0 + 0.12], [0.05, 0.05, 0.06], { faces: '+z+x-x+y', step: 1 });
  B.box([-205.58, Y + 1.38, z0 + 0.1], [-205.48, Y + 1.7, z0 + 0.17], [0.03, 0.03, 0.04], { faces: '+z+x-x+y', step: 1 });
  B.cyl(-205.22, z0 + 0.12, Y + 1.43, Y + 1.46, 0.07, 0.07, [0.9, 0.82, 0.55], { seg: 8, cap: false });
  for (const [px, pz, pw, ph, side, art] of [[-208, z0, 1.0, 0.7, 'n', 0x3a5a6a], [-211.3, z0, 0.7, 0.9, 'n', 0x7a5a2a], [-206.0, z0, 0.6, 0.5, 'n', 0x4a6a3a], [x0, 133.2, 0.7, 0.55, 'w', 0x8a3a3a], [x0, 140.0, 0.6, 0.8, 'w', 0x2a4a7a]]) {
    const cx = px, cz = pz, y = Y + 1.55;
    if (side === 'n') { B.box([cx - pw / 2 - 0.05, y - 0.05, cz], [cx + pw / 2 + 0.05, y + ph + 0.05, cz + 0.06], BRASS, { faces: '+z', step: 1 }); B.box([cx - pw / 2, y, cz + 0.06], [cx + pw / 2, y + ph, cz + 0.07], C(art), { faces: '+z', step: 1 }); }
    else { B.box([cx, y - 0.05, cz - pw / 2 - 0.05], [cx + 0.06, y + ph + 0.05, cz + pw / 2 + 0.05], BRASS, { faces: '+x', step: 1 }); B.box([cx + 0.06, y, cz - pw / 2], [cx + 0.07, y + ph, cz + pw / 2], C(art), { faces: '+x', step: 1 }); }
  }

  const roomMat = new THREE.MeshBasicNodeMaterial({ vertexColors: true, fog: false });
  const roomMesh = new THREE.Mesh(B.geometry(), roomMat);
  roomMat.color.setScalar(1.8); // (a gain on the baked light)
  roomMesh.name = 'QuietRoom';
  roomMesh.frustumCulled = false;
  // the neon over the back bar, and the street sign on the outside
  const neonTex = signTexture('QUIET ROOM', { fg: '#ff5a9a', bg: '#000', glow: 18, font: '700 78px "Playfair Display", Georgia, serif', w: 640, h: 160 });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicNodeMaterial({ map: neonTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  neon.position.set(x1 - 0.04, Y + 2.78, 136.5);
  neon.rotation.y = -Math.PI / 2;
  neon.frustumCulled = false;

  // ---- the street door, outside ----------------------------------------------------------------------------------------
  const groundY = cm.getGroundHeight(STAND_OUT.x, STAND_OUT.z, 'person') ?? 0.22;
  const outB = makeBuilder([], [1, 1, 1], [], false); // (the street is lit by the day: plain colours, a glow where lamps are)
  const FX = DOOR_OUT.x, DZ = DOOR_OUT.z, P = 0.16; // the facade, how far the frame stands out
  const GY = groundY;
  const FRAME = C(0x24150c);
  outB.box([FX - P, GY, DZ - 0.95], [FX, GY + 2.6, DZ - 0.78], FRAME, { step: 1 });
  outB.box([FX - P, GY, DZ + 0.78], [FX, GY + 2.6, DZ + 0.95], FRAME, { step: 1 });
  outB.box([FX - P, GY + 2.45, DZ - 0.95], [FX, GY + 2.6, DZ + 0.95], FRAME, { step: 1 });
  outB.box([FX - 0.05, GY, DZ - 0.78], [FX, GY + 2.45, DZ + 0.78], C(0x3a2314), { faces: '-x', step: 1 }); // the door
  outB.box([FX - 0.06, GY + 0.9, DZ - 0.6], [FX - 0.05, GY + 2.3, DZ + 0.6], [1.0, 0.62, 0.28], { faces: '-x', emit: true, step: 1 }); // lit glass
  outB.box([FX - 0.06, GY + 0.95, DZ - 0.02], [FX - 0.055, GY + 2.3, DZ + 0.02], FRAME, { faces: '-x', step: 1 });
  outB.box([FX - 0.1, GY + 1.0, DZ + 0.5], [FX - 0.04, GY + 1.04, DZ + 0.7], [0.85, 0.65, 0.28], { step: 1 }); // handle
  // a striped awning over it, and the lamps either side
  outB.box([FX - 1.0, GY + 2.62, DZ - 1.25], [FX - 0.02, GY + 2.72, DZ + 1.25], C(0x1d3b2c), { step: 1, faces: '-x+y-y' });
  outB.box([FX - 1.0, GY + 2.42, DZ - 1.25], [FX - 0.9, GY + 2.72, DZ + 1.25], C(0x1d3b2c), { step: 1, faces: '-x' });
  for (const s of [-1, 1]) {
    outB.box([FX - 0.12, GY + 1.9, DZ + s * 1.12 - 0.05], [FX, GY + 2.3, DZ + s * 1.12 + 0.05], FRAME, { step: 1 });
    outB.box([FX - 0.22, GY + 2.0, DZ + s * 1.12 - 0.09], [FX - 0.12, GY + 2.22, DZ + s * 1.12 + 0.09], [1.6, 1.15, 0.6], { emit: true, step: 1 });
  }
  const outMesh = new THREE.Mesh(outB.geometry(), new THREE.MeshBasicNodeMaterial({ vertexColors: true, fog: false }));
  outMesh.name = 'QuietRoomDoor';
  const signTex = signTexture('THE QUIET ROOM', { fg: '#e3bf6a', bg: '#14100c', font: '700 70px "Playfair Display", Georgia, serif' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.78), new THREE.MeshBasicNodeMaterial({ map: signTex, fog: false }));
  sign.position.set(FX - 0.108, GY + 3.25, DZ);
  sign.rotation.y = -Math.PI / 2;
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 3.55), new THREE.MeshBasicNodeMaterial({ color: 0x1b140e, fog: false }));
  signBack.position.set(FX - 0.05, GY + 3.25, DZ);
  // the soft marker on the footpath: a warm pool of light that breathes
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  { const g = gc.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,200,120,0.95)'); gr.addColorStop(0.55, 'rgba(255,160,70,0.4)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const glowTex = new THREE.CanvasTexture(gc);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  glow.position.set(FX - 1.3, GY + 0.04, DZ);
  glow.renderOrder = 3;

  const group = new THREE.Group();
  group.name = 'Interiors';
  group.add(roomMesh, neon, outMesh, sign, signBack, glow);
  scene.add(group);
  group.updateMatrixWorld(true);
  for (const o of group.children) { o.matrixAutoUpdate = false; o.updateMatrix(); o.updateMatrixWorld(true); }

  // ---- colliders and ground ---------------------------------------------------------------------------------------------
  const walls = [
    [x0 - 1, z0 - 1, x0, z1 + 1], [x1, z0 - 1, x1 + 1, z1 + 1], [x0, z0 - 1, x1, z0], [x0, z1, x1, z1 + 1]
  ].map(([ax, az, bx, bz]) => ({ minX: ax, minZ: az, maxX: bx, maxZ: bz, minY: Y - 1, maxY: Y + H + 1, room: true }));
  const furniture = solids.map((s) => ({ minX: s.x0, minZ: s.z0, maxX: s.x1, maxZ: s.z1, minY: Y - 0.5, maxY: Y + s.h, room: true }));
  cm.colliders.push(...walls, ...furniture);
  cm._colliderCells = null; // (indexed again on the next collision query)
  (cm.extraGround ||= []).push((x, z) => (inside && x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1 ? Y : null));

  // ---- the UI: the prompt, the fade ----------------------------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
.in-prompt { position: fixed; left: 50%; bottom: 212px; transform: translateX(-50%); z-index: 31; padding: 7px 14px; border-radius: 999px; background: rgba(10,12,16,.78);
  color: #fff; font: 600 14px/1 Inter, system-ui, sans-serif; cursor: pointer; white-space: nowrap; pointer-events: auto; border: 0; }
.in-prompt[hidden] { display: none; }
.in-prompt kbd { display: inline-block; min-width: 18px; margin-right: 6px; padding: 2px 5px; border-radius: 5px; background: #ffd23f; color: #111; font: 800 12px/1.2 Inter, sans-serif; text-align: center; }
.in-fade { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; z-index: 70; }
body.in-room #minimap-card { display: none; }
`;
  document.head.append(style);
  const elPrompt = document.createElement('button');
  elPrompt.type = 'button';
  elPrompt.className = 'in-prompt';
  elPrompt.hidden = true;
  document.body.append(elPrompt);
  const elFade = document.createElement('div');
  elFade.className = 'in-fade';
  document.body.append(elFade);

  // ---- state -------------------------------------------------------------------------------------------------------------------
  let fade = null; // { to: 'in' | 'out', t, moved }
  let promptFor = '';
  const saved = { sun: 0, hemi: 0, sky: 0, ground: 0, env: 0, rain: false };
  const person = () => cm.entities.person;
  const m = () => ref.missionSystem;
  const stepNow = () => m()?.step || null;
  const cinematic = () => document.body.classList.contains('cinematic') || document.body.classList.contains('cutscene');
  const hasStep = () => { const ms = m(); return !!(ms && ms.onJob); };

  // may the player go through the door now? On foot, no cut scene or choice up, no police about; and on a job, only
  // when the step wants them in (or out)
  function mayEnter() {
    const ms = m();
    if (cm.activeMode !== 'person' || cinematic() || ms?.busy || fade) return false;
    if (ref.wanted && ref.wanted.stars > 0) return false;
    if (hasStep()) { const s = stepNow(); return !!(s && (s.enter || s.inside)); }
    return true;
  }
  const mayLeave = () => cm.activeMode === 'person' && !cinematic() && !m()?.busy && !fade;

  function beginFade(to) { fade = { to, t: 0, moved: false }; cm.resetInput(); }

  function applyIndoorLight(on) {
    const L = lightingSystem;
    if (!L) return;
    if (on) {
      if (!saved.on) {
        saved.on = true;
        saved.sun = L.sunLight.intensity; saved.hemi = L.hemiLight.intensity;
        saved.sky = L.hemiLight.color.getHex(); saved.ground = L.hemiLight.groundColor.getHex();
        saved.env = scene.environmentIntensity; saved.rain = !!L.rain?.visible; saved.preset = L.activePresetId;
      }
      L.sunLight.intensity = 0;
      L.hemiLight.color.setHex(0xffe2b8); L.hemiLight.groundColor.setHex(0x9a7a5a); L.hemiLight.intensity = 3.0;
      scene.environmentIntensity = 0.6;
      if (L.rain) L.rain.visible = false;
    } else if (saved.on) {
      saved.on = false;
      if (L.activePresetId !== saved.preset) L.applyPreset(L.activePresetId, true); // (the time of day changed while in here)
      else {
        L.sunLight.intensity = saved.sun; L.hemiLight.intensity = saved.hemi;
        L.hemiLight.color.setHex(saved.sky); L.hemiLight.groundColor.setHex(saved.ground);
        scene.environmentIntensity = saved.env;
        if (L.rain) L.rain.visible = saved.rain;
      }
    }
  }

  function setInside(v, { place = true } = {}) {
    if (v) {
      inside = true;
      document.body.classList.add('in-room');
      if (place) cm.placePerson(ARRIVE.x, Y, ARRIVE.z, ARRIVE.heading);
      ref.wanted?.reset?.();
    } else {
      if (place) {
        inside = false;
        cm.placePerson(STAND_OUT.x, cm.getGroundHeight(STAND_OUT.x, STAND_OUT.z, 'person') ?? 0.22, STAND_OUT.z, STAND_OUT.heading);
      }
      inside = false;
      document.body.classList.remove('in-room');
      applyIndoorLight(false);
      cast?.setActor('qr_ruby', null, null);
    }
    cameraSystem?.resetForTeleport?.();
  }

  function go(to) { // the doors: fade out, move, fade in
    if (fade) return false;
    if (to === 'in' ? !mayEnter() || inside : !inside || !mayLeave()) return false;
    beginFade(to);
    return true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT'))) return;
    const k = doorNear();
    if (!k) return;
    e.stopImmediatePropagation(); // (this F is for the door, not for a car or a passer-by)
    go(k);
  }, true);
  elPrompt.addEventListener('click', (e) => { e.stopPropagation(); const k = doorNear(); if (k) go(k); });

  // which door the player is at (and may use): 'in', 'out', or null
  function doorNear() {
    if (fade) return null;
    const p = person().position;
    if (!inside) return Math.hypot(p.x - STAND_OUT.x, p.z - STAND_OUT.z) < REACH_OUT && p.y < Y - 50 && mayEnter() ? 'in' : null;
    return Math.hypot(p.x - DOOR_IN.x, p.z - DOOR_IN.z) < REACH_IN && mayLeave() ? 'out' : null;
  }

  let clock = 0;
  function update(dt, elapsed) {
    clock += dt;
    const p = person().position;
    // teleported away from in here (the Jobs list, a new spot): nothing of the room is left on
    if (inside && !fade && (p.y < Y - 50 || cm.activeMode !== 'person')) {
      inside = false;
      document.body.classList.remove('in-room');
      applyIndoorLight(false);
      cast?.setActor('qr_ruby', null, null);
    }
    // the fade
    if (fade) {
      fade.t += dt;
      const k = Math.min(1, fade.t / FADE);
      if (!fade.moved) elFade.style.opacity = String(k);
      else elFade.style.opacity = String(1 - Math.min(1, (fade.t - fade.hold) / FADE));
      if (!fade.moved && fade.t >= FADE) {
        fade.moved = true; fade.hold = fade.t + 0.12;
        setInside(fade.to === 'in');
        elFade.style.opacity = '1';
      }
      if (fade.moved && fade.t >= fade.hold + FADE) { fade = null; elFade.style.opacity = '0'; }
    }
    if (inside) {
      if (!fade || fade.moved) applyIndoorLight(true);
      if (ref.wanted && (ref.wanted.stars > 0 || ref.wanted.heat > 0)) ref.wanted.reset();
      if (p.x < x0 + 0.3 || p.x > x1 - 0.3 || p.z < z0 + 0.3 || p.z > z1 - 0.3) { p.x = Math.min(x1 - 0.5, Math.max(x0 + 0.5, p.x)); p.z = Math.min(z1 - 0.5, Math.max(z0 + 0.5, p.z)); }
      // a job that has moved on to a step out in the street: shown out
      const s = stepNow();
      if (!fade && hasStep() && s && !s.inside && !s.enter && !cinematic() && !m().busy) go('out');
      else if (!fade && hasStep() && !s && !m()?.inCut) { /* (between a job's steps) */ }
    }
    // Ruby at the bar when there is a till to hand over
    if (inside && ref.empire && !hasStep() && ref.empire.tillReady) {
      const q = PLACES.QR_RUBY;
      cast?.setActor('qr_ruby', STORY_CAST.Ruby, { x: q.x, y: Y, z: q.z, heading: -Math.PI / 2, ease: 7 }, 'idle');
    } else if (inside) cast?.setActor('qr_ruby', null, null);
    // the prompt
    const k = fade ? null : doorNear();
    const label = k === 'in' ? 'Go in' : k === 'out' ? 'Go out' : '';
    if (label !== promptFor) {
      promptFor = label;
      elPrompt.hidden = !label;
      elPrompt.replaceChildren();
      if (label) { const kb = document.createElement('kbd'); kb.textContent = 'F'; elPrompt.append(kb, document.createTextNode(label)); }
    }
    // the door's pool of light breathes; brighter when it is the way on
    glow.material.opacity = 0.55 + Math.sin(clock * 2.2) * 0.2;
    const want = !inside && (cm.activeMode === 'person') && Math.hypot(p.x - STAND_OUT.x, p.z - STAND_OUT.z) < 120;
    if (glow.visible !== want) glow.visible = want;
    void elapsed;
  }

  // keep the camera inside the room: pulled in along the line to the player until it is
  const _head = new THREE.Vector3();
  function postCamera(camera) {
    if (!inside) return;
    const q = person().position;
    _head.set(q.x, q.y + 1.5, q.z);
    const c = camera.position;
    let t = 1;
    const lim = [[x0 + 0.3, x1 - 0.3], [Y + 0.3, Y + H - 0.2], [z0 + 0.3, z1 - 0.3]];
    const hv = [_head.x, _head.y, _head.z], cv = [c.x, c.y, c.z];
    for (let a = 0; a < 3; a++) {
      const d = cv[a] - hv[a];
      if (cv[a] > lim[a][1] && d > 1e-6) t = Math.min(t, (lim[a][1] - hv[a]) / d);
      else if (cv[a] < lim[a][0] && d < -1e-6) t = Math.min(t, (lim[a][0] - hv[a]) / d);
    }
    if (t < 1) {
      t = Math.max(0.12, t);
      c.set(hv[0] + (cv[0] - hv[0]) * t, hv[1] + (cv[1] - hv[1]) * t, hv[2] + (cv[2] - hv[2]) * t);
      c.x = Math.min(x1 - 0.3, Math.max(x0 + 0.3, c.x)); c.z = Math.min(z1 - 0.3, Math.max(z0 + 0.3, c.z)); c.y = Math.min(Y + H - 0.2, Math.max(Y + 0.3, c.y));
      camera.lookAt(cameraSystem.currentLookAt);
      camera.updateMatrixWorld();
    }
  }

  return {
    update,
    postCamera,
    ROOM,
    attach(o) { Object.assign(ref, o); },
    get inside() { return inside; },
    get fading() { return !!fade; },
    get triangles() { return B.verts; },
    /** Where a saved game puts the player when it is saved in here: the street door */
    get exitSpot() { return { x: STAND_OUT.x, y: groundY, z: STAND_OUT.z, heading: STAND_OUT.heading }; },
    get door() { return { ...STAND_OUT, y: groundY }; },
    /** Through the door now (scripted checks, no fade) */
    enter() { if (!inside) { setInside(true); fade = null; elFade.style.opacity = '0'; } },
    leave() { if (inside) { setInside(false); fade = null; elFade.style.opacity = '0'; } },
    /** F at a door, as the player would */
    use() { const k = doorNear(); return k ? go(k) : false; },
    debug() { return { inside, lit: !!saved.on, fade: fade ? fade.to : null, prompt: promptFor, door: doorNear(), verts: B.verts, colliders: walls.length + furniture.length }; }
  };
}
