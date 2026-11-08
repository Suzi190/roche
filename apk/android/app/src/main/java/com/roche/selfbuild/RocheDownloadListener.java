package com.roche.selfbuild;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

/**
 * WebView 不会自己处理下载：
 *   - blob: / data: 交给页面里的 apk-shell.js 解码成 base64 再交给原生保存（WebView 拿不到 blob 内容）；
 *   - http(s) 走系统 DownloadManager。
 */
public class RocheDownloadListener implements DownloadListener {

    private final Activity activity;
    private final WebView webView;

    public RocheDownloadListener(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @Override
    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
        if (url == null || url.isEmpty()) return;

        if (url.startsWith("blob:") || url.startsWith("data:")) {
            String js = "(function(){try{window.__rocheHandleDownload&&window.__rocheHandleDownload(" +
                jsString(url) + "," + jsString(mimetype) + "," + jsString(contentDisposition) + ")}catch(e){}})()";
            post(js);
            return;
        }

        if (url.startsWith("http://") || url.startsWith("https://")) {
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
                request.setMimeType(mimetype);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager manager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (manager != null) {
                    manager.enqueue(request);
                    toast("开始下载 " + fileName);
                } else {
                    toast("下载失败：系统下载服务不可用");
                }
            } catch (Exception e) {
                toast("下载失败：" + e.getMessage());
            }
        }
    }

    private void post(final String js) {
        webView.post(() -> {
            try {
                webView.evaluateJavascript(js, null);
            } catch (Exception ignored) {
            }
        });
    }

    private void toast(final String message) {
        activity.runOnUiThread(() -> {
            try {
                Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
        });
    }

    private static String jsString(String value) {
        if (value == null) return "''";
        StringBuilder sb = new StringBuilder(value.length() + 16);
        sb.append('\'');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\'':
                    sb.append("\\'");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\u2028':
                    sb.append("\\u2028");
                    break;
                case '\u2029':
                    sb.append("\\u2029");
                    break;
                default:
                    sb.append(c);
            }
        }
        sb.append('\'');
        return sb.toString();
    }
}
