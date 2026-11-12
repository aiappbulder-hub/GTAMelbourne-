// js/story/leader.js: someone the player follows or chases in a job: a car (or a person on foot) that goes along a
// fixed route of [x, z] points at its own pace, slowing for the bends, and stops at the end. missions.js decides what
// the distance to it means (too far: lost; too close: spotted; there at the end: caught). It eases off a little when
// the player drops well back, so a slow start doesn't lose the job.
import * as THREE from 'three/webgpu';

export function createLeader({ scene, controllerManager, cast = null }) {
  const models = new Map();
  async function loadModel(file, color) {
    if (!models.has(file)) {
      models.set(file, (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        return new GLTFLoader().loadAsync(new URL(`../../../models/custom/${file}.json`, import.meta.url).href);
      })());
    }
    const gltf = await models.get(file);
    const body = gltf.scene.clone(true);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.material && o.material.name === 'Body') { o.material = o.material.clone(); o.material.color.setHex(color); }
    });
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.add(body);
    const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].map((n) => body.getObjectByName(n)).filter(Boolean);
    return { root, wheels };
  }

  const KEY = 'leader';
  let car = null; // { root, wheels, file, color }
  let active = false, moving = false, arrived = false;
  let route = [], k = 0; // route[k] is the next point
  let pos = { x: 0, z: 0 }, heading = 0, v = 0, vMax = 14, far = 150;
  let person = null; // a model id: on foot
  let token = 0;

  const player = () => controllerManager.getActiveEntity().position;
  const ground = (x, z) => controllerManager.getGroundHeight(x, z, 'person') || 0;

  /** Put it at the start of `pts` ([[x, z], ...]), waiting; go() sets it off. person: a model id (on foot), else a car */
  async function start({ pts, speed = 14, file = 'barrina', color = 0xe8e8e8, person: who = null, ease = 150 }) {
    const my = ++token;
    route = pts.map(([x, z]) => ({ x, z }));
    k = 1;
    pos = { ...route[0] };
    heading = route[1] ? Math.atan2(route[1].x - pos.x, route[1].z - pos.z) : 0;
    v = 0; vMax = speed; far = ease;
    active = true; moving = false; arrived = false;
    person = who;
    if (car) car.root.visible = false;
    if (person) return;
    if (!car || car.file !== file || car.color !== color) {
      if (car) scene.remove(car.root);
      const m = await loadModel(file, color);
      if (my !== token) return;
      car = { ...m, file, color };
    }
    car.root.visible = true;
    if (!car.root.parent) scene.add(car.root);
    place(0);
  }
  function go() { if (active) moving = true; }
  /** The pace and the easing distance of the step that sets it off (it may have been parked by an earlier one) */
  function tune({ speed, ease }) { if (speed) vMax = speed; if (ease) far = ease; }
  /** Caught before the end: it stops where it is */
  function halt() { if (!active) return; arrived = true; v = 0; place(0); }
  function stop() {
    token++;
    active = false; moving = false;
    if (car) car.root.visible = false;
    if (person) cast?.setActor(KEY, null, null);
    person = null;
  }
  // the sharpest turn over the next `ahead` metres of route (radians)
  function bendAhead(ahead) {
    let L = 0, worst = 0, h0 = heading, a = pos;
    for (let i = k; i < route.length && L < ahead; i++) {
      const b = route[i], d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < 0.5) continue;
      const h = Math.atan2(b.x - a.x, b.z - a.z);
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(h - h0), Math.cos(h - h0))));
      h0 = h; L += d; a = b;
    }
    return worst;
  }
  function left() {
    let L = 0, a = pos;
    for (let i = k; i < route.length; i++) { L += Math.hypot(route[i].x - a.x, route[i].z - a.z); a = route[i]; }
    return L;
  }
  function update(dt) {
    if (!active) return;
    if (moving && !arrived) {
      const d = distance();
      let want = vMax * (1 - Math.min(0.7, bendAhead(Math.max(12, v * 1.5)) / (Math.PI * 0.6)));
      if (d > far * 0.55) want *= THREE.MathUtils.clamp(1 - (d - far * 0.55) / (far * 0.45), 0.35, 1); // waits for a player well back
      want = Math.min(want, Math.sqrt(2 * (person ? 4 : 6) * left()) + 0.3); // and pulls up at the end
      v += THREE.MathUtils.clamp(want - v, -9 * dt, (person ? 6 : 4) * dt);
      v = Math.max(0, v);
      let move = v * dt;
      while (move > 0 && k < route.length) {
        const b = route[k], dd = Math.hypot(b.x - pos.x, b.z - pos.z);
        if (dd <= move) { pos = { x: b.x, z: b.z }; k++; move -= dd; continue; }
        pos = { x: pos.x + ((b.x - pos.x) / dd) * move, z: pos.z + ((b.z - pos.z) / dd) * move };
        move = 0;
      }
      if (k >= route.length) { arrived = true; v = 0; }
      const t = route[Math.min(k, route.length - 1)];
      if (Math.hypot(t.x - pos.x, t.z - pos.z) > 0.5) {
        const h = Math.atan2(t.x - pos.x, t.z - pos.z);
        heading += Math.atan2(Math.sin(h - heading), Math.cos(h - heading)) * Math.min(1, dt * (person ? 9 : 5));
      }
    }
    place(dt);
  }
  function place(dt) {
    if (person) {
      const p = player();
      const h = arrived ? Math.atan2(p.x - pos.x, p.z - pos.z) : heading; // caught: turns to face you
      cast?.setActor(KEY, person, { x: pos.x, y: ground(pos.x, pos.z), z: pos.z, heading: h, speed: v, ease: 7 }, arrived ? 'nervous_idle' : 'look');
      return;
    }
    if (!car) return;
    car.root.position.set(pos.x, Math.max(0, ground(pos.x, pos.z)), pos.z);
    car.root.rotation.set(0, heading, 0);
    for (const w of car.wheels) w.rotation.x += (v * dt) / 0.33;
  }
  function distance() { const p = player(); return Math.hypot(p.x - pos.x, p.z - pos.z); }

  return {
    start, go, stop, update, distance, tune, halt,
    get active() { return active; },
    get moving() { return moving; },
    get arrived() { return arrived; },
    get position() { return pos; },
    get speed() { return v; },
    /** A car's footprint (for the player to bump into), or null */
    box() { return active && !person && car ? { x: pos.x, z: pos.z, yaw: heading, halfL: 2.2, halfW: 0.95 } : null; }
  };
}
