const fs = require('fs');
const { makeDB, buildPng, ok, eq, SRC, vm, fails, getPass } = require('./_cc_test_lib.cjs');

/* ---------------- 测试用角色卡 ---------------- */
const CARD = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Seraphina',
    description: '{{char}} is a knight.\n{{user}} is her squire.',
    personality: 'brave',
    scenario: 'a castle',
    first_mes: 'Hello {{user}}, I am {{char}}.',
    alternate_greetings: ['Alt one', 'Alt two for <USER>'],
    mes_example: '<START>\n{{char}}: hi',
    system_prompt: 'Stay in character as {{char}}.',
    post_history_instructions: 'Never break character.',
    creator_notes: 'test card',
    creator: 'tester',
    character_version: '1.2',
    tags: ['fantasy'],
    extensions: {
      regex_scripts: [
        { scriptName: 'bold', findRegex: '/\\*\\*(.+?)\\*\\*/gi', replaceString: '<b>$1</b>' },
        { scriptName: 'del', findRegex: '/\\[ooc\\]/g', replaceString: '' },
        { scriptName: 'name', findRegex: '/\\{\\{char\\}\\}/g', replaceString: '{{match}}!' },
        { scriptName: 'ci', findRegex: '/hello/i', replaceString: 'hi' },
      ],
    },
    character_book: {
      name: 'Lore',
      entries: [
        { keys: ['dragon', 'Dragon'], content: 'Dragons exist.', enabled: true, position: 0, constant: false, comment: 'dragons' },
        { keys: ['/sword|blade/i'], content: 'Swords.', enabled: true, position: 1 },
        { keys: [], content: 'Always on.', enabled: true, constant: true, position: 2 },
        { keys: ['depth0'], content: 'Deep.', enabled: true, position: 4, depth: 0 },
        { keys: ['deep7'], content: 'Deep2.', enabled: true, position: 4, depth: 7 },
        { keys: ['off'], content: 'Disabled.', enabled: false, position: 0 },
      ],
    },
  },
};
const cardJson = JSON.stringify(CARD);
const cardB64 = Buffer.from(cardJson, 'utf8').toString('base64');

/* ---------------- 沙箱 ---------------- */
const TS0 = { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };

function seedStores() {
  return {
    contacts: [
      Object.assign({
        id: 'c_old', name: 'Old', handle: '@old', persona: 'p', bio: 'b', link: '',
        avatar: '', openingGreetings: ['hi'], professionalAccountEnabled: false,
        minimaxVoiceId: '', elevenLabsVoiceId: '', ttsLanguage: 'en', ttsSpeed: 1,
        ttsVol: 1, ttsPitch: 0,
      }, TS0),
      Object.assign({
        id: 'c_decoy', name: 'Seraphina', handle: '@seraphina', persona: 'p', bio: 'b',
        link: '', avatar: '', openingGreetings: ['hi'], ttsSpeed: 1,
      }, TS0),
    ],
    worldbook_categories: [Object.assign({ id: 'wbc_old', name: 'Old', scope: 'global', color: '#fff', isActive: true }, TS0)],
    worldbook_entries: [
      Object.assign({
        id: 'wbe_old', categoryId: 'wbc_old', title: 't', content: 'c', keywords: [],
        isConstant: false, position: 'mid', depth: 0, scope: 'global', enabled: true, order: 0,
      }, TS0),
    ],
    regex_categories: [Object.assign({ id: 'rec_old', name: 'R', scope: 'global' }, TS0)],
    regex_entries: [Object.assign({ id: 'ree_old', categoryId: 'rec_old', name: 'n', regex: 'a', html: 'b' }, TS0)],
    conversations: [
      { id: 'conv_hit', contactId: 'c_1700000000000ddd', localSettings: { theme: 'dark', mountedWorldbooks: [] }, messages: [] },
      { id: 'conv_other', contactId: 'c_someone_else', localSettings: { theme: 'light' }, messages: [] },
    ],
  };
}

function boot(stores) {
  const db = makeDB(stores);
  const doc = {
    readyState: 'loading',
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }),
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
  const win = {};
  const idb = {
    open: () => {
      const req = {};
      setTimeout(() => { req.result = db; req.onsuccess && req.onsuccess(); }, 0);
      return req;
    },
  };
  win.indexedDB = idb;
  const sandbox = {
    console, document: doc, window: win,
    indexedDB: idb,
    FileReader: class {
      readAsDataURL() {
        const self = this;
        setTimeout(() => { self.result = 'data:image/png;base64,AAAA'; self.onload && self.onload(); }, 0);
      }
    },
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    TextDecoder,
    atob,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext('Math.random = () => 0.1; Date.now = () => 1700000000000;', ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'charcard-import.js' });
  return { db, api: win.__CC_IMPORT__ };
}

