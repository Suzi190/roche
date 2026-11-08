package com.roche.selfbuild;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * 注入到 WebView 的原生桥（window.RocheNative）。
 * 只做「Web 层自己做不到」的几件事：写系统下载目录、吐司、退到后台、切换状态栏图标颜色。
 */
public class RocheShell {

    private final Activity activity;
    private final WebView webView;
    private final Runnable onReady;
    private volatile String cachedInsets = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}";

    public RocheShell(Activity activity, WebView webView, Runnable onReady) {
        this.activity = activity;
        this.webView = webView;
        this.onReady = onReady;
    }

    public void setInsetsJson(String json) {
        if (json != null) cachedInsets = json;
    }

    @JavascriptInterface
    public String isNative() {
        return "1";
    }

    @JavascriptInterface
    public String getInsets() {
        return cachedInsets;
    }

    @JavascriptInterface
    public String platform() {
        return "android";
    }

    @JavascriptInterface
    public void shellReady() {
        if (onReady != null) activity.runOnUiThread(onReady);
    }

    @JavascriptInterface
    public void toast(final String message) {
        if (message == null) return;
        activity.runOnUiThread(() -> {
            try {
                Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public void copyText(final String text) {
        activity.runOnUiThread(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("roche", String.valueOf(text)));
            } catch (Exception ignored) {
            }
        });
    }

    /** 退到后台（回到手机桌面），不销毁进程，也不退出 App */
    @JavascriptInterface
    public void minimize() {
        activity.runOnUiThread(() -> activity.moveTaskToBack(true));
    }

    @JavascriptInterface
    public void exitApp() {
        activity.runOnUiThread(() -> {
            activity.moveTaskToBack(true);
            activity.finish();
        });
    }

    /** true = 浅色图标（白色，深色背景时用） */
    @JavascriptInterface
    public void setSystemBarStyle(final boolean lightIcons) {
        activity.runOnUiThread(() -> {
            try {
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                    activity.getWindow(),
                    activity.getWindow().getDecorView()
                );
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(!lightIcons);
                    controller.setAppearanceLightNavigationBars(!lightIcons);
                }
            } catch (Exception ignored) {
            }
        });
    }

    /**
     * 把 base64 内容写进系统「下载」目录。
     *
     * @return 可读的保存路径（失败返回空串）
     */
    @JavascriptInterface
    public String saveBase64(String name, String mime, String base64) {
        if (base64 == null || base64.isEmpty()) return "";
        String safeMime = (mime == null || mime.trim().isEmpty())
            ? "application/octet-stream"
            : mime.split(";")[0].trim();
        String fileName = sanitizeName(name, safeMime);

        byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (Exception e) {
            toast("导出失败：数据损坏");
            return "";
        }

        try {
            String where;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                where = writeToDownloadsMediaStore(fileName, safeMime, bytes);
            } else {
                where = writeToDownloadsLegacy(fileName, safeMime, bytes);
            }
            toast("已保存到 " + where);
            return where;
        } catch (Exception e) {
            return writeToAppDownloads(fileName, safeMime, bytes);
        }
    }

    /* -------------------------------------------------------------- 文件写入 */

    private String writeToDownloadsMediaStore(String fileName, String mime, byte[] bytes) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("无法在下载目录创建文件");

        OutputStream out = activity.getContentResolver().openOutputStream(uri);
        if (out == null) throw new Exception("无法写入下载目录");
        try {
            out.write(bytes);
            out.flush();
        } finally {
            try {
                out.close();
            } catch (Exception ignored) {
            }
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        activity.getContentResolver().update(uri, values, null, null);
        return "下载/" + fileName;
    }

    private String writeToDownloadsLegacy(String fileName, String mime, byte[] bytes) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) throw new Exception("没有下载目录");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("下载目录不可用");
        File file = uniqueFile(dir, fileName);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(bytes);
            fos.flush();
        }
        try {
            MediaScannerConnection.scanFile(activity, new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
        } catch (Exception ignored) {
        }
        return "下载/" + file.getName();
    }

    private String writeToAppDownloads(String fileName, String mime, byte[] bytes) {
        try {
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = activity.getCacheDir();
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("目录不可用");
            File file = uniqueFile(dir, fileName);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(bytes);
                fos.flush();
            }
            toast("已保存到 " + file.getAbsolutePath());
            shareFile(file, mime);
            return file.getAbsolutePath();
        } catch (Exception e) {
            toast("保存失败：" + e.getMessage());
            return "";
        }
    }

    private void shareFile(File file, String mime) {
        try {
            Uri uri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".fileprovider",
                file
            );
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime == null ? "*/*" : mime);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(intent, "导出文件");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(chooser);
        } catch (Exception ignored) {
        }
    }

    private File uniqueFile(File dir, String fileName) {
        File file = new File(dir, fileName);
        if (!file.exists()) return file;
        String base = fileName;
        String ext = "";
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) {
            base = fileName.substring(0, dot);
            ext = fileName.substring(dot);
        }
        for (int i = 1; i < 1000; i++) {
            File candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    private String sanitizeName(String name, String mime) {
        String n = name == null ? "" : name.trim().replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_");
        if (n.isEmpty()) n = "roche-" + System.currentTimeMillis();
        if (n.length() > 120) n = n.substring(0, 120);
        if (!n.contains(".")) n += extFor(mime);
        return n;
    }

    private String extFor(String mime) {
        if (mime == null) return ".bin";
        String m = mime.toLowerCase(Locale.US);
        if (m.contains("json")) return ".json";
        if (m.startsWith("text/plain")) return ".txt";
        if (m.contains("csv")) return ".csv";
        if (m.contains("html")) return ".html";
        if (m.contains("png")) return ".png";
        if (m.contains("jpeg") || m.contains("jpg")) return ".jpg";
        if (m.contains("webp")) return ".webp";
        if (m.contains("gif")) return ".gif";
        if (m.contains("zip")) return ".zip";
        if (m.contains("pdf")) return ".pdf";
        return ".bin";
    }
}
