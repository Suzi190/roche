# SillyTavern 角色卡导入（charcard-import.js）

个人页（Following）头部「添加角色 `person_add`」按钮**右侧**会多出一个导入按钮，支持一次选择多份
SillyTavern 角色卡：**PNG（tEXt/iTXt 内嵌 `chara`）** 与 **JSON（v1 / v2 / v3 / roche_contact_card）**。

## 文件

| 文件 | 说明 |
| --- | --- |
| `readable/charcard-import.js` | 可读源码，独立 IIFE，无构建依赖 |
| `site/charcard-import.js` | 与上面完全一致的副本（部署目录） |
| `readable/index.html` / `site/index.html` | 在 `native-push-bridge.js` 之后加载本模块 |
| `_cc_test_lib.cjs` / `_cc_test.cjs` | 数据层测试（69 项：解析、映射、写库、挂载） |
| `_cc_test_ui.cjs` | 注入逻辑测试（44 项：锚点、槽包装、去重、选择框、内存 store 识别 / 合并 / 同步） |
| `_serve.cjs` / `preview.cmd` | 本地预览服务器（零依赖）+ 双击启动器 |
| `site/_cc-demo.html` | 无需登录的**效果预览页**（真实页头类名 + 真实样式表 + 模拟 store 的实时列表） |
| `site/no-login.js` | **去掉登录门**的本地补丁（写本地标记让应用直接解锁，不联网） |
| `_demo_check.mjs` | 真浏览器（Edge headless + CDP）校验按钮位置，并验证「合并进 store → 列表立刻多一行」 |
| `_real_live.mjs` | 真应用端到端校验：页面自己找 store → 合并 → 真实 Following 组件直接渲染出新角色 |
| `_nologin.mjs` | 校验「账号验证」门已去掉（打印 `PWD-INPUT: false` 并截图 `_shot-nologin.png`） |

## 本地预览

```powershell
cd d:\roche\164177633_site
node _serve.cjs 8123                  # 仅本机：http://localhost:8123/
node _serve.cjs 8123 site 0.0.0.0     # 局域网可访问（会用手机打开时加这个）
# 或者直接双击 preview.cmd（自动起服务 + 打开浏览器；preview.cmd lan 只起服务并打印局域网地址）
```

- 应用本体：<http://localhost:8123/>（SPA 本体；**登录门已由 `site/no-login.js` 去掉**，打开即可进）
- 效果预览：<http://localhost:8123/_cc-demo.html>（不用登录，直接看按钮/点开面板）
- 服务默认只绑 `127.0.0.1`：**手机或其它设备打不开是正常的**，加第 3 个参数 `0.0.0.0`
  后会打印形如 `http://192.168.x.x:8123/` 的局域网地址（首次需在 Windows 防火墙弹窗里允许）。
- 服务是前台进程：**关掉那个命令行窗口（或 Ctrl+C）服务就停了**，链接随之打不开。

真浏览器校验（无需登录）：

```powershell
node _demo_check.mjs
# PASS 按钮已注入 / 页头用 .cc-slot 收成一组 / 插在 person_add 右边 / 几何在其右侧 / 同排 / 40x40 圆形 / 点击生成 file input
# PASS 合并进页面 store 后列表立刻多一行（未重载）
# 截图：_shot-header.png（页头）、_shot.png（含遮罩）

node _nologin.mjs        # 校验登录门已去掉：PWD-INPUT false，截图 _shot-nologin.png
node _real_live.mjs      # 真应用里验证免重启：自己找 store → 合并 → 真实 Following 渲染出新角色
```


## 运行测试

```powershell
cd d:\roche\164177633_site
node _cc_test.cjs      # 数据层
node _cc_test_ui.cjs   # UI 注入
```

## 实现要点

1. **不碰压缩包**：直接读写应用自己的 IndexedDB（`Roche_db`）。
   已核实该 SPA 的 `contacts` 只在**启动时**从库水合一次到内存，没有 Pinia，也没有
   任何 `reloadAll` / `refreshAll` / `visibilitychange` 之类的「重新读库」通道
   （运行时把 76 个 chunk 的导出全扫过也没有现成的 reload 函数）。
   `indexedDB.open()` 不传 version，永远不会触发 upgrade 破坏 schema。
2. **免重启（v3，替代 v2 的「自动重载 + 点击重放」）**：写库之后直接把新角色塞进应用的
   **内存 store**，页面是响应式的，列表立刻更新，**不重载、不重启**。
   - 应用的全局状态是构建产物 `index-*.js` 导出的一个 Vue `reactive` 对象（含
     `contacts` / `personas` / `conversations` …），`Following-De-2vWMN.js` 里
     `import{s as n}from"./ai-core-*.js"` 拿的就是它 —— 列表就是从这个数组渲染的；
   - 构建产物是 ES 模块，同一模块在页面里只执行一次，所以脚本用 `import()` 遍历
     `performance.getEntriesByType('resource')` 里**已经加载过**的 `/assets/*.js`，
     按形状（三个数组齐全）把这个 store 找出来，**零副作用**；
   - 合并规则：同 `id` 覆盖、新角色 `unshift` 到最前面（和「刚加的人在最上面」一致）；
   - 找不到 store（应用换版本、结构变了）时降级：照常写库，面板提示「点刷新页面后生效」，
     不会自动刷新、不会打断你的操作；
   - 实测（`_real_live.mjs`）：真应用里 `findStore()` 命中 `index-*.js#s`，
     `syncLive()` 后 `contacts` 0 → 1，把真实 `Following` 组件挂上去立刻渲染出
     `… person liveprobe 免重启探针角色 Following`，全程没有重载页面。
