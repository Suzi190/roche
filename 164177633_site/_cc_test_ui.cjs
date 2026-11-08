const fs = require('fs');
const { makeDB, ok, eq, fails, getPass, SRC, vm } = require('./_cc_test_lib.cjs');

/* ---------------- 极简 DOM（按 Following 页真实 class 结构搭建） ---------------- */
function descendants(node, out) {
  (node.children || []).forEach((c) => { out.push(c); descendants(c, out); });
  return out;
}

function queryFrom(root, sel) {
  const all = descendants(root, []);
  if (sel.charAt(0) === '.') {
    const cls = sel.slice(1);
    return all.filter((n) => String(n.className || '').split(/\s+/).indexOf(cls) >= 0);
  }
  if (/^[a-z]+$/i.test(sel)) {
    return all.filter((n) => String(n.tagName || '').toLowerCase() === sel.toLowerCase());
  }
  let m = /^\[([\w-]+)\*="([^"]*)"\]$/.exec(sel);
  if (m) return all.filter((n) => String(n.className || '').indexOf(m[2]) >= 0);
  m = /^\[([\w-]+)\]$/.exec(sel);
  if (m) return all.filter((n) => n._attrs[m[1]] != null);
  return [];
}

function makeEl(tag) {
  const elm = {
    tagName: tag, children: [], parentNode: null, isConnected: true,
    _attrs: {}, style: {}, _listeners: {}, _text: '',
    className: '', innerHTML: '', title: '', type: '',
    get textContent() { return elm._text + elm.children.map((c) => c.textContent).join(''); },
    set textContent(v) { elm._text = String(v); elm.children.length = 0; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    fire(t) { (this._listeners[t] || []).forEach((f) => f({ preventDefault() {}, stopPropagation() {} })); },
    click() { this._clicked = (this._clicked || 0) + 1; this.fire('click'); },
    appendChild(c) {
      const old = c.parentNode;
      if (old && old.children) {
        const i = old.children.indexOf(c);
        if (i >= 0) old.children.splice(i, 1);
      }
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    insertBefore(c, ref) {
      c.parentNode = this;
      const i = this.children.indexOf(ref);
      this.children.splice(i < 0 ? this.children.length : i, 0, c);
      return c;
    },
    remove() {
      const p = this.parentNode;
      if (p) p.children.splice(p.children.indexOf(this), 1);
      this.isConnected = false;
    },
    closest() { return null; },
    getBoundingClientRect() { return { width: 40, height: 40, top: 20, left: 300 }; },
    querySelectorAll(sel) { return queryFrom(elm, sel); },
    querySelector(sel) { return queryFrom(elm, sel)[0] || null; },
  };
  return elm;
}

function iconify(btn, iconName, extra) {
  const span = btn.appendChild(makeEl('span'));
  span.className = 'material-symbols-outlined text-[24px]' + (extra || '');
  span.textContent = iconName;
  span.closest = () => btn;
  return span;
}

function buildPage() {
  const body = makeEl('body');
  const head = makeEl('head');

  /* 干扰项 1：其它页面头部也有 ml-4 按钮组 */
  const other = body.appendChild(makeEl('div'));
  other.className = 'flex items-center justify-between px-6 pt-5 pb-3 sticky top-0 z-10';
  const og = other.appendChild(makeEl('div'));
  og.className = 'flex items-center gap-2 ml-4';
  og.appendChild(makeEl('button'));

  /* 干扰项 2：空状态里的 person_add 插图 */
  const empty = body.appendChild(makeEl('div'));
  empty.className = 'flex flex-col items-center justify-center py-20';
  const eicon = empty.appendChild(makeEl('span'));
  eicon.className = 'material-symbols-outlined text-zinc-300 text-[24px]';
  eicon.textContent = 'person_add';

  /* Following 页头（class 取自线上的 strings 表） */
  const header = body.appendChild(makeEl('div'));
  header.className =
    'flex items-center justify-between px-6 pt-[calc(20px_+_env(safe-area-inset-top))] pb-3 ' +
    'sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-gray-50';
  const back = header.appendChild(makeEl('button'));
  back.className = 'flex items-center justify-center size-10 -ml-2 hover:bg-gray-100 rounded-full transition-colors';
  iconify(back, 'arrow_back_ios_new');
  const title = header.appendChild(makeEl('div'));
  title.className = 'text-[14px] font-bold tracking-tight truncate';
  title.textContent = 'Following';
  const group = header.appendChild(makeEl('div'));
  group.className = 'flex items-center gap-2 ml-4';
  const addBtn = group.appendChild(makeEl('button'));
  addBtn.className = 'flex items-center justify-center size-10 -mr-2 hover:bg-gray-100 rounded-full transition-colors';
  const icon = iconify(addBtn, 'person_add');

  return { body, head, header, group, addBtn, icon, other, og };
}


function boot(page) {
  const db = makeDB({});
  const doc = {
    readyState: 'complete',
    addEventListener() {},
    head: page.head,
    body: page.body,
    createElement: (t) => makeEl(t),
    getElementById: (id) =>
      descendants(page.head, []).concat(descendants(page.body, [])).filter((n) => n.id === id)[0] || null,
    querySelectorAll: (sel) => queryFrom(page.body, sel),
    querySelector: (sel) => queryFrom(page.body, sel)[0] || null,
  };
  const win = {};
  const idb = { open: () => { const r = {}; setTimeout(() => { r.result = db; r.onsuccess && r.onsuccess(); }, 0); return r; } };
  win.indexedDB = idb;
  const ctx = vm.createContext({
    console, document: doc, window: win, indexedDB: idb,
    TextDecoder, atob, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    FileReader: class { readAsDataURL() {} },
  });
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'charcard-import.js' });
  page.win = win;
  page.api = win.__CC_IMPORT__;
  return win.__CC_IMPORT__;
}

