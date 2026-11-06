// GTA Melbourne's people: realistic rigged characters from the Microsoft Rocketbox Avatar Library (MIT licence),
// converted by tools/people/ into assets/people/ (one GLB per person, and one set of motion-captured clips for men and
// one for women: idle, walk, run, sprint, talk, phone, crouch).
//
//  - The player is played by their own character.
//  - Pedestrians: the nearest few in view (14 on High graphics, 9 on Medium, 5 on Low) are drawn as these people,
//    each picked for the person by sex and role (police, gangs, office workers, tradies, everyday locals). People
//    further off stay the light procedural crowd (js/pedestrians.js). How many different people can be on screen is
//    capped by graphics level too, to keep graphics memory in check.
//  - Story characters: Vince and Kaz wait at their jobs (on the phone) and talk through the cut scene.
// Until the files load (or if they fail) everything stays as it was.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Q } from './quality.js';

const BASE = new URL('../assets/people/', import.meta.url);

// Who plays whom
export const PLAYER_MODEL = 'Male_Adult_09';
export const STORY_CAST = { Vince: 'Male_Adult_03', Kaz: 'Female_Adult_04', Mick: 'Male_Adult_05' };
const POOLS = {
  police: ['Police_Male_01', 'Police_Male_03'],
  gang: ['Male_Adult_18', 'Male_Adult_04', 'Male_Adult_10', 'Male_Adult_17'],
  male: ['Male_Adult_01', 'Male_Adult_02', 'Male_Adult_06', 'Male_Adult_07', 'Male_Adult_08', 'Male_Adult_11',
    'Male_Adult_12', 'Male_Adult_14', 'Male_Adult_16', 'Male_Adult_20', 'Business_Male_01', 'Business_Male_02', 'Business_Male_05',
    'Construction_Male_07', 'Construction_Male_08'],
  female: ['Female_Adult_01', 'Female_Adult_02', 'Female_Adult_03', 'Female_Adult_05', 'Female_Adult_06', 'Female_Adult_07',
    'Female_Adult_08', 'Female_Adult_09', 'Female_Adult_11', 'Female_Adult_12', 'Female_Adult_13', 'Female_Adult_14',
    'Female_Adult_15', 'Female_Adult_17', 'Business_Female_01', 'Business_Female_02']
};
// How many people can be drawn this way at once, and how many different ones (each brings its own textures)
const LEVEL = Q.peds >= 300 ? { actors: 14, kinds: 14, normals: true, shadows: true }
  : Q.peds >= 200 ? { actors: 9, kinds: 9, normals: true, shadows: false }
    : { actors: 5, kinds: 5, normals: false, shadows: false };
// The pools trimmed to that many kinds: a police officer and a gang member always, then men and women alternately
const ACTIVE = (() => {
  const want = Math.max(4, LEVEL.kinds);
  const out = { police: POOLS.police.slice(0, want >= 9 ? 2 : 1), gang: POOLS.gang.slice(0, want >= 9 ? 2 : 1), male: [], female: [] };
  let left = want - out.police.length - out.gang.length, i = 0;
  while (left > 0 && (i < POOLS.male.length || i < POOLS.female.length)) {
    if (i < POOLS.male.length && left > 0) { out.male.push(POOLS.male[i]); left--; }
    if (i < POOLS.female.length && left > 0) { out.female.push(POOLS.female[i]); left--; }
    i++;
  }
  return out;
})();

// Ground speeds (m/s) the clips' feet are matched to at their normal rate
const GAIT = { walk: 1.4, run: 3.3, sprint: 5.0 };

const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
/** The person who plays pedestrian i (stable), from its sex and role ('police', 'gang' or a civilian) */
export function characterFor(i, female, role) {
  const pool = role === 'police' || role === 'gang' ? ACTIVE[role] : female ? ACTIVE.female : ACTIVE.male;
  return pool[Math.floor(hash(i, 3) * pool.length) % pool.length];
}
export const isFemale = (id) => /Female/.test(id);

