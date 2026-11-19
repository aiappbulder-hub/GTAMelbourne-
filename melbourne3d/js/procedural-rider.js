// Ported from rezvivo (https://github.com/thpg/rezvivo), GPL-3.0-or-later, RiderMotion.pas, RiderDynamics.pas,
// RiderGroundTurn.pas
// Cyclist motion layer: seated / standing / sprint blend, breathing, ankle flex curve, spine and scapula layering,
// pedal-rate interlock, and the lean-into-turns target (a reduced form of RiderDynamics' roll spring: the full
// articulated solver is not ported). Pure functions, no three.js. Angles in radians (rezvivo uses degrees);
// lengths in metres. Phase = right crank angle / 2pi, 0 = forward.

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothUnit = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };

export const RIDER_PROFILES = {
  seated: { standing: 0, seatedPower: 0, sprint: 0, pedalling: 1, breathing: 1, ankleDeg: 22 },
  seatedPower: { standing: 0, seatedPower: 1, sprint: 0, pedalling: 1, breathing: 1, ankleDeg: 24 },
  climb: { standing: 1, seatedPower: 0, sprint: 0, pedalling: 1, breathing: 1, ankleDeg: 26 },
  sprint: { standing: 1, seatedPower: 0, sprint: 1, pedalling: 1, breathing: 1, ankleDeg: 28 }
};

