package ir.hooshyar.pos

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Full-screen WebView host. The whole POS UI lives in assets/www (synced from
 * /webapp at build time); this class adds the hardware capabilities a browser
 * cannot offer: USB/Bluetooth/network ESC/POS, PSP intents and durable backup.
 */
class MainActivity : Activity() {

    companion object {
        const val REQ_PSP = 4201
        const val REQ_BLUETOOTH = 4202
        const val ACTION_USB_PERMISSION = "ir.hooshyar.pos.USB_PERMISSION"
    }

    private lateinit var webView: WebView
    private var printWebView: WebView? = null
    private var usbReceiver: BroadcastReceiver? = null
    private var usbLatch: CountDownLatch? = null

    @Volatile
    private var usbGranted = false

    private val manager: UsbManager by lazy { getSystemService(Context.USB_SERVICE) as UsbManager }

    fun usbManager(): UsbManager = manager

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor("#0F1116"))
        setContentView(webView, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.allowFileAccess = true
        s.allowContentAccess = true
        // Only our own assets are loaded here. These two legacy flags let the
        // bundled Vazirmatn woff2 resolve from file:///android_asset/ and keep
        // canvas.getImageData() usable for the ESC/POS raster renderer.
        s.allowFileAccessFromFileURLs = true
        s.allowUniversalAccessFromFileURLs = true
        s.defaultTextEncodingName = "UTF-8"
        s.cacheMode = WebSettings.LOAD_NO_CACHE
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.layoutAlgorithm = WebSettings.LayoutAlgorithm.NORMAL
        s.mediaPlaybackRequiresUserGesture = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        webView.isHorizontalScrollBarEnabled = false
        webView.isVerticalScrollBarEnabled = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER

        webView.addJavascriptInterface(AndroidBridge(this), "AndroidPOS")
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleUrl(url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) handleUrl(request.url.toString())
                else false
            }

            override fun onPageFinished(view: WebView, url: String) {
                // Make sure the durable backup exists even before the first change.
                flushWebView()
            }
        }

        registerUsbReceiver()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissions(
                arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN),
                REQ_BLUETOOTH
            )
        }
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    private fun handleUrl(url: String?): Boolean {
        if (url == null) return false
        if (url.startsWith("file:") || url.startsWith("about:") || url.startsWith("data:") ||
            url.startsWith("javascript:") || url.startsWith("http://localhost") ||
            url.startsWith("http://127.0.0.1")) return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
            true
        } catch (e: Exception) { false }
    }

    /** Native durability hook: called on pause, page finish and from JS. */
    fun flushWebView() {
        try {
            webView.evaluateJavascript("(window.App && window.App.flush) ? window.App.flush() : null", null)
        } catch (e: Exception) { /* WebView already destroyed */ }
    }

    fun setKeepScreenOn(enabled: Boolean) {
        if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onPause() {
        flushWebView()
        super.onPause()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        webView.evaluateJavascript("(window.App && window.App.back) ? window.App.back() : false") { value ->
            if (value != "true") moveTaskToBack(true)
        }
    }

    /* ----------------------------- system printing ----------------------------- */
    @Suppress("UNUSED_PARAMETER")
    fun printHtml(html: String, widthMm: String) {
        // widthMm is applied by the receipt CSS (@media print); PrintManager
        // receives an A4 job which the user can scale to 58/80 mm paper.
        try {
            val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
            val pv = WebView(this)
            printWebView = pv
            pv.settings.javaScriptEnabled = false
            pv.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    try {
                        val adapter = pv.createPrintDocumentAdapter("hooshyar-receipt")
                        val attrs = PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build()
                        pm.print(getString(R.string.print_job), adapter, attrs)
                    } catch (e: Exception) {
                        Toast.makeText(this@MainActivity, "خطا در چاپ سیستم: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            pv.loadDataWithBaseURL("file:///android_asset/www/", html, "text/html", "UTF-8", null)
        } catch (e: Exception) {
            Toast.makeText(this, "خطا در چاپ سیستم: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    /* --------------------------------- PSP --------------------------------- */
    fun startPsp(intent: Intent) {
        try {
            startActivityForResult(intent, REQ_PSP)
        } catch (e: Exception) {
            val json = JSONObject().put("ok", false).put("code", "-1")
                .put("message", "اجرای اپلیکیشن PSP ممکن نیست: ${e.message}").toString()
            deliverPspResult(json)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_PSP) {
            val out = JSONObject()
            out.put("resultCode", resultCode)
            out.put("ok", resultCode == RESULT_OK)
            out.put("message", if (resultCode == RESULT_OK) "پاسخ PSP دریافت شد" else "تراکنش توسط کاربر لغو شد")
            try {
                val extras = data?.extras
                if (extras != null) {
                    for (key in extras.keySet()) {
                        val value = extras.get(key)
                        if (value != null) {
                            val text = value.toString()
                            out.put(key, text)
                            when {
                                key.contains("response", true) || key.contains("resultCode", true) || key.equals("code", true) -> out.put("code", text)
                                key.contains("reference", true) || key.equals("rrn", true) -> out.put("ref", text)
                                key.contains("trace", true) -> out.put("trace", text)
                                key.contains("pan", true) || key.contains("card", true) -> out.put("pan", text)
                            }
                        }
                    }
                }
            } catch (e: Exception) { /* ignore malformed extras */ }
            deliverPspResult(out.toString())
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    private fun deliverPspResult(json: String) {
        runOnUiThread {
            try {
                webView.evaluateJavascript(
                    "window.onPspResult && window.onPspResult(" + JSONObject.quote(json) + ")", null)
            } catch (e: Exception) { /* ignore */ }
        }
    }

    /* ------------------------------- USB permission ------------------------------- */
    private fun registerUsbReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == ACTION_USB_PERMISSION) {
                    usbGranted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    usbLatch?.countDown()
                }
            }
        }
        usbReceiver = receiver
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
        }
    }

    /**
     * Blocks the calling JavascriptInterface thread (NOT the UI thread) until
     * the user answers the Android USB permission dialog.
     */
    fun requestUsbPermission(device: UsbDevice): Boolean {
        if (manager.hasPermission(device)) return true
        val latch = CountDownLatch(1)
        usbLatch = latch
        usbGranted = false
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        else PendingIntent.FLAG_UPDATE_CURRENT
        val pi = PendingIntent.getBroadcast(
            this, 17, Intent(ACTION_USB_PERMISSION).setPackage(packageName), flags)
        runOnUiThread { manager.requestPermission(device, pi) }
        return try {
            latch.await(20, TimeUnit.SECONDS)
            usbGranted
        } catch (e: InterruptedException) { false }
    }

    override fun onDestroy() {
        try { usbReceiver?.let { unregisterReceiver(it) } } catch (_: Exception) {}
        try { printWebView?.destroy() } catch (_: Exception) {}
        try { webView.destroy() } catch (_: Exception) {}
        super.onDestroy()
    }
}
