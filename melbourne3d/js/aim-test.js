// Debug: the aim accuracy test, run as `__city.gameplay.aimTest()` (or `?aimtest` in the URL, logged to the console).
//
// Next to the player (on foot, pistol) it sets up the cases below, one at a time:
// - stationary hostiles at 5 m and at 15 m
// - one walking across the line of fire
// - one partly behind a parked car
// - one fully behind a building
// - a target under the crosshair with a nearer decoy just off it (aim assist must not steal the shot)
// - a click from the hip, made without aiming first
// It aims the real camera at each target with the real input path (a held right button, mouse movement and a left
// click: the same handlers a player uses). For every shot it logs:
// - what took the hit
// - the impact point's distance from the crosshair ray
// - whether the intended target was hit
// Hostiles hold their fire during the test.
import * as THREE from 'three/webgpu';

const SENS = 0.0042; // radians per pixel, as gameplay.js AIM_SENS
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function runAimTest(ctx, opts = {}) {
  const { cm, cameraSystem, trafficSystem, combat, canvas, api, hooks } = ctx;
  const person = cm.entities.person;
  const shotsPer = opts.shots ?? 6;
  const only = opts.only || null;
  const frames = (n = 1) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const groundAt = (x, z) => cm.getGroundHeight(x, z, 'person') ?? 0;
  // the synthetic input: pointer and mouse events on the canvas (they bubble to the window's listeners)
  let mx = 320, my = 180, fx = 0, fy = 0;
  const ev = (type, init = {}) => canvas.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, {
    bubbles: true, cancelable: true, composed: true, clientX: mx, clientY: my, pointerType: 'mouse', pointerId: 1, isPrimary: true, ...init }));
  const moveMouse = (dx, dy) => {
    fx += dx; fy += dy;
    const ix = Math.round(fx), iy = Math.round(fy);
    fx -= ix; fy -= iy;
    mx += ix; my += iy;
    ev('mousemove', { buttons: 2 });
  };
  const aimDown = () => { ev('pointerdown', { button: 2, buttons: 2 }); ev('mousedown', { button: 2, buttons: 2 }); ev('mousemove', { buttons: 2 }); };
  const aimUp = () => { ev('pointerup', { button: 2, buttons: 0 }); ev('mouseup', { button: 2, buttons: 0 }); };
  const click = () => { ev('mousedown', { button: 0, buttons: 3 }); ev('mouseup', { button: 0, buttons: 2 }); };

  // the crosshair ray, from the camera as drawn
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  const crossRay = () => {
    const cam = cameraSystem.camera;
    cam.updateMatrixWorld();
    const n = hooks.crossNDC();
    const o = cam.getWorldPosition(_o).clone();
    const d = _d.set(n.x, n.y, 0.5).unproject(cam).sub(o).normalize().clone();
    return { o, d };
  };
  const perp = (r, p) => {
    const v = new THREE.Vector3(p.x - r.o.x, p.y - r.o.y, p.z - r.o.z);
    const s = v.dot(r.d);
    return { dist: v.addScaledVector(r.d, -s).length(), along: s };
  };
  // turn the camera (by mouse movement) until the crosshair ray passes through T (a function: moving targets)
  async function aimAt(T, maxIter = 12) {
    let err = Infinity;
    for (let i = 0; i < maxIter; i++) {
      const p = T();
      const r = crossRay();
      const wy = Math.atan2(p.x - r.o.x, p.z - r.o.z), wp = Math.atan2(p.y - r.o.y, Math.hypot(p.x - r.o.x, p.z - r.o.z));
      const cy = Math.atan2(r.d.x, r.d.z), cp = Math.asin(Math.max(-1, Math.min(1, r.d.y)));
      const dyaw = wrap(wy - cy), dp = wp - cp;
      err = perp(r, p).dist;
      if (i > 1 && Math.abs(dyaw) < 0.0025 && Math.abs(dp) < 0.0025) break;
      moveMouse(-dyaw / SENS, -dp / SENS);
      await frames(3);
    }
    return err;
  }

  // a free spot for a person (r m round) on the ground (no wall standing there)
  const free = (x, z, r = 0.5) => cm.nearColliders(x, z, r + 1).every((c) => !(x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r && (c.minY ?? 0) - (c.groundY ?? 0) < 2.5));
  // A building with a clear lane on one side: the player stands 9 m out from one face, the hidden hostile 2.5 m past
  // the far face, and the lane out from the player (away from the building) is open for 20 m
  function findSite() {
    const P0 = person.position;
    const cs = cm.colliders.filter((c) => !c.polygon && c.maxY !== undefined && c.maxY - (c.minY ?? 0) > 6 && (c.minY ?? 0) - (c.groundY ?? 0) < 1 &&
      c.maxX - c.minX > 4 && c.maxX - c.minX < 30 && c.maxZ - c.minZ > 4 && c.maxZ - c.minZ < 30 && Math.hypot((c.minX + c.maxX) / 2 - P0.x, (c.minZ + c.maxZ) / 2 - P0.z) < 400)
      .sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - P0.x, (a.minZ + a.maxZ) / 2 - P0.z) - Math.hypot((b.minX + b.maxX) / 2 - P0.x, (b.minZ + b.maxZ) / 2 - P0.z));
    for (const c of cs) {
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2, hx = (c.maxX - c.minX) / 2, hz = (c.maxZ - c.minZ) / 2;
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const half = nx ? hx : hz, across = nx ? hz : hx;
        if (across < 2.5) continue;
        const P = { x: cx + nx * (half + 9), z: cz + nz * (half + 9) }, E = { x: cx - nx * (half + 2.5), z: cz - nz * (half + 2.5) };
        if (!free(P.x, P.z, 0.8) || !free(E.x, E.z, 0.8)) continue;
        const gy = groundAt(P.x, P.z);
        if (Math.abs(groundAt(E.x, E.z) - gy) > 1.5) continue;
        const t = { x: -nz, z: nx };
        let ok = true;
        for (let s = 1; s <= 20 && ok; s += 0.5) {
          for (const o of [-5, -2.5, 0, 2.5, 5]) {
            const x = P.x + nx * s + t.x * o, z = P.z + nz * s + t.z * o;
            if (!free(x, z, 0.4) || Math.abs(groundAt(x, z) - gy) > 0.6) { ok = false; break; }
          }
        }
        if (ok) return { P, E, n: { x: nx, z: nz }, t, c };
      }
    }
    return null;
  }

  const site = opts.site || findSite();
  if (!site) return { error: 'no site found near the player' };
  const { P, E, n, t } = site;
  const at = (fwd, side = 0) => ({ x: P.x + n.x * fwd + t.x * side, z: P.z + n.z * fwd + t.z * side });
  if (cm.activeMode !== 'person') return { error: 'not on foot' };
  api.selectSlot(0);
  hooks.calm = true;
  const hp0 = api.health;
  api.health = 1e6;
  combat.clear();
  const place = (p, heading) => {
    person.position.set(p.x, groundAt(p.x, p.z), p.z);
    person.heading = heading;
    if (person.velocity) person.velocity.set?.(0, 0, 0);
    person.speed = 0;
  };
  const spawn = async (p, face) => {
    const g = combat.spawn({ x: p.x, z: p.z, weapon: 'pistol', hp: 1e6, heading: face });
    for (let i = 0; i < 300 && !g.visible; i++) await frames(1);
    return g;
  };
  const waitReady = async () => {
    for (let i = 0; i < 600; i++) {
      const s = api.state;
      if (s.cooldown <= 0 && s.reloading <= 0 && s.ammo > 0) return;
      if (s.ammo <= 0 && s.reloading <= 0) click(); // empty: the next pull starts the reload
      await frames(1);
    }
  };
  const results = [];
  // one aimed shot at point T() of target g (null: none intended); `expect` is what should take it
  async function shoot(name, T, g, expect, all) {
    await waitReady();
    const aimErr = await aimAt(T);
    const before = all.map((o) => o.hp);
    const r = crossRay();
    const tp = T();
    click();
    const s = api.state.lastShot;
    const hits = all.map((o, i) => Math.round((before[i] - o.hp) / 34));
    const imp = s ? { x: s.x, y: s.y, z: s.z } : null;
    const e = imp ? perp(r, imp) : null;
    const rec = {
      case: name, expect, kind: s?.kind ?? null, hitTarget: g ? hits[all.indexOf(g)] : 0, otherHits: hits.reduce((a, b) => a + b, 0) - (g ? hits[all.indexOf(g)] : 0),
      aimErrCm: Math.round(aimErr * 100), impactOffRayCm: e ? Math.round(e.dist * 100) : null, impactDepth: e ? +e.along.toFixed(2) : null,
      targetDepth: +perp(r, tp).along.toFixed(2)
    };
    rec.pass = expect === 'target' ? rec.hitTarget === 1 && rec.otherHits === 0 : rec.kind === expect && rec.hitTarget === 0;
    results.push(rec);
    await frames(2);
    return rec;
  }
  const want = (k) => !only || only.includes(k);
  const chest = (g, dy = 1.2, side = 0) => () => ({ x: g.x + t.x * side, y: g.y + dy, z: g.z + t.z * side });

  // aim held for the run (the right button)
  const awayYaw = Math.atan2(n.x, n.z);
  place(P, awayYaw);
  cameraSystem.personYaw = awayYaw;
  cameraSystem.orbitYawOffset = 0;
  await frames(5);
  aimDown();
  await frames(10);

  if (want('stat5')) {
    const g = await spawn(at(5), awayYaw + Math.PI);
    for (let k = 0; k < shotsPer; k++) await shoot('stationary 5 m', chest(g), g, 'target', [g]);
    combat.clear();
  }
  if (want('stat15')) {
    const g = await spawn(at(15), awayYaw + Math.PI);
    for (let k = 0; k < shotsPer; k++) await shoot('stationary 15 m', chest(g), g, 'target', [g]);
    if (!opts.keep) combat.clear();
  }
  if (want('moving')) {
    const g = await spawn(at(11, -4), awayYaw + Math.PI);
    let dir = 1;
    hooks.pre = (dt) => {
      const o = (g.x - P.x) * t.x + (g.z - P.z) * t.z;
      if (o > 4) dir = -1; else if (o < -4) dir = 1;
      g.x += t.x * 1.5 * dir * dt; g.z += t.z * 1.5 * dir * dt;
    };
    for (let k = 0; k < shotsPer + 2; k++) await shoot('moving 11 m, 1.5 m/s across', chest(g), g, 'target', [g]);
    hooks.pre = null;
    combat.clear();
  }
  if (want('car')) {
    // a parked car broadside 8 m out; the hostile 10 m out, his body half past the car's end, as seen from the player
    const v = trafficSystem.cars.filter((c) => !c.driven && !c.isPolice && !c.bus).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (v) {
      const cp = at(8);
      Object.assign(v, { edge: null, conn: null, parked: true, speed: 0, acc: 0, x: cp.x, z: cp.z, prevX: cp.x, prevZ: cp.z, yaw: Math.atan2(t.x, t.z), y: groundAt(cp.x, cp.z) });
      const hl = v.halfL ?? 2.2;
      const g = await spawn(at(10, hl * 10 / 8), awayYaw + Math.PI);
      await frames(5);
      const all = [g];
      for (let k = 0; k < Math.ceil(shotsPer / 2); k++) await shoot('behind car: exposed half', chest(g, 1.1, 0.18), g, 'target', all);
      for (let k = 0; k < Math.ceil(shotsPer / 2); k++) await shoot('behind car: covered half', chest(g, 1.0, -0.32), g, 'car', all);
      combat.clear();
    } else results.push({ case: 'behind car', error: 'no car' });
  }
  if (want('assist')) {
    // the crosshair on a hostile at 14 m; a decoy at 6 m about 4.5 degrees off it, on either side
    for (const side of [-1, 1]) {
      const a = await spawn(at(14), awayYaw + Math.PI);
      const b = await spawn(at(6, side * 6 * Math.tan(0.08)), awayYaw + Math.PI);
      for (let k = 0; k < Math.ceil(shotsPer / 2); k++) await shoot(`decoy ${side < 0 ? 'left' : 'right'} 6 m, target 14 m`, chest(a), a, 'target', [a, b]);
      combat.clear();
    }
  }
  if (want('wall')) {
    const inYaw = awayYaw + Math.PI;
    aimUp();
    await frames(5);
    place(P, inYaw);
    cameraSystem.personYaw = inYaw;
    await frames(8);
    aimDown();
    await frames(10);
    const g = await spawn(E, awayYaw);
    for (let k = 0; k < Math.ceil(shotsPer / 2); k++) await shoot('fully behind building', chest(g), g, 'wall', [g]);
    combat.clear();
    aimUp();
    await frames(5);
    place(P, awayYaw);
    cameraSystem.personYaw = awayYaw;
    await frames(8);
    aimDown();
    await frames(10);
  }
  if (want('hip')) {
    // no aim held: the chase camera behind, a hostile 10 m ahead; one click (down, then up 90 ms later)
    aimUp();
    const g = await spawn(at(10), awayYaw + Math.PI);
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 400 && api.state.aimHeld; i++) await frames(1); // (the sticky aim runs out)
      place(P, awayYaw);
      cameraSystem.personYaw = awayYaw;
      cameraSystem.orbitYawOffset = 0;
      await frames(15);
      await waitReady();
      const before = g.hp;
      ev('pointerdown', { button: 0, buttons: 1 });
      await wait(90);
      ev('pointerup', { button: 0, buttons: 0 });
      const s = api.state.lastShot;
      const hit = Math.round((before - g.hp) / 34);
      results.push({ case: 'click from the hip, 10 m', expect: 'target', kind: s?.kind ?? null, hitTarget: hit, otherHits: 0, pass: hit === 1,
        impactOffTargetCm: s ? Math.round(Math.hypot(s.x - g.x, s.y - (g.y + 1.2), s.z - g.z) * 100) : null });
      await frames(3);
    }
    combat.clear();
    aimDown();
  }
  if (!opts.keep) {
    aimUp();
    combat.clear();
  }
  hooks.calm = !!opts.keep;
  // per case: hits, passes, impact-off-crosshair-ray mean/max
  const summary = {};
  for (const r of results) {
    const s = summary[r.case] || (summary[r.case] = { shots: 0, pass: 0, expect: r.expect, kinds: {}, errs: [] });
    s.shots++;
    if (r.pass) s.pass++;
    s.kinds[r.kind] = (s.kinds[r.kind] || 0) + 1;
    if (r.impactOffRayCm != null) s.errs.push(r.impactOffRayCm);
  }
  for (const s of Object.values(summary)) {
    s.meanOffRayCm = s.errs.length ? Math.round(s.errs.reduce((a, b) => a + b, 0) / s.errs.length) : null;
    s.maxOffRayCm = s.errs.length ? Math.max(...s.errs) : null;
    delete s.errs;
  }
  const playerHurt = api.health < 1e6;
  api.health = Math.max(hp0, 1);
  return { site: { P, E, n, t }, playerHurt, summary, results };
}
