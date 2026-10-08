#!/usr/bin/env python3
"""Regenerate ONE TTS take (or a few) without re-running the whole pipeline pass.

Why: an expressive ElevenLabs profile is stochastic — it sometimes cuts a take,
adds a gap, or reads faster than the rest. When verify-takes.sh or verify-audio.sh
flag a take, this re-requests it with the SAME params as the demo YAML and
overwrites the mp3. The previous mp3 is kept as .bak.

  python3 tools/regen-take.py <demo-id> <seg-id> [<seg-id> ...]
  python3 tools/regen-take.py my-tutorial s12 --text "different text"   # one take
  python3 tools/regen-take.py my-tutorial s5 --speed 0.94               # last resort

--speed is the LAST resort for a take stuck above the WPM limit after two tries;
first cut the sentence or add a period. If used, note it in the production notes.

After regenerating, ALWAYS re-run the audio gate and the whisper check: a fresh
take can come out worse than the old one (hence the .bak).

Reads ELEVENLABS_API_KEY etc. from the repo's .env (same as the pipeline).
"""
import os, re, sys, json, urllib.request, subprocess, shutil

ROOT = os.environ.get('ROOT', os.getcwd())


def env(k):
    p = f'{ROOT}/.env'
    if not os.path.exists(p):
        return None
    for line in open(p):
        line = line.strip()
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip().strip('"\'')
    return None


def yaml_val(y, k, default=None, cast=str):
    m = re.search(rf'^\s*{k}:\s*(.+)$', y, re.M)
    return cast(re.sub(r'\s+#.*$', '', m.group(1)).strip().strip('"')) if m else default


def dur(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'default=nk=1:nw=1', p], capture_output=True, text=True).stdout.strip()
    return float(out) if out else 0.0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    text_over = sys.argv[sys.argv.index('--text') + 1] if '--text' in sys.argv else None
    speed_over = float(sys.argv[sys.argv.index('--speed') + 1]) if '--speed' in sys.argv else None
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    demo, sids = args[0], args[1:]

    y = open(f'{ROOT}/src/config/{demo}.yaml').read()
    key = env('ELEVENLABS_API_KEY')
    if not key:
        print('ELEVENLABS_API_KEY missing from the repo .env'); sys.exit(1)
    voice = yaml_val(y, 'tts_voice_id') or env('ELEVENLABS_VOICE_ID') or '21m00Tcm4TlvDq8ikWAM'
    model = yaml_val(y, 'tts_model') or env('ELEVENLABS_MODEL') or 'eleven_multilingual_v2'
    settings = {
        'stability':         yaml_val(y, 'tts_stability', 0.5, float),
        'similarity_boost':  yaml_val(y, 'tts_similarity', 0.85, float),
        'style':             yaml_val(y, 'tts_style', 0.0, float),
        'use_speaker_boost': True,
        'speed':             min(1.2, max(0.7, yaml_val(y, 'tts_speed', 1.0, float))),
    }
    if model in ('eleven_v3', 'eleven_v4'):
        settings.pop('style'); settings.pop('use_speaker_boost')
    if speed_over is not None:
        settings['speed'] = min(1.2, max(0.7, speed_over))
        print(f'(speed forced to {settings["speed"]} — note it in the production notes)')

    # Full text lives in output/scripts/<demo>.json (the YAML hint may be truncated).
    narr = dict(re.findall(r'- id: (\S+)\n(?:.*\n)*?\s+narration_hint: "(.*?)"\n', y))
    js = f'{ROOT}/output/scripts/{demo}.json'
    if os.path.exists(js):
        narr.update({s['segmentId']: s['text'] for s in json.load(open(js)).get('segments', [])})

    for sid in sids:
        text = text_over or narr.get(sid)
        if not text:
            print(f'{sid}: no narration found'); continue
        text = text.replace('\\"', '"')
        mp3 = f'{ROOT}/output/audio/{demo}-{sid}.mp3'
        before = dur(mp3) if os.path.exists(mp3) else 0
        if os.path.exists(mp3):
            shutil.copyfile(mp3, mp3 + '.bak')
        req = urllib.request.Request(
            f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
            data=json.dumps({'text': text, 'model_id': model, 'voice_settings': settings}).encode(),
            headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'},
            method='POST')
        with urllib.request.urlopen(req) as r:
            open(mp3, 'wb').write(r.read())
        words = len(re.findall(r'\w+', text))
        d = dur(mp3)
        print(f'{sid}: {before:.1f}s → {d:.1f}s · {words / d * 60:.0f} wpm  (backup: {os.path.basename(mp3)}.bak)')


main()