export function blendProfile(a, b, t, out = {}) {
  for (const k of ['standing', 'seatedPower', 'sprint', 'pedalling', 'breathing', 'ankleDeg']) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export const breathsPerMinute = (load) => 12 + 42 * smoothUnit(clamp(load / 1.6, 0, 1));

/** state = { load, phase }; effort 0..2. Breathing has its own clock, independent of the cranks and frame rate. */
export function advanceBreathing(state, dt, effort) {
  dt = clamp(dt, 0, 0.25);
  effort = clamp(effort, 0, 2);
  const response = effort > state.load ? 4 : 10;
  state.load += (effort - state.load) * (1 - Math.exp(-dt / response));
  const p = state.phase + dt * breathsPerMinute(state.load) / 60;
  state.phase = p - Math.floor(p);
  return state;
}

/** Ankle flex in degrees over the crank angle (degrees): plantar-flexes through the downstroke. */
export function bicycleAnkleFlexCurve(crankDeg, maxFlexDeg) {
  const a = crankDeg - 360 * Math.floor(crankDeg / 360);
  const s = Math.cos((a - 310) * DEG) + 0.25 * Math.cos(2 * (a - 250) * DEG);
  return s >= 0 ? maxFlexDeg * s / 0.992690685 : maxFlexDeg * s / 1.182432177;
}

/** Crank rate that reaches the request within 0.4 s; zero unless the feet are on the pedals. */
export function advancePedalRate(current, requested, dt, contactsReady = true) {
  if (!contactsReady) return 0;
  requested = Math.max(0, requested);
  const step = Math.max(4, requested / 0.4) * Math.max(0, dt);
  return current < requested ? Math.min(requested, current + step) : Math.max(requested, current - step);
}

/** Out of the saddle the bike rocks under the pelvis: inverse-roll the support anchor {y, z} by the bike lean (radians). */
export function riderSupportInBikeFrame(p, standing, leanRad) {
  const w = clamp(standing, 0, 1);
  if (w === 0 || leanRad === 0) return p;
  const c = Math.cos(leanRad), s = Math.sin(leanRad);
  const iy = p.y * c + p.z * s, iz = -p.y * s + p.z * c;
  p.y += (iy - p.y) * w;
  p.z += (iz - p.z) * w;
  return p;
}

export function createMotionFrame() {
  return {
    x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, bikeLean: 0, bikeSteer: 0,
    spinePitch: new Float32Array(5), spineYaw: new Float32Array(5), spineRoll: new Float32Array(5),
    shoulderRound: 0, ankle: 0, scapulaProtraction: new Float32Array(2), scapulaElevation: new Float32Array(2)
  };
}

/**
 * Layered rider motion for one crank angle. profile as RIDER_PROFILES; phase = crank angle / 2pi (right crank);
 * breathPhase 0..1; cadenceRpm; effort 0..2; swayM / bobM = pelvis excursion scale (m per unit).
 * Angles in the result are radians (position in metres). Spine arrays: lumbar, 1..3 thoracic, neck.
 */
export function evaluateRiderMotion(profile, phase, breathPhase, cadenceRpm, effort, swayM, bobM, out = createMotionFrame()) {
  const stand = clamp(profile.standing, 0, 1);
  const power = (1 - stand) * clamp(profile.seatedPower, 0, 1);
  const sprint = stand * clamp(profile.sprint, 0, 1);
  const drive = smoothUnit(cadenceRpm / 35) * clamp(profile.pedalling, 0, 1);
  const torque = clamp(effort * 80 / Math.max(50, cadenceRpm), 0, 2);
  const A = drive * (0.28 + 0.42 * torque);
  const th = phase * 2 * Math.PI;
  const stroke = (Math.cos(th) + 0.12 * sprint * Math.cos(3 * th)) / (1 + 0.12 * sprint);
  const dbl = Math.sin(2 * th + 0.3 * stand + 0.2 * power);
  out.z = swayM * A * Math.cos(th - 0.2 - 0.15 * stand);
  out.y = bobM * A * dbl;
  out.x = (0.0005 + 0.001 * power + 0.004 * stand + 0.002 * sprint) * A * Math.sin(2 * th - 0.4);
  out.yaw = (0.3 + 0.25 * power + 0.65 * stand + 0.25 * sprint) * A * Math.cos(th - 0.35) * DEG;
  out.pitch = (0.16 + 0.14 * power + 0.45 * stand + 0.25 * sprint) * A * Math.sin(2 * th - 0.35) * DEG;
  const bikeLeanDeg = (0.28 + 0.2 * power + 3.82 * stand + 1.2 * sprint) * A * stroke;
  out.bikeLean = bikeLeanDeg * DEG;
  out.bikeSteer = -out.bikeLean * 0.18;
  const worldRoll = (0.32 + 0.2 * power + 0.85 * stand + 0.25 * sprint) * A * Math.cos(th - 0.55);
  const thoraxRoll = (0.2 + 0.18 * power + 0.6 * stand + 0.25 * sprint) * A * Math.cos(th - 1.1);
  out.roll = (worldRoll - bikeLeanDeg) * DEG;
  const breath = Math.sin(breathPhase * 2 * Math.PI);
  const chest = profile.breathing * (0.28 + 0.32 * clamp(effort, 0, 2)) * breath; // degrees
  const pd = out.pitch / DEG, yd = out.yaw / DEG;
  const sp = out.spinePitch, sy = out.spineYaw, sr = out.spineRoll;
  sp[0] = 0; sp[1] = -0.2 * pd - 0.18 * chest; sp[2] = -0.4 * pd - 0.5 * chest; sp[3] = -0.2 * pd - 0.32 * chest; sp[4] = -0.2 * pd + chest;
  sr[0] = 0; sr[1] = 0.2 * (thoraxRoll - worldRoll); sr[2] = 0.45 * (thoraxRoll - worldRoll); sr[3] = 0.35 * (thoraxRoll - worldRoll); sr[4] = -thoraxRoll;
  sy[0] = 0; sy[1] = -0.2 * yd; sy[2] = -0.35 * yd; sy[3] = -0.2 * yd; sy[4] = -0.25 * yd;
  const lumbarTwist = (0.3 + 0.15 * power + 0.65 * stand + 0.25 * sprint) * A * Math.cos(th - 0.45);
  const lumbarFlex = (0.16 + 0.35 * stand) * A * dbl;
  sy[0] = lumbarTwist; sy[2] -= 0.45 * lumbarTwist; sy[3] -= 0.55 * lumbarTwist;
  sp[0] = lumbarFlex; sp[2] -= 0.6 * lumbarFlex; sp[3] -= 0.4 * lumbarFlex;
  const thoraxTwist = (0.55 + 0.7 * power + 3 * stand + sprint) * A * Math.cos(th - 0.95);
  sy[2] += 0.45 * thoraxTwist; sy[3] += 0.55 * thoraxTwist; sy[4] -= thoraxTwist;
  for (let i = 0; i < 5; i++) { sp[i] *= DEG; sy[i] *= DEG; sr[i] *= DEG; }
  out.shoulderRound = 0.8 * chest * DEG;
  const load = A * (0.3 + 0.35 * power + 1.2 * stand + 0.4 * sprint) * Math.cos(th - 0.85);
  out.scapulaProtraction[0] = load * DEG; out.scapulaProtraction[1] = -load * DEG;
  out.scapulaElevation[0] = (0.15 * chest + 0.3 * load) * DEG; out.scapulaElevation[1] = (0.15 * chest - 0.3 * load) * DEG;
  out.ankle = profile.ankleDeg * drive * (0.75 + 0.2 * torque) * DEG;
  return out;
}

/**
 * Lean into turns (RiderDynamics: lean target = atan2(lateral accel, g cos(road pitch)), roll spring, softer when
 * standing). state = { lean, vel }; lateralAccel m/s^2 (+ = turning left); returns the new lean (radians, + = left).
 */
export function advanceTurnLean(state, dt, lateralAccel, roadPitch = 0, standing = 0) {
  const target = clamp(Math.atan2(lateralAccel, 9.81 * Math.cos(roadPitch)), -1.05, 1.05);
  const k = 600 * (1 - standing) + 260 * standing; // rezvivo's roll spring stiffness
  const w = Math.sqrt(k) * 0.3, damp = 2 * 0.9 * w; // normalised so the response settles in ~0.3 s
  dt = clamp(dt, 0, 0.05);
  const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.vel += (w * w * (target - state.lean) - damp * state.vel) * h;
    state.lean += state.vel * h;
  }
  return state.lean;
}

