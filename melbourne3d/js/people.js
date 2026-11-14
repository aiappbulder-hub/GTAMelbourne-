// GTA Melbourne's people: realistic rigged characters from the Microsoft Rocketbox Avatar Library (MIT licence),
// converted by tools/people/ into assets/people/ (one GLB per person, and one set of motion-captured clips for men and
// one for women: idle, walk, run, sprint, talk, phone, crouch).
//
//  - The player is played by their own character.
//  - The street crowd is the procedural people of js/pedestrians.js (their walking is generated, with feet planted, and
//    never loops; they cost little). The code to draw the nearest of them as these people is kept (CROWD), switched off.
//  - Story characters: Vince and Kaz wait at their jobs (on the phone) and talk through the cut scene.
// Until the files load (or if they fail) everything stays as it was.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Q } from './quality.js';
import { WEAPON_BY_ID, buildWeaponModel } from './weapons.js';

const BASE = new URL('../assets/people/', import.meta.url);

// Who plays whom
export const PLAYER_MODEL = 'Male_Adult_09';
// The cast are Ara 3D Gen characters (tools/ara/, assets/ara/: realistic MakeHuman people, CC0, with motion-captured
// clips and facial blend shapes in their own files). ?classic brings back the Rocketbox ones
const ARA_BASE = new URL('../assets/ara/', import.meta.url);
const CLASSIC = typeof location !== 'undefined' && new URLSearchParams(location.search).has('classic');
const PLAYER = CLASSIC ? PLAYER_MODEL : 'ara:player';
// Ara's clip names for the game's. Several of the game's moods share one capture (all the talking to Talk, all the
// sitting to the chair idle); anything not here (on the phone, listening, nods) plays the idle
const ARA_CLIPS = { idle: 'Idle', walk: 'Walk', run: 'Run', sprint: 'Run', back: 'Walk backwards', strafe_left: 'Strafe left',
  strafe_right: 'Strafe right', turn_left: 'Turn left 90°', turn_right: 'Turn right 90°',
  talk: 'Talk', talk_cool: 'Talk', talk_assured: 'Talk', talk_angry: 'Talk', talk_excited: 'Talk', talk_nervous: 'Talk',
  wave: 'Wave', cheer: 'Cheer', laugh: 'Laugh',
  sit: 'Sit idle (chair)', sit_listen: 'Sit idle (chair)', sit_look: 'Sit idle (chair)', sit_talk: 'Sit idle (chair)', sit_think: 'Sit idle (chair)',
  ready: 'Pistol idle (low ready)', aim: 'Pistol aim', fire: 'Pistol fire', hit: 'Hit from front', die: 'Death (fall backward)', getup: 'Get up (from back)' };
const ARA_GAIT = { walk: 1.3, run: 3.4, sprint: 3.4 }; // the motion capture's ground speeds (m/s)
// (Act I's people are Rocketbox bodies for now; each loads when their job first wants them)
const ACT1_CAST = { Gus: 'Male_Adult_07', Ruby: 'Business_Female_01', Nico: 'Male_Adult_04', Marsh: 'Business_Female_02', Terry: 'Business_Male_02',
  Sully: 'Male_Adult_12', Bianca: 'Female_Adult_06', Shooter: 'Male_Adult_18', Bouncer: 'Male_Adult_17' };
const EAGER_CAST = ['Vince', 'Kaz', 'Mick'];
export const STORY_CAST = CLASSIC ? { Vince: 'Male_Adult_03', Kaz: 'Female_Adult_04', Mick: 'Male_Adult_05', Davo: 'Male_Adult_10', ...ACT1_CAST }
  : { Vince: 'ara:vince', Kaz: 'ara:kaz', Mick: 'ara:mick', Davo: 'ara:davo', ...ACT1_CAST };
const POOLS = {
  police: CLASSIC ? ['Police_Male_01', 'Police_Male_03'] : ['ara:sgt', 'ara:cons'], // Kestrel's own: a sergeant and a constable
  gang: ['Male_Adult_04', 'Male_Adult_10'],
  male: ['Male_Adult_03', 'Male_Adult_05', 'Male_Adult_09', 'Male_Adult_14'],
  female: ['Female_Adult_04', 'Female_Adult_09']
};
// How many people can be drawn this way at once, and how many different ones (each brings its own textures)
const LEVEL = Q.peds >= 300 ? { actors: 24, kinds: 16, normals: true, shadows: true, range: 80 }
  : Q.peds >= 200 ? { actors: 14, kinds: 10, normals: true, shadows: false, range: 65 }
    : { actors: 7, kinds: 6, normals: false, shadows: false, range: 50 };
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

// Rocketbox people in the street crowd too (the nearest few)? Off: the procedural crowd moves better and costs less
const CROWD = false;

// Ground speeds (m/s) the clips' feet are matched to at their normal rate
const GAIT = { walk: 1.4, run: 3.3, sprint: 5.0 };

const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
/** The person who plays pedestrian i (stable), from its sex and role ('police', 'gang' or a civilian) */
export function characterFor(i, female, role) {
  const pool = role === 'police' || role === 'gang' ? ACTIVE[role] : female ? ACTIVE.female : ACTIVE.male;
  return pool[Math.floor(hash(i, 3) * pool.length) % pool.length];
}
export const isFemale = (id) => /Female/.test(id) || id === 'ara:kaz' || id === 'ara:cons';

// The captured "Sit idle (chair)" is a 1.6 s loop with the hips and legs swaying about +-8 degrees, so anyone seated rocks in
// their chair. Hold the pelvis, legs and spine still at the clip's average pose; the neck, head and arms keep a gentle
// share of their motion (the talk and listen gestures)
const SEAT_STILL = /^(Hips|Spine\d?|.*UpLeg|.*Leg|.*Foot|.*ToeBase|.*Shoulder)\./;
function calmSeat(clip) {
  for (const t of clip.tracks) {
    const size = t.getValueSize(), n = t.times.length;
    if (!/\.(quaternion|position)$/.test(t.name) || n < 2) continue;
    const k = SEAT_STILL.test(t.name) ? 0 : /^(Neck|Head)\./.test(t.name) ? 0.6 : 0.4;
    const mean = new Array(size).fill(0);
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) mean[c] += t.values[i * size + c] / n;
    if (size === 4) { const l = Math.hypot(...mean) || 1; for (let c = 0; c < 4; c++) mean[c] /= l; }
    for (let i = 0; i < n; i++) {
      const v = new Array(size);
      for (let c = 0; c < size; c++) v[c] = mean[c] + (t.values[i * size + c] - mean[c]) * k;
      if (size === 4) { const l = Math.hypot(...v) || 1; for (let c = 0; c < 4; c++) v[c] /= l; }
      for (let c = 0; c < size; c++) t.values[i * size + c] = v[c];
    }
  }
}

