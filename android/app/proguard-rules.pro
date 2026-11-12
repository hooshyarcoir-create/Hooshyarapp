# JavascriptInterface methods are called by name from the WebView.
-keepclassmembers class ir.hooshyar.pos.AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*
