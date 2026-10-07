# assets/

Branding assets referenced from `src/config/demos.yaml` (or a per-demo
`branding:` block) live here.

- Drop a `logo.png` (or `.svg`) here and point `branding.logo_path` at it, e.g.
  `logo_path: "assets/logo.png"`. If omitted, the intro/outro slides use text only.
- Files referenced by an `upload-file` action (a sample PDF, an image) can also
  live here; reference them by path relative to the repo root.

Nothing here is required — the bundled example renders a text-only intro/outro.