export function createCast({ scene, controllerManager }) {
  const loader = new GLTFLoader();
  const templates = new Map(); // id → glTF scene
  const ownClips = new Map(); // id → its own clips by the game's names (Ara characters)
  const clips = { m: null, f: null }; // name → AnimationClip
  const loading = new Map();
  function loadPerson(id) {
    if (!loading.has(id)) {
      const ara = id.startsWith('ara:');
      const url = ara ? new URL(`${id.slice(4)}${Q.peds < 200 ? '-low' : ''}.glb`, ARA_BASE) : new URL(`${id}.glb`, BASE);
      loading.set(id, loader.loadAsync(url.href).then(async (g) => {
        if (ara && g.animations.length) {
          const byName = Object.fromEntries(g.animations.map((c) => [c.name, c]));
          if (byName['Sit idle (chair)']) calmSeat(byName['Sit idle (chair)']);
          ownClips.set(id, Object.fromEntries(Object.entries(ARA_CLIPS).filter(([, n]) => byName[n]).map(([k, n]) => [k, byName[n]])));
        } else if (ara) {
          // no clips of their own: the player's (the same rig), the hips' travel scaled to this body's leg length
          await loadPerson('ara:player');
          const hipY = (root) => root?.getObjectByName('Hips')?.position.y || 0;
          const base = templates.get('ara:player'), mine = hipY(g.scene), theirs = hipY(base);
          const r = mine > 0 && theirs > 0 ? mine / theirs : 1;
          // the face's track names the player's meshes: these are this body's (the same parts, in the same order)
          const morphs = (root) => { const out = new Map(); root.traverse((o) => { if (o.morphTargetDictionary && o.material) out.set(o.material.name, o.name); }); return out; };
          const theirsM = morphs(base), mineM = morphs(g.scene);
          const rename = new Map([...theirsM].filter(([m]) => mineM.has(m)).map(([m, n]) => [n, mineM.get(m)]));
          const scaled = new Map();
          ownClips.set(id, Object.fromEntries(Object.entries(ownClips.get('ara:player') || {}).map(([k, c]) => {
            if (!scaled.has(c)) {
              const copy = c.clone();
              for (const t of copy.tracks) {
                if (t.name.endsWith('.position')) t.values = t.values.map((v) => v * r);
                const dot = t.name.indexOf('.morphTargetInfluences');
                if (dot > 0) t.name = (rename.get(t.name.slice(0, dot)) || '__none') + t.name.slice(dot); // (a part this body hasn't got: unbound)
              }
              copy.tracks = copy.tracks.filter((t) => !t.name.startsWith('__none'));
              scaled.set(c, copy);
            }
            return [k, scaled.get(c)];
          })));
        }
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of [].concat(o.material)) {
            if (!LEVEL.normals && m.normalMap && id !== PLAYER) { m.normalMap.dispose(); m.normalMap = null; m.needsUpdate = true; }
            if (/opacity/.test(m.name)) { m.alphaTest = 0.45; m.side = THREE.DoubleSide; } // hair and lashes
            if (ara && m.alphaTest > 0) m.alphaToCoverage = true; // Ara's hair cards: soft strand edges with MSAA, not a hard cut
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
    await Promise.all([loadClips('m'), loadClips('f'), loadPerson(PLAYER)]);
    // (Davo is one job's: he loads when it wants him)
    await Promise.all([...EAGER_CAST.map((n) => loadPerson(STORY_CAST[n])), loadStory('m'), loadStory('f'), loadStory('m', 'sit'), loadStory('f', 'sit')]);
    storyLoaded = true;
    // (the street crowd is the procedural people of js/pedestrians.js: their walking is generated, feet planted, never
    // looping, and they cost little; Rocketbox people are for the story's cast, where faces matter. Extras for a scene
    // load when the scene first wants them, in setActor)
  })();
  // gestures that play once and then hand back to whatever the person was doing
  const ONCE = new Set(['wave', 'nod', 'deny', 'shrug', 'laugh', 'cheer']);
  // Clips that would visibly come round again (idles, talking, listening, sitting: motion capture cut to a length, not
  // made to loop): just before one ends, the person drifts into another from its group instead
  const VARIANTS = {
    idle: ['idle', 'wait', 'look'], wait: ['wait', 'idle', 'look'], look: ['look', 'idle', 'wait'], text: ['text', 'idle', 'look'],
    phone: ['phone', 'text'], angry_idle: ['angry_idle', 'look', 'idle'], nervous_idle: ['nervous_idle', 'idle', 'look'],
    talk: ['talk', 'talk_cool', 'talk_assured'], talk_cool: ['talk_cool', 'talk', 'talk_assured'], talk_assured: ['talk_assured', 'talk', 'talk_cool'],
    talk_angry: ['talk_angry', 'talk_assured'], talk_excited: ['talk_excited', 'talk_cool', 'talk'], talk_nervous: ['talk_nervous', 'talk'],
    listen: ['listen', 'idle'], listen_angry: ['listen_angry', 'listen'],
    sit: ['sit', 'sit_listen', 'sit_look'], sit_listen: ['sit_listen', 'sit', 'sit_look'], sit_look: ['sit_look', 'sit_listen', 'sit'],
    sit_talk: ['sit_talk', 'sit_think'], sit_think: ['sit_think', 'sit_talk']
  };
  let clock = 0;

  // An actor: a clone of a person (sharing their meshes and textures) with its own skeleton and animation mixer
  function makeActor(id, shadow = LEVEL.shadows) {
    const tpl = templates.get(id), set = ownClips.get(id) || clips[isFemale(id) ? 'f' : 'm'];
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
    for (const [name, clip] of Object.entries(set)) {
      acts[name] = mixer.clipAction(clip);
      if (ONCE.has(name)) { acts[name].setLoop(THREE.LoopOnce, 1); acts[name].clampWhenFinished = true; } // a gesture plays once
    }
    // the face's blend shapes (Ara characters): for blinking
    const faces = [];
    root.traverse((o) => { if (o.morphTargetDictionary && o.morphTargetDictionary.eyeBlinkLeft !== undefined) faces.push(o); });
    const group = new THREE.Group();
    group.name = `Person:${id}`;
    group.rotation.order = 'YXZ';
    group.add(root);
    group.visible = false;
    scene.add(group);
    const ara = ownClips.has(id);
    return { id, group, root, mixer, acts, set, cur: null, heading: 0, fall: 0, owner: null, onceUntil: 0, still: 0,
      ara, faces, gaitSpeed: ara ? ARA_GAIT : GAIT, blinkAt: 1 + Math.random() * 3, blinkT: -1, lastHeading: null, turnT: 0 };
  }
  function action(a, name) {
    if (!a.acts[name] && a.set[name]) {
      a.acts[name] = a.mixer.clipAction(a.set[name]); // a story clip that arrived after this person was made
      if (ONCE.has(name)) { a.acts[name].setLoop(THREE.LoopOnce, 1); a.acts[name].clampWhenFinished = true; }
    }
    return a.acts[name];
  }
  // a name with no clip for this body plays the idle (never a frozen pose); each is named once in the console. Ara's bodies
  // have no phone, listening or fidget clips by design (ARA_CLIPS), so those are not reported for them
  let storyLoaded = false;
  const missing = new Map(); // body id → names asked for with no clip
  const ARA_OK = new Set(['phone', 'text', 'look', 'wait', 'listen', 'listen_angry', 'angry_idle', 'nervous_idle', 'thoughtful', 'nod', 'deny', 'shrug', 'crouch']);
  function noteMissing(a, name) {
    if (!storyLoaded || a.ara && ARA_OK.has(name)) return;
    let set = missing.get(a.id);
    if (!set) missing.set(a.id, set = new Set());
    if (set.has(name)) return;
    set.add(name);
    console.warn(`[people] ${a.id} has no "${name}" clip: playing the idle instead. Missing for it so far: ${[...set].join(', ')}`);
  }
  function play(a, name, timeScale = 1, fade = 0.3) {
    // a gesture playing once finishes before anything but a new gesture (or death) takes over; walking cuts it short
    const moving = name === 'walk' || name === 'run' || name === 'sprint';
    if (moving) a.onceUntil = 0;
    if (clock < a.onceUntil && !ONCE.has(name)) return;
    if (ONCE.has(name) && !has(a, name)) return; // a gesture this person hasn't got (Ara's: no nod or shrug)
    let act;
    const group = VARIANTS[name];
    if (group && a.logical === name && a.cur && group.some((n) => a.acts[n] === a.cur)) {
      // still doing the same thing: keep the clip going, and near its end slip into another of its kind
      act = a.cur;
      if (act.time > act.getClip().duration - 1.0) {
        const opts = group.filter((n) => has(a, n) && action(a, n) !== act);
        if (opts.length) { act = action(a, opts[Math.floor(Math.random() * opts.length)]); fade = 0.9; }
      }
    } else { act = action(a, name); if (!act) { noteMissing(a, name); act = a.acts.idle; } }
    const again = a.logical === name; // (a gesture still being asked for after it ended stays at its last frame, no restart)
    a.logical = name;
    if (!act) return;
    if (a.cur !== act || ONCE.has(name) && clock >= a.onceUntil && !again) {
      act.reset();
      act.enabled = true;
      act.setEffectiveWeight(1);
      // idles and talk start somewhere in their first half, so a crowd doesn't move in step (and there's time before
      // the next change)
      if (!ONCE.has(name) && !['walk', 'run', 'sprint'].includes(name)) act.time = Math.random() * act.getClip().duration * 0.5;
      act.play();
      if (a.cur && a.cur !== act) act.crossFadeFrom(a.cur, fade, false);
      a.cur = act;
      if (ONCE.has(name)) a.onceUntil = clock + act.getClip().duration / timeScale - fade;
    }
    // the playback rate eases towards the wanted one (a sudden change makes the feet skip)
    act.timeScale = a.cur === act && act.timeScale > 0 ? act.timeScale + (timeScale - act.timeScale) * 0.12 : timeScale;
  }
  /** Is this gesture or clip there (the story set loads after the basics)? */
  const has = (a, name) => !!(a.acts[name] || a.set[name]);
  /** Walk, jog, sprint or stand, at the speed v (m/s), with a margin between gaits so nobody flickers */
  function gait(a, v, idle = 'idle') {
    const s = Math.abs(v);
    const was = a.cur === a.acts.sprint ? 3 : a.cur === a.acts.run ? 2 : a.cur === a.acts.walk ? 1 : 0;
    const g = s > (was === 3 ? 6.2 : 6.8) ? 3 : s > (was >= 2 ? 2.2 : 2.6) ? 2 : s > (was >= 1 ? 0.12 : 0.25) ? 1 : 0;
    const G = a.gaitSpeed || GAIT;
    if (g === 3) play(a, 'sprint', THREE.MathUtils.clamp(s / G.sprint, 0.8, 2.0));
    else if (g === 2) play(a, 'run', THREE.MathUtils.clamp(s / G.run, 0.75, 1.45));
    else if (g === 1) play(a, 'walk', THREE.MathUtils.clamp(s / G.walk, 0.55, 1.6));
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
    a.fresh = true; // the first pose snaps to the person's heading (no spin round from wherever the actor last faced)
    a.cur = null;
    a.mixer.stopAllAction();
    p.actor = a;
    holders.add(p);
    return true;
  }
  /** Each frame: the placed, visible people with their squared distance from the focus. The nearest hold actors */
  function assign(candidates) {
    if (!CROWD) return; // the crowd stays procedural
    if (!templates.size || !clips.m) return;
    candidates.sort((a, b) => a.d2 - b.d2);
    const near = candidates.filter((c) => c.d2 < LEVEL.range * LEVEL.range);
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
    place(a, p.x, y, p.z, dead ? a.heading : heading, dt, !a.fresh);
    a.fresh = false;
    a.mixer.update(dt);
  }
  function drop(p) { release(p); }
  // a stable pick for person i from a list, rotated so neighbours differ (returned as a list to try in order)
  const pick = (i, list) => [...list.slice(i % list.length), ...list.slice(0, i % list.length)];

  // ---------------------------------------------------------------------------------------------------------------
  // Guns in hands (the player's and armed hostiles'): the models of js/weapons.js (pointing down +z, the origin in the right
  // palm), drawn each frame in the hand (or at the shoulder for the long guns), the arms solved to hold them
  const newGunState = () => ({ id: 'pistol', armed: false, aiming: false, yaw: 0, pitch: 0, raise: 0, drawK: 1, shownId: null, models: {},
    muzzle: new THREE.Vector3(), muzzleValid: false, punch: 0, punchLeft: false, kick: 0 });
  const weapon = newGunState(); // the player's
  const gunModel = (gs, id) => {
    let g = gs.models[id];
    if (!g) { g = buildWeaponModel(id); g.visible = false; scene.add(g); gs.models[id] = g; }
    return g;
  };
  const hideGuns = (gs) => { for (const g of Object.values(gs.models)) g.visible = false; gs.muzzleValid = false; };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
  // turn bone so the direction to child points along dir (world), by w (0..1)
  function pointBone(bone, child, dir, w) {
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(false, false);
    bone.getWorldPosition(_a);
    child.getWorldPosition(_b);
    _c.subVectors(_b, _a).normalize();
    _q.setFromUnitVectors(_c, dir);
    if (w < 1) _q.slerp(_qw.identity(), 1 - w);
    bone.getWorldQuaternion(_qw);
    _qw.premultiply(_q);
    bone.parent.getWorldQuaternion(_qp);
    bone.quaternion.copy(_qp.invert().multiply(_qw));
    bone.updateWorldMatrix(false, true);
  }
  const MIXAMO = { R_UpperArm: 'RightArm', R_Forearm: 'RightForeArm', R_Hand: 'RightHand', L_UpperArm: 'LeftArm', L_Forearm: 'LeftForeArm', L_Hand: 'LeftHand' };
  const bonesOf = (a) => a.bones || (a.bones = Object.fromEntries(['R_UpperArm', 'R_Forearm', 'R_Hand', 'L_UpperArm', 'L_Forearm', 'L_Hand']
    .map((n) => [n, a.root.getObjectByName(`Bip01_${n}`) || a.root.getObjectByName(MIXAMO[n])])));
  // A face that lives (Ara characters' blend shapes): a blink every 2-6 s, the lids closing and opening over 0.16 s, on top
  // of whatever the clip does with the face
  let voiceLevel = 0; // the story voices' loudness (main.js passes it each frame)
  function faceLife(a, dt, speaks = true) {
    if (!a.faces || !a.faces.length) return;
    // talking (their line playing): the jaw and lips follow the voice's loudness, the mouth shape changing every
    // ~0.1 s between open vowels and closed consonants
    const talking = speaks && /^(sit_)?talk/.test(a.logical || '') && voiceLevel > 0.02;
    const want = talking ? Math.min(1, voiceLevel * 1.6) : 0;
    a.mouth = (a.mouth || 0) + (want - (a.mouth || 0)) * Math.min(1, dt * 18);
    a.shapeT = (a.shapeT || 0) - dt;
    if (a.shapeT <= 0) { a.shapeT = 0.08 + Math.random() * 0.07; a.shape = ['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_I', 'viseme_U', 'viseme_PP', 'viseme_FF', 'viseme_DD'][Math.floor(Math.random() * 8)]; }
    a.blinkAt -= dt;
    if (a.blinkAt <= 0 && a.blinkT < 0) { a.blinkT = 0; a.blinkAt = 2 + Math.random() * 4; }
    let v = 0;
    // (the first frame of a blink always shuts the lids, so a slow frame rate never skips it)
    if (a.blinkT >= 0) { v = a.blinkT === 0 ? 1 : Math.sin(Math.min(1, a.blinkT / 0.16) * Math.PI); a.blinkT += dt; if (a.blinkT >= 0.16) a.blinkT = -1; }
    for (const o of a.faces) {
      const d = o.morphTargetDictionary, w = o.morphTargetInfluences;
      for (const k of ['eyeBlinkLeft', 'eyeBlinkRight']) if (d[k] !== undefined) w[d[k]] = Math.max(w[d[k]], v);
      if (a.mouth > 0.01 || a.mouthWas) {
        for (const k in d) if (k.startsWith('viseme_')) w[d[k]] = 0;
        if (d.jawOpen !== undefined) w[d.jawOpen] = a.mouth * 0.45;
        if (a.shape && d[a.shape] !== undefined) w[d[a.shape]] = a.mouth * 0.8;
        a.mouthWas = a.mouth > 0.01;
      }
    }
  }
  // A mobile phone: on a call (the hand at the ear) or texting (held in front of the chest, screen up). Ara people have no
  // phone capture, so the right arm is solved to it over whatever the clip does (two bones: shoulder to elbow to hand)
  const phoneBody = new THREE.MeshStandardNodeMaterial({ color: 0x15161a, roughness: 0.3, metalness: 0.6 });
  const phoneGlass = new THREE.MeshStandardNodeMaterial({ color: 0x0b1424, roughness: 0.08, metalness: 0.1, emissive: 0x1d3150, emissiveIntensity: 0.6 });
  function makePhone() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.15, 0.009), phoneBody);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.138), phoneGlass);
    sc.position.z = 0.0047;
    g.add(b, sc);
    g.name = 'Phone';
    g.visible = false;
    scene.add(g);
    return g;
  }
  const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
  function posePhone(a, dt) {
    const want = a.ara && (a.logical === 'phone' || a.logical === 'text') ? 1 : 0;
    a.phoneW = (a.phoneW || 0) + (want - (a.phoneW || 0)) * Math.min(1, dt * 6);
    if (a.phone) a.phone.visible = false;
    if (a.phoneW < 0.02) return;
    const B = bonesOf(a);
    const head = a.head || (a.head = a.root.getObjectByName('Head'));
    const chest = a.chest || (a.chest = a.root.getObjectByName('Spine2') || a.root.getObjectByName('Spine1'));
    if (!B.R_UpperArm || !B.R_Forearm || !B.R_Hand || !head || !chest) return;
    a.group.updateMatrixWorld(true);
    const h = a.heading, fwd = _f.set(Math.sin(h), 0, Math.cos(h)), right = _r.set(-Math.cos(h), 0, Math.sin(h));
    const S = B.R_UpperArm.getWorldPosition(new THREE.Vector3()), E0 = B.R_Forearm.getWorldPosition(new THREE.Vector3()), H0 = B.R_Hand.getWorldPosition(new THREE.Vector3());
    const L1 = S.distanceTo(E0), L2 = E0.distanceTo(H0);
    const texting = a.logical === 'text';
    // where the wrist goes: beside the ear (the phone then sits on the cheek), or out in front of the chest
    // (both from the head: on a call the wrist just under and beside the ear; texting, at the height of the lower chest a
    // forearm's length in front, where the eyes look down at it)
    const T = texting ? head.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.3).addScaledVector(right, 0.04).add(_e.set(0, -0.3, 0))
      : head.getWorldPosition(new THREE.Vector3()).addScaledVector(right, 0.08).addScaledVector(fwd, 0.04).add(_e.set(0, -0.13, 0));
    // the elbow: down, out to the side and (texting) back, on the circle the two lengths allow
    const d = Math.min(S.distanceTo(T), L1 + L2 - 1e-3), dir = new THREE.Vector3().subVectors(T, S).normalize();
    const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), up = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, texting ? 0.35 : 0.9).addScaledVector(fwd, texting ? -0.3 : 0.15);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir, along).addScaledVector(pole, up);
    pointBone(B.R_UpperArm, B.R_Forearm, elbow.sub(S).normalize(), a.phoneW);
    const E = B.R_Forearm.getWorldPosition(new THREE.Vector3());
    pointBone(B.R_Forearm, B.R_Hand, T.clone().sub(E).normalize(), a.phoneW);
    // the fingers round the phone: up the side of the head on a call, forwards texting
    const mid = a.midFinger || (a.midFinger = a.root.getObjectByName('RightHandMiddle1'));
    if (mid) pointBone(B.R_Hand, mid, (texting ? fwd.clone().add(_e.set(0, 0.35, 0)) : _e.set(0, 1, 0).addScaledVector(fwd, -0.25).addScaledVector(right, -0.15)).normalize(), a.phoneW);
    B.R_Hand.updateWorldMatrix(true, false);
    if (a.phoneW < 0.6) return;
    // the phone in the palm, screen to the face
    const ph = a.phone || (a.phone = makePhone());
    const hand = B.R_Hand.getWorldPosition(new THREE.Vector3());
    const handDir = mid ? mid.getWorldPosition(new THREE.Vector3()).sub(hand).normalize() : hand.clone().sub(E).normalize();
    ph.position.copy(hand).addScaledVector(handDir, 0.07);
    if (texting) ph.position.y += 0.025; else ph.position.addScaledVector(right, -0.02); // (on the palm side, against the cheek)
    const face = head.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, texting ? 0.05 : 0.04);
    ph.up.copy(texting ? fwd : _u);
    ph.lookAt(face);
    ph.visible = a.group.visible;
    ph.updateMatrixWorld(true);
  }
  const smoothK = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
  // Holding the weapon gs describes (the player's, or a hostile's): the model in the hand (a short draw when the weapon
  // changes: it rises from the hip and the arms come up), the arms solved to hold it, the muzzle for the flash and tracers.
  //  - the pistol: the right arm straight along the aim, the left hand coming under it when aimed; lowered, it hangs
  //    along the forearm
  //  - the long guns: held at the shoulder (stock in, muzzle along the aim) when aimed, across the chest muzzle down when
  //    not; both hands are solved to it (the right to the grip, the left to the fore-end)
  //  - fists: a punch is the arm solved out in front over the swing; aimed, both fists up
  function poseGun(a, gs, dt) {
    hideGuns(gs);
    gs.kick = Math.max(0, gs.kick - dt * 7);
    const spec = WEAPON_BY_ID[gs.id];
    if (!gs.armed || !spec) { gs.raise = 0; gs.shownId = null; return; }
    if (gs.shownId !== gs.id) { gs.shownId = gs.id; gs.drawK = 0; }
    gs.drawK = Math.min(1, gs.drawK + dt / 0.32);
    const draw = smoothK(gs.drawK);
    gs.raise += ((gs.aiming ? 1 : 0) - gs.raise) * Math.min(1, dt * 14);
    const B = bonesOf(a);
    if (!B.R_Hand || !B.R_Forearm || !B.R_UpperArm) return;
    const pitch = gs.pitch + gs.kick * (spec.kick ? 3 : 1.5) * 0.06;
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.sin(gs.yaw) * cp, Math.sin(pitch) - 0.04, Math.cos(gs.yaw) * cp).normalize();
    const fw = new THREE.Vector3(Math.sin(gs.yaw), 0, Math.cos(gs.yaw)), right = new THREE.Vector3(-Math.cos(gs.yaw), 0, Math.sin(gs.yaw));
    if (spec.melee) {
      const head = a.head || (a.head = a.root.getObjectByName('Head'));
      if (!head) return;
      const H = head.getWorldPosition(new THREE.Vector3());
      const guard = gs.raise > 0.3 || gs.punch > 0;
      if (guard) for (const left of [false, true]) {
        const punching = gs.punch > 0 && left === gs.punchLeft, w = punching ? Math.sin(Math.PI * Math.min(1, gs.punch)) : 0;
        const T = H.clone().addScaledVector(fw, 0.28 + 0.5 * w).addScaledVector(right, (left ? 1 : -1) * (punching ? 0.04 : 0.14)).add(new THREE.Vector3(0, -0.3 - (punching ? 0 : 0.08), 0));
        reachArm(a, { x: T.x, y: T.y, z: T.z, left }, Math.max(0.75 * Math.max(gs.raise, 0.5), w));
      }
      return;
    }
    const g = gunModel(gs, gs.id);
    let look;
    const G = new THREE.Vector3();
    if (spec.twoHanded) {
      const S = B.R_UpperArm.getWorldPosition(new THREE.Vector3());
      const lowDir = new THREE.Vector3(fw.x * 0.55, -0.83, fw.z * 0.55).normalize();
      look = lowDir.lerp(dir, gs.raise).normalize();
      const aimG = S.clone().addScaledVector(dir, spec.hold.f).addScaledVector(right, spec.hold.s).add(new THREE.Vector3(0, spec.hold.u, 0));
      const lowG = S.clone().addScaledVector(fw, 0.17).addScaledVector(right, -0.09).add(new THREE.Vector3(0, -0.3, 0));
      G.copy(lowG).lerp(aimG, gs.raise);
      G.y -= (1 - draw) * 0.32;
      const grip = G.clone().addScaledVector(look, -spec.hand.fwd);
      const fore = G.clone().addScaledVector(look, spec.support - spec.hand.fwd * 0.5);
      fore.y -= 0.025;
      reachArm(a, { x: grip.x, y: grip.y, z: grip.z, left: false }, draw);
      reachArm(a, { x: fore.x, y: fore.y, z: fore.z, left: true }, draw);
    } else {
      if (gs.raise > 0.02) {
        pointBone(B.R_UpperArm, B.R_Forearm, dir, gs.raise * draw);
        pointBone(B.R_Forearm, B.R_Hand, dir, gs.raise * draw);
      }
      B.R_Hand.updateWorldMatrix(true, false);
      const hp = B.R_Hand.getWorldPosition(new THREE.Vector3()), fp = B.R_Forearm.getWorldPosition(new THREE.Vector3());
      look = hp.clone().sub(fp).normalize().lerp(dir, gs.raise).normalize();
      G.copy(hp).addScaledVector(look, spec.hand.fwd);
      G.y -= spec.hand.down * (1 - gs.raise * 0.5);
      G.y -= (1 - draw) * 0.28;
      if (gs.raise > 0.5) { // the other hand comes under the grip
        const lp = G.clone().addScaledVector(look, -0.07);
        lp.y -= 0.07;
        reachArm(a, { x: lp.x, y: lp.y, z: lp.z, left: true }, smoothK((gs.raise - 0.5) * 2) * draw);
      }
    }
    g.position.copy(G);
    g.scale.setScalar(0.45 + 0.55 * draw);
    g.lookAt(G.x + look.x, G.y + look.y, G.z + look.z);
    g.visible = true;
    g.updateMatrixWorld(true);
    gs.muzzle.copy(G).addScaledVector(look, spec.muzzle * g.scale.x);
    gs.muzzle.y += 0.04;
    gs.muzzleValid = true;
  }

  // One arm reaching for a point in the world (a car's door handle, a driver's collar): the rig has no reaching clip, so
  // the arm is solved over whatever the clip does, two bones as for the phone, the elbow down and out to that side.
  // target: { x, y, z, left }
  function reachArm(a, target, w) {
    const B = bonesOf(a);
    const U = target.left ? B.L_UpperArm : B.R_UpperArm, F = target.left ? B.L_Forearm : B.R_Forearm, H = target.left ? B.L_Hand : B.R_Hand;
    if (!U || !F || !H) return;
    const h = a.heading, fwd = _f.set(Math.sin(h), 0, Math.cos(h)), side = _r.set(-Math.cos(h), 0, Math.sin(h));
    if (target.left) side.negate();
    const S = U.getWorldPosition(new THREE.Vector3()), E0 = F.getWorldPosition(new THREE.Vector3()), H0 = H.getWorldPosition(new THREE.Vector3());
    const L1 = S.distanceTo(E0), L2 = E0.distanceTo(H0);
    const T = new THREE.Vector3(target.x, target.y, target.z);
    const d = Math.max(1e-3, Math.min(S.distanceTo(T), L1 + L2 - 1e-3)), dir = new THREE.Vector3().subVectors(T, S).normalize();
    const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), up = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(side, 0.6).addScaledVector(fwd, -0.2);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir, along).addScaledVector(pole, up);
    pointBone(U, F, elbow.sub(S).normalize(), w);
    const E = F.getWorldPosition(new THREE.Vector3());
    pointBone(F, H, T.sub(E).normalize(), w);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The player
  let playerActor = null, playerAction = null;
  // getting into or out of a car: { x, y, z, heading, anim, timeScale, reach: { x, y, z, w, left } } or null
  let playerPose = null;
  /** What the player does while standing (a cut scene's listen, talk or nod; a cheer): null hands back to the gait */
  function setPlayerAction(name) {
    playerAction = name;
    if (name && ONCE.has(name) && playerActor) play(playerActor, name);
  }
  function posePlayer(dt) {
    const p = controllerManager?.entities?.person;
    if (!p) return;
    if (!playerActor) {
      playerActor = makeActor(PLAYER, true);
      if (!playerActor) return;
    }
    if (playerSeat) {
      const a = playerActor, s = playerSeat;
      p.castModel = controllerManager.activeMode === 'person';
      play(a, has(a, playerSeatAnim) ? playerSeatAnim : has(a, 'sit') ? 'sit' : 'idle');
      place(a, s.x, s.y, s.z, s.heading, dt, false);
      a.mixer.update(dt);
      faceLife(a, dt);
      return;
    }
    if (playerPose && controllerManager.activeMode === 'person') {
      // getting into or out of a car (js/gameplay.js): drawn where the sequence says, not where the controller stands
      const a = playerActor, o = playerPose;
      p.castModel = true;
      a.still = 0;
      a.turnT = 0;
      a.lastHeading = p.heading; // (no turn clip kicks in from the jump back to the controller's heading afterwards)
      a.onceUntil = 0; // a wave or a cheer doesn't hold the sequence up
      a.fall = o.fall || 0; // (shot dead: down on their back)
      play(a, has(a, o.anim) ? o.anim : 'idle', o.timeScale || 1, o.fade ?? 0.3);
      place(a, o.x, o.y, o.z, o.heading, dt, false);
      a.mixer.update(dt);
      faceLife(a, dt);
      a.group.updateMatrixWorld(true);
      if (o.reach && o.reach.w > 0.01) reachArm(a, o.reach, Math.min(1, o.reach.w));
      hideGuns(weapon); // (the gun is away while both hands are busy)
      return;
    }
    if (controllerManager.activeMode !== 'person') {
      playerActor.group.visible = false;
      p.castModel = false;
      hideGuns(weapon);
      return;
    }
    p.castModel = true; // controllers.js stops drawing its procedural stand-in
    const a = playerActor;
    a.fall = 0;
    a.still = Math.abs(p.speed) < 0.1 ? a.still + dt : 0;
    // turning on the spot (how fast the heading swings while standing): the turn clips, not sliding round on the idle
    let turnRate = 0;
    if (a.lastHeading !== null && dt > 0) { let dh = p.heading - a.lastHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); turnRate = dh / dt; }
    a.lastHeading = p.heading;
    const standing = Math.abs(p.speed) < 0.3;
    // (a pivot from a standstill: the controller swings the body round before the walk takes over)
    if (Math.abs(p.speed) < 0.9 && Math.abs(turnRate) > 1.0 && has(a, 'turn_left') && !weapon.aiming) a.turnT = 0.35;
    else a.turnT = Math.max(0, a.turnT - dt);
    if (playerAction && standing) play(a, has(a, playerAction) ? playerAction : 'idle');
    else if (standing && weapon.armed && weapon.aiming && has(a, 'aim')) play(a, 'aim'); // the pistol stance (the arms then point it)
    else if (weapon.aiming && !standing && has(a, 'strafe_left') && p._strafeX !== undefined) {
      // gun up and moving: step the way they go, still facing the aim (forwards, backwards or sideways)
      let rel = Math.atan2(p._strafeX, p._strafeZ) - p.heading;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const ts = THREE.MathUtils.clamp(Math.abs(p.speed) / 1.3, 0.6, 1.6);
      play(a, Math.abs(rel) < 0.8 ? 'walk' : Math.abs(rel) > 2.35 ? 'back' : rel > 0 ? 'strafe_left' : 'strafe_right', ts);
    }
    else if (a.turnT > 0 && Math.abs(p.speed) < 0.9) play(a, turnRate > 0 || (turnRate === 0 && a.cur === a.acts.turn_left) ? 'turn_left' : 'turn_right', THREE.MathUtils.clamp(Math.abs(turnRate) / 1.6, 0.8, 1.8));
    else {
      if (!standing) playerAction = null;
      // standing a while, they look about, then wait
      gait(a, p.speed, a.still > 14 ? 'wait' : a.still > 5 ? 'look' : 'idle');
    }
    place(a, p.position.x, p.position.y, p.position.z, p.heading, dt, false); // the controller already eases the heading
    a.mixer.update(dt);
    faceLife(a, dt);
    a.group.updateMatrixWorld(true);
    poseGun(a, weapon, dt);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Story characters at their jobs: on the phone while they wait, talking through the cut scene, facing the player
  const story = {};
  function setGiver(name, at = null, face = null, mood = null, dt = 0) {
    for (const [n, a] of Object.entries(story)) if (a && !a.seat && (n !== name || !at)) { a.group.visible = false; if (a.phone) a.phone.visible = false; }
    if (!name || !at) return;
    const id = STORY_CAST[name];
    if (!id) return;
    if (!templates.has(id)) { loadPerson(id); return; } // fetched the first time their job wants them
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
    faceLife(a, dt);
    posePhone(a, dt || 0.016);
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
    for (const a of Object.values(story)) if (a && a.seat && a.group.visible) { a.mixer.update(dt); faceLife(a, dt); }
  }
  // Actors for a scene (the intro's shots): key → one person (by model id) standing at a pose playing a clip; null pose:
  // gone. Called every frame while wanted (a model still loading just appears a moment later)
  const extras = new Map();
  function setActor(key, id, pose, anim = 'idle') {
    let a = extras.get(key);
    if (!pose) { if (a) a.group.visible = false; return; }
    if (!templates.has(id)) { loadPerson(id); return; } // fetched the first time a scene wants them
    if (!a || a.id !== id) {
      if (a) a.group.visible = false;
      a = makeActor(id, true);
      if (!a) return;
      extras.set(key, a);
    }
    // pose.speed (m/s): a walker, stepping at the pace they really move and standing in `anim` once they arrive.
    // pose.ease (rad/s): the heading turns towards pose.heading at most that fast (and settles) instead of snapping
    if (pose.speed !== undefined) gait(a, pose.speed, anim); else play(a, anim); // (a mood they've no clip for plays the idle, but stays their mood: the phone comes out for 'phone')
    // pose.fall (0..1): tipped over backwards as the crowd's dead go down (a carjacked driver dragged out lands on
    // their back; 0 stands them up again)
    a.fall = pose.fall || 0;
    if (pose.ease && a.group.visible) {
      const dt = Math.min(0.1, Math.max(0, clock - (a.poseT ?? clock)));
      const d = Math.atan2(Math.sin(pose.heading - a.heading), Math.cos(pose.heading - a.heading));
      a.heading += THREE.MathUtils.clamp(d * Math.min(1, dt * 8), -pose.ease * dt, pose.ease * dt);
    } else a.heading = pose.heading;
    a.poseT = clock;
    place(a, pose.x, pose.y ?? 0, pose.z, a.heading, 0.016, false);
  }
  // An armed hostile (js/combat.js), drawn each frame while wanted: key → one person (model id), o = { x, y, z, heading,
  // speed, weapon, armed, aiming, yaw, pitch, dead, fire, dt }; null: gone. Returns { muzzle } once the model is in (null
  // before: they don't shoot until they can be seen)
  const gunmen = new Map();
  function setGunman(key, id, o) {
    let a = gunmen.get(key);
    if (!o) { if (a) { a.group.visible = false; hideGuns(a.gs); } return null; }
    if (!templates.has(id)) { loadPerson(id); return null; }
    if (!a || a.id !== id) {
      if (a) { a.group.visible = false; hideGuns(a.gs); }
      a = makeActor(id, LEVEL.shadows);
      if (!a) return null;
      a.gs = newGunState();
      gunmen.set(key, a);
    }
    const dt = o.dt || 0.016;
    if (o.dead) {
      a.fall = Math.min(1, a.fall + dt / 0.55);
      if (a.cur) a.cur.timeScale = Math.max(0, 1 - a.fall * 2);
    } else {
      a.fall = 0;
      if (o.speed > 0.3) gait(a, o.speed);
      else if (o.aiming && has(a, 'aim')) play(a, 'aim');
      else if (o.armed && has(a, 'ready')) play(a, 'ready');
      else play(a, 'idle');
    }
    place(a, o.x, o.y, o.z, o.dead ? a.heading : o.heading, dt, a.group.visible);
    a.mixer.update(dt);
    faceLife(a, dt, false);
    a.group.updateMatrixWorld(true);
    const gs = a.gs;
    gs.id = o.weapon; gs.armed = !!o.armed && !o.dead; gs.aiming = !!o.aiming; gs.yaw = o.yaw ?? o.heading; gs.pitch = o.pitch || 0;
    if (o.fire) gs.kick = 1;
    poseGun(a, gs, dt);
    return { muzzle: gs.muzzleValid ? gs.muzzle : null, held: Object.entries(gs.models).find(([, g]) => g.visible)?.[0] || null };
  }
  // A rider seated on a motorbike (js/bikies.js), drawn each frame: key → one person (model id), o = { parent (the bike's
  // THREE group: the rider is carried in it), seat { y, z } (where the hips go, in the bike's space), grips [left, right] (Object3Ds on the bars), dt }; null: gone. The seated clip with both hands solved onto the bars, a torso lean from
  // the bike. Returns false until the model is in.
  const riders = new Map();
  function setRider(key, id, o) {
    let a = riders.get(key);
    if (!o) { if (a) { a.group.visible = false; if (a.group.parent) a.group.parent.remove(a.group); } return true; }
    if (!templates.has(id)) { loadPerson(id); return false; }
    if (!a || a.id !== id) {
      if (a) a.group.visible = false;
      a = makeActor(id, LEVEL.shadows);
      if (!a) return false;
      riders.set(key, a);
    }
    const dt = o.dt || 0.016;
    if (a.group.parent !== o.parent) o.parent.add(a.group);
    play(a, has(a, 'sit') ? 'sit' : 'idle');
    a.mixer.update(dt);
    a.group.rotation.set(0, 0, 0);
    a.group.scale.setScalar(1);
    a.group.position.set(0, 0, 0);
    a.group.visible = true;
    a.group.updateMatrixWorld(true);
    // the hips' height above the person's feet, measured once from the seated clip, then the person set so they land on the seat
    const hips = a.hipsBone || (a.hipsBone = a.root.getObjectByName('Bip01_Pelvis') || a.root.getObjectByName('Bip01') || a.root.getObjectByName('Hips'));
    if (hips && a.hipH === undefined) { const p = hips.getWorldPosition(new THREE.Vector3()); a.group.worldToLocal(p); a.hipH = p.y; a.hipZ = p.z; }
    a.group.position.set(0, o.seat.y - (a.hipH || 0.5), o.seat.z - (a.hipZ || 0));
    a.heading = 0;
    o.parent.updateMatrixWorld(true);
    a.group.updateMatrixWorld(true);
    const head = o.parent.getWorldDirection(_f.set(0, 0, 1)); // the bike's forward, for the arms' elbows
    a.heading = Math.atan2(head.x, head.z);
    if (o.grips) for (let i = 0; i < 2; i++) {
      const w = o.grips[i].getWorldPosition(new THREE.Vector3());
      reachArm(a, { x: w.x, y: w.y, z: w.z, left: i === 0 }, 1);
    }
    faceLife(a, dt, false);
    return true;
  }
  // The player sitting down (a scene): drawn at the seat whatever mode they're in
  let playerSeat = null, playerSeatAnim = 'sit';
  function setPlayerSeat(seat, anim = 'sit') { playerSeat = seat; playerSeatAnim = anim; }

  return {
    setActor,
    /** Start fetching people a scene will want soon (the intro's extras) */
    preload(ids) { for (const id of ids) if (id) loadPerson(id); },
    /** The player's gun: { id, armed, aiming, yaw } from js/gameplay.js each frame */
    setPlayerWeapon(w) {
      weapon.id = w.id; weapon.armed = w.armed; weapon.aiming = w.aiming; weapon.yaw = w.yaw; weapon.pitch = w.pitch || 0;
      weapon.punch = w.punch || 0; weapon.punchLeft = !!w.punchLeft;
      if (w.kick) weapon.kick = 1;
    },
    /** For checks: the weapon model in the player's hand now */
    heldGun() {
      const held = Object.entries(weapon.models).find(([, g]) => g.visible)?.[0] || null;
      return { held, drawK: weapon.drawK, raise: weapon.raise, muzzle: weapon.muzzleValid };
    },
    setGunman,
    setRider,
    /** Where the gun's muzzle is (for the flash and tracers), or null */
    muzzle() { return weapon.muzzleValid ? weapon.muzzle : null; },
    setSeated,
    setPlayerSeat,
    get ready() { return templates.has(PLAYER) && !!clips.m; },
    /** which model plays the player */
    get playerModel() { return PLAYER; },
    get loaded() { return [...templates.keys()]; },
    level: LEVEL,
    active: ACTIVE,
    assign,
    posePed,
    drop,
    posePlayer,
    setGiver,
    get actors() { return live; },
    /** for checks: does this body (a model id) have a clip of this name, and a few bones' rotations summed (a pose that
     *  changes between two looks is moving). `who` is a story name ('Davo'), 'player' or an extra's key. */
    probe(who, name) {
      const a = who === 'player' ? playerActor : story[who] || extras.get(who);
      if (!a) return null;
      let sig = 0;
      a.root.traverse((o) => { if (o.isBone) sig += o.quaternion.x * 3 + o.quaternion.y * 5 + o.quaternion.z * 7 + o.quaternion.w; });
      return { id: a.id, clip: a.cur?.getClip().name || null, has: name ? has(a, name) : undefined, visible: a.group.visible, sig };
    },
    /** is the story clip set in */
    get storyLoaded() { return storyLoaded; },
    /** which clips a body (model id) has: `clipsFor('Male_Adult_09')` */
    clipNames(id) { return Object.keys(ownClips.get(id) || clips[isFemale(id) ? 'f' : 'm'] || {}); },
    setPlayerAction,
    /** Draw the player at a pose of the car sequence's (js/gameplay.js) while on foot: { x, y, z, heading, anim,
     *  timeScale, reach }, reach an arm's target { x, y, z, w (0..1), left }; null hands back to the controller */
    setPlayerPose(o) { playerPose = o; },
    /** for checks: what the player and the story characters are playing */
    debug() {
      const name = (a) => a?.cur?.getClip().name || '-';
      return { player: name(playerActor), ...Object.fromEntries(Object.entries(story).map(([n, a]) => [n, a.group.visible ? name(a) : 'hidden'])) };
    },
    /** how loud the story voices are (0..1): the speaking character's lips follow it */
    setVoiceLevel(x) { voiceLevel = x; },
    /** advance the cast's clock (gestures time out on it) */
    tick(dt) { clock += dt; animateSeated(dt); for (const a of extras.values()) { if (a.group.visible) { a.mixer.update(dt); faceLife(a, dt, false); } posePhone(a, dt); } } // (extras' lips stay still: the voice over them is the narrator's)
  };
}

// The pedestrian system lives inside the traffic system, made before the cast: it finds the cast here
export const castHook = { cast: null };
