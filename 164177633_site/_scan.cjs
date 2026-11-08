const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || 'readable/assets';
const pats = process.argv.slice(3);
const files = fs.readdirSync(dir).filter((f) => /\.(js|css|json)$/.test(f));
for (const pat of pats) {
  const hits = [];
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const i = t.indexOf(pat);
    if (i >= 0) hits.push(f + ' @' + i + ' :: ' + t.slice(Math.max(0, i - 120), i + 160).replace(/\s+/g, ' '));
  }
  console.log('=== ' + pat + ' → ' + hits.length + ' file(s)');
  hits.slice(0, 3).forEach((h) => console.log('   ' + h));
}
