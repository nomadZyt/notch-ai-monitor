# Design QA

## Target

Single centered `.notch-island` spec board in `prototype/`, validated against:

`prototype/9F9FEDCA-9B8F-4C94-B3D6-0BF3A0925B57.png`

## Checked States

- Full spec board: `output/playwright/notch-ai-monitor-spec-board.png`
- Resting + sessions: `output/playwright/notch-ai-monitor-resting.png`
- Peek state: `output/playwright/notch-ai-monitor-peek.png`
- Action expanded: `output/playwright/notch-ai-monitor-action.png`
- Expression row: `output/playwright/notch-ai-monitor-expressions.png`

## Acceptance

- Resting island width 268px; peek/action pill 336px; no dual run+alert capsule layout.
- Glass chrome, peek bump, and four moods match `docs/spec-from-concept.md`.
- Compare new Playwright captures side-by-side with the concept PNG (not legacy crop baselines).

## Interaction

- Expression cards set `data-mood` on `.desktop` and update `.main-face` on peek rows.
- Island pills with `data-cycle-mood` cycle Waiting → Happy → Sad → Angry.
