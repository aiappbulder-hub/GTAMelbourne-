// Young & Jackson Hotel (1861), Melbourne's famous corner pub on the north-west corner of Flinders and Swanston Streets.
// A 3-storey sandstone hotel with arched windows, a cast-iron verandah, a corner entrance, a parapet with the heritage
// "YOUNG & JACKSON" sign and rooftop billboards. Chloe (Jules Lefebvre, 1875, public domain) hangs in the upstairs bar,
// seen through the lit first-floor window facing Swanston St. Footprint from OSM (`Young and Jackson` in the geodata).
// buildYoungJackson() runs before the city blocks (its collider replaces the generic building on the footprint);
// update() takes the night factor from the lighting system and shows the "say g'day" toast on foot.
import * as THREE from 'three/webgpu';
import { LANDMARK_SITES } from './city-config.js';
import { terrainRange } from './terrain.js';

const SITE = 'Young and Jackson';
const H = 13.5, GF = 4.6, FLOOR = 4.0; // wall height, ground-floor height, upper storeys
const PX = 56; // facade texture pixels per metre

function canvasTex(w, h, draw, aniso = 4) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function arch(g, x, y, w, h) { // arched window opening, (x, y) top-left
  g.beginPath();
  g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath();
}

// A facade texture, `len` metres wide. `lit` draws the window glass only, on black (the emissive map).
// u runs left to right as seen from the street; `cornerAt` is 'left' or 'right' (where the corner door is).
function facadeTex(len, lit, { cornerAt, gap } = {}) {
  const w = Math.round(len * PX), h = Math.round((H + 0.2) * PX);
  return canvasTex(w, h, (g) => {
    const Y = (m) => h - m * PX; // metres above the footpath to canvas y
    if (lit) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); } else {
      g.fillStyle = '#cdb98f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${75 + Math.random() * 50},50,0.05)`; g.fillRect(Math.random() * w, Math.random() * h, 12 + Math.random() * 30, 2 + Math.random() * 5); }
      // rusticated plinth and string courses
      g.fillStyle = '#7d715d'; g.fillRect(0, Y(1.1), w, 1.1 * PX);
      g.fillStyle = '#e1d2ac'; for (const y of [GF, GF + FLOOR]) g.fillRect(0, Y(y + 0.25), w, 0.3 * PX);
      // parapet / cornice
      g.fillStyle = '#e8dbb8'; g.fillRect(0, 0, w, 1.4 * PX);
      g.fillStyle = '#b9a67c'; g.fillRect(0, 1.4 * PX, w, 0.18 * PX);
      g.fillStyle = '#d6c69c';
      for (let x = 0.3 * PX; x < w; x += 0.9 * PX) g.fillRect(x, 1.58 * PX, 0.4 * PX, 0.4 * PX);
    }
    const bay = 4.0, n = Math.max(1, Math.round(len / bay)), bw = len / n;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * bw * PX;
      const u0 = (i * bw), u1 = u0 + bw;
      const door = (cornerAt === 'left' && i === 0) || (cornerAt === 'right' && i === n - 1);
      // ground floor: arched openings with leadlight transoms; the corner bay is the doorway
      const gw = (bw - 1.3) * PX, gx = cx - gw / 2;
      arch(g, gx, Y(GF - 0.25), gw, (GF - 1.2) * PX);
      if (lit) g.fillStyle = door ? '#ffcf86' : '#ffb85e'; else g.fillStyle = door ? '#2b1a10' : '#3a2616';
      g.fill();
      if (!lit) { g.strokeStyle = '#6e5f45'; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#2a1b10'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, Y(GF - 0.4)); g.lineTo(cx, Y(1.2)); g.stroke(); }
      // upper floors: arched windows
      for (let f = 1; f <= 2; f++) {
        const yb = GF + (f - 1) * FLOOR + 0.5, wh = FLOOR - 1.1, ww = 1.35 * PX;
        if (f === 1 && gap && u1 > gap[0] && u0 < gap[1] && Math.abs((u0 + u1) / 2 - (gap[0] + gap[1]) / 2) < bw) continue; // Chloe's bay
        arch(g, cx - ww / 2, Y(yb + wh), ww, wh * PX);
        if (lit) { g.fillStyle = (i * 7 + f * 3) % 5 === 0 ? '#3a2a18' : '#ffc272'; g.fill(); } else {
          g.fillStyle = '#42331f'; g.fill();
          g.strokeStyle = '#efe3c2'; g.lineWidth = 7; g.stroke();
          g.strokeStyle = '#2a2014'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, Y(yb + wh)); g.lineTo(cx, Y(yb)); g.moveTo(cx - ww / 2, Y(yb + wh * 0.45)); g.lineTo(cx + ww / 2, Y(yb + wh * 0.45)); g.stroke();
        }
      }
    }
  });
}

