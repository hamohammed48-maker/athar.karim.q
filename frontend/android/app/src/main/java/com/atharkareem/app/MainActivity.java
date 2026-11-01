package com.atharkareem.app;

import android.os.Bundle;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(BackNavigationPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            super.onBackPressed();
            return;
        }
        bridge.getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('athar:android-back'))",
            null
        );
    }
}
