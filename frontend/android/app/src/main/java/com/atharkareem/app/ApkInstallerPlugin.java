package com.atharkareem.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    @PluginMethod
    public void downloadApk(PluginCall call) {
        String urlValue = call.getString("url");
        long expectedSize = call.getData().optLong("expectedSize", 0L);
        if (urlValue == null || urlValue.trim().isEmpty()) {
            call.reject("رابط ملف التحديث غير صالح.");
            return;
        }

        new Thread(() -> {
            File temporary = null;
            HttpURLConnection connection = null;
            try {
                URL source = new URL(urlValue);
                if (!"https".equalsIgnoreCase(source.getProtocol())
                        || !"github.com".equalsIgnoreCase(source.getHost())
                        || !source.getPath().startsWith("/" + "hamohammed48-maker/athar.karim.q/releases/download/")) {
                    throw new IllegalArgumentException("رابط التحديث ليس من مصدر الإصدار المعتمد.");
                }

                connection = (HttpURLConnection) source.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/octet-stream");
                connection.setRequestProperty("User-Agent", "AtharKareem-Android-Updater");
                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("تعذّر الوصول إلى ملف التحديث (HTTP " + status + ").");
                }

                URL finalUrl = connection.getURL();
                String finalHost = finalUrl.getHost();
                if (!"https".equalsIgnoreCase(finalUrl.getProtocol())
                        || !("release-assets.githubusercontent.com".equalsIgnoreCase(finalHost)
                        || "github.com".equalsIgnoreCase(finalHost))) {
                    throw new IllegalStateException("تم تحويل رابط التحديث إلى مصدر غير موثوق.");
                }

                long contentLength = connection.getContentLength();
                if (expectedSize > 0 && contentLength > 0 && contentLength != expectedSize) {
                    throw new IllegalStateException("حجم ملف التحديث لا يطابق الحجم المنشور.");
                }

                File cache = getContext().getCacheDir();
                temporary = new File(cache, "athar-kareem-update.apk.part");
                File apk = new File(cache, "athar-kareem-update.apk");
                long received = 0L;
                try (InputStream input = new BufferedInputStream(connection.getInputStream());
                     BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(temporary))) {
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        received += count;
                    }
                    output.flush();
                }

                if (received <= 0 || (expectedSize > 0 && received != expectedSize)) {
                    throw new IllegalStateException("ملف التحديث غير مكتمل، أعد المحاولة.");
                }
                if (apk.exists() && !apk.delete()) {
                    throw new IllegalStateException("تعذّر استبدال ملف التحديث المؤقت.");
                }
                if (!temporary.renameTo(apk)) {
                    throw new IllegalStateException("تعذّر حفظ ملف التحديث على الجهاز.");
                }

                JSObject result = new JSObject();
                result.put("path", Uri.fromFile(apk).toString());
                call.resolve(result);
            } catch (Exception error) {
                if (temporary != null && temporary.exists()) temporary.delete();
                call.reject(error.getMessage() != null ? error.getMessage() : "تعذّر تنزيل ملف التحديث.", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "athar-apk-download").start();
    }

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