3. **模板克隆**：新记录以库里已有记录为模板克隆字段，仅覆盖语义字段，
   这样应用升级新增字段时不会因缺字段崩掉。
4. **锚点 / 位置**：目标永远是「添加角色」（`person_add` 图标按钮），导入按钮一律放在它**右边**：
   - 若它在一个按钮组里（`flex items-center gap-2 ml-4`），直接 `insertAfter`，
     组的 `gap-2` 自然给出间距，结果 `[person_add][导入按钮]`；
   - 若它直接挂在两端对齐的页头下（线上真实 DOM 就是这样：`header.justify-between` 的
     第三个子节点），直接加成同级会被 `justify-between` 均匀撑开，所以先用
     `.cc-slot`（`inline-flex; gap:8px`）把「原按钮 + 导入按钮」包成一组再放回原位置，
     页头子节点数不变，两者始终贴在一起；`person_add` 原本靠 `-mr-2` 贴右边，
     现在改由导入按钮承担（`.cc-slot .cc-btn{margin-right:-8px}`）；
   - 认不出 `person_add` 图标时取组内最后一个按钮；再找不到就退回整页的
     `person_add` / `add` / `search` 图标按钮（同样插到它右边）。
   仅当头部含 `Following` 文本或 `person_add` 图标时才注入，避免污染其它页面。
   MutationObserver + 1.5s 轮询保证路由切换、热更新后仍在；若槽里的原按钮被前端
   重新渲染掉，会自动重新收一次组。

   线上真实页头结构（用 CDP 从运行中的应用里 dump 出来的 DOM）：

   ```html
   <header class="flex items-center justify-between px-6 pt-[calc(20px_+_env(safe-area-inset-top))] pb-3
                  sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-gray-50">
     <button class="... size-10 -ml-2 ..."><span class="material-symbols-outlined">arrow_back_ios_new</span></button>
     <span class="text-[13px] font-bold uppercase tracking-[0.25em]">FOLLOWING</span>
     <button class="... size-10 -ml-2 ..."><span class="material-symbols-outlined text-[18px]">person_add</span></button>
   </header>
   ```

   注入后页头变成 `[返回][FOLLOWING][cc-slot: person_add + 导入按钮]`，
   图标按钮尺寸与 `size-10`（40×40）一致（实测两个按钮 40×40、间距 8px、同一行）。
   空状态插图里的 `person_add` 带 `text-zinc-300`，会被跳过。

5. **handle 唯一**：`@name` 已存在时自动变成 `@name2`、`@name3`……

## SillyTavern → 本应用 映射

| ST 字段 | 落库位置 |
| --- | --- |
| `name` | `contacts.name`；`handle` 由名字取 ASCII（`[a-z0-9_]`，截 16 位），纯中文名退化为 `@char_<hash>` |
| `description` / `personality` / `scenario` | 合成 `contacts.persona` 段落 |
| `first_mes` + `alternate_greetings` | `contacts.openingGreetings[]` |
| `mes_example` | persona 里的「示例对话」段 |
| `creator_notes` 等 | `charcard` 备注行（不参与推理） |
| `character_book.entries` | 新建世界书分类 + 条目，并自动挂到该角色已有的会话 |
| `extensions.regex_scripts` | 新建正则分类 + 条目 |

**世界书**

- `keys` → 触发词（`a|b` 这类正则写法降级为字面量多关键词）
- `secondary_keys` → 合并进关键词；`enabled === false` 的条目跳过
- `position`：0/2 → `front`；1/3/4（含 `at_depth`）→ `back`，`depth` 限幅 1–10
- `insertion_order` → 条目排序；`content` 内 `{{char}}` / `{{user}}` / `<BOT>` / `<USER>` 就地展开

**正则**

- 应用侧执行契约：`new RegExp(entry.regex, 'gms').replace(re, entry.html)`
- ST 的 `/pattern/flags` 去掉首尾斜杠；`i` 标记通过把字母展开成 `[aA]` 实现
- `{{match}}` → `$&`；替换串同样展开 JS 替换符 `$1`、`$&`

## 注意

- **导入完就生效，不需要重启**：新角色会被直接合并进应用内存里的 `contacts`，
  回到 Following（或它本来就在前台时）列表立刻出现，无需刷新页面。
  只有在应用换了版本、脚本认不出 store 的极端情况下，面板才会多出一个「刷新页面」按钮。
- 若之前访问过本站，Service Worker 可能缓存了旧的 `index.html`：
  首次调试请强刷或在 DevTools → Application → Service Workers 里 Unregister。
- `_mirror.ps1` 重新镜像会覆盖 `site/index.html`，需要重新补上
  `<script src="./charcard-import.js"></script>` 这一行。
- 同名/同 handle 多次导入不会覆盖，会自动加序号。
- 应用升级后如果 `contacts` 的记录结构变了（比如新增必填字段），
  `_cc_test.cjs` 的模板克隆测试会先失败——照着库里已有记录补上字段即可。
