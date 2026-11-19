// Ported from rezvivo (https://github.com/thpg/rezvivo), GPL-3.0-or-later, AvatarGait.pas
// Walker gait maths: cadence from speed and body scale, duty factor, step length, pelvis and shoulder yaw
// (counter-rotation), arm-girdle protraction, support pulses, the flight-phase vertical motion and the 32-sample
// periodic pelvis-height curve with its cubic B-spline lookup. Pure functions, no three.js. Angles in radians
// (rezvivo uses degrees). Phase 0 = left heel strike, 0.5 = right.

export const GAIT_HEIGHT_SAMPLES = 32;
const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const blend = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

/** Gait cycles per second. `scale` = leg length / 0.805 m; `run` 0..1 blends the walking and running fits. */
export function gaitFrequency(speed, scale = 1, run = 0) {
  scale = Math.max(scale, 0.1);
  const walk = clamp(0.68 + speed / scale * 0.27, 0.65, 1.38);
  const jog = clamp(1.2 + speed / Math.sqrt(scale) * 0.055, 1.32, 1.8);
  return blend(walk, jog, run) / Math.sqrt(scale);
}

export function advanceGaitPhase(phase, dt, speed, scale = 1, run = 0) {
  const p = frac(phase + clamp(dt, 0, 0.1) * Math.sign(speed) * gaitFrequency(Math.abs(speed), scale, run));
  return p < 0 ? p + 1 : p;
}

/** Share of the vertical load one foot carries (a half-sine over its stance, average of both feet = 1 body weight). */
export function gaitSupport(phase, duty) {
  phase = frac(phase + 2);
  duty = clamp(duty, 0.12, 0.75);
  return phase < duty ? Math.sin(Math.PI * phase / duty) * Math.PI / (4 * duty) : 0;
}

/** Running: integrate the two support pulses twice; flight has acceleration -g. Returns { height, velocity, acceleration }. */
export function gaitVerticalMotion(phase, duty, rate, out = {}) {
  const P = frac(phase * 2 + 4) * 0.5;
  const D = clamp(duty, 0.12, 0.75);
  const F = Math.max(rate, 0.1);
  const i1 = (x) => (x < D ? (1 - Math.cos(Math.PI * x / D)) * 0.25 : 0.5);
  const i2 = (x) => (x < D ? x * 0.25 - D * Math.sin(Math.PI * x / D) / (4 * Math.PI) : x * 0.5 - D * 0.25);
  const A0 = i1(0.5);
  const V0 = -(0.75 - 0.5 * D - A0);
  out.height = 9.81 / (F * F) * (V0 * P + i2(P) + i2(P + 0.5) - i2(0.5) - A0 * P - 0.5 * P * P);
  out.velocity = 9.81 / F * (V0 + i1(P) + i1(P + 0.5) - A0 - P);
  out.acceleration = 9.81 * (gaitSupport(P, D) + gaitSupport(P + 0.5, D) - 1);
  return out;
}

const _vm = {};
/** Pelvis height offset (m), velocity and acceleration: periodic cubic B-spline through `walkHeight`, blended to the running flight model. */
export function gaitBodyMotion(phase, duty, rate, amount, run, walkHeight, out = {}) {
  if (amount <= 0) { out.height = walkHeight[0]; out.velocity = 0; out.acceleration = 0; return out; }
  if (run >= 1) {
    gaitVerticalMotion(phase, duty, rate, out);
    out.height *= amount; out.velocity *= amount; out.acceleration *= amount;
    return out;
  }
  const N = GAIT_HEIGHT_SAMPLES;
  let t = frac(phase + 2) * N;
  const i = Math.floor(t);
  t -= i;
  const p0 = walkHeight[(i + N - 1) % N], p1 = walkHeight[i % N], p2 = walkHeight[(i + 1) % N], p3 = walkHeight[(i + 2) % N];
  const c0 = (p0 + 4 * p1 + p2) / 6, c1 = (p2 - p0) * 0.5, c2 = (p0 - 2 * p1 + p2) * 0.5, c3 = (-p0 + 3 * p1 - 3 * p2 + p3) / 6;
  const w = N * rate;
  out.height = c0 + t * (c1 + t * (c2 + t * c3));
  out.velocity = (c1 + t * (2 * c2 + t * 3 * c3)) * w;
  out.acceleration = (2 * c2 + t * 6 * c3) * w * w;
  if (run > 0) {
    gaitVerticalMotion(phase, duty, rate, _vm);
    out.height = blend(out.height, _vm.height * amount, run);
    out.velocity = blend(out.velocity, _vm.velocity * amount, run);
    out.acceleration = blend(out.acceleration, _vm.acceleration * amount, run);
  }
  return out;
}

