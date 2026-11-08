const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let depth = 0, line = 1, i = 0;
let stack = [];
const n = src.length;
let st = 0; // 0 code, 1 sq, 2 dq, 3 tpl, 4 line-comment, 5 block-comment, 6 regex
function push(c) { stack.push({ line, depth, c }); }
while (i < n) {
  const c = src[i], d = src[i + 1];
  if (c === '\n') line++;
  if (st === 0) {
    if (c === '/' && d === '/') { st = 4; i += 2; continue; }
    if (c === '/' && d === '*') { st = 5; i += 2; continue; }
    if (c === "'") { st = 1; i++; continue; }
    if (c === '"') { st = 2; i++; continue; }
    if (c === '`') { st = 3; i++; continue; }
    if (c === '/' ) { st = 6; i++; continue; }
    if (c === '{' || c === '(' || c === '[') { push(c); depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') {
      const want = c === '}' ? '{' : c === ')' ? '(' : '[';
      const top = stack.pop();
      if (!top || top.c !== want) {
        console.log('MISMATCH at line', line, 'got', c, 'expected close for', top && top.c, 'opened at', top && top.line);
        process.exit(0);
      }
      depth--;
      if (depth === 0) console.log('depth0 closed at line', line);
      i++; continue;
    }
    i++; continue;
  }
  if (st === 1) { if (c === '\\') { i += 2; continue; } if (c === "'") st = 0; i++; continue; }
  if (st === 2) { if (c === '\\') { i += 2; continue; } if (c === '"') st = 0; i++; continue; }
  if (st === 3) { if (c === '\\') { i += 2; continue; } if (c === '`') st = 0; i++; continue; }
  if (st === 4) { if (c === '\n') st = 0; i++; continue; }
  if (st === 5) { if (c === '*' && d === '/') { st = 0; i += 2; continue; } i++; continue; }
  if (st === 6) { if (c === '\\') { i += 2; continue; } if (c === '/') { st = 0; } i++; continue; }
}
console.log('EOF depth', depth, 'stack', stack.map(x => x.c + '@' + x.line).join(' '));
