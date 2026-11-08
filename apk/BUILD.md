# Roche → APK 打包说明

本目录是一个 **Capacitor 7 原生壳**，把镜像下来的 Web 产物包成 Android APK。

原版 App 本身就是 Capacitor（`native-push-bridge.js` 里有 `Capacitor` / `isNativePlatform` / `getPlatform`，
并监听了 `pushNotificationReceived` / `pushNotificationActionPerformed`；`native-build-config.json`
显示 `androidFirebaseConfigured: null`，即官方包也没启用 FCM）。所以这里用同一套方案，
Web 层行为与官方一致，不会出现 origin 不匹配之类的问题。

---

## 先看这里：两条路怎么选

实测你这台机器：**没有可用的 JDK / Android SDK**（Android Studio 目录是装了一半的空壳），
且网络总带宽只有 **0.05–0.3 MB/s**。本机出包要拉 JDK 192 MB + SDK 146 MB + Gradle 及依赖约 250 MB，
合计 600 MB 左右，**约 1 小时以上**；云端出包只需要推送约 15 MB（代码 + Web 产物），
编译在 GitHub 机器上跑，**几分钟出 APK**。

| | 云端 GitHub Actions | 本机 |
| --- | --- | --- |
| 传输量 | ~15 MB（推仓库） | ~600 MB（装工具链） |
| 耗时 | 3–5 分钟 | 1 小时+ |
| 前置条件 | GitHub 账号（实测 github.com 可直连，1.3 s） | 无，已有脚本 |
| 适合 | **强烈推荐** | 想完全离线 / 反复调试 |

---


```
d:\roche\apk\
├─ www\                     ← Web 产物（APK 里实际加载的页面，二改就改这里）
├─ android\                 ← 原生工程（cap add android 生成）
│  └─ app\src\main\AndroidManifest.xml   ← 已加 POST_NOTIFICATIONS / ACCESS_NETWORK_STATE
├─ capacitor.config.json    ← appId=com.roche.selfbuild, androidScheme=https
├─ check-web.mjs            ← 打包前自检（文件存在性 + 全部 JS 语法校验）
├─ sync-web.ps1             ← 一键把镜像产物刷进 www（可选 site / readable）
└─ （流水线在仓库根）.github\workflows\build-apk.yml   ← 云端出包流水线，工作目录 apk/
```

## 关键参数

| 项 | 值 | 说明 |
| --- | --- | --- |
| appId | `com.roche.selfbuild` | 刻意与官方包区分，避免冒名；装到手机上可与官方版共存 |
| appName | `Roche` | 桌面显示名，改 `android/app/src/main/res/values/strings.xml` |
| minSdk | 23 (Android 6.0) | |
| targetSdk | 35 (Android 15) | |
| 权限 | INTERNET / POST_NOTIFICATIONS / ACCESS_NETWORK_STATE | 实测前端未使用摄像头、麦克风、定位、震动，无需敏感权限 |
| Web origin | `https://localhost` | Capacitor 默认，`index.html` 用的是相对路径 `./assets/...`，照常工作 |

---

## 二改流程

1. 选基线：
   - `npm run` 前先决定改哪套。**要改代码就用 readable**（`sync-web.ps1 -Source readable`），
     它是 prettier 反美化版，8 万个符号都还原成缩进结构，`Chat` 分包从 1 行变成 29059 行，好定位。
   - 只改文案/开关，用 `site` 基线 + 全局替换更快。
2. 直接在 `www\assets\` 里改对应分包（见 `d:\roche\164177633_site\CHUNKS.md` 的分包地图）。
3. 校验 + 同步：
   ```powershell
   cd d:\roche\apk
   npm run check      # 全部 JS 语法校验，改坏了会直接报出来
   npm run sync       # cap sync android，把 www 塞进原生工程
   ```
4. 出包（见下）。

> 注意：改完 `readable` 版后不要在 `www` 里再跑 prettier，避免重复格式化。

## 出包方式一：云端 GitHub Actions（已配好，推荐）

仓库：<https://github.com/Suzi190/roche>（公开），流水线文件在**仓库根** `.github/workflows/build-apk.yml`，
所有 `run` 步骤都通过 `working-directory: apk` 在 `apk/` 里执行。

1. 推到 `main` 会自动跑；也可以在 [Actions](https://github.com/Suzi190/roche/actions) 里点 `build-apk` → **Run workflow** 手动触发。
2. 跑完在该次 run 页面底部 **Artifacts** 下载 `roche-debug-apk.zip`，解压得到 `app-debug.apk`，可直接安装。
3. 流水线做的事：Node 22 + JDK 21 → 用 runner 自带的 Android SDK（补装 `platforms;android-35`、`build-tools;35.0.0`）
   → `node check-web.mjs` → `npx cap sync android` → `./gradlew assembleDebug` → `aapt2 dump badging` → 上传 APK。

本地推一次的传输量约 15 MB（`www` + `android` 源码；`node_modules`、`app/build`、SDK 都不进仓库）。

> 一个已知坑：`check-web.mjs` 以前写死了 `d:\roche\apk\www`，Linux runner 上会 `ENOENT` 直接失败，
> 现已改为按脚本自身位置（`import.meta.url`）定位，Windows / Linux 都能跑。

## 出包方式二：本机（环境已装好，可直接出包）

本机现在可用：**Node 22 ✓ / JDK 21 ✓ `D:\jdks\temurin-21` / Android SDK ✓ `D:\AndroidSDk`**，
已实测 `assembleDebug` 成功，产物 `apk\android\app\build\outputs\apk\debug\app-debug.apk`（约 15 MB）。

```powershell
cd d:\roche\apk
powershell -ExecutionPolicy Bypass -File .\sync-web.ps1   # 刷新 www 里的 apk-shell.js
node check-web.mjs                                       # 自检
npx cap sync android
$env:JAVA_HOME='D:\jdks\temurin-21'; $env:ANDROID_HOME='D:\AndroidSDk'; $env:ANDROID_SDK_ROOT='D:\AndroidSDk'
cd android; .\gradlew.bat assembleDebug
```

原生壳行为（`shell\apk-shell.js`，打包时注入 `www`）：

- 边到边全屏：原生 `MainActivity` 把 `WindowInsets` 归一化后通过 `__rocheApplyInsets` 推给页面，
  JS 写入 `--roche-inset-*` 并把 CSS 里的 `env(safe-area-inset-*)` 换成真实像素（另有 `#roche-safe-area` 兜底样式）。
