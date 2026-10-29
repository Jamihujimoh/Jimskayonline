# Jimskay Phone Control — same route as PC Control

PC and Android now use the same authorization and control endpoint:

`POST /api/control/action`

Both require `ADMIN_PIN`.

## PC

`{ pin, target: "pc", command, args, confirm? }`

The server executes the command directly through `pc-control-core.ts` and its Windows PowerShell worker.

## Android

The Android companion sends `{ pin, operation: "register" | "poll" | "result", ... }` to the same endpoint. The server keeps the paired phone/task state in the process-local control hub. No Firebase service account is involved.

AI/web actions use `{ pin, target: "phone", userId, action, input?, timeoutMs? }`. The server queues the action and waits for the Android companion to poll and return the result.

## Network requirement

The phone must be able to reach the PC running Next.js. Use the PC's LAN IP, for example `http://192.168.1.20:3000`. For a production deployment, use HTTPS.

## Important

The admin code is now the common gate for both devices. Do not commit it to source control. The Android app stores the code locally because the companion must authenticate to the same route; use HTTPS when the traffic leaves a trusted LAN.
