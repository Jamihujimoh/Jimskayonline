# Jimskay AI — Android build target

This directory contains the Android build target for Jimskay AI. It produces the Jimskay AI APK (application ID `ai.jimskay.mobile`), not a separate companion-branded app. The Android target uses Firebase Authentication and Realtime Database for phone-control tasks and Android Accessibility/system APIs for user-authorized actions. Android permissions and OS restrictions mean this is not unrestricted remote control.

## Configure Firebase

1. In Firebase Console, enable **Authentication → Email/Password** and create a Realtime Database.
2. Register an Android app in that Firebase project with application ID `ai.jimskay.mobile`.
3. Copy `firebase.properties.example` to `firebase.properties` in this directory and fill in the four Firebase client configuration values from the Firebase app/project settings:
   - `firebaseApiKey`
   - `firebaseApplicationId`
   - `firebaseProjectId`
   - `firebaseDatabaseUrl` (the full `https://…firebasedatabase.app` or `https://…firebaseio.com` URL for your database)
4. `firebase.properties` is ignored by git. No service-account key or other privileged credential is used. Firebase client configuration is not a substitute for database security rules.
5. Open this directory in Android Studio, let Gradle sync, then build/install the `app` configuration. Alternatively, from this directory run `gradle :app:assembleDebug` with JDK 17, Android SDK Platform 35, and Gradle 8.9 or newer installed. The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Without `firebase.properties`, the project still compiles, but the app displays a setup message and does not initialize Firebase.

## Pair and connect

Sign in or create an email/password account, enter a device name, and tap **Register / connect device**. The app creates/reuses a random local device ID for that Firebase user, writes the registration, then starts a visible Android data-sync foreground service with an ongoing notification. Task polling can continue while another app is open. Use **Disconnect** in the app or its notification to stop it. Android may stop or time-limit long-running data-sync services; reconnect from the app if that happens.

```text
devices/{deviceId} = {
  userId: "{authenticated Firebase UID}",
  deviceType: "android",
  name: "{device name}",
  lastSeen: <server timestamp>
}
```

Task polling listens directly at `phoneTasks/{deviceId}`. The task reference used for polling, approval lookup, status/result updates, and picker completion is `phoneTasks/{deviceId}/{taskId}`. Backend tasks are children keyed by task ID; a minimal task shape is:

```json
{
  "status": "pending",
  "action": "open_url",
  "url": "https://example.com"
}
```

Supported actions include opening and listing launcher apps, opening HTTP(S) URLs, web search, safe visible-screen reading, tapping visible text, entering ordinary text, swiping, opening supported Settings pages, system file picking, and basic device/storage information. Shared-storage directory listing and single-file deletion require an absolute path under the shared-storage root (for example, `/storage/emulated/0/Download`). Directory listings return up to 500 entries; directories cannot be deleted. The user must grant Jimskay AI Android's **All files access** special permission from the app's control screen before these shared-storage actions work. Deletion additionally requires approval from an on-device notification. File contents are deliberately not read or written because they would otherwise pass through Firebase Realtime Database.

Tasks transition through `awaiting_approval` or `awaiting_user` when user input is needed, and otherwise `running`, then `completed`, `failed`, or `rejected`; terminal updates include a `result` object and `completedAt`.

Completed, failed, and rejected tasks remain available for result consumption for at most **10 minutes** while the foreground connection is running, then Jimskay AI removes them from `phoneTasks/{deviceId}`. Expired terminal tasks are also pruned when the connection starts again. Realtime Database has no native TTL; if the service is stopped and never reconnects, device-side cleanup cannot run, so configure a server-side expiry policy if a strict retention bound is required.

No query index is needed for the per-device task listener. Realtime Database rules should scope access under `phoneTasks/{deviceId}` to the authenticated device owner. Adapt this illustrative rule to the project's deployed rules and write model:

```json
{
  "rules": {
    "phoneTasks": {
      "$deviceId": {
        ".read": "auth != null && root.child('devices').child($deviceId).child('userId').val() === auth.uid",
        ".write": "auth != null && root.child('devices').child($deviceId).child('userId').val() === auth.uid"
      }
    }
  }
}
```

The repository's `database.rules.json` includes owner-scoped rules for `devices/{deviceId}` and `phoneTasks/{deviceId}`. Deploy the Realtime Database rules before pairing devices. The existing legacy `/tasks` branch remains broadly authenticated for the desktop agent; phone tasks use the separate owner-scoped `/phoneTasks` branch. Do not treat the app as a security boundary.

## Accessibility and action approval

Tap **Enable accessibility service** and enable Jimskay AI in Android Settings. Android requires this explicit, per-device user action. The foreground connection has a persistent notification and updates `lastSeen` while it is running; Android and device manufacturers can still restrict or stop it. Accessibility operations can fail or behave differently in other apps, and Android/system UI may block them.

`tap_text`, `type_text`, shared-file deletion, and tasks whose action/description indicates consequential activity (such as submit, register, send, purchase, pay, transfer, or post), require explicit approval through an on-phone notification showing the requested action and **Approve** / **Reject** buttons. The operation runs only after approval. Task objects containing password/passcode/secret/credential/token/PIN/OTP/code fields are rejected. Picker results contain only the user-selected URI. Typing searches only for ordinary editable fields and avoids password or sensitive-labeled fields. `inspect_screen` / `readScreen` omits secure nodes and fields labeled for passwords, PINs, OTPs, verification codes, or authentication/security codes; UI-provided labels are not always reliable, so treat observations as potentially incomplete.

System file/media picker tasks return only a URI the user selected. Shared-file access is restricted to Android shared storage and does not expose another app's private data. No microphone/camera capture, shell/root commands, force-stopping other apps, permission bypass, or hidden operation is implemented. Android's All files access is a special, user-granted permission; distribution through Google Play is subject to its current policy and eligibility requirements.

## Permission and platform limits

The app requests Internet access and declares Android's foreground-service and shared-storage permissions. Android 13 and newer require notification permission for the persistent connection and task approvals; the app asks when connecting and does not start the background task service if permission is denied. Accessibility access and All files access are separately granted by the user in Android Settings; the app cannot enable either by itself. Opening apps, URLs, general Settings, gestures, screen inspection, and text entry depend on Android accessibility policies, the installed app's UI, device OEM behavior, and Android version. Android does not allow an ordinary app to run desktop-style terminal commands, force-stop arbitrary apps, or inspect other apps' private files. These capabilities are not claimed or bypassed.
