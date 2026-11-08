/*
 * Roche APK 外壳补丁（只在 Capacitor 原生壳里生效，纯浏览器里直接 return）
 * ---------------------------------------------------------------------------
 * 做的事：
 *   1. 全屏/刘海安全区：原生窗口铺满整屏后，把 env(safe-area-inset-*) 换算成真实像素，
 *      必要时改写页面 CSS 里的 env()，让头部自己让开状态栏/刘海（页面本身大量使用 env()）。
 *   2. 返回：滑动/系统返回键 → 先点页面自带的「返回/关闭」（aria-label 返回、data-chat-header-button、
 *      返回图标），再退而点 App 页头的标题（这个 App 里点标题=回桌面），最后才回桌面。
 *      只有真正在桌面那一层时，才交给原生「退到后台」，不会直接退掉 APK。
 *   3. 导入导出兜底：拦截 <a download> / blob: / data: 下载，交给原生写进系统「下载」目录；
 *      同时补上 WebView 不支持的 navigator.share({files})。
 *   4. 状态栏图标深浅：采样顶部背景色，通知原生切换图标颜色（白底黑字 / 黑底白字）。
 */
(function () {
  'use strict';

  var native = window.RocheNative;
  if (!native || typeof native.isNative !== 'function') return;

  var docEl = document.documentElement;
  var insets = { top: 0, right: 0, bottom: 0, left: 0 };
  var envSupported = false;

  /* 调试用：chrome://inspect 里可以直接看 window.__rocheShell */
  var shellState = { stage: 'init', installed: false, error: '', notes: [], envSupported: false, patchedRules: 0 };
  window.__rocheShell = shellState;

  function note(text) {
    try { shellState.notes.push(String(text)); } catch (e) { /* ignore */ }
  }

  function safe(label, fn) {
    try {
      return fn();
    } catch (e) {
      note(label + ' -> ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  /* ---------------------------------------------------------------- 工具 */
  function toNum(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function parseInsets(raw) {
    var data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch (e) { return null; }
    }
    if (!data || typeof data !== 'object') return null;
    return {
      top: toNum(data.top),
      right: toNum(data.right),
      bottom: toNum(data.bottom),
      left: toNum(data.left)
    };
  }

  var BACK_LABELS = ['返回', '关闭', '取消', 'back', 'close', 'cancel', 'dismiss', 'go back'];
  var BACK_ICONS = [
    'arrow_back', 'arrow_back_ios', 'arrow_back_ios_new', 'arrow_back_2', 'arrow_left',
    'chevron_left', 'keyboard_backspace', 'backspace', 'west', 'reply', 'undo', 'close', 'cancel', 'clear'
  ];

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (r.bottom <= 0 || r.top >= (window.innerHeight || 0)) return false;
    var cs = window.getComputedStyle(el);
    if (!cs) return false;
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (toNum(cs.opacity) < 0.05) return false;
    return cs.pointerEvents !== 'none';
  }

  /* 越"上层"（z-index 大、层级深）越优先，弹窗的关闭按钮会胜过页面返回键 */
  function stackingScore(el) {
    var score = 0;
    var depth = 0;
    var node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      var cs = window.getComputedStyle(node);
      if (cs && (cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky')) {
        var z = parseInt(cs.zIndex, 10);
        if (isFinite(z)) score = Math.max(score, z);
        depth += 1;
      }
      node = node.parentElement;
    }
    return score * 100 + depth * 10 + (el.tagName === 'BUTTON' ? 5 : 0);
  }

  function matchesBackLabel(text) {
    if (!text) return false;
    var low = String(text).toLowerCase();
    for (var i = 0; i < BACK_LABELS.length; i++) {
      if (low.indexOf(BACK_LABELS[i]) >= 0) return true;
    }
    return false;
  }

  function iconName(el) {
    var key = el.getAttribute('data-material-symbol-key');
    if (key) return String(key).split(':')[0].trim();
    return String(el.textContent || '').trim();
  }
  /* ------------------------------------------------------------ 1. 安全区 */
  function measureEnvTop() {
    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    docEl.appendChild(probe);
    var h = toNum(window.getComputedStyle(probe).paddingTop);
    docEl.removeChild(probe);
    return h;
  }

  function replaceEnv(text) {
    var out = text;
    out = out.replace(/env\(\s*safe-area-inset-top\s*(?:,[^)]*)?\)/gi, insets.top + 'px');
    out = out.replace(/env\(\s*safe-area-inset-bottom\s*(?:,[^)]*)?\)/gi, insets.bottom + 'px');
    out = out.replace(/env\(\s*safe-area-inset-left\s*(?:,[^)]*)?\)/gi, insets.left + 'px');
    out = out.replace(/env\(\s*safe-area-inset-right\s*(?:,[^)]*)?\)/gi, insets.right + 'px');
    return out;
  }

  function patchRuleList(list) {
    for (var i = 0; i < list.length; i++) {
      var rule = list[i];
      var text = null;
      try { text = rule.cssText; } catch (e) { text = null; }
      if (text && text.indexOf('safe-area-inset') >= 0 && rule.style) {
        var next = replaceEnv(text);
        if (next !== text) {
          try {
            rule.cssText = next;
            shellState.patchedRules = (shellState.patchedRules || 0) + 1;
          } catch (e2) {
            note('cssRule ' + (rule.selectorText || rule.type) + ' -> ' + (e2 && e2.message ? e2.message : e2));
          }
        }
      }
      var inner = null;
      try { inner = rule.cssRules; } catch (e3) { inner = null; }
      if (inner && inner.length) patchRuleList(inner);
    }
  }

  /* env() 不可用时，把样式表里的 env(safe-area-inset-*) 换成真实像素 */
  function patchCssEnv() {
    if (envSupported) return;
    if (insets.top <= 0 && insets.bottom <= 0 && insets.left <= 0 && insets.right <= 0) return;
    var sheets = document.styleSheets || [];
    for (var i = 0; i < sheets.length; i++) {
      var rules = null;
      try { rules = sheets[i].cssRules; } catch (e) { continue; }
      if (!rules || !rules.length) continue;
      try { patchRuleList(rules); } catch (e2) { /* ignore */ }
    }
    var inlines = document.querySelectorAll('[style*="safe-area"]');
    for (var j = 0; j < inlines.length; j++) {
      var el = inlines[j];
      var raw = el.getAttribute('style') || '';
      var next = replaceEnv(raw);
      if (next !== raw) el.setAttribute('style', next);
    }
  }

  /* 兜底样式：直接按真实像素覆盖常用的安全区类，不依赖样式表改写时机 */
  var safeStyleEl = null;
  function updateSafeCss() {
    if (!safeStyleEl) {
      safeStyleEl = document.createElement('style');
      safeStyleEl.id = 'roche-safe-area';
      safeStyleEl.textContent = '';
      (document.head || docEl).appendChild(safeStyleEl);
    }
    safeStyleEl.textContent =
      '.pt-safe{padding-top:' + insets.top + 'px!important}' +
      '.pb-safe{padding-bottom:' + insets.bottom + 'px!important}' +
      '.pl-safe{padding-left:' + insets.left + 'px!important}' +
      '.pr-safe{padding-right:' + insets.right + 'px!important}' +
      '.pt-safe-top{padding-top:max(20px,' + insets.top + 'px)}' +
      '.pb-safe-bottom{padding-bottom:max(20px,' + insets.bottom + 'px)}';
  }

  function applyInsets(raw) {
    var next = parseInsets(raw);
    if (!next) return;
    insets = next;
    docEl.style.setProperty('--roche-inset-top', insets.top + 'px');
    docEl.style.setProperty('--roche-inset-right', insets.right + 'px');
    docEl.style.setProperty('--roche-inset-bottom', insets.bottom + 'px');
    docEl.style.setProperty('--roche-inset-left', insets.left + 'px');
    try { updateSafeCss(); } catch (e) { /* ignore */ }
    patchCssEnv();
  }

  window.__rocheApplyInsets = function (obj) { applyInsets(obj); };

  /* 后续懒加载的 CSS 分包、以及路由切换后新插入的节点，都要再补一次 */
  var patchTimer = null;
  function schedulePatchCss() {
    if (envSupported) return;
    if (patchTimer) return;
    patchTimer = window.setTimeout(function () {
      patchTimer = null;
      patchCssEnv();
    }, 120);
  }

  function watchStyles() {
    function hookLink(link) {
      if (!link || link.__rocheLoadHooked) return;
      link.__rocheLoadHooked = true;
      link.addEventListener('load', schedulePatchCss);
      try {
        if (link.sheet && link.sheet.cssRules) schedulePatchCss();
      } catch (e) { /* ignore */ }
    }

    function scanLinks() {
      var links = document.querySelectorAll('link[rel="stylesheet"], style');
      for (var i = 0; i < links.length; i++) hookLink(links[i]);
    }

    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === 'LINK' || n.tagName === 'STYLE') hookLink(n);
          var inner = n.querySelectorAll ? n.querySelectorAll('link[rel="stylesheet"], style') : null;
          if (inner) for (var k = 0; k < inner.length; k++) hookLink(inner[k]);
        }
      }
      schedulePatchCss();
    });
    mo.observe(document.head || docEl, { childList: true, subtree: true });
    mo.observe(docEl, { childList: true, subtree: false });
    document.addEventListener('DOMContentLoaded', function () { scanLinks(); schedulePatchCss(); }, true);
    window.addEventListener('load', function () { scanLinks(); schedulePatchCss(); window.setTimeout(schedulePatchCss, 600); window.setTimeout(schedulePatchCss, 1800); }, true);

    scanLinks();

    /* 样式表可能在 body 出现后才加载完，DOMContentLoaded 又可能迟迟不来：兜底定时补几轮 */
    var tries = 0;
    (function tick() {
      if (envSupported || tries >= 30) return;
      tries += 1;
      var before = shellState.patchedRules || 0;
      schedulePatchCss();
      window.setTimeout(function () {
        var now = shellState.patchedRules || 0;
        if (now !== before || tries < 6) tick();
      }, 400);
    })();
  }
  /* ------------------------------------------------------------ 2. 返回 */
  /* 桌面层是否真的「露着」——App 页里这些节点可能还在 DOM 里，只是被隐藏 */
  function desktopPresent() {
    var nodes = document.querySelectorAll('.app-pill, .square-app-btn, .desktop-header-widget');
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) return true;
    }
    return false;
  }

  function clickEl(el) {
    if (!el) return false;
    try {
      if (typeof el.click === 'function') { el.click(); return true; }
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 页面自带的返回/关闭控件（含弹窗关闭）：可信度最高 */
  function findStrongBack() {
    var hits = [];
    var i;
    var labored = document.querySelectorAll('[aria-label],[title],[data-chat-header-button]');
    for (i = 0; i < labored.length; i++) {
      var el = labored[i];
      if (!isVisible(el)) continue;
      var label = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
      if (!matchesBackLabel(label) && !el.hasAttribute('data-chat-header-button')) continue;
      hits.push(el);
    }

    var leaves = document.querySelectorAll('button,[role="button"],span,div,a');
    for (i = 0; i < leaves.length; i++) {
      var leaf = leaves[i];
      if (leaf.children.length) continue;
      var txt = String(leaf.textContent || '').trim();
      if (txt.length === 0 || txt.length > 6) continue;
      if (!matchesBackLabel(txt)) continue;
      if (!isVisible(leaf)) continue;
      var r = leaf.getBoundingClientRect();
      if (r.width > 220) continue;
      hits.push(leaf);
      if (hits.length > 40) break;
    }

    var icons = document.querySelectorAll('[data-material-symbol-key],.material-symbols-outlined,.material-symbols-rounded,.material-symbols-sharp');
    for (i = 0; i < icons.length; i++) {
      var ic = icons[i];
      if (BACK_ICONS.indexOf(iconName(ic)) < 0) continue;
      if (!isVisible(ic)) continue;
      hits.push(ic);
    }

    var svgs = document.querySelectorAll('svg[class*="arrow-left"],svg[class*="chevron-left"],svg[class*="angle-left"],svg[class*="fa-times"],svg[class*="fa-xmark"],svg[class*="fa-reply"]');
    for (i = 0; i < svgs.length; i++) {
      if (isVisible(svgs[i])) hits.push(svgs[i]);
    }

    if (!hits.length) return null;
    hits.sort(function (a, b) { return stackingScore(b) - stackingScore(a); });
    return hits[0];
  }

  /* App 页头的标题：这个 App 里点标题就是回桌面 */
  function findAppTitle() {
    var cands = document.querySelectorAll('h1,h2,[class*="cursor-pointer"]');
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (!isVisible(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.top > 160 || r.left > window.innerWidth * 0.62) continue;
      if (r.width > window.innerWidth * 0.7 || r.height > 72) continue;
      var txt = String(el.textContent || '').trim();
      if (!txt || txt.length > 24) continue;
      if (matchesBackLabel(txt)) continue;
      var score = 1000 - Math.round(r.top) - Math.round(r.left);
      if (el.tagName === 'H1' || el.tagName === 'H2') score += 200;
      if (String(el.className || '').indexOf('cursor-pointer') >= 0) score += 100;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  /* 兜底：整页重载 = 回到桌面这一层（数据都在 IndexedDB，不会丢） */
  function softReload() {
    try {
      var mask = document.createElement('div');
      mask.setAttribute('aria-hidden', 'true');
      mask.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647';
      (document.body || docEl).appendChild(mask);
    } catch (e) { /* ignore */ }
    window.setTimeout(function () { window.location.reload(); }, 30);
  }

  function stillInApp() {
    return !desktopPresent();
  }

  function goBack() {
    var strong = findStrongBack();
    if (strong && clickEl(strong)) return true;

    if (stillInApp()) {
      var title = findAppTitle();
      if (title && clickEl(title)) {
        /* 标题点了没反应（不是所有 App 都支持）→ 兜底回桌面 */
        window.setTimeout(function () { if (stillInApp()) softReload(); }, 600);
        return true;
      }
      softReload();
      return true;
    }

    /* 已经在桌面：交给原生退到后台，不退出 APK */
    return false;
  }

  window.__rocheBack = function () {
    try { return goBack() ? 'true' : 'false'; } catch (e) { return 'false'; }
  };

  /* 边缘滑动（三键导航时系统不会替我们触发返回，只能自己识别） */
  var swipe = null;
  var lastBackAt = 0;
  var EDGE = 30;

  function onTouchStart(ev) {
    if (ev.touches.length !== 1) { swipe = null; return; }
    var t = ev.touches[0];
    var w = window.innerWidth;
    var fromLeft = t.clientX <= EDGE;
    var fromRight = t.clientX >= w - EDGE;
    if (!fromLeft && !fromRight) { swipe = null; return; }
    swipe = { x: t.clientX, y: t.clientY, at: Date.now(), side: fromLeft ? 'left' : 'right' };
  }

  function onTouchEnd(ev) {
    var s = swipe;
    swipe = null;
    if (!s || !ev.changedTouches || !ev.changedTouches.length) return;
    var t = ev.changedTouches[0];
    var dx = t.clientX - s.x;
    var dy = t.clientY - s.y;
    var dt = Date.now() - s.at;
    if (dt > 700 || Math.abs(dx) < 70) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.8) return;
    if (s.side === 'left' && dx < 0) return;
    if (s.side === 'right' && dx > 0) return;
    var now = Date.now();
    if (now - lastBackAt < 450) return;
    lastBackAt = now;
    var handled = false;
    try { handled = goBack(); } catch (e) { handled = false; }
    if (handled) { try { ev.preventDefault(); } catch (e2) { /* ignore */ } }
  }

  function installSwipe() {
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    document.addEventListener('touchcancel', function () { swipe = null; }, { capture: true, passive: true });
  }
  /* --------------------------------------------------------- 3. 导出兜底 */
  var EXT = {
    'application/json': '.json',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'text/html': '.html',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/zip': '.zip',
    'application/pdf': '.pdf'
  };

  function extOf(mime) {
    return EXT[String(mime || '').split(';')[0].toLowerCase()] || '';
  }

  function timestampName(mime) {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'roche-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + extOf(mime);
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () { reject(reader.error || new Error('read fail')); };
      reader.readAsDataURL(blob);
    });
  }

  function saveBlob(blob, name) {
    if (!blob) return;
    var mime = blob.type || 'application/octet-stream';
    var fileName = name || blob.name || timestampName(mime);
    blobToBase64(blob).then(function (b64) {
      try { native.saveBase64(fileName, mime, b64); } catch (e) { /* ignore */ }
    }).catch(function () {
      try { native.toast('导出失败：读取数据出错'); } catch (e) { /* ignore */ }
    });
  }

  function parseDataUrl(url) {
    var comma = url.indexOf(',');
    if (comma < 0) return null;
    var meta = url.slice(5, comma);
    var mime = (meta.split(';')[0] || 'application/octet-stream');
    var data = url.slice(comma + 1);
    if (/;base64/i.test(meta)) return { mime: mime, b64: data };
    try {
      return { mime: mime, b64: window.btoa(unescape(encodeURIComponent(decodeURIComponent(data)))) };
    } catch (e) {
      return null;
    }
  }

  function isDownloadAnchor(a) {
    if (!a || a.tagName !== 'A') return false;
    if (a.hasAttribute('download')) return true;
    var href = a.getAttribute('href') || '';
    return /^\s*(blob:|data:)/i.test(href);
  }

  function saveFromAnchor(a) {
    var href = a.href || '';
    var raw = a.getAttribute('download');
    var name = raw && raw !== 'true' && raw !== '' ? raw : '';
    if (/^data:/i.test(href)) {
      var parts = parseDataUrl(href);
      if (!parts) return false;
      try { native.saveBase64(name || timestampName(parts.mime), parts.mime, parts.b64); } catch (e) { return false; }
      return true;
    }
    if (/^blob:/i.test(href)) {
      window.fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
        saveBlob(b, name);
      }).catch(function () { try { native.toast('导出失败：无法读取文件'); } catch (e) { /* ignore */ } });
      return true;
    }
    return false;
  }

  function installExportHooks() {
    var proto = window.HTMLAnchorElement && window.HTMLAnchorElement.prototype;
    if (proto && typeof proto.click === 'function') {
      var originalClick = proto.click;
      proto.click = function () {
        if (isDownloadAnchor(this) && saveFromAnchor(this)) return;
        return originalClick.apply(this, arguments);
      };
    }

    document.addEventListener('click', function (ev) {
      var target = ev.target;
      var anchor = target && target.closest ? target.closest('a') : null;
      if (!anchor || !isDownloadAnchor(anchor)) return;
      if (!saveFromAnchor(anchor)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);

    var originalOpen = window.open;
    window.open = function (url) {
      var u = String(url || '');
      if (/^\s*(blob:|data:)/i.test(u)) {
        if (/^data:/i.test(u)) {
          var parts = parseDataUrl(u);
          if (parts) { try { native.saveBase64(timestampName(parts.mime), parts.mime, parts.b64); } catch (e) { /* ignore */ } }
        } else {
          window.fetch(u).then(function (r) { return r.blob(); }).then(function (b) { saveBlob(b, ''); }).catch(function () {});
        }
        return null;
      }
      return originalOpen.apply(window, arguments);
    };

    /* WebView 没有分享面板：用「保存到下载目录」代替 */
    var canShareImpl = function (data) { return !!(data && data.files && data.files.length); };
    var shareImpl = function (data) {
      if (data && data.files && data.files.length) {
        saveBlob(data.files[0], data.files[0].name || '');
        return Promise.resolve();
      }
      if (data && data.text) {
        try { native.copyText(String(data.text)); native.toast('已复制到剪贴板'); } catch (e) { /* ignore */ }
        return Promise.resolve();
      }
      return Promise.reject(new Error('share not supported'));
    };
    /* 原型 + 实例都覆盖，Chrome/WebView 里哪个生效都能兜住 */
    try {
      Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, writable: true, value: canShareImpl });
    } catch (e) { /* ignore */ }
    try {
      Object.defineProperty(Navigator.prototype, 'share', { configurable: true, writable: true, value: shareImpl });
    } catch (e) { /* ignore */ }
    try { navigator.canShare = canShareImpl; } catch (e) { /* ignore */ }
    try { navigator.share = shareImpl; } catch (e) { /* ignore */ }
  }
  /* 供原生 DownloadListener 回调：blob:/data: 由页面自己解码后交给原生保存 */
  window.__rocheHandleDownload = function (url, mime, disposition) {
    var name = '';
    try {
      var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(String(disposition || ''));
      if (m && m[1]) name = decodeURIComponent(m[1].replace(/^"|"$/g, ''));
    } catch (e) { name = ''; }
    var href = String(url || '');
    if (/^data:/i.test(href)) {
      var parts = parseDataUrl(href);
      if (parts) {
        try { native.saveBase64(name || timestampName(parts.mime), parts.mime, parts.b64); } catch (e2) { /* ignore */ }
      }
      return true;
    }
    if (/^blob:/i.test(href)) {
      window.fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
        if (!name && mime) name = timestampName(mime);
        saveBlob(b, name);
      }).catch(function () { try { native.toast('下载失败：无法读取文件'); } catch (e3) { /* ignore */ } });
      return true;
    }
    return false;
  };

  /* ------------------------------------------- 4. 状态栏图标深浅色自适应 */
  var lastLightIcons = null;

  function sampleTopLuminance() {
    var y = Math.max(4, Math.min(insets.top > 0 ? insets.top / 2 : 10, 48));
    var el = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(y));
    while (el) {
      var cs = window.getComputedStyle(el);
      if (cs) {
        if (cs.backgroundImage && cs.backgroundImage !== 'none' && cs.backgroundImage.indexOf('url(') >= 0) return 0;
        var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
        if (m) {
          var p = m[1].split(',');
          var alpha = p.length > 3 ? toNum(p[3]) : 1;
          if (alpha > 0.35) {
            return (0.2126 * toNum(p[0]) + 0.7152 * toNum(p[1]) + 0.0722 * toNum(p[2])) / 255;
          }
        }
      }
      el = el.parentElement;
    }
    return 0;
  }

  function updateSystemBarStyle() {
    var light = sampleTopLuminance() < 0.62;
    if (light === lastLightIcons) return;
    lastLightIcons = light;
    try { native.setSystemBarStyle(light); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------- 启动 */
  var bootTimer = null;
  function afterDomChange() {
    if (bootTimer) return;
    bootTimer = window.setTimeout(function () {
      bootTimer = null;
      schedulePatchCss();
      updateSystemBarStyle();
    }, 400);
  }

  function boot() {
    try {
      shellState.stage = 'measure';
      envSupported = measureEnvTop() > 0.5;
      shellState.envSupported = envSupported;
      shellState.stage = 'insets';
      applyInsets(native.getInsets());
      shellState.stage = 'export';
      installExportHooks();
      shellState.stage = 'styles';
      watchStyles();
      shellState.stage = 'bar';
      updateSystemBarStyle();
      shellState.stage = 'done';
      shellState.installed = true;
    } catch (e) {
      shellState.error = String((e && e.stack) || e);
    }

    window.setInterval(updateSystemBarStyle, 2500);
    try {
      var mo = new MutationObserver(afterDomChange);
      mo.observe(document.body || docEl, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
    if (native.shellReady) {
      try { native.shellReady(); } catch (e) { /* ignore */ }
    }
  }

  /* 滑动识别尽早装上（不依赖 DOM 就绪） */
  shellState.stage = 'script-end:' + document.readyState;
  installSwipe();
  shellState.stage = 'swipe-ok';

  /*
   * 注意：不能只等 DOMContentLoaded —— 这个 App 的入口是 module + 顶层 await，
   * 网络不通时 DOMContentLoaded 可能被拖到很晚。这里 body 一出现就跑。
   */
  function whenReady(fn) {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      shellState.stage = 'boot-now';
      fn();
    }
    if (document.body) { run(); return; }
    document.addEventListener('DOMContentLoaded', run);
    var timer = window.setInterval(function () {
      if (document.body) {
        window.clearInterval(timer);
        run();
      }
    }, 50);
    window.setTimeout(function () {
      window.clearInterval(timer);
      run();
    }, 2000);
  }

  whenReady(boot);
})();
