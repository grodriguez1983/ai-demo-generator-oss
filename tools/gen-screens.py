#!/usr/bin/env python3
"""
Generate animated HTML screens + the demo YAML for a screen-based tutorial.

The "screen" path records animated slides instead of a real app: good for
concept explainers and code tutorials where the visual is a designed screen, not
a product UI. Each screen is one segment; the recorder navigates to it, the voice
is synced per segment, and `tools/calibrate-audio.py` locks the timing.

Screens are BUILD ARTIFACTS — you author them here as data and regenerate; you
never hand-edit the HTML. Run:

  python3 tools/gen-screens.py

It writes:
  assets/screens/<demo>/<n>.html     (one file per segment, numbered)
  src/config/<demo>.yaml             (the demo the pipeline records)

Then:
  PORT=5599 npx tsx tools/serve-screens.ts &
  node tools/gate-visual.mjs <demo> <N>                  # visual gate
  BASE_URL=http://127.0.0.1:5599 npx tsx src/index.ts --demo=<demo> --skip-seed --skip-render --skip-clips
  python3 tools/calibrate-audio.py <demo>                # sync voice↔screens
  BASE_URL=http://127.0.0.1:5599 npx tsx src/index.ts --demo=<demo> --skip-seed --skip-voice

Edit the DECK at the bottom of this file (or import these helpers from your own
script). The helpers mirror the theme classes in assets/screens/theme.css.
"""
import os, re, html

# Words-per-minute used to pre-size each segment's dwell (sleep). It is only a
# starting point — calibrate-audio.py sets the real value from the recorded mp3.
WPM = 160

HEAD = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    'family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;600&'
    'family=Playfair+Display:wght@900&display=swap">'
    '<link rel="stylesheet" href="/theme.css"></head>'
)
# Rebrand here: the top mark and the footer url.
BRAND = 'YOUR&nbsp;<b>PRODUCT</b>'
FOOT_URL = '<span class="url">yoursite.dev</span>'


# ── Frame ───────────────────────────────────────────────────────────
def pantalla(cuerpo, foot_left=''):
    return (f'{HEAD}<body><div class="screen">'
            f'<div class="brand">{BRAND}</div>'
            f'{cuerpo}'
            f'<div class="foot"><span>{foot_left}</span>{FOOT_URL}</div>'
            f'</div></body></html>')


# ── Templates ───────────────────────────────────────────────────────
def pizarra(frase, kick=''):
    """Whiteboard: one big phrase. Use <br> and <span class="g"> for accents."""
    k = f'<div class="kick">{kick}</div>' if kick else ''
    return f'<div class="pizarra">{k}<div class="phrase">{frase}</div></div>'


def editor(paso, nota, ruta, lineas):
    """Split 40/60: a prose column + a code pane. `lineas` is a list of code-line
    HTML (wrap tokens in .kw/.str/.com/.dim/.now; exactly one .now per screen)."""
    code = '\n'.join(f'<span class="ln">{str(i + 1).rjust(2)}</span>  {ln}'
                     for i, ln in enumerate(lineas))
    return (f'<div class="editor">'
            f'<div class="lado"><div class="paso">{paso}</div>'
            f'<div class="phrase" style="font-size:62px">{nota}</div></div>'
            f'<div class="pane"><div class="barra">'
            f'<div class="dot"></div><div class="dot"></div><div class="dot"></div>'
            f'<span class="ruta">{ruta}</span></div>'
            f'<pre>{code}</pre></div></div>')


def terminal(titulo, lineas):
    """Terminal card. In `lineas` use <span class="p">$</span>, .ok and .err."""
    return (f'<div class="terminal"><div class="term">'
            f'<div class="barra">{titulo}</div>'
            f'<pre>{chr(10).join(lineas)}</pre></div></div>')


def tablero(titulo, steps):
    """Progress board. steps = list of (label, state) with state in
    {'done','now','todo'} — ticks off what is finished and marks the current one."""
    lis = []
    for i, (label, state) in enumerate(steps, 1):
        cls = {'done': ' done', 'now': ' now', 'todo': ''}.get(state, '')
        mark = '✓' if state == 'done' else str(i)
        lis.append(f'<li class="step{cls}"><span class="num">{mark}</span>{label}</li>')
    return (f'<div class="tablero"><div class="titulo">{titulo}</div>'
            f'<ul>{"".join(lis)}</ul></div>')


