// Armed hostiles: the Nomads on a boat in Docklands, a warehouse's guards, an ambush at the dock. A gunman is a person
// (js/people.js draws him with a gun in his hands: setGunman) with a simple readable fight:
//
//   idle    stands about, gun lowered, until the player is inside his sight range with a clear line (a ray through the
//           same 3D trace the player's own shots use, so walls, cars and the ground block it)
//   notice  turns to face the player, raises the gun (the aim clip, the arms solved to the gun), a reaction time of
//           0.5-0.9 s that is why a gunman does not hit you on the first frame
//   fight   bursts of shots (pistol 3, Uzi 6, M4 4, shotgun 1) with a flash, a tracer and the shot's sound, then a pause in
//           which he strafes a little (or closes up if you are far, or backs off if you are close). A shot is a real trace
//           from the muzzle with an aim error that grows with the distance, doubles with you running, and gets worse
//           again with you in a car; it hurts you only if the traced bullet really passes through you
//   stop    nobody shoots with the player dead, a cut scene or a choice up, indoors, out of range or sight (he loses interest
//           after 10 s without a line to you, or at 75 m)
//
// A gunman looks like a pedestrian to the missions (x, z, dead), so a job's `targets` step can use them.
import { WEAPON_BY_ID } from './weapons.js';

const MODELS = ['Male_Adult_04', 'Male_Adult_10']; // the street gang's bodies
const PLAYER_R = 0.42; // metres: the bullet's hit radius round a standing player
const CAR_R = 1.15;
const rand = (a, b) => a + Math.random() * (b - a);

