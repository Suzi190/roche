const fs = require('fs');
const t = fs.readFileSync(process.argv[2], 'utf8');
const re = new RegExp(process.argv[3], 'g');
let m, n = 0;
while ((m = re.exec(t)) && n < 40) { n++; console.log(m[0]); }
if (!n) console.log('no match');