/**
 * Build the 32-sample walking pelvis-height curve (metres relative to standing, <= 0). Rezvivo solves it from its
 * rig's leg geometry; here each stance foot is a straight-leg reach limit (sqrt(L^2 - d^2) - L, d = foot distance
 * ahead/behind the hip), the lower of the two limits wins, a swinging leg relaxes its bound under gravity, and the
 * same cyclic 1:4:1 deconvolution as the original makes the B-spline pass through the contact heights.
 */
export function buildWalkHeight(speed, scale, duty, rate, legLength, out = new Float32Array(GAIT_HEIGHT_SAMPLES)) {
  const N = GAIT_HEIGHT_SAMPLES;
  const move = ease(speed / (0.45 * scale));
  if (move < 0.001) { out.fill(0); return out; }
  const travel = speed * duty / rate; // metres the body moves during one foot's stance
  const L = legLength;
  const reach = (d) => Math.sqrt(Math.max(L * L - d * d, (0.5 * L) ** 2)) - L;
  const targets = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const at = n / N;
    let h = 1e9;
    for (let side = 0; side < 2; side++) {
      const fp = frac(at + side * 0.5);
      if (fp < duty) h = Math.min(h, reach(travel * (0.5 - fp / duty) + 0.4 * travel * 0.0));
      else {
        const dt = (fp - duty) / rate;
        h = Math.min(h, reach(travel * 0.5) + 0.5 * 9.81 * dt * dt);
      }
    }
    targets[n] = Math.min(0, h) * move;
  }
  out.set(targets);
  const prev = new Float32Array(N);
  for (let it = 0; it < 12; it++) {
    prev.set(out);
    for (let n = 0; n < N; n++) out[n] = 1.5 * targets[n] - 0.25 * (prev[(n + N - 1) % N] + prev[(n + 1) % N]);
  }
  return out;
}

/**
 * Gait frame for a walker/runner: cadence (steps/min), duty, step length (m), pelvis and shoulder yaw (radians),
 * pelvis roll, arm-girdle protraction (left, right) and the walk-height curve.
 * `legLength` metres (0.805 = reference). Allocates nothing if `out` is reused.
 */
export function gaitFrame(phase, speed, legLength = 0.805, runBlend = 0, out = {}) {
  const scale = legLength / 0.805;
  speed = Math.max(0, speed);
  const move = ease(speed / (0.45 * scale));
  const run = clamp(runBlend, 0, 1) * move;
  phase = frac(phase);
  const rate = gaitFrequency(speed, scale, runBlend);
  const runPace = ease((speed / Math.sqrt(scale) - 2) / 5.5);
  const pace = ease((speed / scale - 0.4) / 1.7);
  let runDuty = Math.min(clamp(0.43 - speed / Math.sqrt(scale) * 0.018, 0.2, 0.44), legLength * rate / Math.max(speed, 0.1));
  runDuty = clamp(runDuty, 0.12, 0.46);
  const duty = blend(clamp(0.68 - speed / scale * 0.035, 0.58, 0.68), runDuty, run);
  const cycle = 2 * Math.PI * phase;
  const lag = blend(65, 165, Math.max(pace, run)) * DEG;
  out.phase = phase; out.amount = move; out.run = run; out.scale = scale; out.rate = rate; out.duty = duty;
  out.cadence = speed > 0 ? 120 * rate : (out.cadence || 0);
  out.stepLength = speed / (2 * rate);
  out.pelvisYaw = -blend(blend(3.2, 6.5, pace), blend(4, 7, runPace), run) * DEG * move * Math.cos(cycle);
  out.shoulderYaw = -blend(blend(3, 7, pace), blend(4.5, 8, runPace), run) * DEG * move * Math.cos(cycle - lag);
  out.pelvisRoll = blend(2.5, blend(2.5, 3.2, runPace), run) * DEG * move * Math.sin(cycle);
  out.shoulderProtraction = out.shoulderProtraction || [0, 0];
  for (let i = 0; i < 2; i++) {
    out.shoulderProtraction[i] = blend(5.5, blend(6, 10, runPace), run) * DEG * move * -Math.cos(2 * Math.PI * frac(phase + i * 0.5) - 0.12);
  }
  out.walkHeight = buildWalkHeight(speed, scale, duty, rate, legLength, out.walkHeight);
  return out;
}