- 返回：页面有返回/关闭控件就点它；App 页只有标题就点标题回桌面；都不行则软重载（数据在 IndexedDB）；
  已经在桌面层时返回 `false`，原生 `moveTaskToBack` 退到后台而不是退出。
- 边缘滑动：左/右边缘 30px 内起手、横向位移 > 60px 且大于纵向 → 等同于返回。
- 导入/导出：拦截 `<a download>`、`blob:`、`data:`、`window.open`、`navigator.share({files})`，
  页面内用 `FileReader` 解成 base64 → 原生 `saveBase64` 写入 Downloads；`__rocheHandleDownload` 处理 DownloadListener 回传的 blob。

回归测试：`node test-apk-shell.mjs`（Edge CDP + stub 原生桥，12 项全绿）。

因此我为你在 `D:\roche\tools` 下装**免安装便携版**（不写系统目录、不需要管理员）：

| 组件 | 来源 | 大小 |
| --- | --- | --- |
| OpenJDK 21 (Windows x64) | `https://mirrors.huaweicloud.com/openjdk/21.0.2/openjdk-21.0.2_windows-x64_bin.zip` | 192 MB |
| Android cmdline-tools | `https://mirrors.cloud.tencent.com/AndroidSDK/commandlinetools-win-11076708_latest.zip` | 146.5 MB |

> 为什么用这两个源：Adoptium 官方链接会跳 GitHub Releases，实测在本网络**直接卡死**；
> `aka.ms`（微软 JDK）、Oracle CDN、AWS Corretto 实测都只有 0.05–0.25 MB/s。华为/腾讯镜像是最稳的。
> **注意：你这网络整体只有 0.05–0.3 MB/s，整条链路（JDK + SDK + Gradle ≈ 600 MB）大约要 1 小时以上。**

### 步骤

```powershell
# 1) 下载两个包到 D:\roche\tools（支持断点续传，可反复运行）
powershell -ExecutionPolicy Bypass -File d:\roche\apk\download-mirrors.ps1

# 2) 一键装环境 + 出包
powershell -ExecutionPolicy Bypass -File d:\roche\apk\setup-toolchain.ps1
```

`setup-toolchain.ps1` 会自动完成：解压 JDK → 解压 cmdline-tools → 接受许可 →
`sdkmanager` 装 `platform-tools` / `platforms;android-35` / `build-tools;35.0.0` →
写 `android\local.properties` → `check-web` → `cap sync` → `gradlew assembleDebug`。

产物：`d:\roche\apk\android\app\build\outputs\apk\debug\app-debug.apk`

只装环境不出包：加 `-SkipBuild`。

### 装到手机

```powershell
# 手机开 USB 调试后
D:\roche\tools\android-sdk\platform-tools\adb.exe install -r d:\roche\apk\android\app\build\outputs\apk\debug\app-debug.apk
```

或把 APK 拷进手机手动安装（需允许「安装未知来源应用」）。

### 正式签名（自用可选）

```powershell
keytool -genkey -v -keystore roche.keystore -alias roche -keyalg RSA -keysize 2048 -validity 10000
```

然后在 `android\app\build.gradle` 的 `android { }` 里加 `signingConfigs`，`buildTypes.release` 引用它，
再跑 `npm run apk:release`。自用装 debug 包也完全够用（debug 包默认无签名冲突问题）。

---

## 换图标 / 改包名

- 图标：把 `d:\roche\164177633_site\site\pwa-icon.png`（399 KB，512×512）导入 Android Studio
  → 右键 `res` → New → Image Asset，或直接替换 `android\app\src\main\res\mipmap-*\ic_launcher*.png`。
- 包名：改 `capacitor.config.json` 的 `appId` + `android\app\build.gradle` 的 `namespace` 与
  `applicationId` + `strings.xml` 的 `package_name` / `custom_url_scheme`，然后 `npm run sync`。

---

## 已知限制（务必先看）

1. **后端不在包里**。这个 App 有登录、聊天、钱包、市场，必然连服务端 API（前端 65 处 `fetch`、5 处 WebSocket）。
   壳能跑起来，但**功能能否用取决于你的账号和对方服务端是否还在、是否校验来源**。
   服务端代码/密钥不可能从前端拿到。
2. **推送不会生效**。原生 FCM 未配置（原版也没有）。`native-push-bridge.js` 在没有原生注入时会走降级分支，
   `__rocheNativePush` 相关能力静默失效，不影响其它功能。
3. **PWA Service Worker 在 WebView 里不保证注册成功**，`sw.js` 的离线缓存可能不起作用；不影响在线使用。
   若要彻底避免干扰，可删掉 `www/registerSW.js` 和 `index.html` 里的那行 `<script>`。
4. **二改的合法性由你负责**：修改后自行分发可能违反原始授权协议；自用范围内请对照你的购买条款。
5. `www` 里的第三方库（Vue、Workbox 等）仍受各自开源协议约束。
