package sh.paseo.download

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.toCodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

class PaseoUpdateFileProvider : FileProvider()

class PaseoAppUpdateModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val running = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)
  @Volatile private var connection: HttpURLConnection? = null

  private fun context(): Context = requireNotNull(appContext.reactContext).also {
    require(it.packageName == "sh.paseo.latex") { "Updates are only available for Paseo LaTeX." }
  }

  private fun versionCode(value: Double): Long {
    require(value.isFinite() && value > 0 && value <= 2_100_000_000 && value == value.toLong().toDouble())
    return value.toLong()
  }

  private fun apkFile(context: Context, code: Long): File =
    File(File(context.cacheDir, "latex-updates").apply { mkdirs() }, "update-$code.apk")

  private fun checkCancelled() {
    check(!cancelled.get()) { "Update download was cancelled." }
  }

  private fun checksum(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        checkCancelled()
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  @Suppress("DEPRECATION")
  private fun verifyApk(context: Context, file: File, code: Long, version: String) {
    val manager = context.packageManager
    val installed = manager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
    val candidate = requireNotNull(manager.getPackageArchiveInfo(file.path, PackageManager.GET_SIGNING_CERTIFICATES)) {
      "The downloaded file is not a valid APK."
    }
    require(candidate.packageName == context.packageName) { "The APK belongs to another application." }
    require(candidate.longVersionCode == code && candidate.versionName == version) { "The APK version does not match the release." }
    require(code > installed.longVersionCode) { "This version is already installed or older." }
    val currentSigners = installed.signingInfo?.apkContentsSigners?.map { it.toCharsString() }?.toSet()
    val updateSigners = candidate.signingInfo?.apkContentsSigners?.map { it.toCharsString() }?.toSet()
    require(!currentSigners.isNullOrEmpty() && currentSigners == updateSigners) { "The APK signature does not match this installation." }
  }

  private fun openDownload(address: String): HttpURLConnection {
    var url = URL(address)
    require(url.host == "cnb.cool" && url.query == null && url.ref == null && url.userInfo == null &&
      Regex("/-/releases/download/latex-v(\\d+\\.\\d+\\.\\d+)-r([1-9]\\d?)/paseo-latex-\\1-r\\2\\.apk")
        .matches(url.path.removePrefix("/twicedrop/paseo-latex")) && url.path.startsWith("/twicedrop/paseo-latex/-/")) {
      "The update must come from the personal CNB repository."
    }
    repeat(6) {
      require(url.protocol == "https" && url.userInfo == null &&
        (url.host == "cnb.cool" || url.host.endsWith(".cnb.cool") || url.host.endsWith(".myqcloud.com"))) {
        "The update redirected to an unsupported download service."
      }
      checkCancelled()
      val current = (url.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 30_000
        setRequestProperty("Accept-Encoding", "identity")
      }
      connection = current
      val status = current.responseCode
      if (status == 200) return current
      if (status in listOf(301, 302, 303, 307, 308)) {
        val location = current.getHeaderField("Location")
        current.disconnect()
        url = URL(url, requireNotNull(location) { "CNB returned an invalid redirect." })
      } else {
        current.disconnect()
        error("CNB download failed (HTTP $status).")
      }
    }
    error("CNB returned too many download redirects.")
  }

  override fun definition() = ModuleDefinition {
    Name("PaseoAppUpdate")
    Events("downloadProgress")

    AsyncFunction("downloadAsync") { address: String, sha256: String, size: Double, codeValue: Double, version: String, promise: Promise ->
      val context = context()
      val code = versionCode(codeValue)
      require(Regex("[a-f0-9]{64}").matches(sha256)) { "A SHA-256 checksum is required." }
      require(size > 0 && size <= 1024 * 1024 * 1024 && size == size.toLong().toDouble())
      check(running.compareAndSet(false, true)) { "Another update operation is running." }
      cancelled.set(false)
      scope.launch {
        val target = apkFile(context, code)
        val temporary = File(target.path + ".part")
        try {
          temporary.delete()
          if (target.isFile && target.length() == size.toLong() && checksum(target) == sha256) {
            verifyApk(context, target, code, version)
            checkCancelled()
            promise.resolve(null)
            return@launch
          }
          val response = openDownload(address)
          if (response.contentLengthLong >= 0) require(response.contentLengthLong == size.toLong()) { "The download size does not match the release." }
          var received = 0L
          var lastProgress = 0L
          val started = System.currentTimeMillis()
          response.inputStream.buffered().use { input ->
            temporary.outputStream().buffered().use { output ->
              val buffer = ByteArray(64 * 1024)
              while (true) {
                checkCancelled()
                check(System.currentTimeMillis() - started < 15 * 60_000) { "Update download timed out." }
                val count = input.read(buffer)
                if (count < 0) break
                received += count
                require(received <= size.toLong()) { "The downloaded file exceeds the release size." }
                output.write(buffer, 0, count)
                val now = System.currentTimeMillis()
                if (now - lastProgress >= 250) {
                  sendEvent("downloadProgress", mapOf("received" to received.toDouble(), "total" to size))
                  lastProgress = now
                }
              }
            }
          }
          require(received == size.toLong() && checksum(temporary) == sha256) { "The APK checksum or size does not match. Please retry." }
          verifyApk(context, temporary, code, version)
          checkCancelled()
          target.delete()
          check(temporary.renameTo(target)) { "Cannot save the verified APK." }
          target.parentFile?.listFiles()?.filter { it != target }?.forEach { it.delete() }
          promise.resolve(null)
        } catch (error: Exception) {
          promise.reject(error.toCodedException())
        } finally {
          temporary.delete()
          connection?.disconnect()
          connection = null
          running.set(false)
        }
      }
    }

    Function("cancelDownload") {
      cancelled.set(true)
      connection?.disconnect()
    }

    AsyncFunction("installAsync") { codeValue: Double, sha256: String, version: String, promise: Promise ->
      val context = context()
      val code = versionCode(codeValue)
      check(running.compareAndSet(false, true)) { "Another update operation is running." }
      cancelled.set(false)
      scope.launch {
        try {
          val file = apkFile(context, code)
          require(file.isFile && checksum(file) == sha256) { "The downloaded APK is missing or changed. Download it again." }
          verifyApk(context, file, code, version)
          val result = withContext(Dispatchers.Main) {
            checkCancelled()
            val activity = appContext.throwingActivity
            if (!context.packageManager.canRequestPackageInstalls()) {
              activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
              "permission"
            } else {
              val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
              activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              })
              "installer"
            }
          }
          promise.resolve(result)
        } catch (error: Exception) {
          promise.reject(error.toCodedException())
        } finally {
          running.set(false)
        }
      }
    }

    OnDestroy {
      cancelled.set(true)
      connection?.disconnect()
      scope.cancel()
    }
  }
}