const page = buildPage();
const api = boot(page);

eq('其它页头部未被注入', page.og.children.length, 1);
eq('Following 头部按钮组数量', page.group.children.length, 2);
const btn = page.group.children[1];
ok('按钮位于「添加角色」右侧', page.group.children[0] === page.addBtn);
ok('按钮不再是组内第一个（不再压在左侧）', page.group.children[0] !== btn);
eq('按钮带标记属性', btn.getAttribute('data-cc-import'), '1');
eq('按钮 aria-label', btn.getAttribute('aria-label'), '导入角色卡');
ok('按钮内含图标', /<svg[\s\S]*<\/svg>/.test(btn.innerHTML));
ok('按钮是 button 元素', btn.tagName === 'button');

api.injectButton();
api.injectButton();
eq('重复注入不会产生副本', page.group.children.length, 2);

const styleTags = page.head.children.filter((n) => n.id === 'cc-style');
eq('样式只注入一次', styleTags.length, 1);

btn.fire('click');
const inputs = page.body.children.filter((n) => n.tagName === 'input');
eq('点击后创建文件选择框', inputs.length, 1);
eq('文件类型限制', inputs[0].accept, '.png,.json,application/json,image/png');
eq('支持多选', inputs[0].multiple, true);

/* 按钮被热更新移除后能自动补回 */
btn.remove();
api.injectButton();
eq('移除后可重新注入', page.group.children.length, 2);
ok('重新注入后仍在「添加角色」右侧', page.group.children[0] === page.addBtn);

/* 没有 Following 页头时不应注入 */
const plain = buildPage();
plain.header.remove();
boot(plain);
eq('缺少目标页头时不注入', plain.og.children.length, 1);
ok('未产生按钮', !descendants(plain.body, []).some((n) => n.getAttribute && n.getAttribute('data-cc-import')));

/* ---------------- 线上另一种页头：没有 ml-4 分组，person_add 直接挂在 justify-between 页头下 ----------------
   这时直接加成同级会被 justify-between 均匀撑开，必须用 .cc-slot 把两者包成一组。 */
