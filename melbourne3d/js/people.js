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
export const STORY_CAST = CLASSIC ? { Vince: 'Male_Adult_03', Kaz: 'Female_Adult_04', Mick: 'Male_Adult_05', Davo: 'Male_Adult_10' }
  : { Vince: 'ara:vince', Kaz: 'ara:kaz', Mick: 'ara:mick', Davo: 'ara:davo' };
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
export const isFemale = (id) => /Female/.test(id) || id === 'ara:kaz';

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
    await Promise.all([...Object.entries(STORY_CAST).filter(([n]) => n !== 'Davo').map(([, id]) => loadPerson(id)), loadStory('m'), loadStory('f'), loadStory('m', 'sit'), loadStory('f', 'sit')]);
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
    for (const [name, clip] of Object.entries(set)) acts[name] = mixer.clipAction(clip);
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
  function play(a, name, timeScale = 1, fade = 0.3) {
    // a gesture playing once finishes before anything but a new gesture (or death) takes over
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
    } else act = action(a, name) || a.acts.idle;
    a.logical = name;
    if (!act) return;
    if (a.cur !== act || ONCE.has(name) && clock >= a.onceUntil) {
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
    const g = s > (was === 3 ? 4.3 : 4.8) ? 3 : s > (was >= 2 ? 2.2 : 2.6) ? 2 : s > (was >= 1 ? 0.12 : 0.25) ? 1 : 0;
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
  // Guns in the player's hands: simple models of the three weapons (built pointing down +z), placed each frame at the
  // right hand, and the arms raised to point them when aiming or firing (a two-bone aim for each arm, after the clip)
  const gunMetal = new THREE.MeshStandardNodeMaterial({ color: 0x1b1c1e, roughness: 0.35, metalness: 0.8 });
  const gunGrip = new THREE.MeshStandardNodeMaterial({ color: 0x2b2420, roughness: 0.7 });
  const box = (w, h, d, x, y, z, m = gunMetal) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; };
  const GUNS = {
    pistol: [box(0.03, 0.035, 0.19, 0, 0.02, 0.06), box(0.028, 0.1, 0.035, 0, -0.04, -0.01, gunGrip), box(0.02, 0.015, 0.03, 0, -0.01, 0.03)],
    uzi: [box(0.045, 0.06, 0.24, 0, 0.02, 0.05), box(0.012, 0.012, 0.08, 0, 0.03, 0.2), box(0.03, 0.14, 0.03, 0, -0.06, 0.04), box(0.03, 0.09, 0.03, 0, -0.04, -0.05, gunGrip)],
    shotgun: [box(0.035, 0.035, 0.72, 0, 0.03, 0.22), box(0.03, 0.03, 0.4, 0, 0.0, 0.28, gunGrip), box(0.04, 0.09, 0.3, 0, -0.03, -0.2, gunGrip)]
  };
  const TWO_HANDED = { pistol: true, uzi: true, shotgun: true };
  const guns = {};
  for (const [id, parts] of Object.entries(GUNS)) {
    const g = new THREE.Group();
    g.name = `Gun:${id}`;
    parts.forEach((p) => g.add(p));
    g.visible = false;
    scene.add(g);
    guns[id] = g;
  }
  const muzzleAt = { pistol: 0.17, uzi: 0.25, shotgun: 0.58 };
  let weapon = { id: 'pistol', armed: false, aiming: false, yaw: 0, raise: 0 };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
  const muzzle = new THREE.Vector3();
  let muzzleValid = false;
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
  function aimArms(a, dir, w, twoHanded) {
    const B = bonesOf(a);
    if (!B.R_UpperArm || !B.R_Forearm || !B.R_Hand) return;
    // the right arm straight out along the aim, a touch down
    pointBone(B.R_UpperArm, B.R_Forearm, dir, w);
    pointBone(B.R_Forearm, B.R_Hand, dir, w);
    if (twoHanded && B.L_UpperArm && B.L_Forearm && B.L_Hand) {
      // the left hand comes across to the gun: its upper arm towards a point short of the right hand, its forearm
      // onto the gun just ahead of the right hand
      B.R_Hand.getWorldPosition(_d);
      B.L_UpperArm.getWorldPosition(_a);
      const grip = _d.clone().addScaledVector(dir, 0.1);
      const elbowAim = _b.subVectors(grip, _a).normalize().clone();
      elbowAim.y -= 0.35;
      elbowAim.normalize();
      pointBone(B.L_UpperArm, B.L_Forearm, elbowAim, w);
      B.L_Forearm.getWorldPosition(_a);
      pointBone(B.L_Forearm, B.L_Hand, _c.subVectors(grip, _a).normalize().clone(), w);
    }
  }
  function poseGun(a, dt) {
    for (const g of Object.values(guns)) g.visible = false;
    muzzleValid = false;
    if (!weapon.armed || !guns[weapon.id]) return;
    weapon.raise += ((weapon.aiming ? 1 : 0) - weapon.raise) * Math.min(1, dt * 14);
    const cp = Math.cos(weapon.pitch || 0);
    const dir = _d.set(Math.sin(weapon.yaw) * cp, Math.sin(weapon.pitch || 0) - 0.04, Math.cos(weapon.yaw) * cp).normalize().clone();
    if (weapon.raise > 0.02) aimArms(a, dir, weapon.raise, TWO_HANDED[weapon.id] && weapon.id !== 'pistol' || weapon.raise > 0.5);
    const B = bonesOf(a);
    if (!B.R_Hand || !B.R_Forearm) return;
    B.R_Hand.updateWorldMatrix(true, false);
    B.R_Hand.getWorldPosition(_a);
    B.R_Forearm.getWorldPosition(_b);
    // lowered: along the forearm, hanging; raised: along the aim
    const along = _c.subVectors(_a, _b).normalize();
    const look = along.lerp(dir, weapon.raise).normalize();
    const g = guns[weapon.id];
    g.position.copy(_a).addScaledVector(look, 0.07);
    g.position.y -= 0.02;
    g.lookAt(_b.copy(g.position).add(look));
    g.visible = true;
    g.updateMatrixWorld(true);
    muzzle.copy(g.position).addScaledVector(look, muzzleAt[weapon.id]);
    muzzleValid = true;
  }

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
    if (controllerManager.activeMode !== 'person') {
      playerActor.group.visible = false;
      p.castModel = false;
      for (const g of Object.values(guns)) g.visible = false;
      muzzleValid = false;
      return;
    }
    p.castModel = true; // controllers.js stops drawing its procedural stand-in
    const a = playerActor;
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
    poseGun(a, dt);
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
    faceLife(a, dt);
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
    play(a, has(a, anim) ? anim : 'idle');
    a.heading = pose.heading;
    place(a, pose.x, pose.y ?? 0, pose.z, pose.heading, 0.016, false);
  }
  // The player sitting down (a scene): drawn at the seat whatever mode they're in
  let playerSeat = null, playerSeatAnim = 'sit';
  function setPlayerSeat(seat, anim = 'sit') { playerSeat = seat; playerSeatAnim = anim; }

  return {
    setActor,
    /** Start fetching people a scene will want soon (the intro's extras) */
    preload(ids) { for (const id of ids) if (id) loadPerson(id); },
    /** The player's gun: { id, armed, aiming, yaw } from js/gameplay.js each frame */
    setPlayerWeapon(w) { weapon.id = w.id; weapon.armed = w.armed; weapon.aiming = w.aiming; weapon.yaw = w.yaw; weapon.pitch = w.pitch || 0; },
    /** Where the gun's muzzle is (for the flash and tracers), or null */
    muzzle() { return muzzleValid ? muzzle : null; },
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
    setPlayerAction,
    /** for checks: what the player and the story characters are playing */
    debug() {
      const name = (a) => a?.cur?.getClip().name || '-';
      return { player: name(playerActor), ...Object.fromEntries(Object.entries(story).map(([n, a]) => [n, a.group.visible ? name(a) : 'hidden'])) };
    },
    /** how loud the story voices are (0..1): the speaking character's lips follow it */
    setVoiceLevel(x) { voiceLevel = x; },
    /** advance the cast's clock (gestures time out on it) */
    tick(dt) { clock += dt; animateSeated(dt); for (const a of extras.values()) if (a.group.visible) { a.mixer.update(dt); faceLife(a, dt, false); } } // (extras' lips stay still: the voice over them is the narrator's)
  };
}

// The pedestrian system lives inside the traffic system, made before the cast: it finds the cast here
export const castHook = { cast: null };
