# Firebase setup for Phone Control

## Important security rule

The Firebase service-account JSON is a **server secret**. Never put it in:

- `android/`
- `google-services.json`
- `NEXT_PUBLIC_*` variables
- browser/client code
- Git
- the APK

The Android companion uses its normal Firebase client configuration (`google-services.json`) and **does not receive the service-account private key**.

## Server configuration

Set these variables in the Next.js server environment:

```env
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"YOUR_PROJECT_ID","private_key_id":"ROTATED_KEY_ID","private_key":"<SERVER_ONLY_PRIVATE_KEY>","client_email":"firebase-adminsdk-...@YOUR_PROJECT_ID.iam.gserviceaccount.com","client_id":"..."}'
FIREBASE_DATABASE_URL='https://YOUR_DATABASE_HOST'
```

Alternatively use a file outside the project:

```env
FIREBASE_SERVICE_ACCOUNT_PATH='C:\\secure\\jimskay\\service-account.json'
FIREBASE_DATABASE_URL='https://YOUR_DATABASE_HOST'
```

`FIREBASE_SERVICE_ACCOUNT_JSON` is preferred for hosted/server environments; `FIREBASE_SERVICE_ACCOUNT_PATH` is useful for a local desktop deployment.

## Realtime Database

Phone and PC agents use the existing Realtime Database task bridge:

- `devices/{deviceId}` — paired-device heartbeat/metadata
- `phoneTasks/{deviceId}/{taskId}` — Android tasks
- `tasks/{taskId}` — PC tasks

The server authenticates those REST calls using a short-lived Google OAuth access token created from the service account. The service-account key itself is never sent to the Android device.

## Rotate the exposed key

The service-account private key that was pasted into chat must be considered compromised. Revoke/delete that key in Google Cloud IAM and create a new key before deploying.
