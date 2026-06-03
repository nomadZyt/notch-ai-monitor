# Notch AI Monitor

Lightweight macOS-style prototype for monitoring AI CLI sessions around the MacBook notch.

## What It Contains

- `prototype/`: clickable static prototype (`index.html`, `styles.css`, `app.js`).
- `output/playwright/`: screenshots captured during visual QA.
- `design-qa.md`: checked states, findings, and QA result.

## Prototype Flow

1. Start in the settings desk.
2. Click `Start Monitoring` to auto-collapse into the notch area.
3. Click the left capsule to show running sessions.
4. Click the right capsule to show pending sessions.
5. Switch `Qwen CLI`, `Claude CLI`, and `Codex CLI` to see waiting, happy, and error moods.
6. Use `Locate` to bring up a mock terminal window.
7. Use `Review` to open the confirmation panel.

## Run Locally

```sh
python3 -m http.server 4173 --directory prototype
```

Then open:

```text
http://127.0.0.1:4173
```
