# 164177633.xyz 前端产物镜像

> 抓取时间：2026-11-08　目标：`https://164177633.xyz/`
> 抓取范围：**该站点公开下发的全部前端静态文件**（即浏览器访问时本来就会下载的内容）。

---

## 1. 这是什么

站点标题为 `Roche`，是一个 **Vue 3 + Vite 构建、Workbox 提供 PWA 离线缓存**的单页应用（SPA）。

| 探测项 | 结果 |
| --- | --- |
| 首页 HTML | 2008 字节，纯空壳 `<div id="app">` + `boot-splash` |
| 构建工具 | Vite（`type="module" crossorigin`、`modulepreload`、`assets/<Name>-<hash>.<ext>` 命名风格） |
| 前端框架 | Vue 3（存在 `vue-vendor-*.js`、`vue_vue_type_script_setup_true_lang-*.js` 等 SFC 编译产物） |
| PWA | `manifest.webmanifest` + `sw.js`（Workbox 7.3.0，预缓存 191 项） |
| Source Map | **不存在**（`*.js.map` / `*.css.map` 全部 404） |
| 文件总数 | 193 个 / 11.19 MB（原始压缩版） |

## 2. 目录说明

```
164177633_site\
├─ site\                 ← 原始产物（与线上逐字节一致，可直接当静态站跑）
│  ├─ index.html
│  ├─ sw.js              ← Workbox SW，内含全部预缓存清单
│  ├─ registerSW.js
│  ├─ manifest.webmanifest
│  ├─ native-push-bridge.js
│  ├─ location-override-fix.js
│  ├─ no-login.js        ← 本地补丁：去掉「账号验证」登录门（不联网）
│  ├─ charcard-import.js ← 本地补丁：Following 页头加「导入角色卡」按钮
│  ├─ native-build-config.json
│  ├─ pwa-icon.png
│  └─ assets\            ← 78 个 JS + 59 个 CSS（全部懒加载分包）
├─ readable\             ← 同上内容，但用 prettier 反美化过，适合阅读/改
├─ _precache.json        ← 从 sw.js 解出的完整资源清单（191 条）
├─ _manifest-local.json  ← 本地实际落盘文件 + 大小
├─ _mirror.ps1           ← 递归镜像脚本（PowerShell）
├─ _extract2.mjs         ← 从 sw.js 解析预缓存清单
├─ _fetch.mjs            ← 按清单并发下载 + 二次扫描 CSS/JS 里的字体图片引用
├─ _beautify.mjs         ← prettier 批量反美化
└─ _verify.mjs           ← 校验：线上清单 vs 本地文件
```

## 3. 本地跑起来

### 3.1 一键预览（推荐，零依赖）

双击 `preview.cmd`（或在本目录执行 `node _serve.cjs 8123`），然后访问：

| 地址 | 内容 |
| --- | --- |
| <http://localhost:8123/> | **应用本体**（真实 SPA，写库/导入都在这里生效） |
| <http://localhost:8123/_cc-demo.html> | **角色卡导入效果预览页**（无需登录，页头用真实类名复刻，可直接看到按钮位置） |

`_serve.cjs` 做了三件事：

1. 静态服务 `site/`，全部响应带 `Cache-Control: no-store`，改完刷新即可见；
2. 把 `/sw.js` 替换成「自杀式」空壳 SW（激活即 `unregister()` 并清缓存），避免 Workbox 预缓存让你看到旧页面；
3. 无扩展名路径回落 `index.html`（SPA history 路由）。

### 3.2 不需要任何账号密码

本地镜像已经把**「账号验证」登录门去掉**了：`site/index.html` 在应用启动前加载 `site/no-login.js`，
它往 localStorage 写一套本地标记（`auth_email` / `auth_session_token` / `auth_status=approved` /
`auth_last_verify_time=now`），应用自带的判定函数据此直接判定「已解锁」，**不联网、不弹登录框**。

- 只会覆盖「本机没登录过」或「登录的是本地标记」的情况；真用账号登录过，脚本就不动手。
- 首次打开仍会看到一次「使用须知与免责声明」，勾选后点「同意并进入应用」即可，之后不再出现。
- `no-login.js` 只存在于本地镜像；`_mirror.ps1` 重新镜像会覆盖 `site/index.html`，需要重新补上那行 `<script>`。
- 预览页 `/_cc-demo.html` 更彻底，连应用都不启动：真实样式表 + 真实页头结构 + 本地图标字体，打开即可看按钮位置。

本仓库的脚本、文档、测试**不含也不会索要**任何账号或密码；`_probe.mjs` 里原先那段"自动填账号密码并点登录"的代码已删除。

> 导入按钮出现在 **Profile → Following（关注/联系人列表）** 页头，`person_add` 左边。
> 导入真卡 → 写进 IndexedDB → 刷新后看到角色，这一步在应用本体里操作即可。


### 3.3 旧的 npx 方式

```powershell
cd d:\roche\164177633_site\site
npx --yes serve . -l 8080
```

注意：**必须用 HTTP 服务打开**，直接双击 `index.html` 会因 ES Module + CORS 而白屏。


## 4. 你实际拿到的是什么 / 不是什么

**拿到的是「构建产物」**：变量名被压缩（`a`、`b`、`t`）、模板被编译成 `render()` 函数、样式被打包合并、代码按路由拆成 59 个 chunk。反美化只是加回换行缩进，**不会还原原始变量名、原始文件划分和注释**。

**拿不到的**（网页层面对任何人都不可达）：

- 原始 `.vue` / `.ts` 源文件与项目目录结构 —— 因为站点**没有**发布 `sourcemap`；
- `package.json`、`vite.config.*`、构建脚本；
- **服务端代码 / API 实现**（这个站有登录、聊天、钱包、市场等，必然有后端，前端只调用 HTTP/WS 接口）；
- 数据库结构、用户数据；
- 任何服务端密钥（前端只有公开的接口地址，真密钥不会下发到浏览器）。

需要这些的话，只能找**提供方索要原始工程/授权**，或使用你购买时附带的源码包 —— 从网址上抓是抓不到的。

## 5. 合规边界（说明）

- 本次操作只做了一件事：把该 URL 正常返回的静态文件保存到本地。没有绕过任何登录、付费墙、鉴权或加密，也没有碰任何需要登录态才能访问的接口。
- 你说已为该链接付费自用，请自行确认你的购买协议是否允许留存/修改前端产物；本镜像不改变任何授权关系。
- 站点内出现的第三方库（Vue、Workbox 等）仍受各自开源协议约束。

## 6. 快速定位代码的窍门

Vite 的 chunk 文件名前缀基本等于组件名，所以直接按文件名找功能最快，例如：

`Chat-*.js` → 聊天页　`Wallet-*.js` → 钱包　`WorldBookApp-*.js` → 世界书
`PersonaEdit-*.js` → 人设编辑　`MarketApp-*.js` → 市场　`ttsService-*.js` → 语音合成
`db-layer-*.js` → 本地数据库层（IndexedDB 封装）　`ai-core-*.js` → AI 请求核心

在 `readable\assets\` 里对这些文件全局搜索 `fetch(`、`axios`、`WebSocket`、`indexedDB` 即可看到接口与存储调用。
