package ai.jimskay.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import java.io.File

internal object PhoneFileOperations {
    private const val MAX_DIRECTORY_ENTRIES = 500

    fun hasAccess(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED &&
                context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }

    fun execute(context: Context, action: String, args: Map<String, Any?>): Map<String, Any?> {
        check(hasAccess(context)) {
            "Shared-file access is not enabled. Open Jimskay AI and grant “All files access” in Android Settings."
        }
        val target = resolve(args["path"]?.toString().orEmpty())
        return when (action) {
            "list_directory" -> listDirectory(target)
            "delete_file" -> deleteFile(target)
            else -> error("Unsupported shared-file operation.")
        }
    }

    private fun resolve(path: String): File {
        require(path.isNotBlank() && File(path).isAbsolute) {
            "Use an absolute path inside shared storage, such as /storage/emulated/0/Download/notes.txt."
        }
        val root = Environment.getExternalStorageDirectory().canonicalFile
        val target = File(path).canonicalFile
        require(target == root || target.path.startsWith(root.path + File.separator)) {
            "Phone file access is limited to shared storage."
        }
        return target
    }

    private fun listDirectory(target: File): Map<String, Any?> {
        require(target.isDirectory) { "The requested path is not a directory." }
        val children = target.listFiles()?.sortedBy { it.name.lowercase() }
            ?: error("The directory could not be read.")
        return mapOf(
            "path" to target.path,
            "truncated" to (children.size > MAX_DIRECTORY_ENTRIES),
            "entries" to children.take(MAX_DIRECTORY_ENTRIES).map { file ->
                mapOf(
                    "name" to file.name,
                    "type" to if (file.isDirectory) "directory" else "file",
                    "size" to if (file.isFile) file.length() else null
                )
            }
        )
    }

    private fun deleteFile(target: File): Map<String, Any?> {
        require(target.isFile) { "Only individual files can be deleted; directories are not removed." }
        require(target.delete()) { "The file could not be deleted." }
        return mapOf("path" to target.path, "deleted" to true)
    }
}
