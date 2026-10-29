# Jimskay Unified Creation System + Phone Control

This source tree is the single application source. The creation system (Visual Artifacts, Visual Lessons, Video/PDF production) and Android Phone Control are integrated together.

## Shared control route

PC and Android use the same authenticated route:

`POST /api/control/action`

Both require the server `ADMIN_PIN`.

- `target: "pc"` executes the local Windows control engine.
- `target: "phone"` queues work in the in-process phone control hub for the paired Android companion.
- Android uses the same admin PIN to register, heartbeat, poll, and return task results.

The phone-control transport does **not** require a Firebase service-account private key.

## Android

Open the `android/` folder in Android Studio and follow `android/BUILD_AND_INSTALL.md`.

The Android app uses the normal HTTP control endpoint and does not contain a Firebase service-account key.