export function createCombat({ cm, cast, trafficSystem, trace, fx, world }) {
  const list = [];
  let serial = 0;
  const groundAt = (x, z) => cm.getGroundHeight(x, z, 'person') ?? 0;
  const free = (x, z, r = 0.5) => cm.nearColliders(x, z, r).every((c) => !(x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r && (c.minY ?? 0) < 2 && (c.maxY === undefined || c.maxY > 0.3)));

  /** One armed hostile at (x, z) */
  function spawn({ x, z, weapon = 'pistol', model, hp = 90, heading = 0, sight, aggro = false }) {
    const id = model || MODELS[serial % MODELS.length];
    const g = { kind: 'gunman', key: `gunman${serial++}`, model: id, x, z, y: groundAt(x, z), heading, yaw: heading, pitch: 0, weapon, hp, maxHp: hp, dead: false,
      placed: true, alert: !!aggro, sees: false, seeT: Math.random() * 0.3, lastSeen: 0, react: 0, phase: 'idle', phaseT: 0, shots: 0, shotT: 0, strafe: Math.random() < 0.5 ? 1 : -1,
      strafeT: rand(1, 2.5), speed: 0, aiming: false, fired: false, hurtT: 0, deadT: 0, sight: sight || WEAPON_BY_ID[weapon].npc.sight, visible: false, shotsFired: 0, held: null };
    cast?.preload?.([id]);
    list.push(g);
    return g;
  }
  /** n gunmen on a ring 12-24 m round (cx, cz) where `ok(x, z)` says the ground is theirs (and no wall is there), facing in */
  function spawnGroup(c, n, weapons = ['pistol'], ok = () => true, ring = [12, 24]) {
    const out = [];
    const base = Math.random() * Math.PI * 2;
    for (let tries = 0; out.length < n && tries < 120; tries++) {
      const a = base + (tries * 2.4) % (Math.PI * 2), r = rand(ring[0], ring[1]) + Math.floor(tries / 24) * 4;
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      if (!free(x, z, 0.7) || !ok(x, z) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue;
      out.push(spawn({ x, z, weapon: weapons[out.length % weapons.length], heading: Math.atan2(c.x - x, c.z - z) }));
    }
    return out;
  }
  function clear() {
    for (const g of list) cast?.setGunman(g.key, g.model, null);
    list.length = 0;
  }
  function hurt(g, dmg, fromX, fromZ) {
    if (g.dead) return;
    g.hp -= dmg;
    g.hurtT = 0.25;
    g.alert = true;
    g.lastSeen = 0;
    if (g.hp <= 0) { g.dead = true; g.deadT = 0; g.aiming = false; g.speed = 0; }
    else if (fromX !== undefined) g.heading = Math.atan2(fromX - g.x, fromZ - g.z);
  }
  /** An explosion: everyone alive within r takes dmg falling to 0 at the edge */
  function blast(x, y, z, r, dmg) {
    for (const g of list) {
      if (g.dead) continue;
      const d = Math.hypot(g.x - x, g.z - z, (g.y + 1) - y);
      if (d < r) hurt(g, dmg * (1 - d / r), x, z);
    }
  }

  // Does the segment (ex, ey, ez) -> (px, py, pz) run clear of walls, cars and the ground?
  function los(ex, ey, ez, px, py, pz) {
    const dx = px - ex, dy = py - ey, dz = pz - ez, d = Math.hypot(dx, dy, dz) || 1;
    const h = trace(ex, ey, ez, dx / d, dy / d, dz / d, d, 0.5, true);
    return h.kind === 'none' || h.dist >= d - 0.9;
  }

  // One shot at the player from the muzzle m: a trace with an aim error, hurting only if it passes through the player
  function shoot(g, m, P, w, n) {
    const dx = P.x - m.x, dy = P.y - m.y, dz = P.z - m.z, dist = Math.hypot(dx, dy, dz);
    // aim error (radians, half-angle): grows with distance, is doubled by the player running, and worse in a car
    const err = n.err * (0.4 + dist / 20) * (1 + Math.min(1, P.speed / 5) * 1) * (P.inCar ? 1.5 : 1) * (g.hurtT > 0 ? 1.6 : 1);
    const baseYaw = Math.atan2(dx, dz), basePitch = Math.atan2(dy, Math.hypot(dx, dz));
    const pellets = n.pellets || 1;
    let hits = 0;
    for (let k = 0; k < pellets; k++) {
      const e = pellets > 1 ? err * 1.5 : err;
      const a = baseYaw + (Math.random() - 0.5) * 2 * e, pa = basePitch + (Math.random() - 0.5) * 2 * e * 0.7;
      const cp = Math.cos(pa), vx = Math.sin(a) * cp, vy = Math.sin(pa), vz = Math.cos(a) * cp;
      const h = trace(m.x, m.y, m.z, vx, vy, vz, n.range, 0.3, true);
      // the bullet's path against the player (a stand of radius PLAYER_R, or a car's wider body)
      let hit = null;
      const R = P.inCar ? CAR_R : PLAYER_R;
      for (let s = 0.5; s <= h.dist; s += 0.3) {
        const px = m.x + vx * s, py = m.y + vy * s, pz = m.z + vz * s;
        if (Math.abs(px - P.x) < R && Math.abs(pz - P.z) < R && Math.hypot(px - P.x, pz - P.z) < R && py > P.y - 0.05 && py < P.y + (P.inCar ? 1.6 : 1.85)) { hit = { x: px, y: py, z: pz }; break; }
      }
      if (hit) { hits++; fx.tracer(m.x, m.y, m.z, hit.x, hit.y, hit.z); }
      else {
        fx.tracer(m.x, m.y, m.z, h.x, h.y, h.z);
        if (h.kind !== 'none') fx.spark(h.x, h.y, h.z);
      }
    }
    fx.flash(m.x, m.y, m.z);
    fx.bang(w.sound, dist);
    if (hits) world.hurtPlayer(n.dmg * hits, g.x, g.z);
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    const P = world.player();
    const calm = world.holdFire();
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      const w = WEAPON_BY_ID[g.weapon], n = w.npc;
      g.hurtT = Math.max(0, g.hurtT - dt);
      g.fired = false;
      if (g.dead) {
        g.deadT += dt;
        if (g.deadT > 45) { cast?.setGunman(g.key, g.model, null); list.splice(i, 1); continue; }
        g.visible = !!cast?.setGunman(g.key, g.model, { x: g.x, y: g.y, z: g.z, heading: g.heading, dead: true, weapon: g.weapon, vest: g.biker, dt });
        continue;
      }
      if (g.mounted) { g.fired = false; continue; } // riding a bike: js/bikies.js moves and draws him until he gets off
      const dxp = P.x - g.x, dzp = P.z - g.z, d = Math.hypot(dxp, dzp);
      // perception: four times a second, a ray to the player's chest
      g.seeT -= dt;
      if (g.seeT <= 0) {
        g.seeT = 0.22 + Math.random() * 0.08;
        g.sees = !P.dead && d < (g.alert ? g.sight * 1.5 : g.sight) && los(g.x, g.y + 1.5, g.z, P.x, P.y + (P.inCar ? 0.9 : 1.2), P.z);
      }
      if (g.sees && !calm) { if (!g.alert) { g.alert = true; g.react = rand(0.5, 0.9); } g.lastSeen = 0; } else g.lastSeen += dt;
      if (g.alert && (P.dead || d > 75 || g.lastSeen > 10)) { g.alert = false; g.phase = 'idle'; g.aiming = false; }
      const engaged = g.alert && !calm && !P.dead;
      // facing: round to the player when engaged
      const want = engaged || g.hurtT > 0 ? Math.atan2(dxp, dzp) : g.heading;
      let dh = Math.atan2(Math.sin(want - g.heading), Math.cos(want - g.heading));
      g.heading += Math.max(-7 * dt, Math.min(7 * dt, dh));
      let move = 0, side = 0;
      if (engaged) {
        g.react = Math.max(0, g.react - dt);
        g.aiming = g.react <= 0 || g.phase !== 'idle';
        if (g.aiming && g.sees && d < n.range) {
          if (g.phase === 'idle') { g.phase = 'pause'; g.phaseT = rand(0.1, 0.4); }
          if (g.phase === 'pause') {
            g.phaseT -= dt;
            g.strafeT -= dt;
            if (g.strafeT <= 0) { g.strafe = -g.strafe; g.strafeT = rand(1, 2.6); }
            side = g.strafe * 1.5;
            if (d > Math.max(14, n.range * 0.5)) move = d > 30 ? 3.6 : 1.9; // closes up
            else if (d < 6) move = -1.5; // backs off
            if (g.phaseT <= 0 && g.visible) { g.phase = 'burst'; g.shots = n.burst; g.shotT = 0; trafficSystem.scarePeds?.(g.x, g.z, 30, 10); }
          } else if (g.phase === 'burst') {
            g.shotT -= dt;
            if (g.shotT <= 0) {
              const m = g.muzzle || { x: g.x + Math.sin(g.heading) * 0.6, y: g.y + 1.35, z: g.z + Math.cos(g.heading) * 0.6 };
              shoot(g, m, { x: P.x, y: P.y + (P.inCar ? 0.8 : 1.15), z: P.z, speed: P.speed, inCar: P.inCar }, w, n);
              g.fired = true;
              g.shotsFired++;
              g.shots--;
              g.shotT = n.rate;
              if (g.shots <= 0) { g.phase = 'pause'; g.phaseT = rand(0.9, 1.8) * (n.burst === 1 ? 0.7 : 1); }
            }
          }
        } else if (g.alert && !g.sees) {
          // lost the line: run at where they were
          move = 3.4;
        }
      } else if (g.phase !== 'idle') { g.phase = 'idle'; g.aiming = false; }
      // moving (not through walls)
      const f = { x: Math.sin(g.heading), z: Math.cos(g.heading) }, r = { x: -f.z, z: f.x };
      const vx = f.x * move + r.x * side, vz = f.z * move + r.z * side;
      const nx = g.x + vx * dt, nz = g.z + vz * dt;
      if (vx || vz) {
        if (free(nx, nz, 0.45)) { g.x = nx; g.z = nz; }
        else if (free(nx, g.z, 0.45)) g.x = nx;
        else if (free(g.x, nz, 0.45)) g.z = nz;
        else g.strafe = -g.strafe;
      }
      g.speed += (Math.hypot(vx, vz) - g.speed) * Math.min(1, dt * 6);
      g.y = groundAt(g.x, g.z);
      const pitch = engaged ? Math.atan2(P.y + 1.1 - (g.y + 1.45), Math.max(1, d)) : 0;
      const r2 = cast?.setGunman(g.key, g.model, { x: g.x, y: g.y, z: g.z, heading: g.heading, speed: g.speed, weapon: g.weapon, armed: true,
        aiming: g.aiming && engaged, vest: g.biker, yaw: g.heading, pitch, fire: g.fired, dt });
      g.visible = !!r2;
      g.held = r2?.held || null;
      g.muzzle = r2?.muzzle ? { x: r2.muzzle.x, y: r2.muzzle.y, z: r2.muzzle.z } : null;
    }
  }

  return {
    list, spawn, spawnGroup, clear, hurt, blast, update,
    get alive() { return list.filter((g) => !g.dead).length; },
    /** For checks */
    debug() { return list.map((g) => ({ key: g.key, x: g.x, z: g.z, hp: g.hp, dead: g.dead, alert: g.alert, sees: g.sees, phase: g.phase, aiming: g.aiming, visible: g.visible, held: g.held, shots: g.shotsFired })); }
  };
}
