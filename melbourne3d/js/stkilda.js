// St Kilda: the "Short Black" café on Acland Street, where Kaz and her fence Mick talk the player through a job over
// coffee, and St Kilda Pier (its real outline from OSM), out to the kiosk at its end, where the job sends you.
//
//  - The café: three round tables under parasols on the footpath of Acland Street's café strip (found on the street's
//    real centreline, on the kerb side the footpath is), with chairs, cups and an A-frame board.
//  - Before the job, Kaz and Mick sit at the front table chatting. In the cut scene the player sits with them; the
//    camera opens wide on the street, then cuts between them over the listener's shoulder as each one talks (seated
//    animations: talking with a shrug, listening, thinking, looking round).
//  - The pier: a timber deck on piles with railings, walkable (controllerManager.extraGround), and the kiosk.
import * as THREE from 'three/webgpu';
import { ROADS, blockAt } from './city-config.js';

// St Kilda Pier's centreline, shore to the end, from OSM way 1032397305 (world metres)
const PIER = [[-1458, 5246], [-1802, 5192], [-1828, 5187], [-1848, 5181], [-1866, 5170], [-1877, 5158]];
const PIER_DECK_Y = 1.1;
const PIER_HALF = 3.2;
export const PIER_END = { x: -1872, z: 5160 };
// near the café strip of Acland Street, between Carlisle and Barkly Streets
const ACLAND_NEAR = { x: -985, z: 5470 };

