// GTA Melbourne's voices: pre-generated Australian-English dialogue clips (data/character-voices.json and
// assets/audio/, made offline by tools/voices/generate.py), played through the city's Web Audio graph.
//
//  - each line belongs to a character with one fixed voice, so Vince always sounds like Vince
//  - positional: a speaker in the world gets a PannerNode at their position (followed while they walk), with the
//    character's reference and maximum distances; phone calls, police radio and the narrator are not positional
//  - subtitles under the HUD, revealed word by word over the clip's length (story cut scenes and the T-talk bubble
//    already show their text, so those clips play without a second subtitle)
//  - priorities: story > radio / bark > talk > chat. One dialogue voice at a time: a higher (or equal) priority line
//    interrupts a lower one, a lower one waiting behind it is dropped. Radio has its own channel. Up to two ambient
//    conversations murmur at once, ducked under story lines. One character never talks over themselves.
//  - random pedestrian conversations: two people standing near each other, nearby, swap a couple of chat lines
//  - no line repeats until most of its pool has played, and each has a cooldown
//
// It shares CityAudioSystem's AudioContext and master gain (so the sound button mutes it too) and does nothing until
// that context runs. If the data or a clip fails to load, the game carries on silently with its on-screen text.

const DATA_URL = new URL('../../data/character-voices.json', import.meta.url);
const AUDIO_URL = new URL('../../assets/audio/', import.meta.url);
const PRIORITY = { story: 3, radio: 2, bark: 2, talk: 1, chat: 0 };
const COOLDOWN = { story: 0, radio: 50, bark: 12, talk: 45, chat: 90 }; // seconds before the same line again
const VOLUME_KEY = 'gta-melbourne3d-voice-volume';
const SUBS_KEY = 'gta-melbourne3d-subtitles';

const CSS = `
.vo-subs { position: fixed; left: 50%; bottom: 128px; transform: translateX(-50%); width: min(760px, calc(100vw - 32px)); z-index: 34;
  display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
.vo-sub { max-width: 100%; padding: 6px 12px; border-radius: 8px; background: rgba(0,0,0,.62); color: #fff; text-align: center;
  font: 500 15px/1.4 Inter, system-ui, sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,.8); transition: opacity .25s; }
.vo-sub b { color: #ffcf6e; font-weight: 700; margin-right: 6px; }
.vo-sub.radio b { color: #7fb8ff; }
.vo-sub .rest { opacity: .38; }
body.cinematic .vo-subs { bottom: calc(11vh + 70px); }
@media (max-width: 700px) { .vo-subs { bottom: 170px; } .vo-sub { font-size: 13px; } }
`;

