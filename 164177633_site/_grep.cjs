const fs = require('fs');
const file = process.argv[2];
const needle = process.argv[3];
const before = Number(process.argv[4] || 100);
const after = Number(process.argv[5] || 200);
const max = Number(process.argv[6] || 8);
const t = fs.readFileSync(file, 'utf8');
let i = -1, n = 0;
while ((i = t.indexOf(needle, i + 1)) >= 0 && n < max) {
  n++;
  console.log('--- hit ' + n + ' @' + i);
  console.log(t.slice(Math.max(0, i - before), i + needle.length + after));
}
if (n === 0) console.log('no match');