function buildFlatPage() {
  const body = makeEl('body');
  const head = makeEl('head');
  const header = body.appendChild(makeEl('header'));
  header.className = 'flex items-center justify-between px-6 pt-5 pb-3 sticky top-0 z-10';
  const back = header.appendChild(makeEl('button'));
  iconify(back, 'arrow_back_ios_new');
  const title = header.appendChild(makeEl('span'));
  title.className = 'text-[13px] font-bold uppercase tracking-[0.25em]';
  title.textContent = 'Following';
  const addBtn = header.appendChild(makeEl('button'));
  addBtn.className = 'flex items-center justify-center size-10 -ml-2';
  iconify(addBtn, 'person_add');
  return { body, head, header, addBtn, back, title };
}

const flat = buildFlatPage();
boot(flat);
const slot = flat.header.children[2];
eq('页头子节点数不变（原按钮被收进槽里）', flat.header.children.length, 3);
ok('槽是页头的最后一个子节点且带 cc-slot',
  slot === flat.header.children[2] && String(slot.className).split(/\s+/).indexOf('cc-slot') >= 0);
eq('槽里只有两个按钮', slot.children.length, 2);
ok('槽内第 1 个是原有「添加角色」', slot.children[0] === flat.addBtn);
eq('槽内第 2 个是导入按钮', slot.children[1].getAttribute('data-cc-import'), '1');
boot(flat);
eq('重复注入不产生第二个槽', flat.header.children.length, 3);

/* ---------------- 免重启：内存 store 的形状识别 / 合并 / 同步 ---------------- */
ok('store 形状识别：三个数组齐全才认', api.looksLikeStore({ contacts: [], personas: [], conversations: [] }) === true);
ok('store 形状识别：缺数组不认', api.looksLikeStore({ contacts: [], personas: [] }) === false);
ok('store 形状识别：null 安全', api.looksLikeStore(null) === false);

const fakeStore = { contacts: [{ id: 'a', name: 'A' }], personas: [], conversations: [] };
const m1 = api.mergeIntoStore(fakeStore, [{ id: 'n1', name: '新1' }, { id: 'n2', name: '新2' }]);
eq('新增 2 条', m1.added, 2);
eq('覆盖 0 条', m1.replaced, 0);
eq('新角色排在最前', fakeStore.contacts[0].name, '新1');
eq('原有联系人保留', fakeStore.contacts[2].id, 'a');

const m2 = api.mergeIntoStore(fakeStore, [{ id: 'a', name: 'A2' }]);
eq('同 id 覆盖不新增', m2.added, 0);
eq('同 id 覆盖计数', m2.replaced, 1);
eq('覆盖后名字更新', fakeStore.contacts.filter((c) => c.id === 'a')[0].name, 'A2');
eq('覆盖后不出现重复', fakeStore.contacts.filter((c) => c.id === 'a').length, 1);
eq('空 records 不报错', api.mergeIntoStore(fakeStore, []).added, 0);
eq('store 为空时安全', api.mergeIntoStore(null, [{ id: 'x' }]).added, 0);

(async function () {
  /* 页面里已经挂好 store：findStore 直接认领，syncLive 合并进去 */
  page.win.__CC_STORE__ = { contacts: [], personas: [], conversations: [] };
  const store = await api.findStore();
  ok('findStore 认出页面里的 store', store === page.win.__CC_STORE__);

  const live = await api.syncLive([{ id: 'zz', name: 'ZZ角色' }], null);
  eq('syncLive 报告成功', live.ok, true);
  eq('syncLive 合并 1 条', live.added, 1);
  eq('store 里立刻能看到新角色', page.win.__CC_STORE__.contacts.length, 1);
  eq('store 里是导入的那条', page.win.__CC_STORE__.contacts[0].name, 'ZZ角色');

  /* 找不到 store 时只降级，不抛错、不刷新页面 */
  const plain3 = buildPage();
  const api3 = boot(plain3);
  const none = await api3.syncLive([{ id: 'x', name: 'X' }], null);
  eq('没有 store 时降级', none.ok, false);
  eq('降级原因标明 no-store', none.reason, 'no-store');
  eq('降级时不塞数据', none.added, 0);

  console.log('\nUI 测试 ' + getPass() + ' 项');
  if (fails.length) {
    console.log('失败 ' + fails.length + ' 项:');
    fails.forEach((f) => console.log('  x ' + f));
    process.exitCode = 1;
  } else {
    console.log('全部通过');
  }
})();
