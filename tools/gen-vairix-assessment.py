#!/usr/bin/env python3
"""
Author the "AI Maturity Assessment" explainer (Vairix) as a screen deck.

Imports the helpers from tools/gen-screens.py, overrides the brand mark (the real
vairix-white.svg logo) and the footer url, and emits the screens + YAML.

  python3 tools/gen-vairix-assessment.py

Every narration_hint IS the spoken line (verbatim). Every claim is sourced from
Vairix's own pages (home + the blog "If AI Changes How We Build, It Must Change
How We Measure"). No invented metrics, no over-claim (SPEC §4).
"""
import importlib.util, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
spec = importlib.util.spec_from_file_location(
    "gen_screens", os.path.join(ROOT, "tools", "gen-screens.py"))
gs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gs)

# ── Rebrand the shared frame to Vairix ──────────────────────────────
gs.BRAND = ('<img src="/vairix-white.svg" alt="VAIRIX" '
            'style="height:26px;vertical-align:middle;opacity:.95">')
gs.FOOT_URL = '<span class="url">vairix.com</span>'

p, board = gs.pizarra, gs.tablero

DECK = [
    dict(id='hook',
         hint="AI made shipping software almost free. Which raises an "
              "uncomfortable question: is your codebase actually getting "
              "better, or just getting bigger?",
         html=p('AI made shipping<br>almost <span class="g">free.</span>',
                kick='THE AI MATURITY ASSESSMENT')),

    dict(id='green',
         hint="Your dashboards still look healthy. Tickets closed, velocity "
              "up, test coverage green. But those numbers were built for a "
              "world where writing the code was the hard part.",
         html=p('Your dashboards<br>still look <span class="g">green.</span>',
                kick='THE NUMBERS LOOK FINE')),

    dict(id='durability',
         hint="Underneath that green, the system can quietly get harder to "
              "understand, harder to protect, and harder to change without "
              "breaking something. The usual metrics can't see it.",
         html=p('…while the code gets<br>harder to '
                '<span class="g">protect.</span>',
                kick='WHAT THE METRICS MISS')),

    dict(id='shift',
         hint="So Vairix flips what you measure. Not how much work moves "
              "through the system, but whether that work is durable.",
         html=p("Measure what's <span class=\"g\">durable</span>.<br>"
                "Not how much moves.",
                kick='THE SHIFT')),

    dict(id='assessment',
         hint="That's the AI Maturity Assessment: a diagnostic Vairix runs on "
              "real projects, built around durability instead of speed.",
         html=p('The <span class="g">AI&nbsp;Maturity<br>'
                'Assessment.</span>',
                kick='A DIAGNOSTIC, NOT A SCORE')),

    dict(id='dimensions',
         hint="It traces five dimensions of durable delivery. Take the first: "
              "whether every change you merge carries a decision a reviewer "
              "can follow, without asking the person who wrote it.",
         html=board('Five dimensions of durable delivery', [
             ('Traceable decisions', 'now'),
             ('A defense system that catches bugs early', 'done'),
             ('Memory of the decisions behind the code', 'done'),
             ('Behavioral protection over coverage', 'done'),
             ('Review that scales', 'done'),
         ])),

    dict(id='map',
         hint="It samples your recently merged changes and traces each one "
              "across those five. And what comes back isn't a score. It's a "
              "map: what your process already protects, and what still depends "
              "on one specific person.",
         html=p('Not a score.<br>A <span class="g">map</span>.',
                kick='THE OUTPUT')),

    dict(id='cta',
         hint="It's a complimentary, forty-minute session. If AI changed how "
              "your team builds, this is how you find out what it changed. "
              "Get your assessment, at vairix dot com.",
         html=p('Get your <span class="g">assessment.</span>',
                kick='COMPLIMENTARY · 40 MINUTES · VAIRIX.COM')),
]

META = dict(
    title='AI Maturity Assessment — Vairix',
    description='A short branded explainer of Vairix\'s AI Maturity Assessment: '
                'why traditional engineering metrics miss durability, and what '
                'the assessment maps.',
    locale='en',
    narration_language='English (US)',
    tts_speed=0.82)  # gabriel reads ~205 wpm at 1.0; 0.82 → ~165, calm

# Two formats, one deck: `python3 tools/gen-vairix-assessment.py` (landscape 16:9)
# or `... reel` (portrait 9:16 for reels/stories). Same voice, same words.
import sys
if 'reel' in sys.argv[1:]:
    gs.build('vairix-assessment-reel',
             dict(META, title='AI Maturity Assessment — Vairix (reel)',
                  width=1080, height=1920),
             DECK)
else:
    gs.build('vairix-assessment', META, DECK)
