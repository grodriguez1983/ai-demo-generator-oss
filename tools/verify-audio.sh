#!/bin/bash
# AUDIO gate: internal gaps, volume, clipping and speaking rate — per take.
# Complements verify-takes.sh (that one checks if a take was CUT; this one checks
# if it SOUNDS right). Everything it flags is measurable, so it measures it.
#
# Usage:  bash tools/verify-audio.sh <demo-id>
#         WPM_MIN=140 WPM_MAX=190 SIL_MIN=1.1 bash tools/verify-audio.sh <demo-id>
#
# What it flags (one line per take with observations):
#   GAP       long internal silence (> SIL_MIN s) — a cut or an odd breath
#   VOLUME    mean outside range → this take is quieter/louder than the rest
#   CLIP      peak near 0 dB → distortion
#   FAST      speaking rate too high → the viewer can't read the screen in time
#   SLOW      speaking rate too low → usually a take with a long silence inside
set -u
DEMO="${1:?missing demo id, e.g. my-tutorial}"
ROOT="${ROOT:-$(pwd)}"
AUDIO="$ROOT/output/audio"
JSON="$ROOT/output/scripts/$DEMO.json"

SIL_DB="${SIL_DB:--32}"          # silence threshold
SIL_MIN="${SIL_MIN:-1.1}"        # seconds of internal silence that counts as a gap
MEAN_MIN="${MEAN_MIN:--27}"      # dBFS
MEAN_MAX="${MEAN_MAX:--14}"
PEAK_MAX="${PEAK_MAX:--0.5}"
WPM_MIN="${WPM_MIN:-120}"
WPM_MAX="${WPM_MAX:-190}"        # above this the viewer can't keep up with the screen

[ -d "$AUDIO" ] || { echo "no $AUDIO dir"; exit 1; }

MED=$(mktemp)
trap 'rm -f "$MED"' EXIT

shopt -s nullglob
takes=("$AUDIO/$DEMO"-*.mp3)
[ ${#takes[@]} -gt 0 ] || { echo "no takes for $DEMO in $AUDIO"; exit 1; }

for f in "${takes[@]}"; do
  id=$(basename "$f" .mp3 | sed "s/^$DEMO-//")
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  info=$(ffmpeg -v info -i "$f" -af "volumedetect,silencedetect=n=${SIL_DB}dB:d=${SIL_MIN}" \
         -f null - 2>&1)
  mean=$(echo "$info" | sed -n 's/.*mean_volume: \(.*\) dB.*/\1/p' | tail -1)
  peak=$(echo "$info" | sed -n 's/.*max_volume: \(.*\) dB.*/\1/p' | tail -1)
  # internal silences: those that don't start at 0 nor end at the very end
  gaps=$(echo "$info" | awk -v dur="$dur" '
    /silence_start/ { s=$NF }
    /silence_end/   { e=$(NF-2); if (s>0.35 && e<dur-0.35) n++ }
    END { print n+0 }')
  echo "$id|$dur|${mean:-na}|${peak:-na}|$gaps" >> "$MED"
done

python3 - "$MED" "$JSON" "$SIL_MIN" "$MEAN_MIN" "$MEAN_MAX" "$PEAK_MAX" "$WPM_MIN" "$WPM_MAX" <<'PY'
import sys, os, json, re
med_path, json_path, sil_min = sys.argv[1], sys.argv[2], float(sys.argv[3])
mean_min, mean_max, peak_max = map(float, sys.argv[4:7])
wpm_min, wpm_max = map(float, sys.argv[7:9])

words = {}
if os.path.exists(json_path):
    for s in json.load(open(json_path)).get('segments', []):
        # ElevenLabs tags ([pause]…) aren't spoken; a contraction (won't) is one word
        words[s['segmentId']] = len(re.findall(r"\w+(?:['’]\w+)*", re.sub(r'\[[a-z ]+\]', ' ', s.get('text', ''))))

rows, problems = [], 0
for line in open(med_path):
    sid, dur, mean, peak, gaps = line.strip().split('|')
    dur, gaps = float(dur), int(gaps)
    obs = []
    if gaps:
        obs.append(f'GAP x{gaps} (internal silence > {sil_min}s)')
    try:
        if float(mean) < mean_min: obs.append(f'VOLUME low ({mean} dB)')
        elif float(mean) > mean_max: obs.append(f'VOLUME high ({mean} dB)')
        if float(peak) > peak_max: obs.append(f'CLIP (peak {peak} dB)')
    except ValueError:
        obs.append('VOLUME not measured')
    if sid in words and dur > 1:
        wpm = words[sid] / dur * 60
        if wpm > wpm_max: obs.append(f'FAST ({wpm:.0f} wpm)')
        elif wpm < wpm_min: obs.append(f'SLOW ({wpm:.0f} wpm)')
    rows.append((sid, dur, obs))
    if obs: problems += 1

for sid, dur, obs in rows:
    if obs:
        print(f'{sid}: {dur:5.1f}s · ' + ' · '.join(obs))

total = len(rows)
if not words:
    print('\n(no output/scripts/<demo>.json: speaking rate not measured)')
print(f'\n{total} takes · {problems} with observations' if problems else
      f'\n{total} takes · audio healthy (no gaps, volume and rate in range)')
PY