// --- Standing turns (RiderGroundTurn.pas): the rider steps the bike round on the spot ---------------------------
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const GROUND_TURN = { prepare: 1.15, step: 0.38, lower: 1.1 };

export function createGroundTurn() {
  return {
    stage: 'idle', time: 0, yaw: 0, rate: 0, footYaw: [0, 0], stepTime: 0, stepFrom: 0, stepTo: 0, swingFoot: 0, nextFoot: 0, stepping: false,
    frame: { active: false, blend: 0, bikeLift: 0, yawDelta: 0, yawRate: 0, footAngle: [0, 0], footLift: [0, 0], weightShift: 0 }
  };
}

export function advanceGroundTurn(S, dt, steer, speed, power, enabled = true) {
  const reset = () => { Object.assign(S, createGroundTurn()); return S; };
  if (!enabled) return reset();
  if (dt <= 0) return S;
  dt = Math.min(dt, 0.1);
  const f = S.frame;
  const want = Math.abs(steer) > 0.08 && Math.abs(speed) < 0.15 && power < 10;
  if (S.stage === 'idle') {
    f.active = false; f.blend = f.bikeLift = f.yawDelta = f.yawRate = f.weightShift = 0;
    if (!want) return S;
    reset(); S.stage = 'prepare'; S.nextFoot = steer < 0 ? 1 : 0;
  }
  const oldYaw = S.yaw;
  S.time += dt;
  f.active = true; f.blend = f.bikeLift = f.weightShift = 0; f.footLift[0] = f.footLift[1] = 0;
  const beginStep = (foot, goal) => { S.stepping = true; S.swingFoot = foot; S.stepTime = 0; S.stepFrom = S.footYaw[foot]; S.stepTo = goal; };
  if (S.stage === 'prepare') {
    f.blend = smooth01(S.time / 0.75);
    f.bikeLift = 0.065 * smooth01((S.time - 0.75) / 0.4);
    if (S.time >= GROUND_TURN.prepare) { S.time = 0; S.stage = want ? 'turning' : 'settle'; }
  } else if (S.stage === 'turning' || S.stage === 'settle') {
    f.blend = 1; f.bikeLift = 0.065;
    S.stage = want ? 'turning' : 'settle';
    const target = S.stage === 'turning' ? clamp(steer, -1, 1) * 0.65 : 0;
    S.rate += clamp(target - S.rate, -2.4 * dt, 2.4 * dt);
    S.yaw += S.rate * dt;
    if (!S.stepping) {
      if (Math.abs(S.rate) > 0.02) { beginStep(S.nextFoot, S.yaw + S.rate * GROUND_TURN.step); S.nextFoot = 1 - S.nextFoot; }
      else if (S.stage === 'settle') {
        if (Math.abs(S.footYaw[0] - S.yaw) > 0.002) beginStep(0, S.yaw);
        else if (Math.abs(S.footYaw[1] - S.yaw) > 0.002) beginStep(1, S.yaw);
        else { S.stage = 'lower'; S.time = 0; }
      }
    }
    if (S.stepping) {
      S.stepTime = Math.min(GROUND_TURN.step, S.stepTime + dt);
      const t = S.stepTime / GROUND_TURN.step;
      S.footYaw[S.swingFoot] = S.stepFrom + (S.stepTo - S.stepFrom) * smooth01(t);
      f.footLift[S.swingFoot] = 0.055 * Math.sin(Math.PI * t) ** 2;
      f.weightShift = (2 * S.swingFoot - 1) * 0.014 * Math.sin(Math.PI * t);
      if (S.stepTime >= GROUND_TURN.step) S.stepping = false;
    }
  } else if (S.stage === 'lower') {
    f.bikeLift = 0.065 * (1 - smooth01(S.time / 0.35));
    f.blend = 1 - smooth01((S.time - 0.35) / 0.75);
    if (S.time >= GROUND_TURN.lower) return reset();
  }
  f.yawDelta = S.yaw - oldYaw; f.yawRate = S.rate;
  for (let i = 0; i < 2; i++) f.footAngle[i] = S.footYaw[i] - S.yaw;
  return S;
}