function signTex(w, h, draw) { return canvasTex(w, h, (g) => draw(g, w, h), 8); }
function parapetSign(lit) { // heritage lettering along the parapet band
  return signTex(1024, 128, (g, w, h) => {
    g.fillStyle = lit ? '#000' : '#1f2a24'; g.fillRect(0, 0, w, h);
    if (!lit) { g.strokeStyle = '#d9b45a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); }
    g.font = '700 82px "Playfair Display", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = lit ? '#ffd88a' : '#e9c46a'; g.fillText('YOUNG & JACKSON', w / 2, h / 2 + 4);
  });
}
function billboard(lit, text, sub) {
  return signTex(768, 256, (g, w, h) => {
    g.fillStyle = lit ? '#000' : '#7a1b1b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = lit ? '#ff9a5a' : '#f1e1b0'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = lit ? '#ffcf8a' : '#f6ecc9'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 96px "Playfair Display", Georgia, serif'; g.fillText(text, w / 2, h * 0.4);
    g.font = '600 40px Georgia, serif'; g.fillText(sub, w / 2, h * 0.76);
  });
}

// "Chloe" (Jules Lefebvre, 1875): a stylised portrait-format impression, soft warm tones on a dark ground, in a gilt frame.
function chloeTex() {
  return canvasTex(384, 576, (g, w, h) => {
    g.fillStyle = '#b8892b'; g.fillRect(0, 0, w, h);                       // gilt frame
    g.fillStyle = '#e6c25a'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#8a6118'; g.fillRect(26, 26, w - 52, h - 52);
    const x0 = 38, y0 = 38, cw = w - 76, ch = h - 76;
    g.save(); g.beginPath(); g.rect(x0, y0, cw, ch); g.clip();
    const bg = g.createLinearGradient(0, y0, 0, y0 + ch);                    // dark, warm background
    bg.addColorStop(0, '#1c120c'); bg.addColorStop(1, '#2d1c12');
    g.fillStyle = bg; g.fillRect(x0, y0, cw, ch);
    const glow = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, 230);
    glow.addColorStop(0, 'rgba(150,100,60,0.55)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(x0, y0, cw, ch);
    // standing figure as soft blurred shapes: hair, head, a long warm silhouette, a pale drape at the hip
    g.filter = 'blur(5px)';
    g.fillStyle = '#3b2314'; g.beginPath(); g.ellipse(w / 2, 150, 40, 48, 0, 0, 7); g.fill();     // hair
    g.fillStyle = '#e3b48d'; g.beginPath(); g.ellipse(w / 2 + 2, 160, 28, 36, 0, 0, 7); g.fill(); // face
    g.fillStyle = '#d9a37a'; g.beginPath(); g.moveTo(w / 2 - 48, 215); g.quadraticCurveTo(w / 2, 200, w / 2 + 48, 215);
    g.quadraticCurveTo(w / 2 + 38, 330, w / 2 + 52, 420); g.lineTo(w / 2 - 50, 420); g.quadraticCurveTo(w / 2 - 36, 330, w / 2 - 48, 215); g.fill(); // body
    g.fillStyle = '#c98f66'; g.beginPath(); g.ellipse(w / 2 - 44, 300, 14, 70, 0.1, 0, 7); g.fill(); g.beginPath(); g.ellipse(w / 2 + 48, 300, 13, 68, -0.1, 0, 7); g.fill();
    g.fillStyle = '#e9dfcf'; g.beginPath(); g.moveTo(w / 2 - 62, 360); g.quadraticCurveTo(w / 2, 330, w / 2 + 64, 370);
    g.lineTo(w / 2 + 70, 470); g.lineTo(w / 2 - 70, 470); g.fill();                                // drapery
    g.fillStyle = '#b87f5a'; g.beginPath(); g.ellipse(w / 2 - 14, 470, 14, 50, 0, 0, 7); g.ellipse(w / 2 + 16, 470, 14, 50, 0, 0, 7); g.fill();
    g.filter = 'none';
    const vg = g.createLinearGradient(0, y0 + ch * 0.8, 0, y0 + ch);       // dark floor/foot of the canvas
    vg.addColorStop(0, 'rgba(15,8,4,0)'); vg.addColorStop(1, 'rgba(15,8,4,0.9)');
    g.fillStyle = vg; g.fillRect(x0, y0, cw, ch);
    g.restore();
  });
}
function plaqueTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#b08a35'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6e5316'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#2b1f08'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 22px Georgia, serif';
    g.fillText('CHLOÉ, Jules Lefebvre, 1875', w / 2, h / 2);
  });
}
// The upstairs bar seen through the window: dark panelling, back-bar shelves of bottles, warm pendant glow
function barTex(lit) {
  return canvasTex(512, 384, (g, w, h) => {
    const wall = g.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, lit ? '#d89a52' : '#4b2c1a'); wall.addColorStop(1, lit ? '#a2622d' : '#2e1a10');
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    g.fillStyle = lit ? '#7c4a22' : '#241309'; g.fillRect(0, h * 0.72, w, h * 0.28);                         // bar counter
    g.fillStyle = lit ? '#d9a860' : '#5a3a20'; g.fillRect(0, h * 0.72, w, 8);
    for (let i = 0; i < 18; i++) {                                                                            // bottles
      g.fillStyle = ['#3d6b3a', '#8a4b1c', '#b8842a', '#5a2a1e'][i % 4]; g.fillRect(14 + i * 28, h * 0.58, 10, 40); g.fillRect(17 + i * 28, h * 0.54, 4, 10);
    }
    for (const x of [90, 420]) { g.fillStyle = lit ? '#fff0c0' : '#8a7a50'; g.beginPath(); g.arc(x, 36, 16, 0, 7); g.fill(); }  // pendants
  });
}
function glazingTex() { // mullions and a faint sky reflection over the window
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(180,205,230,0.10)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.45, 0); g.lineTo(0, h * 0.5); g.fill();
    g.strokeStyle = '#efe3c2'; g.lineWidth = 8; g.strokeRect(2, 2, w - 4, h - 4);
    g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h * 0.2); g.lineTo(w, h * 0.2); g.stroke();
  });
}
function ironTex() { // cast-iron lace frieze under the verandah roof
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#16231d'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c120f';
    for (let x = 8; x < w; x += 32) { g.beginPath(); g.arc(x + 8, h / 2, 10, 0, 7); g.fill(); g.fillRect(x + 20, 8, 4, h - 16); }
  });
}

