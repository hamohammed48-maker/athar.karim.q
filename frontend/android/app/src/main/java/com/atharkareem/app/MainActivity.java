package com.atharkareem.app;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(BackNavigationPlugin.class);
        super.onCreate(savedInstanceState);

        // Use AndroidX's dispatcher rather than the deprecated Activity.onBackPressed().
        // This callback is also integrated with Android 13+ predictive-back dispatch.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Bridge bridge = getBridge();
                if (bridge == null || bridge.getWebView() == null) {
                    finish();
                    return;
                }

                bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new Event('athar:android-back'))",
                    null
                );
            }
        });
    }
}
