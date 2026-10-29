package ai.jimskay.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import android.Manifest
import android.content.pm.PackageManager

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var details: TextView
    private lateinit var auth: FirebaseAuth
    private lateinit var database: FirebaseDatabase
    private var pairedDeviceId = ""
    private var activePickerTask: Pair<DatabaseReference, String>? = null

    private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val active = activePickerTask
        activePickerTask = null
        if (active != null) {
            val (taskRef, action) = active
            if (result.resultCode == Activity.RESULT_OK) {
                val uri = result.data?.data
                finishPickerTask(taskRef, "completed", mapOf("message" to "User selected a file.", "uri" to uri?.toString(), "picker" to action))
            } else {
                finishPickerTask(taskRef, "rejected", mapOf("message" to "Picker was cancelled by the user."))
            }
        }
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startConnectedService()
        else status.text = "Device registered, but background connection needs notification permission."
    }
    private val storagePermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        status.text = if (results.values.all { it }) {
            "Shared-storage permission granted."
        } else {
            "Shared-storage permission was not granted."
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!initializeFirebase()) {
            showConfigurationRequired()
            return
        }
        auth = FirebaseAuth.getInstance()
        database = FirebaseDatabase.getInstance()
        render()
        refreshAuthUi()
        handlePickerIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (::auth.isInitialized) refreshAuthUi()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePickerIntent(intent)
    }

    private fun initializeFirebase(): Boolean {
        if (BuildConfig.FIREBASE_API_KEY.isBlank() ||
            BuildConfig.FIREBASE_APP_ID.isBlank() ||
            BuildConfig.FIREBASE_PROJECT_ID.isBlank() ||
            BuildConfig.FIREBASE_DATABASE_URL.isBlank()
        ) return false
        val options = FirebaseOptions.Builder()
            .setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setApplicationId(BuildConfig.FIREBASE_APP_ID)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
            .setDatabaseUrl(BuildConfig.FIREBASE_DATABASE_URL)
            .build()
        if (FirebaseApp.getApps(this).isEmpty()) FirebaseApp.initializeApp(this, options)
        return true
    }

    private fun showConfigurationRequired() {
        val message = TextView(this).apply {
            text = "Firebase is not configured. Copy firebase.properties.example to firebase.properties and fill in your Firebase client settings, then rebuild Jimskay AI for Android."
            setPadding(32, 32, 32, 32)
        }
        setContentView(message)
    }

    private fun render() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        val scroll = ScrollView(this).apply { addView(root) }
        status = TextView(this).apply { textSize = 18f }
        details = TextView(this).apply { text = "Signed out" }
        root.addView(TextView(this).apply { text = "Jimskay AI"; textSize = 24f })
        root.addView(status)
        root.addView(details)
        setContentView(scroll)
    }

    private fun refreshAuthUi() {
        val user = auth.currentUser
        if (user == null) showSignIn() else {
            pairedDeviceId = getSharedPreferences(TaskRunnerService.PREFERENCES, MODE_PRIVATE)
                .getString("deviceId_${user.uid}", "").orEmpty()
            showPairedControls()
        }
    }

    private fun showSignIn() {
        status.text = "Not connected"
        val root = contentRoot()
        root.removeAllViews()
        root.addView(TextView(this).apply { text = "Jimskay AI"; textSize = 24f })
        root.addView(status)
        val email = EditText(this).apply { hint = "Email"; inputType = 33 }
        val password = EditText(this).apply { hint = "Password"; inputType = 129 }
        root.addView(email)
        root.addView(password)
        root.addView(Button(this).apply {
            text = "Sign in"
            setOnClickListener {
                auth.signInWithEmailAndPassword(email.text.toString().trim(), password.text.toString())
                    .addOnSuccessListener { refreshAuthUi() }
                    .addOnFailureListener { status.text = "Sign-in failed: ${it.localizedMessage}" }
            }
        })
        root.addView(Button(this).apply {
            text = "Create account"
            setOnClickListener {
                auth.createUserWithEmailAndPassword(email.text.toString().trim(), password.text.toString())
                    .addOnSuccessListener { refreshAuthUi() }
                    .addOnFailureListener { status.text = "Account creation failed: ${it.localizedMessage}" }
            }
        })
    }

    private fun showPairedControls() {
        val root = contentRoot()
        root.removeAllViews()
        root.addView(TextView(this).apply { text = "Jimskay AI"; textSize = 24f })
        status.text = when {
            TaskRunnerService.isRunning -> "Connected — foreground task service is active"
            pairedDeviceId.isBlank() -> "Not connected"
            else -> "Device registered; tap Register / connect to start."
        }
        root.addView(status)
        root.addView(details)
        if (pairedDeviceId.isNotBlank()) details.text = "Device ID: $pairedDeviceId"
        val nameField = EditText(this).apply {
            hint = "Device name"
            val userId = auth.currentUser?.uid.orEmpty()
            setText(getSharedPreferences(TaskRunnerService.PREFERENCES, MODE_PRIVATE)
                .getString("deviceName_$userId", Build.MODEL))
        }
        root.addView(nameField)
        root.addView(Button(this).apply {
            text = "Register / connect device"
            setOnClickListener { registerDevice(nameField.text.toString().trim().ifBlank { "Android device" }) }
        })
        root.addView(Button(this).apply {
            text = "Enable accessibility service"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        })
        root.addView(Button(this).apply {
            text = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                Environment.isExternalStorageManager()
            ) "Shared-file access enabled" else "Enable shared-file access"
            setOnClickListener { requestSharedFileAccess() }
        })
        root.addView(Button(this).apply {
            text = "Disconnect"
            setOnClickListener {
                stopService(Intent(this@MainActivity, TaskRunnerService::class.java))
                pairedDeviceId = ""
                status.text = "Signed in; device disconnected"
            }
        })
        root.addView(Button(this).apply {
            text = "Sign out"
            setOnClickListener {
                stopService(Intent(this@MainActivity, TaskRunnerService::class.java))
                auth.signOut()
                refreshAuthUi()
            }
        })
    }

    private fun contentRoot(): LinearLayout {
        val scroll = (window.decorView.findViewById<View>(android.R.id.content) as? ViewGroup)?.getChildAt(0) as? ScrollView
        return (scroll?.getChildAt(0) as? LinearLayout) ?: LinearLayout(this).also { layout ->
            layout.orientation = LinearLayout.VERTICAL
            layout.setPadding(24, 24, 24, 24)
            setContentView(ScrollView(this).apply { addView(layout) })
        }
    }

    private fun registerDevice(name: String) {
        val user = auth.currentUser ?: return
        status.text = "Registering device…"
        val prefs = getSharedPreferences(TaskRunnerService.PREFERENCES, MODE_PRIVATE)
        val deviceKey = "deviceId_${user.uid}"
        val deviceId = prefs.getString(deviceKey, null) ?: java.util.UUID.randomUUID().toString().also {
            prefs.edit().putString(deviceKey, it).apply()
        }
        prefs.edit().putString("deviceId", deviceId).putString("deviceName_${user.uid}", name).apply()
        val deviceRef = database.reference.child("devices").child(deviceId)
        deviceRef.setValue(
            mapOf(
                "userId" to user.uid,
                "deviceType" to "android",
                "name" to name,
                "lastSeen" to ServerValue.TIMESTAMP
            )
        ).addOnSuccessListener {
            pairedDeviceId = deviceId
            status.text = "Device registered"
            details.text = "Device ID: $deviceId\nAccount UID: ${user.uid}"
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                startConnectedService()
            }
        }.addOnFailureListener {
            status.text = "Device registration failed: ${it.localizedMessage}"
        }
    }

    private fun startConnectedService() {
        if (pairedDeviceId.isBlank()) return
        val intent = Intent(this, TaskRunnerService::class.java)
            .putExtra(TaskRunnerService.EXTRA_DEVICE_ID, pairedDeviceId)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
        status.text = "Connected — visible foreground task service is active"
    }

    private fun requestSharedFileAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                status.text = "Shared-file access is already enabled."
                return
            }
            val appPermissionIntent = Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:$packageName")
            )
            try {
                startActivity(appPermissionIntent)
            } catch (_: android.content.ActivityNotFoundException) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
            status.text = "Allow Jimskay AI under “All files access”, then return to the app."
        } else {
            storagePermissions.launch(
                arrayOf(
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                )
            )
        }
    }

    private fun handlePickerIntent(intent: Intent?) {
        if (intent?.action != TaskRunnerService.ACTION_PICK_FILE) return
        val taskId = intent.getStringExtra(TaskRunnerService.EXTRA_TASK_ID) ?: return
        val action = intent.getStringExtra(TaskRunnerService.EXTRA_PICKER_ACTION) ?: return
        val deviceId = intent.getStringExtra(TaskRunnerService.EXTRA_DEVICE_ID)
            ?: getSharedPreferences(TaskRunnerService.PREFERENCES, MODE_PRIVATE)
                .getString("deviceId_${auth.currentUser?.uid}", "").orEmpty()
        if (deviceId.isBlank()) return
        activePickerTask = database.reference.child("phoneTasks").child(deviceId).child(taskId) to action
        val pickerIntent = Intent(
            if (action == "pick_document") Intent.ACTION_OPEN_DOCUMENT else Intent.ACTION_GET_CONTENT
        ).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(intent.getStringExtra(TaskRunnerService.EXTRA_MIME_TYPE)
                ?: if (action == "pick_media") "image/*" else "*/*")
        window.decorView.post { picker.launch(pickerIntent) }
        setIntent(Intent(this, MainActivity::class.java))
    }

    private fun finishPickerTask(ref: DatabaseReference, state: String, result: Map<String, Any?>) {
        ref.updateChildren(mapOf("status" to state, "result" to result, "completedAt" to ServerValue.TIMESTAMP))
        status.text = "Connected — picker task $state"
    }
}