export function createCast({ scene, controllerManager }) {
  const loader = new GLTFLoader();
  const templates = new Map(); // id → glTF scene
  const clips = { m: null, f: null }; // name → AnimationClip
  const loading = new Map();
  function loadPerson(id) {
    if (!loading.has(id)) {
      loading.set(id, loader.loadAsync(new URL(`${id}.glb`, BASE).href).then((g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of [].concat(o.material)) {
            if (!LEVEL.normals && m.normalMap && id !== PLAYER_MODEL) { m.normalMap.dispose(); m.normalMap = null; m.needsUpdate = true; }
            if (/opacity/.test(m.name)) { m.alphaTest = 0.45; m.side = THREE.DoubleSide; } // hair and lashes
          }
        });
        templates.set(id, g.scene);
        return true;
      }).catch((e) => { console.warn('[people] could not load', id, e); return false; }));
    }
    return loading.get(id);
  }
  const loadClips = (sex) => fetch(new URL(`clips-${sex}.json`, BASE)).then((r) => r.json()).then((j) => {
    clips[sex] = Object.fromEntries(j.clips.map((c) => {
      const a = THREE.AnimationClip.parse(c);
      a.tracks = a.tracks.filter((t) => !t.name.startsWith('MotionExtractionHelper')); // a helper of the motion capture's export
      return [a.name, a];
    }));
  }).catch((e) => console.warn('[people] no clips', sex, e));
  // The story set: moods for talking and listening, gestures and idles (added to each sex's clips once loaded)
  const loadStory = (sex, set = 'story') => fetch(new URL(`${set}-${sex}.json`, BASE)).then((r) => r.json()).then((j) => {
    for (const c of j.clips) {
      const a = THREE.AnimationClip.parse(c);
      a.tracks = a.tracks.filter((t) => !t.name.startsWith('MotionExtractionHelper'));
      clips[sex][a.name] = a;
    }
  }).catch((e) => console.warn('[people] no story clips', sex, e));
  // the player and the story first, then the crowd one at a time
  (async () => {
    await Promise.all([loadClips('m'), loadClips('f'), loadPerson(PLAYER_MODEL)]);
    await Promise.all([...Object.values(STORY_CAST).map(loadPerson), loadStory('m'), loadStory('f'), loadStory('m', 'sit'), loadStory('f', 'sit')]);
    for (const id of [...ACTIVE.police, ...ACTIVE.gang, ...ACTIVE.male, ...ACTIVE.female]) await loadPerson(id);
  })();
  // gestures that play once and then hand back to whatever the person was doing
  const ONCE = new Set(['wave', 'nod', 'deny', 'shrug', 'laugh', 'cheer']);
  let clock = 0;

  // An actor: a clone of a person (sharing their meshes and textures) with its own skeleton and animation mixer
  function makeActor(id, shadow = LEVEL.shadows) {
    const tpl = templates.get(id), set = clips[isFemale(id) ? 'f' : 'm'];
    if (!tpl || !set) return null;
    const root = SkeletonUtils.clone(tpl);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // skinned: the pose moves it off its bind-pose bounds (we cull by the person instead)
      o.castShadow = shadow;
      o.receiveShadow = false;
    });
    const mixer = new THREE.AnimationMixer(root);
    const acts = {};
    for (const [name, clip] of Object.entries(set)) acts[name] = mixer.clipAction(clip);
    const group = new THREE.Group();
    group.name = `Person:${id}`;
    group.rotation.order = 'YXZ';
    group.add(root);
    group.visible = false;
    scene.add(group);
    return { id, group, root, mixer, acts, set, cur: null, heading: 0, fall: 0, owner: null, onceUntil: 0, still: 0 };
  }
  function action(a, name) {
    if (!a.acts[name] && a.set[name]) {
      a.acts[name] = a.mixer.clipAction(a.set[name]); // a story clip that arrived after this person was made
      if (ONCE.has(name)) { a.acts[name].setLoop(THREE.LoopOnce, 1); a.acts[name].clampWhenFinished = true; }
    }
    return a.acts[name];
  }
  function play(a, name, timeScale = 1, fade = 0.3) {
    // a gesture playing once finishes before anything but a new gesture (or death) takes over
    if (clock < a.onceUntil && !ONCE.has(name)) return;
    const act = action(a, name) || a.acts.idle;
    if (!act) return;
    if (a.cur !== act || ONCE.has(name) && clock >= a.onceUntil) {
      act.reset();
      act.enabled = true;
      act.setEffectiveWeight(1);
      // idles and talk start somewhere along, so a crowd doesn't move in step
      if (!ONCE.has(name) && !['walk', 'run', 'sprint'].includes(name)) act.time = Math.random() * act.getClip().duration;
      act.play();
      if (a.cur && a.cur !== act) act.crossFadeFrom(a.cur, fade, false);
      a.cur = act;
      if (ONCE.has(name)) a.onceUntil = clock + act.getClip().duration / timeScale - fade;
    }
    act.timeScale = timeScale;
  }
  /** Is this gesture or clip there (the story set loads after the basics)? */
  const has = (a, name) => !!(a.acts[name] || a.set[name]);
  /** Walk, jog, sprint or stand, at the speed v (m/s), with a margin between gaits so nobody flickers */
  function gait(a, v, idle = 'idle') {
    const s = Math.abs(v);
    const was = a.cur === a.acts.sprint ? 3 : a.cur === a.acts.run ? 2 : a.cur === a.acts.walk ? 1 : 0;
    const g = s > (was === 3 ? 4.3 : 4.8) ? 3 : s > (was >= 2 ? 2.2 : 2.6) ? 2 : s > (was >= 1 ? 0.12 : 0.25) ? 1 : 0;
    if (g === 3) play(a, 'sprint', THREE.MathUtils.clamp(s / GAIT.sprint, 0.8, 1.7));
    else if (g === 2) play(a, 'run', THREE.MathUtils.clamp(s / GAIT.run, 0.75, 1.45));
    else if (g === 1) play(a, 'walk', THREE.MathUtils.clamp(s / GAIT.walk, 0.55, 1.6));
    else play(a, has(a, idle) ? idle : 'idle');
  }
  function place(a, x, y, z, heading, dt, ease = true) {
    let d = heading - a.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.heading = ease ? a.heading + d * Math.min(1, dt * 10) : heading; // ease round rather than snap
    a.group.position.set(x, y, z);
    // the dead go down backwards over 0.55 s (there's no death clip: the body tips over and lies still)
    a.group.rotation.set(-a.fall * Math.PI * 0.5, a.heading, 0);
    a.group.position.y = y + Math.sin(a.fall * Math.PI) * 0.15 + a.fall * 0.08;
    a.group.visible = true;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pedestrians: the nearest visible ones get actors
  const free = new Map(); // id → [actors]
  let live = 0;
  const holders = new Set();
  function release(p) {
    const a = p.actor;
    if (!a) return;
    a.group.visible = false;
    a.owner = null;
    if (!free.has(a.id)) free.set(a.id, []);
    free.get(a.id).push(a);
    p.actor = null;
    holders.delete(p);
  }
  function loadedFor(p) {
    if (templates.has(p.castId)) return p.castId;
    const pool = p.role === 'police' || p.role === 'gang' ? ACTIVE[p.role] : isFemale(p.castId) ? ACTIVE.female : ACTIVE.male;
    return pool.find((id) => templates.has(id)) || null;
  }
  function acquire(p) {
    const id = loadedFor(p);
    if (!id) return false;
    let a = free.get(id)?.pop();
    if (!a) {
      if (live >= LEVEL.actors + 3) return false;
      a = makeActor(id);
      if (!a) return false;
      live++;
    }
    a.owner = p;
    a.heading = p.castHeading ?? 0;
    a.fall = p.dead ? 1 : 0;
    a.cur = null;
    a.mixer.stopAllAction();
    p.actor = a;
    holders.add(p);
    return true;
  }
  /** Each frame: the placed, visible people with their squared distance from the focus. The nearest hold actors */
  function assign(candidates) {
    if (!templates.size || !clips.m) return;
    candidates.sort((a, b) => a.d2 - b.d2);
    const near = candidates.filter((c) => c.d2 < 60 * 60);
    const keep = new Set();
    // those who have one keep it while they're among the nearest few more than fit (no swapping at the cut-off)
    near.slice(0, LEVEL.actors + 3).forEach((c) => { if (c.p.actor && keep.size < LEVEL.actors) keep.add(c.p); });
    for (const c of near) { if (keep.size >= LEVEL.actors) break; keep.add(c.p); }
    for (const p of [...holders]) if (!keep.has(p)) release(p);
    for (const p of keep) if (!p.actor) acquire(p);
  }
  function posePed(p, y, heading, dt, { dead = false, talking = false, scared = false } = {}) {
    const a = p.actor;
    if (!a) return;
    if (dead) {
      a.fall = Math.min(1, a.fall + dt / 0.55);
      if (a.cur) a.cur.timeScale = Math.max(0, 1 - a.fall * 2); // the motion stops as they go down
    } else {
      a.fall = 0;
      if (talking) {
        // two people talking take turns, every few seconds: one speaks with their hands, the other listens and nods
        const turn = Math.floor((clock + (p.index % 7)) / 4.5) % 2 === (p.index % 2);
        if (turn) play(a, pick(p.index, ['talk', 'talk_cool', 'talk_excited', 'talk']).find((n) => has(a, n)) || 'talk');
        else if (clock >= a.onceUntil && Math.random() < dt * 0.25 && has(a, 'nod')) play(a, 'nod');
        else play(a, has(a, 'listen') ? 'listen' : 'idle');
      } else {
        // standing about, each in their own way: police and gangs look about or glare, others wait, text or look round
        const idles = p.role === 'police' ? ['look', 'idle'] : p.role === 'gang' ? ['angry_idle', 'text', 'idle']
          : ['idle', 'wait', 'text', 'look', 'phone', 'idle'];
        gait(a, scared ? Math.max(p.v || 0, 3.5) : p.v || 0, idles[p.index % idles.length]);
      }
    }
    p.castHeading = heading;
    place(a, p.x, y, p.z, dead ? a.heading : heading, dt);
    a.mixer.update(dt);
  }
  function drop(p) { release(p); }
  // a stable pick for person i from a list, rotated so neighbours differ (returned as a list to try in order)
  const pick = (i, list) => [...list.slice(i % list.length), ...list.slice(0, i % list.length)];

  // ---------------------------------------------------------------------------------------------------------------
  // The player
  let playerActor = null, playerAction = null;
  /** What the player does while standing (a cut scene's listen, talk or nod; a cheer): null hands back to the gait */
  function setPlayerAction(name) {
    playerAction = name;
    if (name && ONCE.has(name) && playerActor) play(playerActor, name);
  }
  function posePlayer(dt) {
    const p = controllerManager?.entities?.person;
    if (!p) return;
    if (!playerActor) {
      playerActor = makeActor(PLAYER_MODEL, true);
      if (!playerActor) return;
    }
    if (playerSeat) {
      const a = playerActor, s = playerSeat;
      p.castModel = controllerManager.activeMode === 'person';
      play(a, has(a, playerSeatAnim) ? playerSeatAnim : has(a, 'sit') ? 'sit' : 'idle');
      place(a, s.x, s.y, s.z, s.heading, dt, false);
      a.mixer.update(dt);
      return;
    }
    if (controllerManager.activeMode !== 'person') {
      playerActor.group.visible = false;
      p.castModel = false;
      return;
    }
    p.castModel = true; // controllers.js stops drawing its procedural stand-in
    const a = playerActor;
    a.still = Math.abs(p.speed) < 0.1 ? a.still + dt : 0;
    if (playerAction && Math.abs(p.speed) < 0.3) play(a, has(a, playerAction) ? playerAction : 'idle');
    else {
      if (Math.abs(p.speed) >= 0.3) playerAction = null;
      // standing a while, they look about, then wait
      gait(a, p.speed, a.still > 14 ? 'wait' : a.still > 5 ? 'look' : 'idle');
    }
    place(a, p.position.x, p.position.y, p.position.z, p.heading, dt, false); // the controller already eases the heading
    a.mixer.update(dt);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Story characters at their jobs: on the phone while they wait, talking through the cut scene, facing the player
  const story = {};
  function setGiver(name, at = null, face = null, mood = null, dt = 0) {
    for (const [n, a] of Object.entries(story)) if (a && !a.seat && (n !== name || !at)) a.group.visible = false;
    if (!name || !at) return;
    const id = STORY_CAST[name];
    if (!id) return;
    if (!story[name]) {
      story[name] = makeActor(id, true);
      if (!story[name]) return;
    }
    const a = story[name];
    const heading = face ? Math.atan2(face.x - at.x, face.z - at.z) : a.heading;
    // waiting: on the phone until the player comes into view, then a wave, then impatient; in the cut scene, the mood
    // the story gives each line (talking or listening)
    const near = face && Math.hypot(face.x - at.x, face.z - at.z) < 28;
    if (mood && mood !== a.mood) a.onceUntil = 0; // a line of the story takes over from a wave at once
    a.mood = mood;
    if (mood) play(a, has(a, mood) ? mood : mood.startsWith('talk') ? 'talk' : 'idle');
    else if (near && !a.waved && has(a, 'wave')) { a.waved = true; play(a, 'wave'); }
    else play(a, near ? (name === 'Kaz' ? 'angry_idle' : 'wait') : 'phone');
    if (!near) a.waved = false;
    place(a, at.x, at.y ?? 0, at.z, heading, dt || 0.016);
    a.mixer.update(dt);
  }

  // Story characters sitting down (the café scene): at a seat { x, y, z, heading } playing a seated clip; null: gone
  function setSeated(name, seat, anim = 'sit') {
    const id = STORY_CAST[name];
    if (!id) return;
    if (!seat) { if (story[name]) { story[name].seat = null; story[name].group.visible = false; } return; }
    if (!story[name]) {
      story[name] = makeActor(id, true);
      if (!story[name]) return;
    }
    const a = story[name];
    a.seat = seat;
    play(a, has(a, anim) ? anim : has(a, 'sit') ? 'sit' : 'idle');
    a.heading = seat.heading;
    place(a, seat.x, seat.y, seat.z, seat.heading, 0.016, false);
  }
  function animateSeated(dt) {
    for (const a of Object.values(story)) if (a && a.seat && a.group.visible) a.mixer.update(dt);
  }
  // The player sitting down (a scene): drawn at the seat whatever mode they're in
  let playerSeat = null, playerSeatAnim = 'sit';
  function setPlayerSeat(seat, anim = 'sit') { playerSeat = seat; playerSeatAnim = anim; }

  return {
    setSeated,
    setPlayerSeat,
    get ready() { return templates.has(PLAYER_MODEL) && !!clips.m; },
    get loaded() { return [...templates.keys()]; },
    level: LEVEL,
    active: ACTIVE,
    assign,
    posePed,
    drop,
    posePlayer,
    setGiver,
    get actors() { return live; },
    setPlayerAction,
    /** for checks: what the player and the story characters are playing */
    debug() {
      const name = (a) => a?.cur?.getClip().name || '-';
      return { player: name(playerActor), ...Object.fromEntries(Object.entries(story).map(([n, a]) => [n, a.group.visible ? name(a) : 'hidden'])) };
    },
    /** advance the cast's clock (gestures time out on it) */
    tick(dt) { clock += dt; animateSeated(dt); }
  };
}

// The pedestrian system lives inside the traffic system, made before the cast: it finds the cast here
export const castHook = { cast: null };
