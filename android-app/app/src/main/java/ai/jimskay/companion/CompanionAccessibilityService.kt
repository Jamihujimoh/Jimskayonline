package ai.jimskay.mobile

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.StatFs
import android.provider.Settings
import android.text.InputType
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

class JimskayAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    fun execute(action: String, args: Map<String, Any?>, callback: (String?, Exception?) -> Unit) {
        try {
            val result = when (action.lowercase()) {
                "open_app", "launch_app" -> openApp(args)
                "list_apps" -> listApps()
                "open_url" -> openUrl(args)
                "search_web", "search" -> searchWeb(args)
                "inspect_screen", "readscreen", "read_screen" -> inspectScreen()
                "get_system_info" -> getSystemInfo()
                "tap_text" -> tapText(args)
                "type_text" -> typeText(args)
                "swipe" -> swipe(args)
                "open_settings" -> openSettings(args)
                else -> error("Unsupported task action.")
            }
            callback(result, null)
        } catch (error: Exception) {
            callback(null, error)
        }
    }

    private fun openApp(args: Map<String, Any?>): String {
        val requestedName = args.string("packageName")
            .ifBlank { args.string("package") }
            .ifBlank { args.string("appName") }
        require(requestedName.isNotBlank()) { "An app name or package name is required." }
        val launchableApps = packageManager.queryIntentActivities(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),
            0
        )
        val matchingApp = launchableApps.firstOrNull {
            it.activityInfo.packageName.equals(requestedName, ignoreCase = true) ||
                it.loadLabel(packageManager).toString().equals(requestedName, ignoreCase = true)
        } ?: error("That app is not installed or its name is ambiguous. Try its exact app name.")
        val packageName = matchingApp.activityInfo.packageName
        val launch = packageManager.getLaunchIntentForPackage(packageName)
            ?: error("That app is not installed or has no launch screen.")
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launch)
        return "Opened app $packageName."
    }

    private fun listApps(): String {
        val launchableApps = packageManager.queryIntentActivities(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),
            0
        )
        val apps = launchableApps.map { app ->
            JSONObject()
                .put("name", app.loadLabel(packageManager).toString())
                .put("packageName", app.activityInfo.packageName)
        }.distinctBy { it.getString("packageName") }
            .sortedBy { it.getString("name").lowercase() }
        return JSONObject().put("apps", apps).toString()
    }

    private fun getSystemInfo(): String {
        val storage = StatFs(android.os.Environment.getDataDirectory().path)
        return JSONObject()
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("androidVersion", Build.VERSION.RELEASE)
            .put("apiLevel", Build.VERSION.SDK_INT)
            .put("availableStorageBytes", storage.availableBytes)
            .put("totalStorageBytes", storage.totalBytes)
            .toString()
    }

    private fun openUrl(args: Map<String, Any?>): String {
        val raw = args.string("url")
        val uri = Uri.parse(raw)
        require(uri.scheme == "https" || uri.scheme == "http") { "Only http and https URLs are supported." }
        startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "Opened URL."
    }

    private fun searchWeb(args: Map<String, Any?>): String {
        val query = args.string("query").trim()
        require(query.isNotEmpty()) { "A search query is required." }
        val uri = Uri.parse("https://www.google.com/search").buildUpon()
            .appendQueryParameter("q", query).build()
        startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "Opened browser search."
    }

    private fun inspectScreen(): String {
        val root = rootInActiveWindow ?: return JSONObject().put("text", "").toString()
        val visibleText = mutableListOf<String>()
        collectSafeText(root, visibleText)
        return JSONObject().put("text", visibleText.distinct().take(100)).toString()
    }

    private fun collectSafeText(
        node: AccessibilityNodeInfo,
        output: MutableList<String>,
        insideSensitiveField: Boolean = false
    ) {
        val nodeLabel = listOf(
            node.text?.toString().orEmpty(),
            node.contentDescription?.toString().orEmpty(),
            node.hintText?.toString().orEmpty(),
            node.viewIdResourceName.orEmpty()
        ).joinToString(" ")
        val sensitiveField = insideSensitiveField || looksSensitive(nodeLabel)
        if (!node.isVisibleToUser || isSecureInput(node) || sensitiveField || containsSensitiveDescendant(node)) return
        val text = node.text?.toString()?.trim().orEmpty()
        val description = node.contentDescription?.toString()?.trim().orEmpty()
        if (text.isNotEmpty()) output += text.take(500)
        if (description.isNotEmpty()) output += description.take(500)
        for (index in 0 until node.childCount) {
            node.getChild(index)?.let { child ->
                collectSafeText(child, output, sensitiveField)
                child.recycle()
            }
        }
    }

    private fun containsSensitiveDescendant(node: AccessibilityNodeInfo): Boolean {
        for (index in 0 until node.childCount) {
            val child = node.getChild(index) ?: continue
            val childLabel = listOf(
                child.text?.toString().orEmpty(),
                child.contentDescription?.toString().orEmpty(),
                child.hintText?.toString().orEmpty(),
                child.viewIdResourceName.orEmpty()
            ).joinToString(" ")
            val sensitive = isSecureInput(child) || looksSensitive(childLabel) || containsSensitiveDescendant(child)
            child.recycle()
            if (sensitive) return true
        }
        return false
    }

    private fun tapText(args: Map<String, Any?>): String {
        val requested = args.string("text").trim()
        require(requested.isNotEmpty()) { "Visible text to tap is required." }
        val root = rootInActiveWindow ?: error("No visible screen is available.")
        val candidates = root.findAccessibilityNodeInfosByText(requested)
        val target = candidates.firstOrNull { !it.isPassword && it.isVisibleToUser }
            ?: error("No matching visible text was found.")
        var clickable: AccessibilityNodeInfo? = target
        while (clickable != null && !clickable.isClickable) {
            clickable = clickable.parent
        }
        val success = (clickable ?: target).performAction(AccessibilityNodeInfo.ACTION_CLICK)
        target.recycle()
        require(success) { "The matching item could not be tapped." }
        return "Tapped visible text."
    }

    private fun typeText(args: Map<String, Any?>): String {
        requireNoSecretFields(args)
        val value = args.string("text")
        require(value.isNotEmpty()) { "Text to type is required." }
        require(value.length <= 2000) { "Text is too long." }
        val root = rootInActiveWindow ?: error("No visible screen is available.")
        val target = findEditableNode(root) ?: error("No ordinary editable text field is focused or visible.")
        val bundle = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        val updated = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
        target.recycle()
        require(updated) { "The text field rejected the requested text." }
        return "Entered text into an ordinary text field."
    }

    private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (isSecureInput(node)) return null
        val hint = node.hintText?.toString().orEmpty()
        val label = "${node.text ?: ""} $hint"
        if (node.isEditable && !looksSensitive(label)) return AccessibilityNodeInfo.obtain(node)
        for (index in 0 until node.childCount) {
            val child = node.getChild(index) ?: continue
            val result = findEditableNode(child)
            child.recycle()
            if (result != null) return result
        }
        return null
    }

    private fun isSecureInput(node: AccessibilityNodeInfo): Boolean {
        val variation = node.inputType and InputType.TYPE_MASK_VARIATION
        return node.isPassword ||
            variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
    }

    private fun swipe(args: Map<String, Any?>): String {
        val metrics = resources.displayMetrics
        val startX = args.number("startX", 0.5) * metrics.widthPixels
        val startY = args.number("startY", 0.8) * metrics.heightPixels
        val endX = args.number("endX", 0.5) * metrics.widthPixels
        val endY = args.number("endY", 0.2) * metrics.heightPixels
        require(startX in 0.0..metrics.widthPixels.toDouble() &&
            endX in 0.0..metrics.widthPixels.toDouble() &&
            startY in 0.0..metrics.heightPixels.toDouble() &&
            endY in 0.0..metrics.heightPixels.toDouble()
        ) {
            "Swipe coordinates are out of bounds."
        }
        val path = Path().apply {
            moveTo(startX.toFloat(), startY.toFloat())
            lineTo(endX.toFloat(), endY.toFloat())
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, args.long("durationMs", 400).coerceIn(100, 2000)))
            .build()
        require(dispatchGesture(gesture, null, null)) { "The swipe could not be dispatched." }
        return "Performed swipe."
    }

    private fun openSettings(args: Map<String, Any?>): String {
        val action = when (args.string("page").lowercase()) {
            "", "general" -> Settings.ACTION_SETTINGS
            "wifi", "network" -> Settings.ACTION_WIFI_SETTINGS
            "display", "screen" -> Settings.ACTION_DISPLAY_SETTINGS
            "apps", "applications" -> Settings.ACTION_APPLICATION_SETTINGS
            "notifications" -> Settings.ACTION_APP_NOTIFICATION_SETTINGS
            "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            else -> error("Supported Settings pages are general, wifi, display, apps, notifications, and accessibility.")
        }
        startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "Opened Android Settings."
    }

    private fun requireNoSecretFields(args: Map<String, Any?>) {
        val forbidden = listOf("password", "passwd", "passcode", "secret", "credential", "token", "pin")
        require(args.keys.none { key -> hasSensitiveWord(key, forbidden) }) {
            "Sensitive task fields are not accepted."
        }
        require(args.entries.none { (key, value) ->
            hasSensitiveWord(key, forbidden) || (key.equals("field", true) && value.toString().let(::looksSensitive))
        }) { "Sensitive task fields are not accepted." }
    }

    private fun looksSensitive(value: String): Boolean {
        return Regex(
            """\b(password|passwd|passcode|secret|credential|token|pin|otp|one[\s-]+time\s+(?:password|code)|verification(?:\s+|[_-])code|authentication(?:\s+|[_-])code|security(?:\s+|[_-])code)\b""",
            RegexOption.IGNORE_CASE
        )
            .containsMatchIn(value)
    }

    private fun hasSensitiveWord(value: String, words: List<String>): Boolean {
        val separated = value.replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
            .replace(Regex("[^A-Za-z0-9]+"), " ")
        return separated.split(" ").any { token -> words.any { token.equals(it, ignoreCase = true) } }
    }

    private fun Map<String, Any?>.string(key: String): String = this[key]?.toString().orEmpty()
    private fun Map<String, Any?>.number(key: String, fallback: Double): Double =
        (this[key] as? Number)?.toDouble() ?: fallback
    private fun Map<String, Any?>.long(key: String, fallback: Long): Long =
        (this[key] as? Number)?.toLong() ?: fallback

    companion object {
        @Volatile
        var instance: JimskayAccessibilityService? = null
            private set
    }
}
