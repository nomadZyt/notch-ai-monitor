# Notch AI Monitor

Lightweight macOS-style prototype for monitoring AI CLI sessions around the MacBook notch.

## What It Contains

- `prototype/`: static spec board (`index.html`, `styles.css`, `app.js`) rebuilt from the concept image.
- `docs/spec-from-concept.md`: design tokens and acceptance notes.
- `prototype/9F9FEDCA-9B8F-4C94-B3D6-0BF3A0925B57.png`: visual source of truth.
- `output/playwright/`: screenshots for visual QA.

## Prototype Flow

1. **Row 1 — Resting island** (~268px): icon stack, purple pulse ring, alert badge `2`; sessions popover below.
2. **Row 2 — Peek**: single island (~336px) with alert strip and purple glowing eyes on the peek bump.
3. **Row 3 — Action**: peek pill + action panel (tabs, `Run generated command?`, Locate / Review).
4. **Row 4 — Expression system**: click a mood card to update peek faces on rows 2–3; click islands to cycle moods.

## Run Locally

```sh
python3 -m http.server 4173 --directory prototype
```

Then open:

```text
http://127.0.0.1:4173
```
