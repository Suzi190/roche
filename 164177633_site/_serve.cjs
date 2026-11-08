/**
 * 本地预览服务器（零依赖）
 *   node _serve.cjs [port] [root] [host]
 * 默认：port=8123，root=./site，host=127.0.0.1
 *   想用手机 / 同一局域网的设备打开：node _serve.cjs 8123 site 0.0.0.0
 *
 * 特点
 *  - 关掉缓存（no-store），改完刷新就能看到
 *  - 把 /sw.js 换成「自杀式」SW，避免 Service Worker 缓存害你看到旧页面
 *  - 没有扩展名的路径回落到 index.html（SPA history 路由）
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.argv[2] || 8123);
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, 'site'));
const HOST = process.argv[4] || process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const KILL_SW = `// 本地预览专用的空壳 Service Worker：不缓存任何东西
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (err) {}
      try { await self.registration.unregister(); } catch (err) {}
    })()
  );
});
`;

function send(res, code, type, body, extra) {
  const headers = Object.assign(
    { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' },
    extra || {}
  );
  res.writeHead(code, headers);
  res.end(body);
}

function notFound(res) {
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return notFound(res);
  }

  if (pathname === '/sw.js') {
    return send(res, 200, 'application/javascript; charset=utf-8', KILL_SW);
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const file = path.join(ROOT, pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT)) return notFound(res); // 防目录穿越

  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store, must-revalidate',
        'Content-Length': st.size,
      });
      return fs.createReadStream(file).pipe(res);
    }
    if (err && path.extname(file)) return notFound(res); // 静态资源缺失就 404
    // 无扩展名 → SPA 回落到 index.html
    fs.readFile(path.join(ROOT, 'index.html'), (e2, buf) => {
      if (e2) return notFound(res);
      send(res, 200, 'text/html; charset=utf-8', buf);
    });
  });
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，换一个：node _serve.cjs ${PORT + 1}`);
  } else if (e && e.code === 'EACCES') {
    console.error(`没有权限绑定 ${HOST}:${PORT}，换一个大端口：node _serve.cjs ${PORT + 2000}`);
  } else {
    console.error(e);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log('静态目录: ' + ROOT);
  console.log('本地地址: http://localhost:' + PORT + '/   (绑定 ' + HOST + ':' + PORT + ')');
  if (HOST === '0.0.0.0' || HOST === '::') {
    const nets = os.networkInterfaces();
    Object.keys(nets).forEach((name) => {
      (nets[name] || []).forEach((n) => {
        if (!n || n.family !== 'IPv4' || n.internal) return;
        console.log('局域网地址: http://' + n.address + ':' + PORT + '/   (' + name + ')');
      });
    });
    console.log('提示: Windows 首次运行会弹防火墙授权，允许后才能被手机访问');
  } else if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log('提示: 只有本机能打开；手机/其它设备请用 node _serve.cjs ' + PORT + ' site 0.0.0.0');
  }
});
