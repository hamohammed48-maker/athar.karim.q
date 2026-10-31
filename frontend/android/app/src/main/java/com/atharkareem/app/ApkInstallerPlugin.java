package com.atharkareem.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("مسار ملف التحديث غير صالح.");
            return;
        }

        try {
            File apk = new File(Uri.parse(path).getPath()).getCanonicalFile();
            File cache = getContext().getCacheDir().getCanonicalFile();
            if (!apk.getPath().startsWith(cache.getPath() + File.separator)
                    || !apk.isFile() || !apk.getName().toLowerCase().endsWith(".apk")) {
                call.reject("ملف التحديث غير موجود في مساحة التطبيق المؤقتة.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(settings);
                JSObject result = new JSObject();
                result.put("permissionRequired", true);
                call.resolve(result);
                return;
            }

            Uri contentUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
            );
            Intent installer = new Intent(Intent.ACTION_VIEW);
            installer.setDataAndType(contentUri, "application/vnd.android.package-archive");
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installer.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(installer);

            JSObject result = new JSObject();
            result.put("permissionRequired", false);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("تعذّر فتح مثبت أندرويد للتحديث.", error);
        }
    }
}