export function buildYoungJackson(scene) {
  const s = LANDMARK_SITES[SITE];
  if (!s || !s.ring) return { colliders: [], update() {} };
  // the footprint's bounds; the east face (Swanston St) and south face (Flinders St) meet at the corner (x1, z1)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < s.ring.length; i += 2) { x0 = Math.min(x0, s.ring[i]); x1 = Math.max(x1, s.ring[i]); z0 = Math.min(z0, s.ring[i + 1]); z1 = Math.max(z1, s.ring[i + 1]); }
  const { lo, hi } = terrainRange({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  const y0 = Math.max(lo, hi - 0.3);
  const lenE = z1 - z0, lenS = x1 - x0;
  const root = new THREE.Group();
  root.name = 'YoungJackson';
  root.position.y = y0;
  scene.add(root);
  const glows = []; // [material, day, night] emissive intensities
  const std = (o, day = 0.0, night = 1.0) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, ...o });
    if (o.emissiveMap || o.emissive) glows.push([m, day, night]);
    return m;
  };
  const mesh = (geo, mat, x, y, z, ry = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; root.add(m); return m;
  };

  // body
  const wallMat = std({ color: 0xcbb68c });
  mesh(new THREE.BoxGeometry(lenS, H, lenE), wallMat, (x0 + x1) / 2, H / 2, (z0 + z1) / 2);
  // roof lid and a slim parapet fascia on the plain sides
  mesh(new THREE.BoxGeometry(lenS + 0.3, 0.3, lenE + 0.3), std({ color: 0x55504a }), (x0 + x1) / 2, H + 0.05, (z0 + z1) / 2);

  // Chloe's window on the east (Swanston St) face: first floor, 5.5 m north of the corner
  const chloeZ = z1 - 7.6, wy = GF + 0.55, ww = 3.6, wh = 3.0;
  const gapU = [z1 - chloeZ - 2.0, z1 - chloeZ + 2.0];
  const faces = [
    // east face: plane normal +x, its u runs towards -z, so u=0 is the south (corner) end
    { len: lenE, x: x1 + 0.02, z: (z0 + z1) / 2, ry: Math.PI / 2, corner: 'left', gap: gapU },
    // south face: normal +z, u runs towards +x, corner at the right
    { len: lenS, x: (x0 + x1) / 2, z: z1 + 0.02, ry: 0, corner: 'right' }
  ];
  for (const f of faces) {
    const geo = new THREE.PlaneGeometry(f.len, H + 0.2);
    const m = std({ map: facadeTex(f.len, false, { cornerAt: f.corner, gap: f.gap }), emissiveMap: facadeTex(f.len, true, { cornerAt: f.corner, gap: f.gap }), emissive: 0xffffff, emissiveIntensity: 0 }, 0.12, 1.0);
    mesh(geo, m, f.x, (H + 0.2) / 2 - 0.1, f.z, f.ry, false);
    // heritage lettering across the parapet
    const sw = Math.min(f.len - 1, 13), sh = sw / 8;
    const sm = std({ map: parapetSign(false), emissiveMap: parapetSign(true), emissive: 0xffffff, emissiveIntensity: 0 }, 0.15, 1.3);
    const off = f.ry ? { x: 0.06, z: 0 } : { x: 0, z: 0.06 };
    mesh(new THREE.PlaneGeometry(sw, sh), sm, f.x + off.x, H - 0.1 - 0.2, f.z + off.z, f.ry, false).position.y = H - 0.5;
    // verandah: slim roof over the footpath with a lace frieze and posts
    const vd = 2.6, vroofY = GF + 0.15;
    const along = f.len;
    const vgeo = new THREE.BoxGeometry(f.ry ? vd : along, 0.18, f.ry ? along : vd);
    const vx = f.ry ? x1 + vd / 2 : f.x, vz = f.ry ? f.z : z1 + vd / 2;
    mesh(vgeo, std({ color: 0x1d3a2e, roughness: 0.6 }), vx, vroofY, vz);
    const frieze = new THREE.Mesh(new THREE.PlaneGeometry(along, 0.5), std({ map: ironTex(), side: THREE.DoubleSide }));
    frieze.position.set(f.ry ? x1 + vd : f.x, vroofY - 0.35, f.ry ? f.z : z1 + vd); frieze.rotation.y = f.ry; root.add(frieze);
    const postGeo = new THREE.CylinderGeometry(0.05, 0.06, vroofY, 6), postMat = std({ color: 0x14231c });
    const count = Math.floor(along / 3.5);
    const posts = new THREE.InstancedMesh(postGeo, postMat, count + 1);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i <= count; i++) {
      const t = -along / 2 + 0.6 + (along - 1.2) * (i / count);
      mtx.setPosition(f.ry ? x1 + vd - 0.1 : f.x + t, vroofY / 2, f.ry ? f.z + t : z1 + vd - 0.1); posts.setMatrixAt(i, mtx);
    }
    posts.frustumCulled = false; root.add(posts);
  }

  // Chloe's window: the lit upstairs bar, with the painting inside the glass
  const nx = x1 + 0.05;
  mesh(new THREE.PlaneGeometry(ww, wh), std({ map: barTex(false), emissiveMap: barTex(true), emissive: 0xffffff, emissiveIntensity: 0 }, 0.35, 1.2), nx, wy + wh / 2, chloeZ, Math.PI / 2, false);
  const pw = 1.05, ph = pw * 1.5;
  mesh(new THREE.PlaneGeometry(pw, ph), std({ map: chloeTex(), emissiveMap: chloeTex(), emissive: 0xffffff, emissiveIntensity: 0 }, 0.3, 0.85), nx + 0.02, wy + wh / 2 + 0.12, chloeZ - 0.2, Math.PI / 2, false);
  mesh(new THREE.PlaneGeometry(0.5, 0.125), std({ map: plaqueTex(), emissiveMap: plaqueTex(), emissive: 0xffffff, emissiveIntensity: 0 }, 0.2, 0.7), nx + 0.025, wy + 0.42, chloeZ - 0.2, Math.PI / 2, false);
  const glaze = new THREE.MeshBasicNodeMaterial({ map: glazingTex(), transparent: true, depthWrite: false });
  mesh(new THREE.PlaneGeometry(ww, wh), glaze, nx + 0.04, wy + wh / 2, chloeZ, Math.PI / 2, false);
  // "CHLOE'S BAR" small gilt sign beneath the window
  const barSign = signTex(512, 96, (g, w, h) => { g.fillStyle = '#1d1712'; g.fillRect(0, 0, w, h); g.fillStyle = '#e6c25a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 56px Georgia, serif'; g.fillText("CHLOÉ'S BAR", w / 2, h / 2); });
  mesh(new THREE.PlaneGeometry(2.6, 0.5), std({ map: barSign, emissiveMap: barSign, emissive: 0xffffff, emissiveIntensity: 0 }, 0.2, 0.9), nx + 0.03, wy - 0.3, chloeZ, Math.PI / 2, false);

  // rooftop billboards on steel frames, facing Swanston St and Flinders St
  const bb = [
    { x: x1 - 1.0, z: z0 + 5, ry: Math.PI / 2, w: 7, text: 'COLD BEER', sub: 'Hotel · Bistro · Chloé’s Bar' },
    { x: x0 + 8, z: z1 - 0.8, ry: 0, w: 8, text: 'YOUNG & JACKSON', sub: 'Est. 1861 · Flinders St' }
  ];
  const frameMat = std({ color: 0x3a3d40, metalness: 0.5 });
  for (const b of bb) {
    const bh = b.w / 3;
    const bm = std({ map: billboard(false, b.text, b.sub), emissiveMap: billboard(true, b.text, b.sub), emissive: 0xffffff, emissiveIntensity: 0 }, 0.1, 1.2);
    const px = b.ry ? 0.1 : 0, pz = b.ry ? 0 : 0.1;
    mesh(new THREE.PlaneGeometry(b.w, bh), bm, b.x + px, H + 1.6 + bh / 2, b.z + pz, b.ry, false);
    const back = mesh(new THREE.BoxGeometry(b.ry ? 0.15 : b.w, bh + 0.2, b.ry ? b.w : 0.15), frameMat, b.x, H + 1.6 + bh / 2, b.z);
    back.material = frameMat;
    for (const t of [-0.35, 0.35]) mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), frameMat, b.x + (b.ry ? 0 : t * b.w), H + 0.8, b.z + (b.ry ? t * b.w : 0));
  }

  // corner turret-like canopy marker over the entrance
  mesh(new THREE.BoxGeometry(2.6, 0.35, 2.6), std({ color: 0x1d3a2e }), x1 + 0.9, GF + 0.35, z1 + 0.9, Math.PI / 4);

  // a few outdoor drinkers at tables on the Flinders St footpath
  const tableMat = std({ color: 0x2b2b2b, metalness: 0.6 });
  const tables = [[x1 - 8, z1 + 3.4], [x1 - 14, z1 + 3.4], [x1 - 20, z1 + 3.4]];
  const shirts = [0x3d5a80, 0xb5503c, 0x6b8f71, 0xd9b44a, 0x8a5a9a, 0xe0e0e0];
  let pi = 0;
  for (const [tx, tz] of tables) {
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), tableMat, tx, 1.0, tz);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), tableMat, tx, 0.5, tz);
    for (const a of [0.6, 3.7]) {
      const px = tx + Math.cos(a) * 0.75, pz = tz + Math.sin(a) * 0.75;
      mesh(new THREE.CapsuleGeometry(0.2, 0.45, 3, 8), std({ color: shirts[pi++ % shirts.length] }), px, 0.8, pz);
      mesh(new THREE.SphereGeometry(0.14, 8, 6), std({ color: 0xd8a98a }), px, 1.38, pz);
    }
  }

  // ---------- update ----------
  let toastEl = null, toastTimer = 0, armed = true;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  function toast() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;top:110px;left:50%;transform:translateX(-50%);z-index:36;padding:8px 18px;border-radius:999px;background:rgba(8,10,16,.8);color:#f4e7c0;font:600 14px Georgia,serif;pointer-events:none;opacity:0;transition:opacity .4s';
      document.body.append(toastEl);
    }
    toastEl.textContent = "Young & Jackson. Say g'day to Chloé upstairs.";
    toastEl.style.opacity = '1'; toastTimer = 5;
  }
  let lastNight = -1;
  function update(dt, { night = 0, onFoot = false, pos = null } = {}) {
    if (Math.abs(night - lastNight) > 0.01) {
      lastNight = night;
      for (const [m, day, nt] of glows) m.emissiveIntensity = day + (nt - day) * Math.min(1, night * 1.6);
    }
    if (toastTimer > 0 && (toastTimer -= dt) <= 0 && toastEl) toastEl.style.opacity = '0';
    if (!pos) return;
    const d = Math.hypot(pos.x - cx, pos.z - cz) - 8; // roughly from the facade
    if (onFoot && d < 25 && armed) { armed = false; toast(); } else if (d > 60) armed = true;
  }
  const collider = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: lo - 3, groundY: lo - 3, maxY: y0 + H + 1, landmark: 'youngjackson' };
  console.info('[young-jackson] placed at', cx.toFixed(1), cz.toFixed(1));
  return { colliders: [collider], update, group: root };
}
