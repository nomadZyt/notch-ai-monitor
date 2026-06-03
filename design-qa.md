# Design QA

## Target

Mac notch AI CLI monitor prototype in `prototype/`, based on the selected dual-capsule macOS direction.

## Checked States

- Setup desk: `output/playwright/notch-ai-monitor-setup.png`
- Resting notch state: `output/playwright/notch-ai-monitor-resting.png`
- Left sessions capsule: `output/playwright/notch-ai-monitor-sessions.png`
- Right action capsule: `output/playwright/notch-ai-monitor-alert-fixed.png`
- Reference-aligned active view: `output/playwright/notch-ai-monitor-perfect-pass3.png`
- Completed happy state: `output/playwright/notch-ai-monitor-session-switch.png`
- Error angry state: `output/playwright/notch-ai-monitor-error-open.png`
- Locate window state: `output/playwright/notch-ai-monitor-locate-extended.png`
- Review command state: `output/playwright/notch-ai-monitor-review-flow.png`
- Expression map full view: `output/playwright/notch-ai-monitor-expressions-full-v2.png`
- Expression map narrow preview: `output/playwright/notch-ai-monitor-expressions-viewport-v2.png`
- Refined face capsule crop: `output/playwright/notch-ai-monitor-face-mouth-lowered-crop.png`
- Fused face capsule crop: `output/playwright/notch-ai-monitor-face-fused-final-crop.png`
- Target-matched face crop: `output/playwright/notch-ai-monitor-face-target-match-crop.png`

## Findings

- P0/P1/P2: none found after iteration.
- P3: emotional face is intentionally subtle; later native prototype can tune mouth/eye animation curves.
- P3: Locate currently uses a mock terminal window; native implementation should bind this to actual window focus/highlight APIs.
- P3: Expression map is appended as a fourth spec row, so the page now scrolls when the preview browser is narrow or short.
- P3: Face bump was tightened after review so the eyes and mouth read as part of the capsule instead of a pasted badge.
- P3: Face bump now uses the alert capsule itself to draw the raised contour, reducing the pasted-on visual separation.
- P3: Latest face revision uses a wider oval contour, removes the hard connector band, and changes waiting mouth to a short dash to better match the reference crop.

## Console

Playwright console check: 0 errors, 0 warnings.

## Interaction Check

- Waiting, Happy, Sad, and Angry expression cards each update the main capsule mood and selected state.

## Final Result

passed
