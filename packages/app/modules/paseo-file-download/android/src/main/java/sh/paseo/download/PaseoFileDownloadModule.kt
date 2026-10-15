package sh.paseo.download

import android.app.Activity
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.toCodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File

private const val SAVE_DOCUMENT_CODE = 27461

class PaseoFileDownloadModule : Module() {
  private data class PendingSave(val file: File, val promise: Promise)
  @Volatile private var pendingSave: PendingSave? = null
  private val copyScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun definition() = ModuleDefinition {
    Name("PaseoFileDownload")

    AsyncFunction("saveFileAsync") { source: String, fileName: String, mimeType: String, promise: Promise ->
      check(pendingSave == null) { "Another file is already being saved." }
      val context = requireNotNull(appContext.reactContext)
      val uri = Uri.parse(source)
      require(uri.scheme == "file") { "Only an app-local downloaded file can be saved." }
      val file = File(requireNotNull(uri.path)).canonicalFile
      require(file.toPath().startsWith(context.cacheDir.canonicalFile.toPath())) {
        "The downloaded file must be in the app cache."
      }
      require(file.isFile) { "Downloaded file is unavailable." }
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType.ifBlank { "application/octet-stream" }
        putExtra(Intent.EXTRA_TITLE, fileName)
      }
      pendingSave = PendingSave(file, promise)
      try {
        appContext.throwingActivity.startActivityForResult(intent, SAVE_DOCUMENT_CODE)
      } catch (error: Exception) {
        pendingSave = null
        promise.reject(error.toCodedException())
      }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode != SAVE_DOCUMENT_CODE) return@OnActivityResult
      val save = pendingSave ?: return@OnActivityResult
      if (resultCode != Activity.RESULT_OK) {
        pendingSave = null
        save.promise.resolve(null)
        return@OnActivityResult
      }
      val destination = intent?.data
      if (destination == null) {
        pendingSave = null
        save.promise.reject(IllegalStateException("No save location was returned.").toCodedException())
        return@OnActivityResult
      }
      val resolver = requireNotNull(appContext.reactContext).contentResolver
      copyScope.launch {
        try {
          save.file.inputStream().use { input ->
            requireNotNull(resolver.openOutputStream(destination, "w")) {
              "Cannot open the selected save location."
            }.use { output -> input.copyTo(output) }
          }
          save.promise.resolve(destination.toString())
        } catch (error: Exception) {
          // A failed copy must not leave a file that appears to be complete.
          runCatching { resolver.delete(destination, null, null) }
          save.promise.reject(error.toCodedException())
        } finally {
          pendingSave = null
        }
      }
    }

    OnDestroy {
      pendingSave?.promise?.reject(IllegalStateException("File save was interrupted.").toCodedException())
      pendingSave = null
      copyScope.cancel()
    }
  }
}