const words = (text) => text.toLowerCase().replace(/[-–]/g, ' ').replace(/[^a-z0-9' ]+/g, ' ')
  .split(/\s+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
const key = (text) => words(text).join(' ');

/** A manager that does nothing: used when there is no Web Audio or no voice data, so callers need no checks */
function silent() {
  const none = () => null;
  return { ready: false, sayText: none, say: none, talkLine: none, event: none, stopStory() {}, stopAll() {}, update() {},
    volume: 0, setVolume() {}, subtitles: true, setSubtitles() {}, ambient: false, setAmbient() {}, lines: [] };
}

export async function createVoiceManager({ audioSystem, cameraSystem, trafficSystem, isCinematic = () => false } = {}) {
  if (!audioSystem?.supported) return silent();
  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    console.warn('[voices] no voice data, playing silently', e);
    return silent();
  }
  const characters = data.characters;
  const lines = data.lines.filter((l) => l.file && characters[l.character]);
  const byText = new Map(lines.map((l) => [key(l.text), l]));
  const pools = new Map(); // `${character}/${category}` → lines
  for (const l of lines) {
    const k = `${l.character}/${l.category}`;
    if (!pools.has(k)) pools.set(k, []);
    pools.get(k).push(l);
  }

  // settings
  let volume = 1, subtitles = true, ambient = true;
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
    subtitles = localStorage.getItem(SUBS_KEY) !== 'off';
  } catch { /* storage unavailable */ }

  // subtitles
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const subsEl = document.createElement('div');
  subsEl.className = 'vo-subs';
  subsEl.setAttribute('aria-live', 'polite');
  document.body.append(subsEl);

  // the audio graph: voices → (ambient duck) → bus → the city's master gain
  let ctx = null, bus = null, duck = null;
  const buffers = new Map(); // file → Promise<AudioBuffer>
  function context() {
    const c = audioSystem.context;
    if (!c || !audioSystem.enabled || c.state !== 'running' || !audioSystem.master) return null;
    if (c !== ctx) {
      ctx = c;
      bus = c.createGain();
      bus.gain.value = volume;
      bus.connect(audioSystem.master);
      duck = c.createGain();
      duck.connect(bus);
      buffers.clear();
    }
    return c;
  }
  function load(line) {
    if (!ctx) return Promise.reject(new Error('no audio'));
    let p = buffers.get(line.file);
    if (!p) {
      p = fetch(new URL(line.file, AUDIO_URL)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((b) => new Promise((ok, fail) => ctx.decodeAudioData(b, ok, fail)));
      p.catch(() => buffers.delete(line.file));
      buffers.set(line.file, p);
    }
    return p;
  }

  // repetition
  const lastPlayed = new Map(); // id → seconds
  const recent = []; // ids, newest last
  let clock = 0;
  function pick(character, category, filter = () => true) {
    const pool = (pools.get(`${character}/${category}`) || []).filter(filter);
    if (!pool.length) return null;
    const keep = Math.max(0, Math.ceil(pool.length * 0.6) - 1); // the most recent ~60% of the pool sits out
    const sitting = new Set(recent.filter((id) => pool.some((l) => l.id === id)).slice(-keep));
    const fresh = pool.filter((l) => !sitting.has(l.id) && clock - (lastPlayed.get(l.id) ?? -1e9) > COOLDOWN[category]);
    const from = fresh.length ? fresh : pool.filter((l) => !sitting.has(l.id));
    return (from.length ? from : pool)[Math.floor(Math.random() * (from.length || pool.length))];
  }
  function note(line) {
    lastPlayed.set(line.id, clock);
    recent.push(line.id);
    if (recent.length > 40) recent.shift();
  }

  // playing voices
  const active = []; // { line, ch, src, gain, panner, follow, pos, channel, prio, t, dur, sub, onEnd }
  const channelOf = (cat) => (cat === 'radio' ? 'radio' : cat === 'chat' ? 'ambient' : 'dialogue');
  function stop(v, fade = 0.08) {
    const i = active.indexOf(v);
    if (i < 0) return;
    active.splice(i, 1);
    if (v.sub) v.sub.remove();
    if (v.gain && ctx) {
      const now = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + fade);
      try { v.src.stop(now + fade + 0.02); } catch { /* not started */ }
    }
    v.onEnd?.(false);
  }

  /**
   * Play one line. opts: at ({x, y?, z} — followed if it moves, e.g. a ped), radio, phone, subtitle (default true),
   * name (override the speaker shown), onEnd(finished). Returns { line, duration } or null when it can't play.
   */
  function say(line, opts = {}) {
    if (!line) return null;
    const ch = characters[line.character];
    const cat = line.category;
    const prio = PRIORITY[cat] ?? 0;
    const channel = opts.channel || channelOf(cat);
    const listener = audioSystem.listener;
    // too far to hear: don't start
    if (opts.at && audioSystem.haveListener && Math.hypot(opts.at.x - listener.x, opts.at.z - listener.z) > ch.maxDistance) return null;
    // arbitration within the channel
    const same = active.filter((v) => v.channel === channel);
    if (channel === 'ambient') {
      if (same.length >= 2) return null;
    } else if (same.some((v) => v.prio > prio)) return null;
    else same.forEach((v) => stop(v));
    active.filter((v) => v.line.character === line.character && v.line.category !== 'chat' && cat !== 'chat').forEach((v) => stop(v));
    note(line);

    const v = { line, ch, channel, prio, follow: opts.at || null, t: 0, dur: line.duration || 3, sub: null, onEnd: opts.onEnd, src: null, gain: null };
    active.push(v);
    if (subtitles && opts.subtitle !== false) {
      const near = !opts.at || !audioSystem.haveListener || Math.hypot(opts.at.x - listener.x, opts.at.z - listener.z) < ch.refDistance * 4;
      if (near) {
        v.sub = document.createElement('div');
        v.sub.className = `vo-sub${line.radio || opts.radio ? ' radio' : ''}`;
        const b = document.createElement('b');
        b.textContent = opts.name || (line.radio ? 'Police radio' : ch.name);
        v.said = document.createElement('span');
        v.rest = document.createElement('span');
        v.rest.className = 'rest';
        v.words = line.text.split(' ');
        v.rest.textContent = line.text;
        v.sub.append(b, v.said, v.rest);
        subsEl.append(v.sub);
        while (subsEl.children.length > 3) subsEl.firstChild.remove();
      }
    }

    const c = context();
    if (!c) return { line, duration: v.dur }; // no sound right now: the subtitle still shows for the clip's length
    const t0 = performance.now();
    load(line).then((buffer) => {
      if (!active.includes(v) || ctx !== c) return;
      // ambient chatter that took too long to load is no longer worth saying
      if (channel === 'ambient' && performance.now() - t0 > 1500) return stop(v, 0);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const gain = c.createGain();
      gain.gain.value = ch.gain ?? 1;
      let node = src;
      if (opts.phone) {
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        node.connect(hp).connect(lp);
        node = lp;
      }
      node.connect(gain);
      if (v.follow) {
        const p = c.createPanner();
        p.panningModel = 'HRTF';
        p.distanceModel = 'inverse';
        p.refDistance = ch.refDistance ?? 5;
        p.maxDistance = ch.maxDistance ?? 50;
        p.rolloffFactor = 1.3;
        const at = v.follow;
        if (p.positionX) { p.positionX.value = at.x; p.positionY.value = (at.y ?? 0) + 1.6; p.positionZ.value = at.z; } else p.setPosition(at.x, (at.y ?? 0) + 1.6, at.z);
        gain.connect(p).connect(channel === 'ambient' ? duck : bus);
        v.panner = p;
      } else gain.connect(channel === 'ambient' ? duck : bus);
      src.onended = () => { if (active.includes(v) && v.src === src) { v.onEnd?.(true); v.onEnd = null; stop(v, 0); } };
      v.src = src;
      v.gain = gain;
      v.dur = buffer.duration;
      v.t = 0;
      src.start();
    }).catch(() => { /* a missing clip: the subtitle runs out on its own */ });
    return { line, duration: v.dur };
  }

  /** A line by its exact script text (mission cut scenes, the intro); null when it has no clip */
  function sayText(text, opts = {}) {
    const line = byText.get(key(text));
    return line ? say(line, opts) : null;
  }

  /** What a pedestrian says when you talk to them: a fresh line for their voice, played when you call play() */
  function talkLine(ped) {
    const character = ped?.female ? 'local_female' : 'local_male';
    const line = pick(character, 'talk');
    if (!line) return null;
    return { text: line.text, duration: line.duration || 3, play: () => say(line, { at: ped, subtitle: false }) };
  }

  // World events: police radio after gunfire or a carjacking, and a nearby police car's officer shouting
  const eventAt = { gunfire: -1e9, carjack: -1e9, bark: -1e9 };
  function nearestPolice(x, z, r) {
    let best = null, bd = r;
    for (const c of trafficSystem?.cars || []) {
      if (!c.isPolice || c.driven || !(c.edge || c.parked)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function event(kind, pos) {
    if (kind === 'gunfire' || kind === 'carjack') {
      const cop = pos && nearestPolice(pos.x, pos.z, 45);
      if (cop && clock - eventAt.bark > 6) {
        eventAt.bark = clock;
        say(pick('police', 'bark', (l) => l.id !== 'police_bark_move'), { at: { x: cop.x, y: 0, z: cop.z } });
      }
      if (clock - eventAt[kind] < 40) return;
      eventAt[kind] = clock;
      const want = kind === 'gunfire' ? ['radio_shots_cbd', 'radio_kestrel'] : ['radio_stolen_car'];
      // a moment later, as if someone called it in
      setTimeout(() => say(pick('police', 'radio', (l) => want.includes(l.id)), { radio: true }), kind === 'gunfire' ? 2500 : 4000);
    }
  }

  // Random pedestrian conversations
  let nextChat = 6 + Math.random() * 6;
  function startConversation() {
    const L = audioSystem.listener;
    const peds = trafficSystem?.peds;
    if (!peds || !audioSystem.haveListener) return;
    const near = [];
    for (const q of peds) {
      if (!q.placed || q.dead || q.fleeing) continue;
      const d = Math.hypot(q.x - L.x, q.z - L.z);
      if (d > 5 && d < 26) near.push(q);
    }
    for (let tries = 0; tries < 8 && near.length > 1; tries++) {
      const a = near[Math.floor(Math.random() * near.length)];
      const b = near.find((q) => q !== a && Math.hypot(q.x - a.x, q.z - a.z) < 4.5);
      if (!b) continue;
      const voiceOf = (q) => (q.female ? 'local_female' : 'local_male');
      const chatty = (l) => l.ambient !== false;
      const first = pick(voiceOf(a), 'chat', chatty) || pick(voiceOf(a), 'talk', chatty);
      if (!first) return;
      say(first, {
        at: a,
        onEnd: (finished) => {
          if (!finished) return;
          const reply = pick(voiceOf(b), 'chat', (l) => chatty(l) && l.id !== first.id) || pick(voiceOf(b), 'talk', chatty);
          setTimeout(() => say(reply, { at: b }), 350 + Math.random() * 400);
        }
      });
      return;
    }
  }

  function update(dt) {
    clock += dt;
    const c = context();
    // story lines push the murmur down
    const storyOn = active.some((v) => v.prio >= PRIORITY.story);
    if (duck && c) duck.gain.setTargetAtTime(storyOn ? 0.3 : 1, c.currentTime, 0.15);
    for (const v of [...active]) {
      v.t += dt;
      if (v.panner && v.follow) {
        const at = v.follow;
        if (v.panner.positionX) {
          v.panner.positionX.setTargetAtTime(at.x, c.currentTime, 0.05);
          v.panner.positionZ.setTargetAtTime(at.z, c.currentTime, 0.05);
        } else v.panner.setPosition(at.x, (at.y ?? 0) + 1.6, at.z);
        // a speaker who dies or wanders out of range stops
        if (at.dead || (audioSystem.haveListener && Math.hypot(at.x - audioSystem.listener.x, at.z - audioSystem.listener.z) > v.ch.maxDistance * 1.2)) { stop(v, 0.3); continue; }
      }
      if (v.sub) {
        const n = Math.min(v.words.length, Math.ceil((v.t / Math.max(0.5, v.dur * 0.92)) * v.words.length));
        if (n !== v.shown) {
          v.shown = n;
          v.said.textContent = v.words.slice(0, n).join(' ') + (n < v.words.length ? ' ' : '');
          v.rest.textContent = v.words.slice(n).join(' ');
        }
      }
      // no sound (muted, or not started): end on the clip's length
      if (!v.src && v.t > v.dur + 0.4) { v.onEnd?.(true); v.onEnd = null; stop(v, 0); }
    }
    if (ambient && c && !isCinematic() && !storyOn) {
      nextChat -= dt;
      if (nextChat <= 0) {
        nextChat = 10 + Math.random() * 14;
        if (!active.some((v) => v.channel === 'ambient')) startConversation();
      }
    }
  }

  return {
    ready: true,
    lines,
    characters,
    say,
    sayText,
    talkLine,
    event,
    update,
    /** End the story line that's playing (a skipped cut scene) */
    stopStory() { active.filter((v) => v.prio >= PRIORITY.story).forEach((v) => stop(v)); },
    stopAll() { [...active].forEach((v) => stop(v)); },
    get active() { return active.map((v) => ({ id: v.line.id, channel: v.channel, t: v.t, sound: !!v.src })); },
    get volume() { return volume; },
    setVolume(x) {
      volume = Math.min(1, Math.max(0, x));
      if (bus && ctx) bus.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* storage unavailable */ }
    },
    get subtitles() { return subtitles; },
    setSubtitles(on) {
      subtitles = !!on;
      if (!subtitles) subsEl.replaceChildren();
      try { localStorage.setItem(SUBS_KEY, subtitles ? 'on' : 'off'); } catch { /* storage unavailable */ }
    },
    get ambient() { return ambient; },
    setAmbient(on) { ambient = !!on; },
    /** for testing: start a pedestrian conversation now */
    chatNow() { nextChat = 0; }
  };
}