(async function main() {
  const stores = seedStores();
  const { db, api } = boot(stores);
  ok('暴露调试 API', !!api && typeof api.runImport === 'function');

  /* ---------- 1. PNG 读取 ---------- */
  const ab = buildPng('chara', cardB64);
  const item = await api.readCardFile({
    name: 'sera.png', type: 'image/png',
    arrayBuffer: async () => ab,
    text: async () => cardJson,
  });
  eq('PNG 卡名', item.card.name, 'Seraphina');
  eq('PNG 头像', item.avatar, 'data:image/png;base64,AAAA');
  eq('spec', item.card.spec, 'chara_card_v2');
  eq('first_mes 保持原文(导入时才展开)', item.card.firstMes, 'Hello {{user}}, I am {{char}}.');
  eq('alternate 数量', item.card.alternateGreetings.length, 2);
  eq('regex 数量', item.card.regexScripts.length, 4);
  eq('世界书条目原始数量', item.card.characterBook.entries.length, 6);

  /* ---------- 1b. JSON 卡（v1 / v3）与错误处理 ---------- */
  const v1 = await api.readCardFile({
    name: 'v1.json', type: 'application/json',
    text: async () => JSON.stringify({ name: 'Vee', char_persona: 'd', personality: 'p', first_mes: 'hi', example_dialogue: 'ex' }),
  });
  eq('v1 卡名', v1.card.name, 'Vee');
  eq('v1 spec 判定', v1.card.spec, 'chara_card_v1');
  eq('v1 字段映射', [v1.card.personality, v1.card.firstMes, v1.card.mesExample], ['p', 'hi', 'ex']);

  const v3 = await api.readCardFile({
    name: 'v3.json', type: 'application/json',
    text: async () => JSON.stringify({
      spec: 'chara_card_v3', spec_version: '3.0',
      data: { name: 'Three', first_mes: 'yo', group_only_greetings: [], character_book: { entries: [{ keys: ['a'], content: 'c' }] } },
    }),
  });
  eq('v3 卡名/spec', [v3.card.name, v3.card.spec], ['Three', 'chara_card_v3']);
  eq('v3 内嵌世界书', v3.card.characterBook.entries.length, 1);

  let err = null;
  try {
    await api.readCardFile({ name: 'bad.png', type: 'image/png', arrayBuffer: async () => buildPng('IHDR', Buffer.alloc(13).toString('latin1')) });
  } catch (e) { err = e; }
  ok('无角色卡数据时抛错', !!err && /chara/.test(err.message), err && err.message);

  let err2 = null;
  try {
    await api.readCardFile({ name: 'junk.json', type: 'application/json', text: async () => JSON.stringify({ hello: 'world' }) });
  } catch (e) { err2 = e; }
  ok('非角色卡 JSON 抛错', !!err2 && /角色卡/.test(err2.message), err2 && err2.message);


  /* ---------- 2. 世界书映射 ---------- */
  const wb = api.buildWorldEntries(item.card.characterBook, 'wbc_test', 'Seraphina', '我');
  eq('世界书条数(跳过 disabled)', wb.length, 5);
  eq('position 0 → front', [wb[0].position, wb[0].depth], ['front', 0]);
  eq('关键词去重(大小写)', wb[0].keywords, ['dragon']);
  eq('title 取 comment', wb[0].title, 'dragons');
  eq('position 1 → back', [wb[1].position, wb[1].depth], ['back', 0]);
  ok('regex 关键词降级拆分', JSON.stringify(wb[1].keywords) === JSON.stringify(['sword', 'blade']), wb[1].keywords);
  eq('constant → isConstant', [wb[2].isConstant, wb[2].position], [true, 'front']);
  eq('at_depth 0 → depth 1', [wb[3].position, wb[3].depth], ['back', 1]);
  eq('at_depth 7 → depth 7', [wb[4].position, wb[4].depth], ['back', 7]);
  eq('全部 scope=local', wb.every((e) => e.scope === 'local'), true);

  /* ---------- 3. 正则映射 ---------- */
  const re = api.buildRegexEntries(item.card.regexScripts, 'rec_test', 'Seraphina', '我');
  eq('正则条数', re.length, 4);
  eq('正则名称', re[0].name, 'bold');
  eq('正则剥离斜杠', re[0].regex, '\\*\\*(.+?)\\*\\*');
  eq('替换串保留 $1', re[0].html, '<b>$1</b>');
  ok('新正则可编译(gms)', (() => { try { new RegExp(re[0].regex, 'gms'); return true; } catch (e) { return false; } })(), re[0].regex);
  eq('空替换串保留', re[1].html, '');
  eq('{{match}} → $&', re[2].html, '$&!');
  eq('i 标志展开为字符类', re[3].regex, '[hH][eE][lL][lL][oO]');
  eq('i 展开后仍可编译', (() => { try { new RegExp(re[3].regex, 'gms'); return true; } catch (e) { return false; } })(), true);
  ok('i 正则语义正确', new RegExp(re[3].regex, 'gms').test('HeLLo'), re[3].regex);
  eq('正则全部带 categoryId', re.every((r) => r.categoryId === 'rec_test'), true);

  /* ---------- 4. persona / greetings / handle ---------- */
  const persona = api.buildPersona(item.card, 'Seraphina', '我');
  ok('persona 以角色设定开头', persona.indexOf('【角色设定】') === 0, persona.slice(0, 20));
  ok('persona 含对话示例', persona.indexOf('【对话示例】') > 0);
  const greetings = api.buildGreetings(item.card, 'Seraphina', '我');
  eq('开场白 3 条', greetings.length, 3);
  eq('开场白宏展开', greetings[0], 'Hello 我, I am Seraphina.');
  eq('备用开场白宏展开', greetings[2], 'Alt two for 我');
  eq('handle 生成', api.buildHandle('Seraphina'), '@seraphina');

  /* ---------- 5. 写入数据库 ---------- */
  const res = await api.runImport([item], {
    worldbook: true, regex: true, greetings: true, promptOverrides: true,
  });
  eq('导入结果 角色数', res.contacts, 1);
  eq('导入结果 世界书分类', res.wbCats, 1);
  eq('导入结果 世界书条目(含提示词 2 条)', res.wbEntries, 7);
  eq('导入结果 正则', [res.reCats, res.reEntries], [1, 4]);
  eq('挂载会话数', res.conversations, 1);

  const contacts = db.__stores.contacts;
  eq('contacts 总数', contacts.length, 3);
  const nc = contacts.filter((c) => c.id !== 'c_old' && c.id !== 'c_decoy')[0];
  ok('新角色 id 已生成', !!nc && /^c_/.test(nc.id), nc && nc.id);
  eq('新角色 name', nc.name, 'Seraphina');
  eq('handle 重名自动加序号', nc.handle, '@seraphina2');
  eq('新角色 开场白', nc.openingGreetings.length, 3);
  eq('新角色 头像', nc.avatar, 'data:image/png;base64,AAAA');
  eq('模板字段继承 ttsSpeed', nc.ttsSpeed, 1);
  ok('charcard.worldbookId', !!nc.charcard && !!nc.charcard.worldbookId, nc.charcard);
  ok('charcard.regexCategoryId', !!nc.charcard && !!nc.charcard.regexCategoryId, nc.charcard);

  const wbCats = db.__stores.worldbook_categories;
  eq('世界书分类数', wbCats.length, 2);
  const ncat = wbCats.find((c) => c.id !== 'wbc_old');
  eq('新分类 name/scope', [ncat.name, ncat.scope], ['Seraphina · 世界书', 'local']);
  eq('分类模板字段继承', ncat.color, '#fff');

  const wbEntries = db.__stores.worldbook_entries.filter((e) => e.categoryId === ncat.id);
  eq('新世界书条目数', wbEntries.length, 7);
  eq('条目 scope=local', wbEntries.every((e) => e.scope === 'local'), true);
  eq('条目模板字段继承', wbEntries[0].enabled, true);
  const sysEntry = wbEntries.find((e) => e.title === '系统提示词（角色卡）');
  ok('系统提示词存在', !!sysEntry);
  if (sysEntry) {
    eq('系统提示词常驻 front/0', [sysEntry.isConstant, sysEntry.position, sysEntry.depth], [true, 'front', 0]);
    eq('系统提示词宏展开', sysEntry.content, 'Stay in character as Seraphina.');
  }

  const reEntries = db.__stores.regex_entries.filter((e) => e.categoryId !== 'rec_old');
  eq('新正则条目数', reEntries.length, 4);

  const conv = db.__stores.conversations.find((c) => c.id === 'conv_hit');
  eq('会话已挂载世界书', conv.localSettings.mountedWorldbooks, [ncat.id]);
  eq('会话 localSettings 保留', conv.localSettings.theme, 'dark');
  const other = db.__stores.conversations.find((c) => c.id === 'conv_other');
  eq('无关会话未改动', other.localSettings.mountedWorldbooks, undefined);

  console.log('\n通过 ' + getPass() + ' 项');
  if (fails.length) {
    console.log('失败 ' + fails.length + ' 项:');
    fails.forEach((f) => console.log('  x ' + f));
    process.exitCode = 1;
  } else {
    console.log('全部通过');
  }
})().catch((e) => {
  console.error('测试异常:', e);
  process.exitCode = 1;
});

