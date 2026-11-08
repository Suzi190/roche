/**
 * apk-shell.js 的真实浏览器回归测试（模拟 window.RocheNative）
 *   node test-apk-shell.mjs
 *
 * 覆盖：
 *   - 安全区变量 + env(safe-area-inset-*) 的 CSS 改写
 *   - __rocheBack：桌面 → false；App 页 → 点页内返回；只有标题 → 点标题
 *   - 导出拦截：<a download> / data: / blob: / navigator.share({files})
 *   - 原生下载回调 __rocheHandleDownload
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = 'd:\\roche\\apk\\www';
const PORT = 8125;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',()=>self.registration.unregister());");
    return;
  }
  let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find((p) => fs.existsSync(p));

const CDP_PORT = 9455;
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + String(CDP_PORT), '--user-data-dir=D:\\roche\\_edge_shell_test',
  '--window-size=412,915', 'about:blank'
], { stdio: 'ignore' });

async function devtools(p) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + CDP_PORT + p);
      if (r.ok) return await r.json();
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('DevTools 未就绪');
}

const list = await devtools('/json/list');
const target = list.filter((t) => t.type === 'page')[0];
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});

let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push(String(d.exception?.description || d.text));
  }
});
function send(method, params) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function js(expr, awaitPromise) {
  const r = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: !!awaitPromise, returnByValue: true, userGesture: true
  });
  if (r.result?.exceptionDetails) {
    throw new Error('EVAL: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  }
  return r.result?.result?.value;
}


const STUB = `
  window.__saved = [];
  window.__toasts = [];
  window.RocheNative = {
    isNative: function () { return '1'; },
    getInsets: function () { return '{"top":24.5,"right":0,"bottom":16,"left":0}'; },
    platform: function () { return 'android'; },
    shellReady: function () { window.__shellReady = true; },
    toast: function (m) { window.__toasts.push(String(m)); },
    copyText: function (t) { window.__copied = String(t); },
    saveBase64: function (name, mime, b64) { window.__saved.push({ name: name, mime: mime, len: String(b64).length }); return '下载/' + name; },
    setSystemBarStyle: function (light) { window.__light = light; },
    minimize: function () { window.__minimized = true; },
    exitApp: function () { window.__exited = true; }
  };
`;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });

let mounted = false;
for (let i = 0; i < 70; i++) {
  await sleep(400);
  mounted = await js('!!document.querySelector("#app[data-v-app]")');
  if (mounted) break;
}
await sleep(1200);

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });
}

check('app 挂载', mounted);

/* 1. 安全区 */
const insetVar = await js('getComputedStyle(document.documentElement).getPropertyValue("--roche-inset-top").trim()');
check('--roche-inset-top = 24.5px', insetVar === '24.5px', insetVar);

const padded = await js(`(() => {
  const d = document.createElement('div');
  d.className = 'pt-safe';
  document.body.appendChild(d);
  const v = getComputedStyle(d).paddingTop;
  d.remove();
  return v;
})()`);
check('env() 被改写成真实像素（.pt-safe）', parseFloat(padded) >= 24, padded);

/* 1b. 诊断：.pt-safe 规则到底长什么样 */
const cssDbg = await js(`(() => {
  const out = [];
  const walk = (list, href) => {
    for (const r of list) {
      const t = r.cssText || '';
      if (t.indexOf('pt-safe') >= 0 && out.length < 4) out.push({ href: href, env: t.indexOf('safe-area-inset') >= 0, text: t.slice(0, 160) });
      let inner = null;
      try { inner = r.cssRules; } catch (e) { inner = null; }
      if (inner && inner.length && out.length < 4) walk(inner, href);
    }
  };
  for (const sheet of document.styleSheets) {
    let rules = null;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    if (rules && rules.length) walk(rules, sheet.href || '(inline)');
  }
  return out;
})()`);
check('诊断：.pt-safe 规则', true, JSON.stringify(cssDbg));

check('shellReady 被调用', await js('window.__shellReady === true'));

/* 2. 返回：桌面层应为 false */
check('桌面层 __rocheBack() = false', (await js('window.__rocheBack()')) === 'false');

/* 3. 返回：App 页里有 aria-label=返回 的按钮 */
const strongBack = await js(`(() => {
  const holder = document.createElement('div');
  holder.id = 'fake-app';
  holder.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', '返回');
  btn.textContent = 'x';
  btn.style.cssText = 'position:absolute;top:8px;left:8px;width:40px;height:40px';
  let clicked = false;
  btn.addEventListener('click', () => { clicked = true; });
  holder.appendChild(btn);
  document.body.appendChild(holder);
  document.querySelectorAll('.app-pill,.square-app-btn,.desktop-header-widget').forEach((n) => (n.style.display = 'none'));
  const r = window.__rocheBack();
  return { ret: r, clicked: clicked };
})()`);
check('页内返回按钮优先被点击', strongBack.ret === 'true' && strongBack.clicked === true, JSON.stringify(strongBack));