# ── Build ───────────────────────────────────────────────────────────
def build(demo_id, meta, screens):
    """screens = list of dicts: { 'id', 'html', 'hint', 'foot'? }."""
    root = os.getcwd()
    out_dir = os.path.join(root, 'assets', 'screens', demo_id)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, f))

    segs, total_ms = [], 0
    for n, sc in enumerate(screens, 1):
        open(os.path.join(out_dir, f'{n}.html'), 'w').write(
            pantalla(sc['html'], sc.get('foot', '')))
        words = len(re.findall(r'\w+', sc['hint']))
        ms = int(words / WPM * 60 * 1000) + 400
        total_ms += ms + 200
        hint = sc['hint'].replace('\\', '\\\\').replace('"', '\\"')
        segs.append(
            f'  - id: {sc["id"]}\n'
            f'    actions: [ {{ type: navigate, path: /{demo_id}/{n}.html }}, {{ type: sleep, ms: {ms} }} ]\n'
            f'    pause_after_ms: 400\n'
            f'    narration_hint: "{hint}"')

    header = (
        f'# Generated by tools/gen-screens.py — do not hand-edit the screens.\n'
        f'id: {demo_id}\n'
        f'title: "{meta["title"]}"\n'
        f'description: "{meta["description"]}"\n'
        f'duration_target_seconds: {total_ms // 1000}\n'
        f'locale: {meta.get("locale", "en")}\n'
        f'skip_login: true\n'
        f'no_locale_prefix: true\n'
        f'skip_branding: true          # the screens already carry the message\n'
        f'verbatim_narration: true     # the hint IS the spoken line (keeps timing predictable)\n'
        f'video_width: 1920\n'
        f'video_height: 1080\n'
        f'viewport_width: 1920\n'
        f'viewport_height: 1080\n'
        f'narration_language: "{meta.get("narration_language", "English (US)")}"\n'
        f'tts_provider: elevenlabs\n'
        f'tts_speed: 1.0\n'
        f'segments:\n')

    yaml_path = os.path.join(root, 'src', 'config', f'{demo_id}.yaml')
    open(yaml_path, 'w').write(header + '\n'.join(segs) + '\n')
    print(f'{demo_id}: {len(screens)} screens → assets/screens/{demo_id}/  ·  src/config/{demo_id}.yaml')
    print(f'  provisional duration ~{total_ms // 1000}s (run calibrate-audio.py after pass 1)')


# ── Example deck (edit this) ────────────────────────────────────────
if __name__ == '__main__':
    DECK = [
        dict(id='intro', hint='This is a screen-based tutorial. Every slide you see is one segment, '
             'generated from a short Python script, with the voice synced to it.',
             html=pizarra('What is a <span class="g">screen tutorial</span>?',
                          kick='A 90-second tour')),

        dict(id='editor', hint='You write each screen as data. A code screen shows a file with real '
             'code, and one amber highlight points at exactly what the voice names right now.',
             html=editor('Step 1 · author', 'One amber focus<br>per screen.',
                         'tools/gen-screens.py',
                         ['<span class="kw">def</span> editor(paso, nota, ruta, lineas):',
                          '    <span class="com"># exactly one .now per screen</span>',
                          '    code = render(<span class="now">lineas</span>)',
                          '    <span class="kw">return</span> screen_html(code)'])),

        dict(id='terminal', hint='A terminal screen shows real output. Green for success, red for a '
             'failure. Nothing on screen that did not actually run.',
             html=terminal('bash — tools/gate-visual.mjs',
                           ['<span class="p">$</span> node tools/gate-visual.mjs intro 6',
                            '<span class="ok">no overflow</span>',
                            '<span class="p">$</span> npx tsx src/index.ts --demo=screens-demo --dry-run',
                            'Segments recorded: <span class="now">6</span>'])),

        dict(id='board', hint='A progress board keeps the viewer oriented: what is done, what comes '
             'next. It ticks off in time with the narration.',
             html=tablero('The flow', [
                 ('Author the deck', 'done'),
                 ('Visual gate', 'done'),
                 ('Record + voice', 'now'),
                 ('Calibrate sync', 'todo'),
                 ('Verify takes', 'todo'),
                 ('Render', 'todo')])),

        dict(id='sync', hint='After the first pass, one command measures each take and locks the '
             'screen timing to the audio, so nothing drifts.',
             html=pizarra('Record once, <span class="g">calibrate</span>,<br>record again in sync.',
                          kick='Two passes')),

        dict(id='outro', hint='That is the whole idea: design the screens, let the pipeline voice and '
             'render them, and the gates catch the cuts. Clone it and make one.',
             html=pizarra('Design it. <span class="g">Voice it.</span><br>Ship it.',
                          kick='Your turn')),
    ]
    build('screens-demo',
          dict(title='A 90-second tour of screen tutorials',
               description='A short screen-based explainer demonstrating the pizarra, editor, '
                           'terminal and board templates.'),
          DECK)
