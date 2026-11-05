#!/usr/bin/env python3
"""Generate GTA Melbourne's dialogue audio offline from data/character-voices.json.

Each line is spoken with Orpheus Australian-English TTS (ablmontazer/orpheus-australian-en-tts, Apache-2.0), run on
the CPU through llama.cpp (the Q4_K_M GGUF quantisation by mradermacher) and decoded with SNAC (MIT). Every take is
transcribed back with Whisper (faster-whisper small.en, MIT) and re-rolled (up to --tries) until the words match the
script; the best take is kept. Then: trim the silence, normalise the loudness (-18 LUFS), radio lines get a police-
radio band-pass, crunch and squelch, and the clip is written as a 64 kb/s mono MP3 under assets/audio/<folder>/.
Its file, duration and match score go back into data/character-voices.json.

Requirements (no GPU needed; about 9x slower than real time on 4 CPU cores):
    python3 -m venv ttsenv
    ttsenv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
    ttsenv/bin/pip install numpy snac soundfile llama-cpp-python faster-whisper
    curl -L -o orpheus-au.Q4_K_M.gguf \\
      https://huggingface.co/mradermacher/orpheus-australian-en-tts-GGUF/resolve/main/orpheus-australian-en-tts.Q4_K_M.gguf
    ffmpeg (with libmp3lame) on the PATH

Usage:
    ttsenv/bin/python tools/voices/generate.py --model orpheus-au.Q4_K_M.gguf [--only id,id] [--force] [--tries 3]

Lines that already have a file are skipped unless --force (so it can be stopped and run again).
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data' / 'character-voices.json'
AUDIO = ROOT / 'assets' / 'audio'

# Orpheus control tokens (from the model card)
SOH, EOT, EOH, SOAI, SOS, EOS, EOAI, PAD, BASE_A = 128259, 128009, 128260, 128261, 128257, 128258, 128262, 128263, 128266


def words(text):
    text = text.lower().replace('-', ' ')
    text = re.sub(r"[^a-z0-9' ]+", ' ', text)
    return [w.strip("'") for w in text.split() if w.strip("'")]


def match_score(target, heard):
    return difflib.SequenceMatcher(None, words(target), words(heard)).ratio()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--model', required=True, help='the Orpheus Australian GGUF')
    ap.add_argument('--only', default='', help='comma-separated line ids')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--tries', type=int, default=3)
    ap.add_argument('--accept', type=float, default=0.8, help='stop re-rolling at this match score')
    ap.add_argument('--threads', type=int, default=os.cpu_count() or 4)
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    import torch
    from llama_cpp import Llama
    from snac import SNAC
    from faster_whisper import WhisperModel

    data = json.loads(DATA.read_text())
    only = set(filter(None, args.only.split(',')))
    todo = [l for l in data['lines'] if (not only or l['id'] in only) and (args.force or not l.get('file') or not (AUDIO / l['file']).exists())]
    print(f'[voices] {len(todo)} lines to generate')
    if not todo:
        return

    llm = Llama(model_path=args.model, n_ctx=2048, n_threads=args.threads, verbose=False)
    snac = SNAC.from_pretrained('hubertsiuzdak/snac_24khz').eval()
    whisper = WhisperModel('small.en', device='cpu', compute_type='int8')

    def speak(speaker, text, temperature, seed):
        llm.set_seed(seed)
        ids = [SOH] + llm.tokenize(f'{speaker}: {text}'.encode(), add_bos=False, special=False) + [EOT, EOH, SOAI, SOS]
        gen = []
        for tok in llm.generate(ids, temp=temperature, top_p=0.95, top_k=0, repeat_penalty=1.1, reset=True):
            if tok == EOAI or (tok == EOS and len(gen) > 50):
                break
            gen.append(tok)
            if len(gen) > 1600:
                break
        a = [x - BASE_A for x in gen if BASE_A <= x < BASE_A + 7 * 4096]
        n = len(a) // 7
        if n < 4:
            return None
        c0, c1, c2 = [], [], []
        for i in range(n):
            f = a[i * 7:i * 7 + 7]
            c0.append(f[0] % 4096)
            c1 += [f[1] % 4096, f[4] % 4096]
            c2 += [f[2] % 4096, f[3] % 4096, f[5] % 4096, f[6] % 4096]
        with torch.inference_mode():
            y = snac.decode([torch.tensor(c0)[None], torch.tensor(c1)[None], torch.tensor(c2)[None]])[0, 0].numpy()
        return y

    def transcribe(wav16):
        a, _ = sf.read(wav16, dtype='float32')
        segs, _ = whisper.transcribe(a, language='en', beam_size=5)
        return ' '.join(s.text.strip() for s in segs)

    def ffmpeg(*a):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *a], check=True)

    tmp = Path(tempfile.mkdtemp(prefix='voices-'))
    for n, line in enumerate(todo, 1):
        ch = data['characters'][line['character']]
        v = ch['voice']
        best = None
        t0 = time.time()
        for attempt in range(args.tries):
            seed = v.get('seed', 1) * 1000 + (abs(hash(line['id'])) % 997) + attempt * 7919
            y = speak(v['speaker'], line['text'], v.get('temperature', 0.6), seed)
            if y is None:
                continue
            raw = tmp / f'{line["id"]}_{attempt}.wav'
            sf.write(raw, y, 24000)
            w16 = tmp / f'{line["id"]}_{attempt}_16k.wav'
            ffmpeg('-i', str(raw), '-ar', '16000', '-ac', '1', str(w16))
            heard = transcribe(w16)
            score = match_score(line['text'], heard)
            if not best or score > best['score']:
                best = {'raw': raw, 'heard': heard, 'score': score}
            if score >= args.accept:
                break
        if not best:
            print(f'[voices] {line["id"]}: no audio')
            continue
        # trim the silence at both ends, normalise, radio treatment, MP3
        out = AUDIO / line['folder'] / f'{line["id"]}.mp3'
        out.parent.mkdir(parents=True, exist_ok=True)
        trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,' \
               'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse'
        chain = trim + ',loudnorm=I=-18:TP=-2:LRA=11'
        if line.get('radio'):
            # police radio: narrow band, a little crunch, a squelch at each end
            chain = trim + ',highpass=f=420,lowpass=f=3100,acompressor=threshold=-20dB:ratio=6,' \
                           'acrusher=bits=10:mix=0.25,loudnorm=I=-20:TP=-3,' \
                           'adelay=180|180,apad=pad_dur=0.2'
            noise = tmp / 'squelch.wav'
            ffmpeg('-f', 'lavfi', '-i', 'anoisesrc=d=0.14:c=white:a=0.18:r=24000', '-af', 'highpass=f=900,lowpass=f=3500', str(noise))
            mid = tmp / f'{line["id"]}_radio.wav'
            ffmpeg('-i', str(best['raw']), '-af', chain, '-ar', '24000', '-ac', '1', str(mid))
            ffmpeg('-i', str(noise), '-i', str(mid), '-i', str(noise), '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1',
                   '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', str(out))
        else:
            ffmpeg('-i', str(best['raw']), '-af', chain, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', str(out))
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out)],
                                   capture_output=True, text=True).stdout.strip() or 0)
        line['file'] = str(out.relative_to(AUDIO)).replace(os.sep, '/')
        line['duration'] = round(dur, 2)
        line['check'] = {'heard': best['heard'], 'score': round(best['score'], 2)}
        DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        print(f'[voices] {n}/{len(todo)} {line["id"]} ({v["speaker"]}): {dur:.1f}s, match {best["score"]:.2f} '
              f'in {time.time() - t0:.0f}s | heard: {best["heard"]}', flush=True)


if __name__ == '__main__':
    main()