/* 4. 返回：App 页无返回按钮时点页头标题回桌面 */
const titleBack = await js(`(() => {
  const holder = document.getElementById('fake-app');
  if (holder) holder.remove();
  const app = document.createElement('div');
  app.id = 'fake-app2';
  app.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#fff';
  const h1 = document.createElement('h1');
  h1.className = 'cursor-pointer';
  h1.textContent = '集市';
  h1.style.cssText = 'position:absolute;top:10px;left:16px;font-size:22px';
  let clicked = false;
  h1.addEventListener('click', () => {
    clicked = true;
    document.querySelectorAll('.app-pill,.square-app-btn,.desktop-header-widget').forEach((n) => (n.style.display = ''));
    app.remove();
  });
  app.appendChild(h1);
  document.body.appendChild(app);
  document.querySelectorAll('.app-pill,.square-app-btn,.desktop-header-widget').forEach((n) => (n.style.display = 'none'));
  const r = window.__rocheBack();
  return { ret: r, clicked: clicked };
})()`);
check('无返回按钮时点 App 标题回桌面', titleBack.ret === 'true' && titleBack.clicked === true, JSON.stringify(titleBack));

/* 5. 导出：<a download> + blob */
const blobSave = await js(`(async () => {
  const before = window.__saved.length;
  const blob = new Blob([JSON.stringify({ hello: 'roche' })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'roche-backup.json';
  a.click();
  await new Promise((r) => setTimeout(r, 400));
  return window.__saved.slice(before);
})()`, true);
check('<a download> 的 blob 被交给原生保存', Array.isArray(blobSave) && blobSave.length === 1 && blobSave[0].name === 'roche-backup.json', JSON.stringify(blobSave));

/* 6. 导出：data: URL */
const dataSave = await js(`(async () => {
  const before = window.__saved.length;
  const a = document.createElement('a');
  a.href = 'data:application/json;base64,eyJhIjoxfQ==';
  a.download = 'preset.json';
  a.click();
  await new Promise((r) => setTimeout(r, 200));
  return window.__saved.slice(before);
})()`, true);
check('data: 链接被交给原生保存', Array.isArray(dataSave) && dataSave.length === 1 && dataSave[0].name === 'preset.json', JSON.stringify(dataSave));

/* 7. 导出：navigator.share({files}) 兜底 */
const shareSave = await js(`(async () => {
  const before = window.__saved.length;
  const file = new File([JSON.stringify({ a: 1 })], 'share.json', { type: 'application/json' });
  const can = navigator.canShare && navigator.canShare({ files: [file] });
  let err = '';
  try {
    await navigator.share({ files: [file], title: 'Roche' });
  } catch (e) {
    err = e.name + ': ' + e.message;
  }
  await new Promise((r) => setTimeout(r, 300));
  const proto = Object.getPrototypeOf(navigator);
  return {
    can: can,
    err: err,
    saved: window.__saved.slice(before),
    ownShare: !!Object.getOwnPropertyDescriptor(navigator, 'share'),
    protoShare: !!Object.getOwnPropertyDescriptor(proto, 'share'),
    protoClean: !!Object.getOwnPropertyDescriptor(Navigator.prototype, 'share'),
    sameProto: proto === Navigator.prototype
  };
})()`, true);
check('navigator.share({files}) 落到保存', shareSave && shareSave.can === true && shareSave.saved.length === 1, JSON.stringify(shareSave));

/* 8. 原生下载回调 */
const nativeDl = await js(`(async () => {
  const before = window.__saved.length;
  const blob = new Blob(['a,b'], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const ok = window.__rocheHandleDownload(url, 'text/csv', 'attachment; filename="export.csv"');
  await new Promise((r) => setTimeout(r, 400));
  return { ok: ok, saved: window.__saved.slice(before) };
})()`, true);
check('__rocheHandleDownload 处理 blob 下载', nativeDl && nativeDl.ok === true && nativeDl.saved.length === 1 && nativeDl.saved[0].name === 'export.csv', JSON.stringify(nativeDl));

/* 9. 状态栏图标自适应有回调 */
check('setSystemBarStyle 被调用', (await js('typeof window.__light === "boolean"')) === true, await js('String(window.__light)'));

const failed = results.filter((r) => !r.ok);
const diag = await js(`(() => ({
  shell: window.__rocheShell || null,
  saved: window.__saved || [],
  light: window.__light,
  toasts: window.__toasts || []
}))()`);
fs.writeFileSync(
  'd:\\roche\\_shell_test.json',
  JSON.stringify({ results, failed: failed.length, diag, errors }, null, 2),
  'utf8'
);
console.log('\n=== apk-shell test ===');
for (const r of results) {
  console.log((r.ok ? '[PASS] ' : '[FAIL] ') + r.name + (r.extra ? '   [' + r.extra + ']' : ''));
}
if (errors.length) {
  console.log('\npage errors:');
  errors.slice(0, 8).forEach((e) => console.log('  ! ' + e.split('\n')[0]));
}
console.log('\nresult: ' + (results.length - failed.length) + '/' + results.length + ' passed');
console.log('detail: d:\\roche\\_shell_test.json');
server.close();
ws.close();
child.kill();
process.exit(failed.length ? 1 : 0);
