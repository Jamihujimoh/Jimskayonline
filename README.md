# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.
## Windows Computer Use (Admin Mode)

Admin Mode can operate the paired Windows desktop through the local PC-control engine. The agent can inspect the desktop with screenshots and then iteratively use window, mouse, keyboard, application, media, and guarded system controls. Screenshot data is kept in-memory for the model decision loop and is not persisted to chat history.

For a packaged desktop build, keep the required local environment variables in `.env` before running `npm run desktop:build`. The build copies them into the private desktop bundle as `env.bundle`; do not commit that file or share it publicly.

The visual computer-use loop intentionally works one model/tool turn at a time so a fresh screenshot can be supplied as multimodal input before the next UI action. Destructive operations such as shutdown, restart, logoff, process termination, and window closing remain confirmation-gated.

## Unified Admin capabilities

Admin Mode now exposes one unified tool layer instead of separate narrow computer features. The agent can combine:

- **Computer use:** screenshots, mouse, keyboard, window management, app launching, media and volume controls.
- **Files:** read/write/list plus create, copy, rename, move, and delete operations with guards for destructive changes.
- **Processes:** inspect running processes, start commands/apps, and guarded process termination.
- **Browser:** open HTTP/HTTPS pages and then use the screenshot + mouse/keyboard loop to interact with visible web apps.
- **Clipboard:** read and write clipboard text for moving information between applications.
- **Terminal:** run Windows shell commands and validate their results.
- **Scheduling:** persist future safe actions such as opening a URL or launching an app. Scheduled actions are stored under `%LOCALAPPDATA%\JimskayAI`.
- **System:** inspect machine information and use guarded shutdown/restart/logoff controls.

The agent is designed to chain these capabilities in one task. For example, it can inspect a project, edit files, run a test, open the result in a browser, inspect the screen, and continue correcting it.

Scheduling deliberately does **not** silently send messages, submit forms, place trades, purchase items, delete data, or power off the PC. Those consequential actions remain behind explicit confirmation gates.

## Desktop build and Windows smoke tests

Build the Windows desktop bundle on a Windows machine after installing dependencies:

```bash
npm install
npm run desktop:build
npm run desktop:verify
npm run desktop:pack
```

The resulting installer is written to `release/`.

For a non-destructive PC-control smoke test, run this on Windows:

```bash
npm run desktop:pc-test
```

## Android phone control

The native phone companion and task executor are in [`android/`](./android/). It supports user-authorized Android UI observation and actions, app/site opening, plans with verification, and shared-storage file operations. It does not access other apps' private storage or bypass Android permissions. Passwords and verification codes must be entered manually on the phone.

Register `com.jimskay.phonecontrol` in the same Firebase project as the server, put its generated `google-services.json` at `android/app/google-services.json`, enable Anonymous Authentication, and deploy the Realtime Database rules from `database.rules.json` with `firebase deploy --only database`. Open `android/` in Android Studio to build the APK. Pair it by using the one-time code generated in the signed-in Phone Agent panel; the server registers the device and the code expires after five minutes. Follow [`src/PHONE_CONTROL_ARCHITECTURE.md`](./src/PHONE_CONTROL_ARCHITECTURE.md) for setup and phone-side permission steps. The APK is not bundled into the Windows desktop installer.

For installer/startup testing, PowerShell can validate the packaged application and its local server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-desktop-smoke-test.ps1 -AppPath ".\release\win-unpacked\Jimskay AI.exe"
```

The desktop shell binds the Next server to loopback only. It automatically tries ports 9002 through 9050 when `JIMSKAY_PORT` is not explicitly set, so an existing development server does not normally block the packaged app.


## Authorized browser downloads
Admin Mode can complete an authorized browser-download workflow: navigate with the normal browser UI, use a site's own Download control when offered, then verify the resulting file with the `waitForAuthorizedDownload` tool. It does not bypass DRM or site download restrictions.
