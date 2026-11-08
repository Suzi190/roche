package com.roche.selfbuild;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Roche 原生壳：
 *   1. 全屏（边到边），状态栏/刘海区域也交给 WebView 使用，不再留黑边；
 *   2. 返回键/侧滑 → 先交给页面自己回上一页，只在桌面层才退到后台（绝不直接退出 App）；
 *   3. 注入 window.RocheNative（保存导出文件、吐司、状态栏图标颜色）；
 *   4. 补上 WebView 不会自己处理的下载（blob:/data:）。
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_STARTUP_PERMISSIONS = 4721;

    private RocheShell shell;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        applyEdgeToEdge();

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            // Capacitor 默认会给 WebView 加系统栏边距（顶部一条黑条），这里改成铺满整屏
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                pushInsetsToWeb(windowInsets);
                return WindowInsetsCompat.CONSUMED;
            });

            shell = new RocheShell(this, webView, () -> ViewCompat.requestApplyInsets(webView));
            webView.addJavascriptInterface(shell, "RocheNative");
            webView.setDownloadListener(new RocheDownloadListener(this, webView));
            ViewCompat.requestApplyInsets(webView);
        }

        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    handleBackPressed();
                }
            }
        );

        requestStartupPermissions();
    }

    /* ------------------------------------------------------------ 全屏/刘海 */

    private void applyEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }
    }

    private void pushInsetsToWeb(WindowInsetsCompat windowInsets) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        Insets bars = windowInsets.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;

        String json = String.format(
            Locale.US,
            "{\"top\":%.2f,\"right\":%.2f,\"bottom\":%.2f,\"left\":%.2f}",
            bars.top / density,
            bars.right / density,
            bars.bottom / density,
            bars.left / density
        );

        if (shell != null) shell.setInsetsJson(json);
        final String payload = json;
        webView.post(() -> {
            try {
                webView.evaluateJavascript(
                    "window.__rocheApplyInsets&&window.__rocheApplyInsets(" + payload + ")",
                    null
                );
            } catch (Exception ignored) {
            }
        });
    }

    /* ----------------------------------------------------------------- 返回 */

    private void handleBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        try {
            webView.evaluateJavascript(
                "(function(){try{return window.__rocheBack?window.__rocheBack():'false'}catch(e){return 'false'}})()",
                value -> {
                    boolean handled = value != null && value.contains("true");
                    if (!handled) {
                        // 已在桌面：退到后台，而不是退掉 APK
                        moveTaskToBack(true);
                    }
                }
            );
        } catch (Exception e) {
            moveTaskToBack(true);
        }
    }

    /* ----------------------------------------------------------------- 权限 */

    private void requestStartupPermissions() {
        List<String> wanted = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            wanted.add(Manifest.permission.POST_NOTIFICATIONS);
            wanted.add(Manifest.permission.READ_MEDIA_IMAGES);
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            wanted.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        List<String> missing = new ArrayList<>();
        for (String permission : wanted) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missing.add(permission);
            }
        }
        if (missing.isEmpty()) return;
        try {
            requestPermissions(missing.toArray(new String[0]), REQ_STARTUP_PERMISSIONS);
        } catch (Exception ignored) {
        }
    }
}

