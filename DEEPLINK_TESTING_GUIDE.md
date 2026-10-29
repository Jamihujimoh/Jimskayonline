# Deeplink Auto-Pairing Testing Guide

## Pre-Test Setup

### 1. Prerequisites

- Android device or emulator (API 26+, Android 8.0+)
- Jimskay server running with valid Firebase configuration
- `google-services.json` in `android/app/`
- Server environment variables set:
  - `FIREBASE_DATABASE_URL=https://your-project.firebaseio.com`
  - `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH`
  - `ADMIN_PIN=<your-pin>`

### 2. Build and Install

```bash
cd android
./gradlew clean assembleDebug
# Install the generated android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Test Scenarios

### Test 1: Deeplink Auto-Pairing (Primary Happy Path)

**Goal:** Verify automatic pairing via deeplink works end-to-end.

**Steps:**

1. **Generate pairing code on server:**
   ```bash
   curl -X POST http://localhost:3000/api/phone/pair \
     -H "Content-Type: application/json" \
     -d '{"pin":"YOUR_ADMIN_PIN","userId":"test-user-123"}'
   ```
   
   **Expected response:**
   ```json
   {
     "ok": true,
     "code": "ABCD1234ABCD1234ABCD1234",
     "expiresAt": 1699564800000,
     "serverUrl": "https://your-server.com",
     "deeplink": "jimskay-phone://pair?code=ABCD1234ABCD1234ABCD1234&serverUrl=https%3A%2F%2Fyour-server.com"
   }
   ```

2. **From PC, simulate clicking the deeplink:**
   ```bash
   adb shell am start -W -a android.intent.action.VIEW \
     -d "jimskay-phone://pair?code=ABCD1234ABCD1234ABCD1234&serverUrl=https://your-server.com" \
     com.jimskay.phonecontrol
   ```

3. **Observe on Android:**
   - App opens
   - Status text: "Pairing via secure link..."
   - Firebase signs in anonymously
   - POSTs to `/api/phone/pair/complete` with code, deviceId, authUid
   - Receives userId and saves to SharedPreferences
   - Status text: "Phone paired. Connecting to Firebase..."
   - Foreground service starts
   - Notification appears: "Jimskay Phone Agent is running"

4. **Verify in Firebase Console:**
   - Navigate to Realtime Database
   - Check `devices/{ANDROID_ID}` contains:
     ```json
     {
       "userId": "test-user-123",
       "deviceType": "android",
       "name": "DEVICE_MODEL",
       "authUid": "...",
       "lastSeen": 1699564700000,
       "agentVersion": 3
     }
     ```

5. **Verify device is paired:**
   - App UI shows "Paired to Jimskay account" on next launch
   - Service continues running (visible in notification)

**Pass Criteria:**
- ✓ No manual code/URL entry required
- ✓ Device appears in Firebase immediately
- ✓ Service starts automatically
- ✓ No errors in Logcat

---

### Test 2: Deeplink with Invalid Parameters (Error Handling)

**Goal:** Verify app falls back to manual UI on invalid deeplink.

**Steps:**

1. **Simulate deeplink with missing code:**
   ```bash
   adb shell am start -W -a android.intent.action.VIEW \
     -d "jimskay-phone://pair?serverUrl=https://your-server.com" \
     com.jimskay.phonecontrol
   ```

2. **Expected:** App shows manual pairing UI (not auto-pairing screen)

3. **Simulate deeplink with invalid serverUrl:**
   ```bash
   adb shell am start -W -a android.intent.action.VIEW \
     -d "jimskay-phone://pair?code=ABCD1234ABCD1234ABCD1234&serverUrl=http://insecure.com" \
     com.jimskay.phonecontrol
   ```

4. **Expected:** App shows manual pairing UI (HTTPS validation fails)

**Pass Criteria:**
- ✓ Invalid deeplinks do not crash the app
- ✓ Manual pairing UI appears on failure

---

### Test 3: Manual Pairing Fallback (Backward Compatibility)

**Goal:** Verify manual code+URL pairing still works.

**Steps:**

1. **Generate pairing code:**
   ```bash
   curl -X POST http://localhost:3000/api/phone/pair \
     -H "Content-Type: application/json" \
     -d '{"pin":"YOUR_ADMIN_PIN","userId":"test-user-456"}'
   ```

2. **On Android device:**
   - Open Jimskay Phone Control app
   - Enter server URL: `https://your-server.com`
   - Enter code: Copy-paste from curl response
   - Tap "Pair with one-time code"

