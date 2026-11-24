// Solid vehicles outside the traffic system (trams, police units, mission cars) against the player's car or bike.
// The traffic's own cars and buses already collide with the player in js/traffic.js; this covers everything that
// moves by its own rules and used to be driven straight through.
//
// - Each body is an oriented box (centre, heading, half length and width) with a mass; mass 0 is immovable (a tram).
// - Bodies are bucketed into a 16 m spatial hash each frame, and only the cells round the player are tested: O(n).
// - Contacts use the shared rigid-body routines (js/vehicle-physics.js): a swept test from last frame's positions
//   first, so a fast car can't tunnel through a thin body between frames, then the plain overlap test.
// - The impulse carries the other body's velocity, so a police car driving into the player shoves the player, and
//   a body with `bump` (a pursuer) is told its new speed along its heading.
// - Hits are reported through controllerManager.reportCollision (kind 'solid'), which plays the crash sounds.
import { terrainHeight } from './terrain.js';
import { vehicleContact, resolveVehicleContact, sweptVehicleContact } from './vehicle-physics.js';

export const SOLID_CELL = 16; // m, spatial hash cell
export const SOLID_REACH = 40; // m around the player that bodies are gathered from
export const SOLID_MASS = { tram: 0, police: 1800, car: 1600, player: 1700, cyclist: 95 }; // kg (0: immovable)
const TELEPORT = 25; // m: a body that moved farther than this in one frame jumped (a tram to its next line)

export function createVehicleSolids(controllerManager) {
  const providers = []; // (x, z, r, out) => void, each pushes { key, x, z, yaw, halfL, halfW, mass, speed, bump? }
  const prev = new Map(); // key -> [x, z] at the end of the last frame
  const seen = new Set();
  const cells = new Map();
  const bodies = [];
  const a = {}, b = {}, hit = {};
  let playerPrev = null, playerEnt = null;
  const stats = { hits: 0, last: null };

  function addProvider(fn) { providers.push(fn); }

  function gather(x, z) {
    bodies.length = 0;
    for (const fn of providers) {
      try { fn(x, z, SOLID_REACH, bodies); } catch (e) { /* a system not ready yet */ }
    }
    for (const list of cells.values()) list.length = 0;
    for (const o of bodies) {
      const k = Math.floor(o.x / SOLID_CELL) * 65536 + Math.floor(o.z / SOLID_CELL);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(o);
    }
  }

  function near(x, z, reach, out) {
    out.length = 0;
    const r = Math.ceil(reach / SOLID_CELL);
    const cx = Math.floor(x / SOLID_CELL), cz = Math.floor(z / SOLID_CELL);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const list = cells.get((cx + i) * 65536 + cz + j);
        if (list) for (const o of list) out.push(o);
      }
    }
    return out;
  }

  const candidates = [];
  function update() {
    const mode = controllerManager.activeMode;
    const pe = controllerManager.getActiveEntity();
    const driving = (mode === 'car' || mode === 'cyclist') && pe && pe.position.y - terrainHeight(pe.position.x, pe.position.z) < 2.6;
    if (pe !== playerEnt) { playerEnt = pe; playerPrev = null; }
    const px = pe ? pe.position.x : 0, pz = pe ? pe.position.z : 0;
    gather(px, pz);
    if (driving) {
      const car = mode === 'car';
      const halfW = car ? 0.86 : 0.35, halfL = car ? 2.18 : 0.85;
      const fromLast = playerPrev && Math.hypot(px - playerPrev[0], pz - playerPrev[1]) < TELEPORT;
      const ppx = fromLast ? playerPrev[0] : px, ppz = fromLast ? playerPrev[1] : pz;
      const travel = Math.hypot(px - ppx, pz - ppz);
      for (const o of near(px, pz, 12 + travel, candidates)) {
        const reach = o.halfL + o.halfW + halfL + halfW + travel + 1;
        if (Math.abs(o.x - pe.position.x) > reach || Math.abs(o.z - pe.position.z) > reach) continue;
        const heading = pe.heading || 0;
        a.x = pe.position.x; a.z = pe.position.z; a.prevX = ppx; a.prevZ = ppz;
        a.sin = Math.sin(heading); a.cos = Math.cos(heading);
        a.halfW = halfW; a.halfL = halfL;
        a.mass = car ? SOLID_MASS.player : SOLID_MASS.cyclist;
        a.vx = a.sin * (pe.speed || 0) + (car ? pe.vx || 0 : 0);
        a.vz = a.cos * (pe.speed || 0) + (car ? pe.vz || 0 : 0);
        a.angularVel = car ? pe.angularVel || 0 : 0;
        const q = prev.get(o.key);
        const moved = q ? Math.hypot(o.x - q[0], o.z - q[1]) : Infinity;
        b.x = o.x; b.z = o.z;
        b.prevX = moved < TELEPORT ? q[0] : o.x; b.prevZ = moved < TELEPORT ? q[1] : o.z;
        b.sin = Math.sin(o.yaw); b.cos = Math.cos(o.yaw);
        b.halfW = o.halfW; b.halfL = o.halfL; b.mass = o.mass;
        b.vx = b.sin * (o.speed || 0); b.vz = b.cos * (o.speed || 0); b.angularVel = 0;
        if (!sweptVehicleContact(a, b, hit) && !vehicleContact(a, b, hit)) continue;
        const bx0 = b.vx, bz0 = b.vz;
        const speed = resolveVehicleContact(a, b, hit);
        // positional correction: the immovable body takes none of it
        const invA = 1 / a.mass, invB = b.mass > 0 ? 1 / b.mass : 0;
        const share = invA / (invA + invB);
        pe.position.x = hit.ax + hit.nx * (hit.depth * share + 0.01);
        pe.position.z = hit.az + hit.nz * (hit.depth * share + 0.01);
        if (pe.mesh) pe.mesh.position.copy(pe.position);
        if (speed > 0) {
          pe.speed = a.vx * a.sin + a.vz * a.cos;
          if (car) {
            pe.vx = a.vx - a.sin * pe.speed;
            pe.vz = a.vz - a.cos * pe.speed;
            pe.angularVel = a.angularVel;
            const kick = Math.min(12, hit.impulse / a.mass);
            if (pe.pitchVel !== undefined) pe.pitchVel += (hit.nx * a.sin + hit.nz * a.cos) * kick * 0.16;
            if (pe.rollVel !== undefined) pe.rollVel -= (hit.nx * a.cos - hit.nz * a.sin) * kick * 0.2;
          }
          if (o.bump && invB > 0 && (b.vx !== bx0 || b.vz !== bz0)) o.bump(b.vx * b.sin + b.vz * b.cos);
          controllerManager.reportCollision?.(pe, o.key, 'solid', hit.x, 0.6, hit.z, hit.nx, 0, hit.nz, speed);
          stats.hits++;
          stats.last = { kind: o.kind || '', speed: +speed.toFixed(2), x: +hit.x.toFixed(1), z: +hit.z.toFixed(1) };
        }
      }
      playerPrev = [pe.position.x, pe.position.z];
    } else playerPrev = null;
    // last positions, for next frame's sweeps
    seen.clear();
    for (const o of bodies) {
      seen.add(o.key);
      const q = prev.get(o.key);
      if (q) { q[0] = o.x; q[1] = o.z; } else prev.set(o.key, [o.x, o.z]);
    }
    for (const k of prev.keys()) if (!seen.has(k)) prev.delete(k);
  }

  return { addProvider, update, near: (x, z, r) => { gather(x, z); return near(x, z, r, []); }, stats, get bodies() { return bodies; } };
}
