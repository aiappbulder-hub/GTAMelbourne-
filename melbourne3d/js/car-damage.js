// Car damage: the hood springs up and rips off, and doors swing open on a broken latch and fly off on side hits.
// Panel states, thresholds and the wind / door-swing dynamics are adapted from Red Clay Chase's loose panels (js/game.js,
// "loose panels"), MIT, Copyright (c) 2026 noclipepe, https://github.com/noclipepe/red-clay-chase (see melbourne3d/CREDITS.md).
//
// Our car bodies are one merged mesh, so the panels are OVERLAYS: thin slabs in the car's paint colour, parented to the
// car's body root, built the first time a car is damaged. When a panel opens, a dark "well" slab hides the real panel
// under it. Debris tumbles with simple physics, rests, then shrinks away. Cost: six small meshes on a damaged car only.
//  - subjects: the player's car (any model), and the police pursuit cars. Traffic cars the player hits shed a panel as debris.
//  - reset: when the player's car body changes (switching car, respawn) the old car's damage is cleared.
import * as THREE from 'three/webgpu';

const OPEN = 3, OFF_DOOR = 14, OFF_HOOD = 11, WIND = 5; // m/s of impact soaked up; seconds of full-speed wind
const MAX_DEBRIS = 14, REST_LIFE = 5, FADE = 1.2;
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createCarDamage({ scene, controllerManager, getPlayerBody, getPursuers, getGround }) {
  const subjects = new Map(); // body root -> subject
  const debris = []; // { mesh, piece, v, w, rest, t, fade }
  const wellMat = new THREE.MeshStandardNodeMaterial({ color: 0x16181b, roughness: 0.8, metalness: 0.2 });
  const paintMats = new Map();
  const q1 = new THREE.Quaternion(), ax = new THREE.Vector3(), tmp = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let playerRoot = null;

  function paintOf(root) {
    let col = 0xb9bec4;
    let best = 0;
    root.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color || !o.geometry) return;
      if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
      const s = o.geometry.boundingBox.getSize(tmp);
      const vol = s.x * s.y * s.z;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const score = (m.name === 'Body' ? 1e6 : 0) + vol;
      if (score > best && m.color) { best = score; col = m.color.getHex(); }
    });
    if (!paintMats.has(col)) paintMats.set(col, new THREE.MeshStandardNodeMaterial({ color: col, roughness: 0.4, metalness: 0.5 }));
    return paintMats.get(col);
  }
  // the body's size in its own frame (skipping wheels)
  function measure(root) {
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), box = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || /wheel|tyre|tire|lightbar/i.test(o.name) || o.userData.dmgOverlay) return;
      if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
      m.multiplyMatrices(inv, o.matrixWorld);
      b.copy(o.geometry.boundingBox).applyMatrix4(m);
      box.union(b);
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.9, 0, -2.3), new THREE.Vector3(0.9, 1.4, 2.3));
    return box;
  }
  // the top surface of the body at local (x, z), by a ray straight down (null: nothing there)
  function topAt(root, x, z, hi) {
    tmp.set(x, hi, z); root.localToWorld(tmp);
    ray.set(tmp, new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(root, true).filter((h) => !h.object.userData.dmgOverlay);
    if (!hits.length) return null;
    return root.worldToLocal(hits[0].point.clone()).y;
  }
  function sideAt(root, sx, y, z, reach) {
    tmp.set(sx * reach, y, z); root.localToWorld(tmp);
    const dir = new THREE.Vector3(-sx, 0, 0).transformDirection(root.matrixWorld);
    ray.set(tmp, dir);
    const hits = ray.intersectObject(root, true).filter((h) => !h.object.userData.dmgOverlay);
    if (!hits.length) return null;
    return Math.abs(root.worldToLocal(hits[0].point.clone()).x);
  }

  function build(root) {
    const box = measure(root), size = box.getSize(new THREE.Vector3());
    const L = size.z, W = size.x, H = size.y, zMax = box.max.z, zMin = box.min.z, hi = box.max.y + 2;
    const paint = paintOf(root);
    const overlay = new THREE.Group();
    overlay.name = 'DamageOverlay';
    root.add(overlay);
    const mk = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.userData.dmgOverlay = true; m.castShadow = false; return m; };
    const pieces = [];
    // hood: hinged at the windscreen end, lying along the bonnet
    {
      const z0 = zMax - 0.36 * L, z1 = zMax - 0.05 * L, len = z1 - z0, w = Math.min(W * 0.76, 1.5);
      const y0 = (topAt(root, 0, z0, hi) ?? box.min.y + H * 0.62) + 0.012, y1 = (topAt(root, 0, z1, hi) ?? y0 - 0.15) + 0.012;
      const hinge = new THREE.Group(), mesh = mk(w, 0.04, len, paint), well = mk(w, 0.02, len, wellMat);
      hinge.position.set(0, y0, z0);
      const rest = Math.atan2(y0 - y1, len);
      mesh.position.set(0, 0, len / 2); hinge.add(mesh);
      well.position.set(0, 0, 0); well.visible = false;
      well.rotation.x = rest; well.position.set(0, y0 + 0.012, z0 + len / 2); // (stays on the car: lies under the lifted hood)
      hinge.rotation.x = rest;
      overlay.add(hinge, well);
      pieces.push({ name: 'hood', sx: 0, hinge, mesh, well, rest, len, w, dmg: 0, wind: 0, cool: 0, last: 0, st: 0, a: 0, av: 0, t: 0, clk: 0 });
    }
    // doors: hinged at the front edge, one each side
    for (const sx of [1, -1]) {
      const zf = zMin + 0.62 * L, len = 0.27 * L, yb = box.min.y + 0.3 * H, yt = box.min.y + 0.62 * H, h = yt - yb;
      const xs = (sideAt(root, sx, (yb + yt) / 2, zf - len / 2, W) ?? W / 2 - 0.03) + 0.012;
      const hinge = new THREE.Group(), mesh = mk(0.04, h, len, paint), well = mk(0.02, h, len, wellMat);
      hinge.position.set(sx * xs, (yb + yt) / 2, zf);
      mesh.position.set(0, 0, -len / 2); hinge.add(mesh);
      well.position.set(sx * (xs + 0.002), (yb + yt) / 2, zf - len / 2); well.visible = false;
      overlay.add(hinge, well);
      pieces.push({ name: sx > 0 ? 'doorL' : 'doorR', sx, hinge, mesh, well, rest: 0, len, w: h, dmg: 0, wind: 0, cool: 0, last: 0, st: 0, a: 0, av: 0, t: 0, clk: 0 });
    }
    // the hinge groups only show once the panel is "open": until then the real body is the panel
    for (const p of pieces) p.hinge.visible = false;
    return { root, overlay, pieces, box, L, W, H, tN: Math.random() * 10, lastSpeed: 0, lastHeading: null, latAcc: 0, acc: 0 };
  }

  function reset(s) {
    for (const p of s.pieces) {
      for (let i = debris.length - 1; i >= 0; i--) if (debris[i].piece === p) { scene.remove(debris[i].mesh); debris.splice(i, 1); }
      p.hinge.add(p.mesh);
      p.mesh.position.set(0, 0, p.sx === 0 ? p.len / 2 : -p.len / 2);
      p.mesh.quaternion.identity(); p.mesh.scale.set(1, 1, 1);
      p.hinge.rotation.set(0, 0, 0);
      if (p.sx === 0) p.hinge.rotation.x = p.rest;
      p.hinge.visible = false; p.well.visible = false;
      p.dmg = p.wind = p.cool = p.last = 0; p.st = 0; p.a = p.av = p.t = 0; p.clk = 0;
    }
  }
  function subjectFor(root) {
    if (!root) return null;
    let s = subjects.get(root);
    if (!s) { s = build(root); subjects.set(root, s); }
    return s;
  }

  function detach(s, p, boom, vx, vz) {
    const mesh = p.mesh;
    scene.attach(mesh); // (keeps where it is in the world)
    mesh.castShadow = false;
    const h = s.root.rotation.y, lx = Math.cos(h), lz = -Math.sin(h), k = boom ? 1.7 : 1;
    const v = new THREE.Vector3(), w = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 7));
    if (p.sx) { v.set(vx * 0.84 + lx * p.sx * rand(2.5, 5) * k, rand(2, 4.5) * k, vz * 0.84 + lz * p.sx * rand(2.5, 5) * k); w.y -= p.sx * 4; }
    else { v.set(vx * 0.5 + lx * rand(-1.2, 1.2), rand(6, 8.5) * k, vz * 0.5 + lz * rand(-1.2, 1.2)); w.x -= 7; }
    p.st = 2; p.t = 0;
    p.well.visible = true; // (the body stays open where the panel was)
    debris.push({ mesh, piece: p, v, w, rest: false, t: 0, fade: 0 });
    while (debris.length > MAX_DEBRIS) { const d = debris.shift(); scene.remove(d.mesh); d.piece.st = 3; }
  }

  /** The car took a knock of dv m/s: where is 'front', 'L' or 'R' (L is the car's +x side) */
  function hit(s, where, dv) {
    const p = s.pieces.find((q) => q.name === (where === 'front' ? 'hood' : where === 'L' ? 'doorL' : 'doorR'));
    if (!p || p.st >= 2 || dv < 1.5) return false;
    dv = Math.min(dv, 8); // one crash counts once, however long the car stays pressed on it
    if (p.cool > 0) { if (dv > p.last) { p.dmg += dv - p.last; p.last = dv; } } else { p.dmg += dv; p.last = dv; p.cool = 0.6; }
    return true;
  }
  // which panel a hit at world (x, z) lands on for a car at pos with heading h
  function whereOf(s, x, z, pos, h) {
    const dx = x - pos.x, dz = z - pos.z;
    const l = dx * Math.cos(h) - dz * Math.sin(h), f = dx * Math.sin(h) + dz * Math.cos(h);
    if (f > s.L * 0.22 && Math.abs(l) < s.W * 0.55) return 'front';
    if (Math.abs(f) < s.L * 0.34 && Math.abs(l) > s.W * 0.2) return l > 0 ? 'L' : 'R';
    return null;
  }

  function stepSubject(s, dt, speed, heading, vx, vz, dead) {
    s.tN += dt;
    if (s.lastHeading !== null) {
      const dh = Math.atan2(Math.sin(heading - s.lastHeading), Math.cos(heading - s.lastHeading)) / Math.max(dt, 1e-3);
      s.latAcc += (-dh * speed - s.latAcc) * Math.min(1, dt * 6);
      s.acc += ((speed - s.lastSpeed) / Math.max(dt, 1e-3) - s.acc) * Math.min(1, dt * 6);
    }
    s.lastHeading = heading; s.lastSpeed = speed;
    const sp = Math.abs(speed);
    for (const p of s.pieces) {
      p.cool -= dt;
      if (p.st === 0) {
        if (p.dmg >= OPEN || dead) { p.st = 1; p.t = 0; p.a = 0.06; p.av = p.sx ? 5 : 4.5; p.hinge.visible = true; p.well.visible = true; }
      } else if (p.st === 1) {
        p.t += dt; p.clk -= dt;
        const nz = Math.sin(s.tN * 9.1 + p.sx * 2) + Math.sin(s.tN * 14.7 + 1.3 + p.sx) + Math.sin(s.tN * 23.3 + p.sx * 4);
        if (p.sx) {
          p.av += ((0.8 - p.a) * 14 - p.av * 1.6 - p.sx * s.latAcc * Math.cos(p.a) * 0.9 - s.acc * Math.sin(p.a) * 0.55 + nz * (2.5 + sp * 0.22)) * dt;
          p.a += p.av * dt;
          if (p.a < 0.03) { p.a = 0.03; p.av = Math.abs(p.av) * 0.45; }
          if (p.a > 1.25) { p.a = 1.25; p.av = -Math.abs(p.av) * 0.4; }
          p.hinge.rotation.set(0, -p.sx * p.a, 0);
        } else {
          const at = 0.1 + 1.02 * smooth(3, 17, sp);
          p.wind += smooth(19, 29, sp) * dt;
          p.av += ((at - p.a) * 70 - p.av * 10 + nz * (0.5 + sp * 0.07) * (1 + 2.5 * p.wind / WIND)) * dt;
          p.a += p.av * dt;
          if (p.a < 0.05) { p.a = 0.05; p.av = Math.abs(p.av) * 0.3; }
          if (p.a > 1.16) { p.a = 1.16; p.av = -Math.abs(p.av) * 0.3; }
          p.hinge.rotation.set(p.rest - p.a, 0, 0);
        }
        s.root.updateMatrixWorld(true);
        if (dead || (p.sx ? p.dmg >= OFF_DOOR && p.t > 1.2 : (p.dmg >= OFF_HOOD && p.t > 0.8) || p.wind >= WIND)) detach(s, p, dead, vx, vz);
      }
    }
  }

  function stepDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i], m = d.mesh;
      d.t += dt;
      d.v.y -= 15 * dt;
      const dr = Math.exp(-dt * 0.7); d.v.x *= dr; d.v.z *= dr;
      m.position.addScaledVector(d.v, dt);
      const wl = d.w.length();
      if (wl > 1e-3) { q1.setFromAxisAngle(ax.copy(d.w).multiplyScalar(1 / wl), wl * dt); m.quaternion.premultiply(q1).normalize(); }
      const gy = getGround(m.position.x, m.position.z) + (d.rest ? 0.05 : 0.25);
      if (m.position.y < gy) {
        m.position.y = gy;
        if (d.v.y < -2) d.v.y *= -0.32; else d.v.y = 0;
        const fr = Math.exp(-dt * 6); d.v.x *= fr; d.v.z *= fr; d.w.multiplyScalar(Math.exp(-dt * 5));
        if (d.v.x * d.v.x + d.v.z * d.v.z < 2 && wl < 2.5) d.rest = true;
      }
      if (d.rest) { d.restT = (d.restT || 0) + dt; d.w.set(0, 0, 0); d.v.x = d.v.z = 0; }
      if ((d.restT || 0) > REST_LIFE || d.t > REST_LIFE + 6) { // fade: shrink away, then despawn
        d.fade += dt;
        const k = Math.max(0, 1 - d.fade / FADE);
        m.scale.setScalar(k);
        if (k <= 0) { scene.remove(m); if (d.piece) d.piece.st = 3; debris.splice(i, 1); }
      }
    }
  }

  /** A loose panel off a traffic car the player hit (no overlay: the traffic is instanced, the panel just flies) */
  const trafficMat = new THREE.MeshStandardNodeMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 });
  function trafficPanel(v, ev) {
    if (ev.speed < 7 || (v._dmgT || 0) > performance.now() - 4000) return;
    v._dmgT = performance.now();
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.0), v.paint ? new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(v.paint[0], v.paint[1], v.paint[2]), roughness: 0.5, metalness: 0.4 }) : trafficMat);
    m.position.set(ev.x, 0.8, ev.z);
    m.rotation.y = v.yaw || 0;
    scene.add(m);
    debris.push({ mesh: m, piece: null, v: new THREE.Vector3(-ev.nx * ev.speed * 0.5 + rand(-2, 2), rand(4, 7), -ev.nz * ev.speed * 0.5 + rand(-2, 2)), w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), rest: false, t: 0, fade: 0 });
    while (debris.length > MAX_DEBRIS) { const d = debris.shift(); scene.remove(d.mesh); if (d.piece) d.piece.st = 3; }
  }

  /** The collision listener (chained after the audio's): damage from a crash */
  function onImpact(ev) {
    const car = controllerManager.entities.car;
    const playerDriving = controllerManager.activeMode === 'car';
    const dv = ev.speed;
    if (!(dv > 1.5)) return;
    const other = ev.a === car ? ev.b : ev.b === car ? ev.a : null;
    if (other && playerDriving && playerRoot) {
      const s = subjectFor(playerRoot);
      if (s) { const w = whereOf(s, ev.x, ev.z, car.position, car.heading); if (w) hit(s, w, dv); }
    }
    if (ev.a === car && ev.b) {
      const b = ev.b;
      if (b.kind === 'police') { // (every pursuit unit shares one key: the one nearest the hit)
        let best = null, bd = 7;
        for (const p of getPursuers()) { if (!p.root) continue; const d = Math.hypot(p.position.x - ev.x, p.position.z - ev.z); if (d < bd) { bd = d; best = p; } }
        if (best) { const s = subjectFor(best.root); if (s) { const w = whereOf(s, ev.x, ev.z, best.position, best.heading); if (w) hit(s, w, dv * 0.9); } }
      } else if (b.bodyType) trafficPanel(b, ev);
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    // the player's car: the body root being drawn (switching car clears the old one's damage)
    const root = controllerManager.activeMode === 'car' ? getPlayerBody() : null;
    if (root !== playerRoot) {
      if (playerRoot) { const old = subjects.get(playerRoot); if (old) reset(old); }
      playerRoot = root;
    }
    const car = controllerManager.entities.car;
    if (playerRoot) {
      const s = subjectFor(playerRoot);
      if (s) stepSubject(s, dt, car.speed || 0, car.heading, car.vx || 0, car.vz || 0, false);
    }
    for (const p of getPursuers()) {
      const r = p.root;
      if (!r) continue;
      const s = subjects.get(r);
      if (s) { stepSubject(s, dt, p.speed, p.heading, Math.sin(p.heading) * p.speed, Math.cos(p.heading) * p.speed, false); if (!p.active) reset(s); }
    }
    stepDebris(dt);
  }

  return {
    update, onImpact,
    /** Clear the player's car damage (respawn) */
    resetPlayer() { if (playerRoot) { const s = subjects.get(playerRoot); if (s) reset(s); } },
    /** Scripted: damage the player's car at 'front' | 'L' | 'R' by dv m/s */
    hitPlayer(where, dv) { const s = subjectFor(playerRoot); return s ? hit(s, where, dv) : false; },
    /** Scripted: damage the nearest pursuit car */
    hitPursuer(i, where, dv) { const p = getPursuers()[i]; const s = p?.root ? subjectFor(p.root) : null; return s ? hit(s, where, dv) : false; },
    debug() {
      const out = [];
      for (const [root, s] of subjects) out.push({ car: root.name || '?', parts: s.pieces.map((p) => `${p.name}:${['intact', 'open', 'off', 'gone'][p.st]}${p.st === 1 ? '@' + p.a.toFixed(2) : ''} dmg=${p.dmg.toFixed(1)}`) });
      return { subjects: out, debris: debris.length };
    }
  };
}
