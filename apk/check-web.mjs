import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const WWW = 'd:\\roche\\apk\\www';
const problems = [];

const indexHtml = path.join(WWW, 'index.html');
if (!fs.existsSync(indexHtml)) problems.push('www/index.html 缺失');

if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  if (!html.includes('apk-shell.js')) problems.push('index.html 没有注入 apk-shell.js（先跑 sync-web.ps1）');
  if (!html.includes('viewport-fit=cover')) problems.push('index.html 的 viewport 缺少 viewport-fit=cover（刘海/安全区会失效）');
}
if (!fs.existsSync(path.join(WWW, 'apk-shell.js'))) problems.push('www/apk-shell.js 缺失（先跑 sync-web.ps1）');

const js = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) js.push(p);
  }
})(WWW);

let parsed = 0;
for (const f of js) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    parsed++;
  } catch {
    try {
      acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
      parsed++;
    } catch (e) {
      problems.push(`${path.relative(WWW, f)} 语法错误: ${e.message}`);
    }
  }
}

let files = 0;
let bytes = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      files++;
      bytes += fs.statSync(p).size;
    }
  }
})(WWW);

console.log(`www: ${files} 个文件, ${(bytes / 1048576).toFixed(2)} MB`);
console.log(`JS 语法校验: ${parsed}/${js.length} 通过`);

if (problems.length) {
  console.log('\n发现问题:');
  problems.forEach((p) => console.log('  ! ' + p));
  process.exit(1);
}
console.log('检查通过 ✔');
