const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, 'readable', 'charcard-import.js');

/* ---------------- 迷你 IndexedDB ---------------- */
function makeDB(seed) {
  const stores = seed || {};
  return {
    __stores: stores,
    objectStoreNames: { contains: (n) => Object.prototype.hasOwnProperty.call(stores, n) },
    transaction(name) {
      const tx = { error: null };
      const os = {
        keyPath: 'id',
        getAll() {
          const req = { result: (stores[name] || []).slice() };
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        },
        put(rec) {
          const arr = stores[name] || (stores[name] = []);
          const i = arr.findIndex((r) => r.id === rec.id);
          if (i >= 0) arr[i] = rec;
          else arr.push(rec);
        },
      };
      tx.objectStore = () => os;
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 8);
      return tx;
    },
    close() {},
  };
}

/* ---------------- PNG 构造 ---------------- */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
function buildPng(textKey, payloadText) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk('IHDR', Buffer.alloc(13));
  const body = Buffer.concat([
    Buffer.from(textKey, 'latin1'),
    Buffer.from([0]),
    Buffer.from(payloadText, 'latin1'),
  ]);
  const png = Buffer.concat([sig, ihdr, chunk('tEXt', body), chunk('IEND', Buffer.alloc(0))]);
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.length);
}

/* ---------------- 断言 ---------------- */
let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
}
function eq(name, actual, expect) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expect), { actual, expect });
}

module.exports = { makeDB, buildPng, chunk, ok, eq, SRC, vm, fails, getPass: () => pass };
if (require.main === module) console.log('helpers loaded');