3. **Expected:**
   - Status: "Validating the one-time pairing code..."
   - After ~2-3 seconds: "Phone paired. Connecting to Firebase..."
   - Service starts
   - Device appears in Firebase

4. **Verify in Firebase Console:**
   - Check `devices/{ANDROID_ID}` exists with correct userId

**Pass Criteria:**
- ✓ Manual pairing works without deeplink
- ✓ Device registered with correct userId

---

### Test 4: Expired Pairing Code (Security)

**Goal:** Verify expired codes are rejected.

**Steps:**

1. **Generate a pairing code:**
   ```bash
   curl -X POST http://localhost:3000/api/phone/pair \
     -H "Content-Type: application/json" \
     -d '{"pin":"YOUR_ADMIN_PIN","userId":"test-user-789"}'
   ```

2. **Wait 5+ minutes**

3. **On Android, try to use the code:**
   - Manual UI: Enter server URL + code
   - Tap "Pair with one-time code"

4. **Expected:**
   - Status: "Pairing failed: Pairing code has expired."

**Pass Criteria:**
- ✓ Expired codes are rejected by server
- ✓ Clear error message displayed to user

---

### Test 5: One-Time Code Replay Protection

**Goal:** Verify pairing code can only be used once.

**Steps:**

1. **Generate a pairing code:**
   ```bash
   curl -X POST http://localhost:3000/api/phone/pair \
     -H "Content-Type: application/json" \
     -d '{"pin":"YOUR_ADMIN_PIN","userId":"test-user-abc"}'
   ```

2. **Use the code on Android (via deeplink or manual entry)** → Should succeed

3. **Immediately try to use the same code again:**
   ```bash
   curl -X POST http://localhost:3000/api/phone/pair/complete \
     -H "Content-Type: application/json" \
     -d '{
       "code": "THE_CODE_FROM_STEP_1",
       "deviceId": "1234567890abcdef",
       "deviceName": "Test Device",
       "authUid": "test-auth-uid"
     }'
   ```

4. **Expected:**
   ```json
   {
     "ok": false,
     "error": "Pairing code is invalid or has already been used.",
     "status": 400
   }
   ```

**Pass Criteria:**
- ✓ Second use is rejected
- ✓ Clear error message "already been used"

---

### Test 6: Phone Heartbeat & Connection Status

**Goal:** Verify phone maintains connection to Firebase.

**Steps:**

1. **After pairing, check device in Firebase Console:**
   - Observe `devices/{ANDROID_ID}/lastSeen` timestamp
   - Wait 30 seconds
   - Refresh and observe `lastSeen` updated

2. **In Jimskay web panel:**
   - Click "Observe phone"
   - Should see `{ok: true, ...screen UI tree...}`
   - Badge shows "Online"

3. **Stop the app:**
   - Close the app or force-stop it
   - In web panel, click "Observe phone" again
   - Should see error with "PHONE_OFFLINE"
   - Badge shows "Offline"

4. **Restart the app:**
   - App loads SharedPreferences (already has userId)
   - Auto-starts PhoneAgentForegroundService
   - Notification appears
   - In web panel, wait 10 seconds and click "Observe phone" again
   - Should see device online again

**Pass Criteria:**
- ✓ Heartbeat updates every ~30 seconds
- ✓ Server detects offline status after ~90 seconds
- ✓ Web panel accurately reflects online/offline state

---

### Test 7: Sensitive Content Suppression

**Goal:** Verify screenshots suppress sensitive fields.

**Steps:**

1. **Ensure Accessibility service is enabled** (see Android main screen)

2. **Open a sensitive app:**
   - Open Google Chrome
   - Navigate to any site with a login form
   - Click on the password field
   - Keep the password field focused

3. **In Jimskay web panel, click "Observe phone"**

4. **Expected:**
   - UI tree is returned (text visible)
   - Screenshot is NOT returned (suppressed due to password field)
   - No error in web panel or Logcat

5. **Blur the field (navigate away) and try again**

6. **Expected:**
   - UI tree is returned
   - Screenshot IS returned (no sensitive field detected)

**Pass Criteria:**
- ✓ Password fields detected and screenshots suppressed
- ✓ Normal screens return screenshots
- ✓ No crashes or sensitive data leaked

---

### Test 8: Already Paired Device

