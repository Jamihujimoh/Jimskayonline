package ai.jimskay.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.database.ChildEventListener
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue

class TaskRunnerService : Service() {
    private var database: FirebaseDatabase? = null
    private var deviceId = ""
    private var listener: ChildEventListener? = null
    private val handledTaskIds = mutableSetOf<String>()
    private val activeTaskNotifications = mutableSetOf<Int>()
    private val handler = Handler(Looper.getMainLooper())
    private val touchDeviceRunnable = object : Runnable {
        override fun run() {
            if (listener != null && deviceId.isNotBlank()) {
                database?.reference?.child("devices")?.child(deviceId)?.child("lastSeen")
                    ?.setValue(ServerValue.TIMESTAMP)
                handler.postDelayed(this, 30_000)
            }
        }
    }
    private val taskRetentionRunnable = object : Runnable {
        override fun run() {
            pruneExpiredTasks()
            if (listener != null) handler.postDelayed(this, TASK_RETENTION_SWEEP_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val intentAction = intent?.action
        if (intentAction == ACTION_STOP) {
            stopConnection()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        if (!getSystemService(NotificationManager::class.java).areNotificationsEnabled()) {
            stopSelf()
            return START_NOT_STICKY
        }
        startAsForeground()
        isRunning = true
        deviceId = intent?.getStringExtra(EXTRA_DEVICE_ID)
            ?: getSharedPreferences(PREFERENCES, MODE_PRIVATE).getString("deviceId", "").orEmpty()
        if (database == null) {
            if (!initializeFirebase()) {
                stopSelf()
                return START_NOT_STICKY
            }
            database = FirebaseDatabase.getInstance()
        }
        if (intentAction == ACTION_APPROVE || intentAction == ACTION_REJECT) {
            val taskId = intent?.getStringExtra(EXTRA_TASK_ID)
            if (taskId != null) {
                resolveApproval(taskId, intentAction == ACTION_APPROVE, intent?.getStringExtra(EXTRA_APPROVAL_DIGEST))
            }
            return START_STICKY
        }

        if (deviceId.isBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }
        startTaskListener()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopConnection()
        isRunning = false
        super.onDestroy()
    }

    override fun onTimeout(startId: Int, foregroundServiceType: Int) {
        stopConnection()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf(startId)
    }

    private fun initializeFirebase(): Boolean {
        if (BuildConfig.FIREBASE_API_KEY.isBlank() ||
            BuildConfig.FIREBASE_APP_ID.isBlank() ||
            BuildConfig.FIREBASE_PROJECT_ID.isBlank() ||
            BuildConfig.FIREBASE_DATABASE_URL.isBlank()
        ) return false
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setDatabaseUrl(BuildConfig.FIREBASE_DATABASE_URL)
                .build()
            FirebaseApp.initializeApp(this, options)
        }
        return true
    }

    private fun startAsForeground() {
        val notification = Notification.Builder(this, CONNECTION_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Jimskay AI is connected")
            .setContentText("Task polling is active. Tap Disconnect to stop.")
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Disconnect",
                    servicePendingIntent(ACTION_STOP, "disconnect".hashCode())
                ).build()
            )
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_CONNECTION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_CONNECTION, notification)
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CONNECTION_CHANNEL, "Device connection", NotificationManager.IMPORTANCE_LOW)
        )
        manager.createNotificationChannel(
            NotificationChannel(APPROVAL_CHANNEL, "Phone action approvals", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "On-phone approval requests for Jimskay AI actions"
            }
        )
    }

    private fun startTaskListener() {
        val db = database ?: return
        if (listener != null) return
        val query = db.reference.child("phoneTasks").child(deviceId)
        val taskListener = object : ChildEventListener {
            override fun onChildAdded(snapshot: DataSnapshot, previousChildName: String?) = handleTask(snapshot)
            override fun onChildChanged(snapshot: DataSnapshot, previousChildName: String?) = handleTask(snapshot)
            override fun onChildRemoved(snapshot: DataSnapshot) = Unit
            override fun onChildMoved(snapshot: DataSnapshot, previousChildName: String?) = Unit
            override fun onCancelled(error: DatabaseError) {
                getSystemService(NotificationManager::class.java).notify(
                    NOTIFICATION_CONNECTION,
                    connectionNotification("Connection error: ${error.message}")
                )
            }
        }
        listener = taskListener
        query.addChildEventListener(taskListener)
        handler.removeCallbacks(touchDeviceRunnable)
        handler.removeCallbacks(taskRetentionRunnable)
        handler.postDelayed(touchDeviceRunnable, 30_000)
        handler.post(taskRetentionRunnable)
    }

    private fun connectionNotification(message: String): Notification =
        Notification.Builder(this, CONNECTION_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Jimskay AI is connected")
            .setContentText(message)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Disconnect",
                    servicePendingIntent(ACTION_STOP, "disconnect".hashCode())
                ).build()
            )
            .build()

    private fun handleTask(snapshot: DataSnapshot) {
        val id = snapshot.key ?: return
        val values = (snapshot.value as? Map<*, *>)?.entries
            ?.associate { it.key.toString() to it.value } ?: return
        val taskStatus = values["status"]?.toString()
        if (values["deviceId"] == deviceId && isTerminal(taskStatus)) {
            cancelTaskNotification(id)
            pruneTaskIfExpired(snapshot)
            handledTaskIds.remove(id)
            return
        }
        if (values["deviceId"] == deviceId && taskStatus == "running") {
            cancelTaskNotification(id)
            return
        }
        if (values["deviceId"] != deviceId ||
            taskStatus !in listOf("pending", "queued", "awaiting_approval")
        ) return
        if (!handledTaskIds.add(id)) return
        val action = (values["action"] ?: values["type"])?.toString().orEmpty()
        if (action.isBlank()) {
            finishTask(snapshot.ref, id, "rejected", mapOf("message" to "Task has no supported action."))
            return
        }
        if (hasSecretField(values)) {
            finishTask(snapshot.ref, id, "rejected", mapOf("message" to "Sensitive task fields are not accepted."))
            return
        }
        if (requiresApproval(action, values)) {
            if (safeActionSummary(action, values).length > 4000) {
                finishTask(snapshot.ref, id, "rejected", mapOf("message" to "Action request is too long to present for approval."))
                return
            }
            snapshot.ref.child("status").setValue("awaiting_approval")
            showApprovalNotification(id, action, values)
        } else {
            executeTask(snapshot.ref, id, action, values)
        }
    }

    private fun requiresApproval(action: String, values: Map<String, Any?>): Boolean {
        val wording = (action + " " + values.entries.filterNot { isSecretKey(it.key) }.joinToString(" ") { it.value.toString() })
            .lowercase()
        return listOf("submit", "register", "send", "delete", "purchase", "buy", "pay", "transfer", "post", "place_order")
            .any(wording::contains) ||
            action.lowercase() in listOf("tap_text", "type_text", "swipe") ||
            action.lowercase() == "delete_file" ||
            action.contains("setting", true) && action !in listOf("open_settings")
    }

    private fun showApprovalNotification(id: String, action: String, values: Map<String, Any?>) {
        val summary = safeActionSummary(action, values)
        val digest = approvalDigest(values)
        val manager = getSystemService(NotificationManager::class.java)
        val notification = Notification.Builder(this, APPROVAL_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Approve phone action?")
            .setContentText(summary)
            .setStyle(Notification.BigTextStyle().bigText(summary))
            .setAutoCancel(true)
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.checkbox_on_background,
                    "Approve",
                    servicePendingIntent(ACTION_APPROVE, id.hashCode(), id, digest)
                ).build()
            )
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Reject",
                    servicePendingIntent(ACTION_REJECT, id.hashCode() + 1, id, digest)
                ).build()
            )
            .build()
        activeTaskNotifications.add(notificationId(id))
        manager.notify(notificationId(id), notification)
    }

    private fun showPickerNotification(id: String, action: String, values: Map<String, Any?>) {
        val intent = Intent(this, MainActivity::class.java)
            .setAction(ACTION_PICK_FILE)
            .putExtra(EXTRA_TASK_ID, id)
            .putExtra(EXTRA_DEVICE_ID, deviceId)
            .putExtra(EXTRA_PICKER_ACTION, action)
            .putExtra(EXTRA_MIME_TYPE, values["mimeType"]?.toString())
        val pendingIntent = PendingIntent.getActivity(
            this,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(this, APPROVAL_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setContentTitle("Choose a file on your device")
            .setContentText("Jimskay AI is waiting for your system picker selection.")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        activeTaskNotifications.add(notificationId(id))
        getSystemService(NotificationManager::class.java).notify(notificationId(id), notification)
    }

    private fun executeTask(ref: DatabaseReference, id: String, action: String, values: Map<String, Any?>) {
        if (action.lowercase() in listOf("pick_document", "pick_media")) {
            ref.child("status").setValue("awaiting_user")
            showPickerNotification(id, action, values)
            return
        }
        ref.child("status").setValue("running")
        if (action.lowercase() in listOf("list_directory", "delete_file")) {
            try {
                val result = PhoneFileOperations.execute(this, action.lowercase(), values)
                finishTask(ref, id, "completed", result)
            } catch (error: Exception) {
                finishTask(ref, id, "failed", mapOf("message" to (error.message ?: "Shared-file operation failed.")))
            }
            return
        }
        val service = JimskayAccessibilityService.instance
        if (service == null) {
            finishTask(ref, id, "failed", mapOf("message" to "Enable Jimskay AI phone control in Accessibility settings first."))
            return
        }
        val args = values.filterKeys { it !in setOf("deviceId", "status", "action", "type", "result", "uid") }
        service.execute(action, args) { message, error ->
            if (error == null) {
                finishTask(ref, id, "completed", mapOf("message" to (message ?: "")))
            } else {
                finishTask(ref, id, "failed", mapOf("message" to "Action could not be completed."))
            }
        }
    }

    private fun resolveApproval(id: String, approved: Boolean, expectedDigest: String?) {
        val ref = database?.reference?.child("phoneTasks")?.child(deviceId)?.child(id) ?: return
        ref.get().addOnSuccessListener { snapshot ->
            val values = (snapshot.value as? Map<*, *>)?.entries
                ?.associate { it.key.toString() to it.value } ?: return@addOnSuccessListener
            if (values["deviceId"] != deviceId ||
                values["status"]?.toString() !in listOf("pending", "queued", "awaiting_approval")
            ) return@addOnSuccessListener
            getSystemService(NotificationManager::class.java).cancel(notificationId(id))
            if (approved && expectedDigest != approvalDigest(values)) {
                ref.child("status").setValue("pending").addOnSuccessListener {
                    handledTaskIds.remove(id)
                    ref.get().addOnSuccessListener { refreshed -> handleTask(refreshed) }
                }
                return@addOnSuccessListener
            }
            if (!approved) {
                finishTask(ref, id, "rejected", mapOf("message" to "Rejected on device by user."))
                return@addOnSuccessListener
            }
            if (hasSecretField(values)) {
                finishTask(ref, id, "rejected", mapOf("message" to "Sensitive task fields are not accepted."))
                return@addOnSuccessListener
            }
            val action = (values["action"] ?: values["type"])?.toString().orEmpty()
            if (action.isBlank()) {
                finishTask(ref, id, "rejected", mapOf("message" to "Task has no supported action."))
            } else {
                executeTask(ref, id, action, values)
            }
        }
    }

    private fun finishTask(ref: DatabaseReference, id: String, state: String, result: Map<String, Any?>) {
        cancelTaskNotification(id)
        ref.updateChildren(mapOf("status" to state, "result" to result, "completedAt" to ServerValue.TIMESTAMP))
    }

    private fun pruneExpiredTasks() {
        val taskRoot = database?.reference?.child("phoneTasks")?.child(deviceId) ?: return
        taskRoot.get().addOnSuccessListener { tasks ->
            for (task in tasks.children) pruneTaskIfExpired(task)
        }
    }

    private fun pruneTaskIfExpired(snapshot: DataSnapshot) {
        val status = snapshot.child("status").getValue(String::class.java)
        if (!isTerminal(status)) return
        val completedAt = snapshot.child("completedAt").getValue(Long::class.java) ?: return
        if (System.currentTimeMillis() - completedAt >= TASK_RESULT_TTL_MS) {
            snapshot.ref.removeValue()
        } else {
            handler.postDelayed({
                if (listener != null) {
                    snapshot.ref.get().addOnSuccessListener { current -> pruneTaskIfExpired(current) }
                }
            }, (TASK_RESULT_TTL_MS - (System.currentTimeMillis() - completedAt)).coerceAtLeast(1_000))
        }
    }

    private fun isTerminal(status: String?): Boolean =
        status in listOf("completed", "failed", "rejected")

    private fun cancelTaskNotification(id: String) {
        val notificationId = notificationId(id)
        getSystemService(NotificationManager::class.java).cancel(notificationId)
        activeTaskNotifications.remove(notificationId)
    }

    private fun safeActionSummary(action: String, values: Map<String, Any?>): String {
        val requestedFields = values.filterKeys {
            it !in setOf("deviceId", "status", "result", "uid", "completedAt", "content")
        }
        val content = values["content"]?.toString()
        val contentSummary = if (content.isNullOrEmpty()) "" else {
            val preview = content.take(500)
            "\nContent (${content.length} characters): $preview${if (content.length > preview.length) " …[truncated]" else ""}"
        }
        return "Requested action: $action\n$requestedFields$contentSummary"
    }

    private fun hasSecretField(value: Any?): Boolean = when (value) {
        is Map<*, *> -> value.entries.any { (key, child) ->
            key?.toString()?.let(::isSecretKey) == true ||
                (key?.toString().equals("field", true) && isSensitiveLabel(child.toString())) ||
                hasSecretField(child)
        }
        is List<*> -> value.any(::hasSecretField)
        else -> false
    }

    private fun isSecretKey(key: String): Boolean =
        key.replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
            .replace(Regex("[^A-Za-z0-9]+"), " ")
            .split(" ")
            .any { token ->
                listOf("password", "passwd", "passcode", "secret", "credential", "token", "pin", "otp", "code")
                    .contains(token.lowercase())
            }

    private fun isSensitiveLabel(value: String): Boolean =
        Regex(
            """\b(password|passwd|passcode|secret|credential|token|security\s+code|pin|otp|one[\s-]+time\s+(?:password|code)|verification\s+code|authentication\s+code)\b""",
            RegexOption.IGNORE_CASE
        )
            .containsMatchIn(value)

    private fun servicePendingIntent(
        action: String,
        requestCode: Int,
        taskId: String? = null,
        digest: String? = null
    ): PendingIntent {
        val intent = Intent(this, TaskRunnerService::class.java).setAction(action)
        if (taskId != null) intent.putExtra(EXTRA_TASK_ID, taskId)
        if (deviceId.isNotBlank()) intent.putExtra(EXTRA_DEVICE_ID, deviceId)
        if (digest != null) intent.putExtra(EXTRA_APPROVAL_DIGEST, digest)
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun notificationId(id: String): Int = id.hashCode().let { if (it == NOTIFICATION_CONNECTION) it + 1 else it }

    private fun approvalDigest(value: Any?): String {
        val fields = (value as? Map<*, *>)?.filterKeys {
            it?.toString() !in setOf("status", "result", "completedAt")
        } ?: value
        val bytes = java.security.MessageDigest.getInstance("SHA-256")
            .digest(canonicalValue(fields).toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { byte -> "%02x".format(byte) }
    }

    private fun canonicalValue(value: Any?): String = when (value) {
        is Map<*, *> -> value.entries
            .sortedBy { it.key.toString() }
            .joinToString(prefix = "{", postfix = "}") { (key, child) -> "${key}=${canonicalValue(child)}" }
        is List<*> -> value.joinToString(prefix = "[", postfix = "]") { canonicalValue(it) }
        else -> value?.toString().orEmpty()
    }

    private fun stopConnection() {
        handler.removeCallbacks(touchDeviceRunnable)
        handler.removeCallbacks(taskRetentionRunnable)
        listener?.let { current ->
            if (deviceId.isNotBlank()) {
                database?.reference?.child("phoneTasks")?.child(deviceId)?.removeEventListener(current)
            }
        }
        listener = null
        handledTaskIds.clear()
        activeTaskNotifications.forEach { getSystemService(NotificationManager::class.java).cancel(it) }
        activeTaskNotifications.clear()
    }

    companion object {
        @Volatile
        var isRunning = false
            private set

        const val EXTRA_DEVICE_ID = "deviceId"
        const val EXTRA_TASK_ID = "taskId"
        const val EXTRA_PICKER_ACTION = "pickerAction"
        const val EXTRA_MIME_TYPE = "mimeType"
        private const val EXTRA_APPROVAL_DIGEST = "approvalDigest"
        const val ACTION_APPROVE = "ai.jimskay.companion.APPROVE"
        const val ACTION_REJECT = "ai.jimskay.companion.REJECT"
        const val ACTION_STOP = "ai.jimskay.companion.STOP"
        const val ACTION_PICK_FILE = "ai.jimskay.companion.PICK_FILE"
        const val PREFERENCES = "jimskay_companion"
        private const val CONNECTION_CHANNEL = "connection"
        private const val APPROVAL_CHANNEL = "approvals"
        private const val NOTIFICATION_CONNECTION = 1001
        private const val TASK_RESULT_TTL_MS = 10 * 60 * 1000L
        private const val TASK_RETENTION_SWEEP_MS = 60 * 1000L
    }
}
