# GTA Melbourne voices

Recorded Australian-English dialogue for GTA Melbourne. Every clip is made offline, ahead of time, and shipped as
an MP3. Nothing is synthesised while the game runs, and no paid API or subscription is involved.

```
assets/audio/
  dialogue/<mission>/   story lines (Vince, Kaz) for the intro and each job's cut scene
  voices/<character>/   pedestrian talk and chat lines, police barks
  radio/                police radio chatter (band-passed, with a squelch at each end)
data/character-voices.json   characters, voice identities and every line (with file, duration and transcript check)
tools/voices/generate.py     makes the clips from the JSON
melbourne3d/js/voice-manager.js   plays them in the game
```

## The voices

| Character | Role | Orpheus speaker | Used for |
|---|---|---|---|
| Vince | Lygon Street Crew boss | `mason` (male) | intro phone call, Laneway Hustle, Hot Lap |
| Kaz | Broadmeadows fixer | `delta` (female) | Westside Bikies, Collection Day, Clean Up |
| Victoria Police officer | police | `matilda` (female) | barks near a police car, police radio |
| Local (male) | pedestrian | `flynn` (male) | answers when you talk to him, street chat |
| Local (female) | pedestrian | `ruby` (female) | answers when you talk to her, street chat |

Each character's speaker, temperature and seed are fixed in `data/character-voices.json`, so a character always
sounds the same. The model has three more Australian voices, unused so far: `angus` and `cooper` (male) and `sienna`
(female).

## How the TTS was chosen

The aim was natural Australian pronunciation, running locally for free. Three options were looked at:

| Option | Australian voices? | Result |
|---|---|---|
| **Piper** (rhasspy/piper-voices) | No: English comes only as `en_GB` and `en_US` | Rejected |
| **Kokoro-82M** | No: American and British English only | Rejected |
| **Orpheus, Australian fine-tune** (`ablmontazer/orpheus-australian-en-tts`) | Yes: 8 Australian speakers | **Chosen** |

Orpheus had clearly Australian vowels ("mate", "reckon", "Melbourne") and natural phrasing, with
punctuation-driven pauses. Every clip is checked automatically: Whisper transcribes it, and the words are compared
with the script. A take scoring under 0.8 is re-rolled with a new seed, up to three tries, and the best take is kept.
Each line's score and what Whisper heard are stored in the JSON.

## Licences

| Component | Licence | Notes |
|---|---|---|
| `ablmontazer/orpheus-australian-en-tts` (the voice model) | Apache-2.0 | Fine-tuned from Canopy Labs' Orpheus 3B on public-domain LibriVox Australian readings |
| `canopylabs/orpheus-3b-0.1-ft` (base model) | Apache-2.0 | Built on Llama 3.2 3B; check the Llama 3.2 Community Licence terms if you redistribute the *model* (this repo ships only the audio it made) |
| `mradermacher/orpheus-australian-en-tts-GGUF` (Q4_K_M quantisation) | same as the model | |
| `hubertsiuzdak/snac_24khz` (audio decoder) | MIT | |
| llama.cpp / llama-cpp-python | MIT | |
| faster-whisper with Whisper `small.en` (validation only) | MIT | |
| FFmpeg (trim, loudness, radio effect, MP3) | LGPL/GPL | a tool only; nothing linked into the game |

The generated MP3s are the project's own output. The model weights are not committed: they are about 2 GB, so
download them as described below.

## Making the clips

There is no GPU requirement. On 4 CPU cores a line takes about 30–80 s, roughly 9× slower than real time, plus the
Whisper check. All 34 prototype lines take about 30–40 minutes.

```bash
python3 -m venv ttsenv
ttsenv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
ttsenv/bin/pip install numpy snac soundfile llama-cpp-python faster-whisper
curl -L -o orpheus-au.Q4_K_M.gguf \
  https://huggingface.co/mradermacher/orpheus-australian-en-tts-GGUF/resolve/main/orpheus-australian-en-tts.Q4_K_M.gguf
```

Then, from the repository root (FFmpeg with libmp3lame must be on the PATH):

```bash
ttsenv/bin/python tools/voices/generate.py --model orpheus-au.Q4_K_M.gguf
```

What the script does:

- It skips lines that already have a file, so it can be stopped and restarted.
- `--only id1,id2 --force` redoes particular lines.
- `--tries 5` re-rolls more often.

Output is 24 kHz mono MP3 at 64 kb/s, with the silence trimmed and loudness normalised to -18 LUFS. Radio lines go to
-20 LUFS, band-passed to 420–3100 Hz with light bit-crush and a squelch at each end.

## Adding a character or line

1. Add the character under `characters` in `data/character-voices.json`. Pick an unused Orpheus speaker, and set a
   temperature (0.55–0.65 is steady) and a seed. Set `refDistance` and `maxDistance` in metres for how far they
   carry.
2. Add each line with an `id`, `character`, `category` and `folder`, and the exact `text`. The categories are
   `story`, `bark`, `radio`, `talk` and `chat`. Set `"radio": true` for radio lines, and `"ambient": false` to keep
   a talk line out of overheard street conversations.
3. Run the generator, then listen to anything with a low `check.score`.

Story lines are matched to the game by their **text**. A mission's cut-scene line in `melbourne3d/js/missions.js` or
the intro's in `melbourne3d/js/intro.js` plays its clip when the text matches a line here. Punctuation and case
don't matter.

## In the game (`melbourne3d/js/voice-manager.js`)

- **Shared audio graph.** It shares the city soundscape's AudioContext and master gain, so the sound button (N)
  mutes voices too. It only starts once the browser lets audio play, after the first click or key.
- **Positional audio.** Speakers in the world get an HRTF panner that follows them, using each character's reference
  and maximum distance. Phone calls (band-passed), radio and the narrator are not positional.
- **Subtitles.** These sit under the HUD and reveal word by word over the clip's length. Cut scenes and the talk
  bubble already show the words, so those clips play without a second subtitle. `voices.setSubtitles(false)` turns
  them off.
- **Priorities.** The order is story > radio/bark > talk > chat:
  - A line interrupts a lower-priority one in the dialogue channel.
  - A lower-priority line arriving during a higher one is dropped.
  - Radio has its own channel.
  - Up to two street conversations run at once, ducked under story lines.
  - A character never talks over themselves.
- **No repetition.** About 60% of a pool sits out after playing, and each line has a cooldown: talk 45 s, chat 90 s,
  radio 50 s.
- **Street conversations.** Every 7–16 s, two pedestrians within 7 m of each other and 3–30 m away swap lines in their
  own voices.
- **Passers-by.** On foot, walk within 2.6 m of someone and now and then (about every 6–12 s at most) they say
  something to you. The same person won't speak again for two minutes.
- **Level.** Voices are boosted 1.7× over the city's soundscape.
- **Police.**
  - Gunfire or a carjacking brings a radio call a moment later, at most every 40 s.
  - An officer in a police car within 45 m shouts.
- **Volume.** `voices.setVolume(0..1)` sets the level and is saved.

If the JSON or a clip fails to load, everything carries on silently with its on-screen text.
