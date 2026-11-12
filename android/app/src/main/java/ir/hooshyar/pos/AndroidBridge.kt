package ir.hooshyar.pos

import android.content.Intent
import android.os.Build
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Methods exposed to the web app as `window.AndroidPOS.*`.
 * All printable bytes are produced in JS; this class only delivers them.
 */
class AndroidBridge(private val activity: MainActivity) {

    companion object {
        private const val TAG = "AndroidBridge"
    }

    private val backupDir: File
        get() = File(activity.filesDir, "backups").apply { if (!exists()) mkdirs() }

    @JavascriptInterface
    fun isAndroid(): Boolean = true

    /** Second durable copy of the whole database, written after every save. */
    @JavascriptInterface
    fun saveBackup(json: String) {
        synchronized(this) {
            try {
                val dir = backupDir
                val tmp = File(dir, "auto.json.tmp")
                tmp.writeText(json, Charsets.UTF_8)
                val target = File(dir, "auto.json")
                if (target.exists() && !target.delete()) Log.w(TAG, "could not rotate auto.json")
                if (!tmp.renameTo(target)) target.writeText(json, Charsets.UTF_8)

                val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                File(dir, "backup-$day.json").writeText(json, Charsets.UTF_8)
                dir.listFiles()?.filter { it.name.startsWith("backup-") && it.name.endsWith(".json") }
                    ?.sortedByDescending { it.name }?.drop(10)?.forEach { it.delete() }
            } catch (e: Exception) {
                Log.e(TAG, "saveBackup failed", e)
            }
        }
    }

    @JavascriptInterface
    fun loadBackup(): String = try {
        val f = File(backupDir, "auto.json")
        if (f.isFile) f.readText(Charsets.UTF_8) else ""
    } catch (e: Exception) { "" }

    /** Called from Activity.onPause() and from JS lifecycle hooks. */
    @JavascriptInterface
    fun flush(): Boolean {
        activity.runOnUiThread { activity.flushWebView() }
        return true
    }

    @JavascriptInterface
    fun toast(message: String) {
        activity.runOnUiThread { Toast.makeText(activity, message, Toast.LENGTH_SHORT).show() }
    }

    @JavascriptInterface
    fun keepScreenOn(enabled: Boolean) {
        activity.runOnUiThread { activity.setKeepScreenOn(enabled) }
    }

    @JavascriptInterface
    fun deviceInfo(): String = JSONObject()
        .put("android", true)
        .put("model", Build.MODEL ?: "")
        .put("manufacturer", Build.MANUFACTURER ?: "")
        .put("sdk", Build.VERSION.SDK_INT)
        .put("appVersion", BuildConfig.VERSION_NAME)
        .put("backupPath", File(activity.filesDir, "backups").absolutePath)
        .toString()

    /** Main ESC/POS dispatcher, mirroring /api/print in the preview server. */
    @JavascriptInterface
    fun print(printerJson: String, base64: String): String {
        return try {
            val p = JSONObject(printerJson)
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            when (p.optString("kind", "network")) {
                "network" -> PrinterTransport.printTcp(
                    p.optString("ip", ""), p.optInt("port", 9100), bytes)
                "bluetooth" -> PrinterTransport.printBluetooth(activity, p.optString("mac", ""), bytes)
                "usb" -> {
                    val manager = activity.usbManager()
                    val device = PrinterTransport.findUsbDevice(
                        manager, p.optInt("vendorId", 0), p.optInt("productId", 0))
                        ?: return TransportResult(false, "چاپگر USB (XPrinter) یافت نشد. اتصال OTG و کابل را بررسی کنید.").json()
                    if (!activity.requestUsbPermission(device))
                        return TransportResult(false, "مجوز دسترسی به چاپگر USB تایید نشد.").json()
                    PrinterTransport.printUsb(manager, device, bytes)
                }
                "system" -> TransportResult(false, "برای چاپگر سیستم از گزینه چاپ مرورگر / PDF استفاده کنید.").json()
                else -> TransportResult(false, "نوع اتصال چاپگر ناشناخته است.").json()
            }.json()
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            TransportResult(false, "خطای چاپ: ${e.message}").json()
        }
    }

    /** Android PrintManager (system printers / PDF / A4). Must run on the UI thread. */
    @JavascriptInterface
    fun printHtml(html: String, widthMm: String): String {
        activity.runOnUiThread { activity.printHtml(html, widthMm) }
        return TransportResult(true, "ارسال به سرویس چاپ اندروید").json()
    }

    /**
     * Launches the payment app of a PSP (پاسارگاد، ایران کیش، به پرداخت، ...).
     * The actual values come from the editable PSP settings in the UI.
     * An empty return means "wait for window.onPspResult()".
     */
    @JavascriptInterface
    fun pspPay(reqJson: String): String {
        return try {
            val r = JSONObject(reqJson)
            val intent = Intent()
            val action = r.optString("action", "")
            if (action.isNotEmpty()) intent.action = action
            val pkg = r.optString("packageName", "")
            if (pkg.isNotEmpty()) intent.setPackage(pkg)
            intent.putExtra(r.optString("amountKey", "amount"), r.optLong("amount", 0L))
            intent.putExtra(r.optString("invoiceKey", "invoiceNumber"), r.optString("invoiceNumber", ""))
            intent.putExtra("terminalId", r.optString("terminalId", ""))
            intent.putExtra("merchantId", r.optString("merchantId", ""))
            intent.putExtra("currency", "IRR")
            intent.putExtra("transactionType", "PURCHASE")
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

            if (activity.packageManager.resolveActivity(intent, 0) == null) {
                return JSONObject()
                    .put("ok", false)
                    .put("code", "-1")
                    .put("message", "اپلیکیشن PSP روی دستگاه یافت نشد: $pkg / $action")
                    .toString()
            }
            activity.runOnUiThread { activity.startPsp(intent) }
            ""
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("code", "-1").put("message", "خطا در اجرای PSP: ${e.message}").toString()
        }
    }

    @JavascriptInterface
    fun listUsbDevices(): String = try {
        PrinterTransport.listUsb(activity.usbManager())
    } catch (e: Exception) { "[]" }

    @JavascriptInterface
    fun listBluetoothDevices(): String = try {
        PrinterTransport.listBluetooth()
    } catch (e: Exception) { "[]" }
}
