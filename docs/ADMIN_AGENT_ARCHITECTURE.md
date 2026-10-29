# Jimskay AI Admin Agent Architecture

Admin Mode now uses a layered computer-use loop:

**Plan → Observe → Act → Verify → Recover → Continue → Complete**

## Perception

- Windows UI Automation exposes accessible controls.
- `inspectDesktop` captures the desktop and runs spatial OCR when text/layout is not exposed semantically.
- `pcControl:screenshot` provides the raw visual state to the model.
- Browser automation exposes page text/DOM state and browser screenshots.

## Action selection

The agent should prefer, in order:

1. Semantic Windows UI Automation.
2. Browser DOM/accessibility automation for browser tasks.
3. Keyboard/clipboard actions.
4. Mouse coordinates only when the other methods cannot reach the target.

## Verification

Important actions must be followed by direct observation. `verifyAdminState` can verify:

- file existence/content
- process state
- window existence
- clipboard contents

The agent is instructed not to declare success from an action's return value alone.

## Recovery

When verification fails, the agent re-observes the current state and tries a focused alternative interaction method. It should not repeat an identical failed action indefinitely.

## Persistent task state

Each Admin task records its phase, round count, latest action, latest verification, errors, and a bounded event journal under `%LOCALAPPDATA%\\JimskayAI\\admin-tasks.json`.

This state is intended for visibility and recovery; it does not bypass Admin authentication or confirmation gates.

## Boundaries

Destructive or consequential actions retain explicit confirmation gates. Website protections, DRM, authentication controls, paywalls, and download restrictions are not bypassed.