export function createStKilda({ scene, cast, controllerManager }) {
  const group = new THREE.Group();
  group.name = 'StKilda';
  scene.add(group);

  // --- The pier -----------------------------------------------------------------------------------------------------
  const timber = new THREE.MeshStandardNodeMaterial({ color: 0x8a6a4a, roughness: 0.9 });
  const pile = new THREE.MeshStandardNodeMaterial({ color: 0x4a3a2c, roughness: 0.95 });
  const rail = new THREE.MeshStandardNodeMaterial({ color: 0xd8d4c8, roughness: 0.6 });
  const segs = [];
  for (let i = 0; i + 1 < PIER.length; i++) {
    const [ax, az] = PIER[i], [bx, bz] = PIER[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    segs.push({ ax, az, ux, uz, L });
    const yaw = Math.atan2(ux, uz);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(PIER_HALF * 2, 0.3, L + 0.6), timber);
    deck.position.set((ax + bx) / 2, PIER_DECK_Y - 0.15, (az + bz) / 2);
    deck.rotation.y = yaw;
    deck.receiveShadow = true;
    group.add(deck);
    for (const side of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, L + 0.4), rail);
      r.position.set((ax + bx) / 2 + uz * side * (PIER_HALF - 0.1), PIER_DECK_Y + 1.0, (az + bz) / 2 - ux * side * (PIER_HALF - 0.1));
      r.rotation.y = yaw;
      group.add(r);
      for (let t = 0; t <= L; t += 4) {
        const px = ax + ux * t + uz * side * (PIER_HALF - 0.1), pz = az + uz * t - ux * side * (PIER_HALF - 0.1);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), rail);
        post.position.set(px, PIER_DECK_Y + 0.5, pz);
        group.add(post);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4.4, 8), pile);
        p.position.set(px, PIER_DECK_Y - 2.4, pz);
        group.add(p);
      }
    }
  }
  // the kiosk at the end: a little pavilion with a red roof
  {
    const [ex, ez] = PIER[PIER.length - 1];
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 12), timber);
    base.position.set(ex - 3, PIER_DECK_Y - 0.15, ez - 2);
    group.add(base);
    const hut = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), new THREE.MeshStandardNodeMaterial({ color: 0xf1ead8, roughness: 0.8 }));
    hut.position.set(ex - 5, PIER_DECK_Y + 1.5, ez - 3);
    hut.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 1.8, 4), new THREE.MeshStandardNodeMaterial({ color: 0xa8322a, roughness: 0.7 }));
    roof.position.set(ex - 5, PIER_DECK_Y + 3.9, ez - 3);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(hut, roof);
  }
  // walkable: the deck's height over the water (and over the kiosk's platform)
  const onPier = (x, z) => {
    const [ex, ez] = PIER[PIER.length - 1];
    if (Math.abs(x - (ex - 3)) < 6 && Math.abs(z - (ez - 2)) < 6) return PIER_DECK_Y;
    for (const s of segs) {
      const t = (x - s.ax) * s.ux + (z - s.az) * s.uz;
      if (t < -0.3 || t > s.L + 0.3) continue;
      if (Math.abs((x - s.ax) * s.uz - (z - s.az) * s.ux) < PIER_HALF) return PIER_DECK_Y;
    }
    return null;
  };
  if (controllerManager) (controllerManager.extraGround ||= []).push(onPier);

  // --- The café on Acland Street --------------------------------------------------------------------------------------
  // the nearest stretch of Acland Street's centreline, and the footpath beside it (the first ground a kerb island
  // starts at, going out from the road, on whichever side it's nearer)
  let cafe = null;
  function findCafe() {
    let best = null;
    for (const r of ROADS) {
      if (r.raw !== 'ACLAND STREET') continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
        const t = Math.max(0, Math.min(L, (ACLAND_NEAR.x - a.x) * ux + (ACLAND_NEAR.z - a.z) * uz));
        const px = a.x + ux * t, pz = a.z + uz * t, d = Math.hypot(px - ACLAND_NEAR.x, pz - ACLAND_NEAR.z);
        if (!best || d < best.d) best = { d, px, pz, ux, uz };
      }
    }
    if (!best) best = { px: ACLAND_NEAR.x, pz: ACLAND_NEAR.z, ux: 0.3, uz: 0.95 };
    const { px, pz, ux, uz } = best;
    let side = 1, kerb = 7;
    for (let off = 3; off < 18; off += 0.5) {
      const l = blockAt(px + uz * off, pz - ux * off), r = blockAt(px - uz * off, pz + ux * off);
      if (l) { side = 1; kerb = off; break; }
      if (r) { side = -1; kerb = off; break; }
    }
    // across the street from the road: nx, nz points from the road into the footpath
    const nx = uz * side, nz = -ux * side;
    const at = (along, out) => ({ x: px + ux * along + nx * (kerb + out), z: pz + uz * along + nz * (kerb + out) });
    return { ux, uz, nx, nz, kerb, at, y: 0.22, road: { x: px, z: pz } };
  }

  const props = new THREE.Group();
  props.name = 'ShortBlackCafe';
  group.add(props);
  const seats = []; // the front table's three seats: Kaz, Mick, the player
  let table = null;
  function buildCafe() {
    cafe = findCafe();
    const y = cafe.y;
    const wood = new THREE.MeshStandardNodeMaterial({ color: 0x5b3b25, roughness: 0.7 });
    const metal = new THREE.MeshStandardNodeMaterial({ color: 0x2a2c2f, roughness: 0.4, metalness: 0.7 });
    const china = new THREE.MeshStandardNodeMaterial({ color: 0xf5f3ee, roughness: 0.3 });
    const canvas = [0x1f5b4a, 0xb23a2e, 0x1f5b4a].map((c) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
    const addTable = (cx, cz, k, chairsAt) => {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), wood);
      top.position.set(cx, y + 0.74, cz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), metal);
      leg.position.set(cx, y + 0.37, cz);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.03, 16), metal);
      foot.position.set(cx, y + 0.015, cz);
      props.add(top, leg, foot);
      // the parasol
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.5, 6), metal);
      pole.position.set(cx, y + 1.25, cz);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.45, 8, 1, true), canvas[k % 3]);
      shade.position.set(cx, y + 2.45, cz);
      shade.castShadow = true;
      props.add(pole, shade);
      // chairs facing the table, with a cup and saucer in front of each
      for (const a of chairsAt) {
        const sx = cx + Math.sin(a) * 0.7, sz = cz + Math.cos(a) * 0.7;
        const face = a + Math.PI; // towards the table
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), wood);
        seat.position.set(sx, y + 0.45, sz);
        seat.rotation.y = face;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.04), wood);
        back.position.set(sx - Math.sin(face) * 0.21, y + 0.7, sz - Math.cos(face) * 0.21);
        back.rotation.y = face;
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), metal);
        legs.position.set(sx, y + 0.22, sz);
        props.add(seat, back);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 10), china);
        cup.position.set(cx + Math.sin(a) * 0.24, y + 0.795, cz + Math.cos(a) * 0.24);
        const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 14), china);
        saucer.position.set(cup.position.x, y + 0.765, cup.position.z);
        props.add(cup, saucer);
        if (k === 0) seats.push({ x: sx, y, z: sz, heading: face });
      }
    };
    // the front table (the scene's) and two more along the footpath
    const t0 = cafe.at(0, 1.6);
    const rot = Math.atan2(cafe.ux, cafe.uz);
    table = { x: t0.x, y, z: t0.z };
    addTable(t0.x, t0.z, 0, [rot + Math.PI / 2, rot - Math.PI / 6, rot + Math.PI * 7 / 6].map((a) => a));
    for (const [along, k] of [[3.4, 1], [-3.4, 2]]) {
      const t = cafe.at(along, 1.6);
      addTable(t.x, t.z, k, [rot + Math.PI / 2 + 0.3, rot - Math.PI / 2 + 0.3]);
    }
    // an A-frame board by the kerb
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1d1c'; g.fillRect(0, 0, 256, 384);
    g.strokeStyle = '#d9c9a3'; g.lineWidth = 6; g.strokeRect(12, 12, 232, 360);
    g.fillStyle = '#f2ead6'; g.textAlign = 'center';
    g.font = '700 46px Georgia, serif'; g.fillText('SHORT', 128, 90); g.fillText('BLACK', 128, 142);
    g.font = 'italic 26px Georgia, serif'; g.fillText('espresso bar', 128, 182);
    g.font = '22px Georgia, serif';
    ['flat white  4.5', 'short black  3.8', 'magic  4.8', 'toastie  9.5'].forEach((t, i) => g.fillText(t, 128, 236 + i * 32));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    const bp = cafe.at(-1.6, 0.35);
    board.position.set(bp.x, y + 0.5, bp.z);
    board.rotation.set(-0.18, Math.atan2(-cafe.nx, -cafe.nz), 0, 'YXZ');
    props.add(board);
  }

  // where the job's marker goes: on the footpath by the front table, towards the road
  function marker() {
    if (!cafe) buildCafe();
    const p = cafe.at(1.4, 0.2);
    return { x: p.x, z: p.z };
  }

  // --- The scene ------------------------------------------------------------------------------------------------------
  // seats: 0 Kaz, 1 Mick, 2 the player
  const WHO = { Kaz: 0, Mick: 1, You: 2 };
  let mode = 'off'; // 'off' | 'waiting' (Kaz and Mick chatting) | 'cut' (the player at the table)
  let clock = 0, shotStart = 0, lastLine = -1;
  function seat(name, anim) {
    const s = seats[WHO[name]];
    if (!s) return;
    if (name === 'You') cast?.setPlayerSeat(s, anim);
    else cast?.setSeated(name, s, anim);
  }
  /** Each frame from missions.js: wanted is 'waiting' (the job's next and the player's near), 'cut' or 'off' */
  function update(dt, wanted, line = null) {
    clock += dt;
    if (wanted !== 'off' && !cafe) buildCafe();
    if (wanted === 'off') {
      if (mode !== 'off') { cast?.setSeated('Kaz', null); cast?.setSeated('Mick', null); cast?.setPlayerSeat(null); }
      mode = 'off';
      return;
    }
    mode = wanted;
    if (mode === 'waiting') {
      cast?.setPlayerSeat(null);
      // chatting between themselves: they take turns
      const kazTalks = Math.floor(clock / 5) % 2 === 0;
      seat('Kaz', kazTalks ? 'sit_talk' : 'sit_listen');
      seat('Mick', kazTalks ? (Math.floor(clock / 2.5) % 3 === 0 ? 'sit_look' : 'sit_listen') : 'sit_talk');
      return;
    }
    // the cut scene: the speaker talks, the others listen (Mick thinks over the plan when it's laid out)
    const [who, text] = line || ['Kaz', ''];
    for (const n of ['Kaz', 'Mick', 'You']) {
      if (n === who) seat(n, n === 'Mick' && /locker|Rolex/.test(text) ? 'sit_think' : 'sit_talk');
      else seat(n, n === 'Kaz' && who === 'Mick' ? 'sit_look' : 'sit_listen');
    }
  }
  /** The cut scene's camera for line k spoken by who; t: seconds into the scene */
  const _e = new THREE.Vector3(), _l = new THREE.Vector3();
  function camera(k, who, dt) {
    if (!seats.length) return null;
    if (k !== lastLine) { lastLine = k; shotStart = clock; }
    const tIn = clock - shotStart;
    const head = (s) => _l.set(s.x, s.y + 1.18, s.z);
    if (k === 0 && tIn < 3.2) {
      // opening: wide from across the street, pushing in on the table under its parasol
      const u = Math.min(1, tIn / 3.2);
      const back = 9 - u * 3;
      _e.set(table.x - cafe.nx * back + cafe.ux * 2.5, table.y + 2.4 - u * 0.8, table.z - cafe.nz * back + cafe.uz * 2.5);
      _l.set(table.x, table.y + 1.0, table.z);
      return { eye: _e.clone(), look: _l.clone() };
    }
    // over the shoulder of the one across from the speaker (the player when Kaz or Mick talks; Mick when the player does)
    const sp = seats[WHO[who] ?? 0], ls = seats[who === 'You' ? WHO.Mick : WHO.You];
    const dx = sp.x - ls.x, dz = sp.z - ls.z, d = Math.hypot(dx, dz) || 1, fx = dx / d, fz = dz / d;
    // over the shoulder on the side away from the table's middle, so the parasol's pole stays out of the shot
    const sideA = { x: ls.x - fx * 0.6 + fz * 0.42, z: ls.z - fz * 0.6 - fx * 0.42 };
    const sideB = { x: ls.x - fx * 0.6 - fz * 0.42, z: ls.z - fz * 0.6 + fx * 0.42 };
    const out = Math.hypot(sideA.x - table.x, sideA.z - table.z) > Math.hypot(sideB.x - table.x, sideB.z - table.z) ? sideA : sideB;
    _e.set(out.x, ls.y + 1.3, out.z);
    head(sp);
    // a slow drift in over the line
    _e.lerp(_l, Math.min(0.12, tIn * 0.015));
    return { eye: _e.clone(), look: _l.clone() };
  }
  /** After the scene: the player gets up and stands beside their chair */
  function standUp() {
    const s = seats[WHO.You];
    cast?.setPlayerSeat(null);
    if (!s || controllerManager.activeMode !== 'person') return;
    const p = controllerManager.entities.person;
    p.position.set(s.x - Math.sin(s.heading) * 0.8, s.y, s.z - Math.cos(s.heading) * 0.8);
    p.heading = s.heading + Math.PI;
  }

  return { marker, update, camera, standUp, pierEnd: PIER_END, get table() { return table; } };
}
