#!/bin/bash
# Verify EVERY TTS take against its real narration by transcribing it with whisper.
# A quality gate worth having with expressive voices: an expressive profile
# occasionally cuts a take short — and it cuts the END, where the call-to-action lives.
#
# Usage:  bash tools/verify-takes.sh <demo-id>          # e.g. my-tutorial
#         WHISPER_LANG=es bash tools/verify-takes.sh <demo-id>
#
# Source of truth: output/scripts/<demo>.json (the FULL text sent to TTS).
# Numbers ("eleven" vs "11") are normalized on both sides before comparing.
# ElevenLabs v3 intonation tags ([pause], [thoughtful]…) are stripped from the
# expected text before comparing, AND the script checks the model did not READ a
# tag out loud (that is a hard failure, not an observation).
#
# Output: nothing suspicious → "N takes verified — all complete".
# A flagged take is regenerated on its own with tools/regen-take.py; no full re-run.
# For gaps / robotic artifacts / pacing, use the other gate: tools/verify-audio.sh
#
# Requires: ffmpeg, and whisper-cli (whisper.cpp) with a model. Set:
#   WHISPER_MODEL  path to a ggml model (default: ~/.cache/whisper-models/ggml-small.bin)
#   WHISPER_LANG   language of the takes (default: en)
set -u
DEMO="${1:?missing demo id, e.g. my-tutorial}"
TXT="${2:-/tmp/transcripts-$DEMO}"
ROOT="${ROOT:-$(pwd)}"
AUDIO="$ROOT/output/audio"
JSON="$ROOT/output/scripts/$DEMO.json"
YAML="$ROOT/src/config/$DEMO.yaml"
MODEL="${WHISPER_MODEL:-$HOME/.cache/whisper-models/ggml-small.bin}"
LANG_W="${WHISPER_LANG:-en}"
mkdir -p "$TXT"

shopt -s nullglob
takes=("$AUDIO/$DEMO"-*.mp3)
if [ ${#takes[@]} -eq 0 ]; then
  echo "no takes for $DEMO in $AUDIO"; exit 1
fi

for f in "${takes[@]}"; do
  id=$(basename "$f" .mp3 | sed "s/^$DEMO-//")
  [ -f "$TXT/$id.txt" ] && continue
  ffmpeg -loglevel error -y -i "$f" -ar 16000 -ac 1 "/tmp/$id.wav"
  # Keep timestamps (stripped afterwards): without them whisper skips the middle
  # of long takes and reports a false cut.
  whisper-cli -m "$MODEL" -f "/tmp/$id.wav" -l "$LANG_W" -mc 0 -np 2>/dev/null | sed 's/^\[[^]]*\] *//' > "$TXT/$id.txt"
  rm -f "/tmp/$id.wav"
done

python3 - "$JSON" "$YAML" "$TXT" <<'PY'
import sys, re, os, json, unicodedata
json_path, yaml_path, txt_dir = sys.argv[1], sys.argv[2], sys.argv[3]

# --- expected text: full JSON preferred over the (possibly truncated) YAML hint ---
if os.path.exists(json_path):
    data = json.load(open(json_path))
    segs = [(s['segmentId'], s.get('text', '')) for s in data.get('segments', [])]
    source = 'output/scripts'
else:
    segs = re.findall(r'- id: (\S+).*?narration_hint: "(.*?)"$',
                      open(yaml_path).read(), re.M | re.S)
    source = 'YAML narration_hint (may be truncated)'

# --- normalization: accents, punctuation and NUMBERS ("eleven" == "11") ---
NUM = set("""cero un uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece
catorce quince veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento
mil millon millones primer primero primera segundo segunda tercer tercero cuarta quinto
zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety
hundred thousand million first second third fourth fifth""".split())
IS_NUM = re.compile(r'^(dieci\w+|veinti\w+|\d+([.,]\d+)?)$')

TAG_RE = re.compile(r'\[([a-z][a-z ]{2,20})\]')

def tags_of(s):
    return {t.strip().replace(' ', '') for t in TAG_RE.findall(s or '')}

def strip_tags(s):
    return TAG_RE.sub(' ', s or '')

def norm(s):
    s = re.sub(r'\[[a-z ]+\]', ' ', s)
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    toks = re.sub(r'[^a-z0-9 ]', ' ', s).split()
    return [t for t in toks if t not in NUM and not IS_NUM.match(t)]

problems = 0
for sid, narr in segs:
    p = os.path.join(txt_dir, f'{sid}.txt')
    if not os.path.exists(p):
        print(f'{sid}: NO AUDIO'); problems += 1; continue
    raw = open(p).read()
    said, expected = norm(raw), norm(strip_tags(narr))
    read_aloud = sorted(t for t in tags_of(narr) if t in set(said))
    if read_aloud:
        problems += 1
        print(f'{sid}: TAG READ ALOUD: {", ".join(read_aloud)} — regenerate (model != eleven_v3?)')
    if not expected:
        continue
    ratio = len(said) / max(1, len(expected))
    # Fuzzy tail: whisper mis-hears the odd word, so we don't require an exact
    # final word — we require most of the expected tail to appear at the end of
    # what was said. A real cut takes the whole tail, not one word.
    tail = [w for w in expected[-10:] if len(w) >= 4][-2:]
    end = said[-12:]
    def present(w):
        pre = w[:5]
        return any(t.startswith(pre) or (pre.startswith(t[:5]) and len(t) >= 4) for t in end)
    cut = bool(tail) and not any(present(w) for w in tail)
    if ratio < 0.9 or ratio > 1.15 or cut:
        problems += 1
        print(f'{sid}: ratio {ratio:.2f} ({len(said)}/{len(expected)} words, numbers excluded)'
              f'{" · POSSIBLE CUT AT END" if cut else ""}')
        print(f'   expected (end): ...{" ".join(expected[-14:])}')
        print(f'   said     (end): ...{" ".join(said[-14:])}')

print(f'\nexpected-text source: {source}')
print(f'{len(segs)} takes · {problems} with observations' if problems else
      f'{len(segs)} takes verified — all complete')
PY
