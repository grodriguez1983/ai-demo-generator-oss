#!/usr/bin/env python3
"""
Calibrate screen↔voice sync for a demo whose segments drive animated screens.

The problem: Playwright adds ~1s of overhead per navigation, so if each segment's
on-screen dwell is a fixed guess, the audio drifts ~1s per segment. The fix is a
two-pass flow:

  pass 1:  record + generate voice (no render)
             npx tsx src/index.ts --demo=<id> --skip-seed --skip-render --skip-clips
  calibrate: THIS script — measure each segment's real mp3 and set its `sleep`
             action to (audio duration + margin) in the YAML
  pass 2:  re-record with the calibrated dwells, then render
             npx tsx src/index.ts --demo=<id> --skip-seed --skip-voice

For this to work, each content segment must end with a sleep action whose ms is
what we calibrate, e.g.  { type: sleep, ms: 1000 }

Usage:
  python3 tools/calibrate-audio.py <demo-id> [<demo-id> ...]

Env:
  MARGIN_MS   extra ms added to each audio duration (default 400)
"""
import subprocess, os, re, sys

MARGIN_MS = int(os.environ.get('MARGIN_MS', '400'))

# Trim leading/trailing silence so the measured duration is the spoken audio.
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05:detection=peak,"
        "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25:detection=peak,areverse")

demos = sys.argv[1:]
if not demos:
    print('usage: calibrate-audio.py <demo-id> [<demo-id> ...]'); sys.exit(1)


def dur_ms(path):
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=nk=1:nw=1', path],
            capture_output=True, text=True).stdout.strip()
        return int(round(float(out) * 1000)) if out else 0
    except Exception:
        return 0


def segment_id(chunk):
    # chunk starts right after "- id: "; the id is the rest of that first line.
    return chunk.split('\n', 1)[0].strip().strip('"\'')


for demo in demos:
    path = f'src/config/{demo}.yaml'
    if not os.path.exists(path):
        print(f'!! {path} does not exist, skipping'); continue

    text = open(path).read()
    # Split on segment headers, KEEPING the delimiter (indentation + "- id: ")
    # so the file's formatting survives the round-trip.
    parts = re.split(r'(?m)(^[ \t]*- id: )', text)
    out, total, touched = [parts[0]], 0, 0
    n_segs = 0

    i = 1
    while i < len(parts):
        delim = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ''
        n_segs += 1
        sid = segment_id(body)
        mp3 = f'output/audio/{demo}-{sid}.mp3'
        if os.path.exists(mp3):
            tmp = mp3 + '.trim.mp3'
            subprocess.run(['ffmpeg', '-y', '-i', mp3, '-af', TRIM, tmp],
                           capture_output=True, text=True)
            if os.path.exists(tmp) and os.path.getsize(tmp) > 1000:
                os.replace(tmp, mp3)
            ms = dur_ms(mp3) + MARGIN_MS
            body, n = re.subn(r'(sleep, ms: )\d+', lambda m: m.group(1) + str(ms), body, count=1)
            if n:
                total += ms
                touched += 1
        out.append(delim)
        out.append(body)
        i += 2

    open(path, 'w').write(''.join(out))
    print(f'{demo}: {touched}/{n_segs} segments calibrated, '
          f'video ~= {round(total / 1000 + n_segs * 0.2, 1)}s')
