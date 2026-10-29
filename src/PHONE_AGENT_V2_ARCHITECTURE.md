# Jimskay Phone Agent V2

The Android companion is a general-purpose, user-authorized automation agent. It uses the same device/task transport already used by the working PC-control agent: Firebase Realtime Database for task delivery and result reporting. Firebase Storage is not involved.

## Agent loop

1. Observe the active accessibility/UI tree and, on supported Android versions, a compressed screenshot.
2. Reason about the current state.
3. Execute one action or a small verified plan.
4. Observe/verify the resulting state.
5. Recover and re-plan when the UI changes or an action fails.

## Capability families

- UI perception: text, content descriptions, resource IDs, class names, bounds, clickable/editable/scrollable state, active package, screenshot.
- UI actuation: tap, long press, text entry, clear, swipe, scroll, global navigation.
- Apps/web: launch installed apps, HTTP(S) URLs, web search, Android intents.
- Files: list/read/write/create directory/rename/move/copy/delete/info within user-accessible shared storage.
- Planning: ordered `runPlan` with optional `observeAfter` checkpoints.
- Verification: expected visible text/state checks.

## Security boundaries

The agent does not bypass Android permissions, root, app-private sandboxes, protected credentials, or security controls. Passwords, OTPs and verification codes are never sent through the agent. Destructive operations require explicit confirmation.

## APK permissions

Accessibility must be explicitly enabled by the user. Shared-storage automation uses Android's user-granted All files access where available.