**Goal:** Verify already-paired device skips pairing UI.

**Steps:**

1. **Ensure device is already paired (from Test 1 or 3)**

2. **Close and re-open the app**

3. **Expected:**
   - App loads
   - Status: "Paired to Jimskay account. Starting phone agent..."
   - Pairing UI does NOT appear
   - Foreground service starts immediately
   - Notification appears

4. **Verify in web panel:**
   - Click "Observe phone"
   - Should work immediately (no need to re-pair)

**Pass Criteria:**
- ✓ App skips pairing UI for already-paired devices
- ✓ Service starts automatically
- ✓ Zero user interaction needed

---

## Integration Test: Full Automation Workflow

**Goal:** End-to-end workflow with deeplink pairing.

**Steps:**

1. **On PC/Server:**
   - Open Jimskay web panel
   - Generate pairing code
   - Copy deeplink URL

2. **On Android:**
   - Paste deeplink in browser or click from email/chat
   - App opens and auto-pairs
   - Notification appears

3. **Enable Accessibility** in Android Settings

4. **In web panel, test automation:**
   ```json
   [
     {"action": "observe", "observeAfter": true},
     {"action": "openApp", "app": "Chrome"},
     {"action": "observe", "observeAfter": true},
     {"action": "openUrl", "url": "https://www.google.com"},
     {"action": "observe", "observeAfter": true}
   ]
   ```

5. **Expected:**
   - Each step completes successfully
   - UI observations show correct screens
   - No crashes or timeout errors

**Pass Criteria:**
- ✓ Deeplink pairing is seamless
- ✓ Automation tasks execute correctly
- ✓ Phone remains connected throughout

---

## Regression Tests

### Existing PC Control Still Works

- [ ] PC device registration unchanged
- [ ] PC task execution works
- [ ] PC tasks do not interfere with phone tasks

### Firebase Rules Enforcement

- [ ] Phone cannot read PC tasks
- [ ] Phone cannot create arbitrary devices
- [ ] Phone can only update its own device/tasks
- [ ] PC service account has full access

---

## Troubleshooting

### Deeplink doesn't open the app

- Check: `android/app/src/main/AndroidManifest.xml` has correct intent filter
- Check: `jimskay-phone://pair` scheme is exactly as specified
- Check: App is installed (`adb install -r app/build/outputs/apk/debug/app-debug.apk`)

### Pairing fails with "Invalid or missing control PIN"

- Check: `ADMIN_PIN` environment variable is set correctly on server
- Check: PIN in curl request matches `ADMIN_PIN`

### Pairing fails with "Invalid Android device ID"

- Check: `Settings.Secure.ANDROID_ID` is a valid 16-character hex string
- Check: No duplicate device registrations in Firebase

### Phone does not appear in Firebase after pairing

- Check: `FIREBASE_DATABASE_URL` is correct
- Check: `FIREBASE_SERVICE_ACCOUNT_JSON/PATH` is valid
- Check: Firebase Realtime Database exists and is accessible
- Check: Logcat for connection errors

### Observe returns "PHONE_OFFLINE"

- Check: Phone has internet connectivity
- Check: Phone foreground service is running (check notification)
- Check: `devices/{ANDROID_ID}/lastSeen` is recent (< 90 seconds)
- Check: Accessibility service is enabled

### Deeplink parameters are missing

- Check: `/api/phone/pair` response includes `deeplink` and `serverUrl` fields
- Check: URL encoding (parameters may need decoding in browser)

---

## Monitoring & Debugging

### Enable Verbose Logging on Android

```bash
adb shell setprop log.tag.JimskayPhone DEBUG
adb logcat *:S JimskayPhone:V
```

### Monitor Firebase Realtime Database

```bash
firebase database:get --project=YOUR_PROJECT_ID /devices
firebase database:get --project=YOUR_PROJECT_ID /phonePairings
```

### Check Server Logs

```bash
tail -f /path/to/jimskay/server.log | grep -i "phone\|pairing"
```

---

## Checklist for Go-Live

- [ ] All test scenarios (1-8) pass on real Android device
- [ ] Regression tests pass
- [ ] Firebase rules are correct
- [ ] Service account is not exposed
- [ ] Deeplink scheme is unique to Jimskay
- [ ] Documentation is up-to-date
- [ ] APK is signed and release-ready
- [ ] Server environment variables are documented
- [ ] Monitoring/alerting is in place
