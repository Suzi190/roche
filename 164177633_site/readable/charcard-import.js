/*!
 * charcard-import.js
 * SillyTavern 角色卡导入（角色 + 世界书 + 多条开场白 + 正则）
 *
 * 设计说明：
 *  1. 站点 bundle 为混淆产物，无法安全改动内部代码，因此本文件作为独立注入脚本，
 *     直接写入应用自己的 IndexedDB（Roche_db）。应用只在启动时把数据库水合进
 *     内存（没有 Pinia，也没有任何刷新 API），所以写入后必须重载页面才能看到新角色。
 *  2. 为了不让人手动「刷新 + 重新点进 Following」，脚本会常驻记录用户在应用内的
 *     点击路径；导入完成后自动 reload，启动时把这条路径重放一次，直接回到原页面。
 *     找不到目标元素就放弃（停在桌面），不会猜测性点击，也不会误点「删除」这类按钮。
 *  3. 记录结构采用「克隆现有记录作模板 + 覆盖语义字段」的方式合成，
 *     这样即使应用版本新增了必填字段，导入结果依然能被正常读取。
 *  4. 世界书以 scope='local' 写入，并挂载到该角色的会话（localSettings.mountedWorldbooks），
 *     与 SillyTavern「角色专属 lorebook」语义一致。
 */
(function () {
  'use strict';
  if (window.__CC_IMPORT_READY__) return;
  window.__CC_IMPORT_READY__ = true;

  var DB_NAME = 'Roche_db';
  var S = {
    contacts: 'contacts',
    wbCat: 'worldbook_categories',
    wbEntry: 'worldbook_entries',
    reCat: 'regex_categories',
    reEntry: 'regex_entries',
    conv: 'conversations'
  };

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */
  function log() {
    try {
      console.log.apply(console, ['[charcard]'].concat([].slice.call(arguments)));
    } catch (e) {}
  }

  function nowTs() {
    return Date.now();
  }

  function rand(n) {
    var s = '';
    var al = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < n; i++) s += al[Math.floor(Math.random() * al.length)];
    return s;
  }

  /* 单调自增序号：同一毫秒内连续生成的 id 也不会撞车 */
  var uidSeq = 0;

  function uid(prefix) {
    uidSeq += 1;
    return prefix + nowTs().toString(36) + uidSeq.toString(36) + rand(4);
  }

  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function safeJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function clamp(n, min, max) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function firstNonEmpty() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
    }
    return '';
  }

  /* ------------------------------------------------------------------ *
   * PNG 文本块解析（tEXt / iTXt，SillyTavern 使用 chara / ccv3 两个 key）
   * ------------------------------------------------------------------ */
  function parsePngChunks(buf) {
    var u8 = new Uint8Array(buf);
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var i = 0; i < 8; i++) if (u8[i] !== sig[i]) return null;

    var view = new DataView(buf);
    var offset = 8;
    var out = {};

    while (offset + 8 <= u8.length) {
      var len = view.getUint32(offset);
      var type = '';
      for (var k = 0; k < 4; k++) type += String.fromCharCode(u8[offset + 4 + k]);
      var dataStart = offset + 8;
      if (dataStart + len > u8.length) break;

      if (type === 'tEXt' || type === 'iTXt') {
        var chunk = u8.subarray(dataStart, dataStart + len);
        var zero = chunk.indexOf(0);
        if (zero > 0) {
          var key = new TextDecoder('latin1').decode(chunk.subarray(0, zero));
          if (type === 'tEXt') {
            out[key] = new TextDecoder('latin1').decode(chunk.subarray(zero + 1));
          } else {
            var p = zero + 1;
            var compFlag = chunk[p];
            p += 2;
            var z1 = chunk.indexOf(0, p);
            var z2 = z1 >= 0 ? chunk.indexOf(0, z1 + 1) : -1;
            if (z2 >= 0) {
              var textBytes = chunk.subarray(z2 + 1);
              if (compFlag === 1) continue; // 压缩 iTXt 极少见，跳过
              out[key] = new TextDecoder('utf-8').decode(textBytes);
            }
          }
        }
      }

      offset = dataStart + len + 4; // + CRC
      if (type === 'IEND') break;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 卡规范化：v1 扁平结构 / v2 v3 { spec, data }
   * ------------------------------------------------------------------ */
  function normalizeCard(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('不是有效的角色卡 JSON');

    var data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    var spec = raw.spec || (raw.data ? 'chara_card_v2' : 'chara_card_v1');

    var looksLikeCard =
      !!raw.spec || !!raw.data || !!data.name || !!data.char_name || !!data.username ||
      !!data.description || !!data.char_persona || !!data.first_mes || !!data.char_greeting ||
      !!data.greeting || !!data.mes_example || !!data.character_book;
    if (!looksLikeCard) {
      throw new Error('不是角色卡 JSON：缺少 name / first_mes / description 等字段');
    }

    var card = {
      spec: spec,
      name: firstNonEmpty(data.name, data.char_name, raw.name) || '未命名角色',
      description: firstNonEmpty(data.description, data.char_persona, raw.description),
      personality: firstNonEmpty(data.personality, data.char_personality),
      scenario: firstNonEmpty(data.scenario, data.world_scenario),
      firstMes: firstNonEmpty(data.first_mes, data.char_greeting, data.greeting),
      alternateGreetings: [],
      mesExample: firstNonEmpty(data.mes_example, data.example_dialogue),
      systemPrompt: firstNonEmpty(data.system_prompt),
      postHistoryInstructions: firstNonEmpty(
        data.post_history_instructions,
        data.jailbreak
      ),
      creatorNotes: firstNonEmpty(data.creator_notes, data.creatorcomment),
      creator: firstNonEmpty(data.creator, data.creator_name),
      characterVersion: firstNonEmpty(data.character_version),
      tags: Array.isArray(data.tags) ? data.tags.slice() : [],
      characterBook: null,
      regexScripts: []
    };

    var alt = data.alternate_greetings;
    if (Array.isArray(alt)) {
      for (var i = 0; i < alt.length; i++) {
        var g = alt[i];
        var text = typeof g === 'string' ? g : g && (g.text || g.content || g.mes);
        if (text && String(text).trim()) card.alternateGreetings.push(String(text));
      }
    }

    var book = data.character_book || data.worldbook || raw.character_book;
    if (book && typeof book === 'object') card.characterBook = book;

    var ext = data.extensions || raw.extensions || {};
    if (ext && Array.isArray(ext.regex_scripts)) card.regexScripts = ext.regex_scripts;
    else if (Array.isArray(data.regex_scripts)) card.regexScripts = data.regex_scripts;

    return card;
  }

  /* ------------------------------------------------------------------ *
   * 宏替换：应用本身不支持 {{char}} / {{user}}，导入时就地展开
   * ------------------------------------------------------------------ */
  function applyMacros(text, charName, userName) {
    return String(text == null ? '' : text)
      .replace(/\{\{\s*char\s*\}\}/gi, charName)
      .replace(/\{\{\s*user\s*\}\}/gi, userName)
      .replace(/<BOT>/gi, charName)
      .replace(/<USER>/gi, userName)
      .replace(/\{\{\s*original\s*\}\}/gi, '');
  }

  function compact(lines) {
    return lines
      .map(function (s) {
        return String(s == null ? '' : s).trim();
      })
      .filter(function (s) {
        return s.length > 0;
      })
      .join('\n\n');
  }

  /* 把 ST 的 description / personality / scenario / mes_example 合成应用的 persona */
  function buildPersona(card, charName, userName) {
    var blocks = [];
    if (card.description)
      blocks.push('【角色设定】\n' + applyMacros(card.description, charName, userName));
    if (card.personality)
      blocks.push('【性格】\n' + applyMacros(card.personality, charName, userName));
    if (card.scenario)
      blocks.push('【场景】\n' + applyMacros(card.scenario, charName, userName));
    if (card.mesExample)
      blocks.push('【对话示例】\n' + applyMacros(card.mesExample, charName, userName));
    return compact(blocks);
  }

  /* 开场白：first_mes + alternate_greetings 全量保留 */
  function buildGreetings(card, charName, userName) {
    var out = [];
    var push = function (t) {
      var s = String(t == null ? '' : t).trim();
      if (s) out.push(applyMacros(s, charName, userName));
    };
    push(card.firstMes);
    card.alternateGreetings.forEach(push);
    return out;
  }

  /* handle：应用要求 @用户名，ST 卡没有，按名字生成一个稳定的 ASCII handle */
  function buildHandle(name) {
    var ascii = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .slice(0, 16);
    if (ascii && ascii.length >= 2) return '@' + ascii;
    var h = 0;
    var s = String(name);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return '@char_' + h.toString(36).slice(0, 6);
  }

  /* ------------------------------------------------------------------ *
   * 世界书条目映射
   *   ST position: 0=before_char 1=after_char 2=before_an 3=after_an 4=at_depth
   *   应用 position: 'front' | 'mid' | 'back'；depth 1-10 → 历史消息注入
   * ------------------------------------------------------------------ */
  function mapEntryPosition(entry) {
    var raw = entry.position;
    if (raw === undefined || raw === null) {
      raw = entry.extensions && entry.extensions.position;
    }
    var depthRaw =
      entry.depth !== undefined && entry.depth !== null
        ? entry.depth
        : entry.extensions && entry.extensions.depth;

    var isAtDepth =
      raw === 4 ||
      raw === '4' ||
      raw === 'at_depth' ||
      raw === 'atDepth' ||
      raw === 'at-depth';

    if (isAtDepth) {
      // ST 的 depth 0 表示「紧跟最后一条消息」，应用需要 depth>0 才会做历史注入
      return { position: 'back', depth: clamp(Number(depthRaw) || 0, 1, 10) };
    }
    if (raw === 1 || raw === '1' || raw === 'after_char' || raw === 'afterChar') {
      return { position: 'back', depth: 0 };
    }
    if (raw === 3 || raw === '3' || raw === 'after_an' || raw === 'afterAN') {
      return { position: 'back', depth: 0 };
    }
    // 0 / 2 / 未指定 → front（角色定义之前）
    return { position: 'front', depth: 0 };
  }

  /* ST 的 /pattern/flags 写法在应用里不是合法 key（走 substring 匹配），必须剥离 */
  function cleanKey(k) {
    var s = String(k == null ? '' : k).trim();
    if (!s) return '';
    var m = s.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
    if (m) s = m[1];
    return s.trim();
  }

  /* ST 允许 /regex/ 关键词；应用只做子串匹配，能降级成多个字面量就降级 */
  var KEY_META = /[\\^$.*+?()[\]{}]/;
  function expandKey(s) {
    if (KEY_META.test(s)) return [s]; // 含真正的正则元字符 → 原样保留
    if (s.indexOf('|') < 0) return [s];
    return s.split('|');
  }

  function buildKeywords(entry) {
    var keys = Array.isArray(entry.keys) ? entry.keys.slice() : [];
    var secondary = Array.isArray(entry.secondary_keys) ? entry.secondary_keys.slice() : [];
    // 应用只支持单一关键词集合（OR 匹配），把次级关键词并入以保证能够触发
    if (entry.selective && secondary.length) keys = keys.concat(secondary);

    var seen = {};
    var out = [];
    keys.forEach(function (k) {
      var s = cleanKey(k);
      if (!s) return;
      expandKey(s).forEach(function (part) {
        var p = part.trim();
        if (!p) return;
        var lower = p.toLowerCase();
        if (seen[lower]) return;
        seen[lower] = 1;
        out.push(p);
      });
    });
    return out;
  }

  function buildWorldEntries(book, categoryId, charName, userName) {
    var list = book && Array.isArray(book.entries) ? book.entries : [];
    var out = [];
    list.forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      if (e.enabled === false) return; // 卡里被禁用的条目保持禁用

      var content = applyMacros(e.content, charName, userName);
      if (!content || !String(content).trim()) return;

      var keys = buildKeywords(e);
      var isConstant = e.constant === true || e.isConstant === true;
      if (!isConstant && keys.length === 0) return; // 无关键词又非常驻 → 永不触发

      var pos = mapEntryPosition(e);
      var title =
        firstNonEmpty(e.comment, e.name, e.title) || (keys.length ? keys[0] : '常驻条目');

      out.push({
        title: String(title).slice(0, 120),
        content: content,
        categoryId: categoryId,
        scope: 'local',
        isConstant: isConstant,
        keywords: keys,
        position: pos.position,
        depth: pos.depth
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 正则映射：ST regex_scripts → 应用 regex_entries { name, regex, html }
   *
   * 应用侧实现（Chat chunk）：
   *   new RegExp(entry.regex, "gms") · text.replace(re, entry.html)
   * 因此 regex 必须是「不带斜杠的纯模式」，替换串支持 $1 / $&。
   * ------------------------------------------------------------------ */

  /* 把字母展开成 [aA] 形式，模拟 ST 的 i 标志（应用强制 "gms"，没有 i） */
  function widenCase(pattern) {
    var out = '';
    var inClass = false;
    var i = 0;
    var n = pattern.length;
    while (i < n) {
      var c = pattern[i];
      if (c === '\\') {
        out += c + (pattern[i + 1] || '');
        i += 2;
        continue;
      }
      if (inClass) {
        out += c;
        if (c === ']') inClass = false;
        i++;
        continue;
      }
      if (c === '[') {
        inClass = true;
        out += c;
        /* 紧跟的 ^ 与首个 ] 属于字符类本身 */
        if (pattern[i + 1] === '^') {
          out += '^';
          i++;
        }
        if (pattern[i + 1] === ']') {
          out += ']';
          i++;
        }
        i++;
        continue;
      }
      if (c >= 'a' && c <= 'z') {
        out += '[' + c + c.toUpperCase() + ']';
      } else if (c >= 'A' && c <= 'Z') {
        out += '[' + c.toLowerCase() + c + ']';
      } else {
        out += c;
      }
      i++;
    }
    return out;
  }

  function buildRegexEntries(scripts, categoryId, charName, userName) {
    var out = [];
    (scripts || []).forEach(function (sc) {
      if (!sc || typeof sc !== 'object') return;
      if (sc.disabled === true) return; // 卡里禁用的正则保持禁用

      var raw = String(sc.findRegex || '').trim();
      if (!raw) return;

      var m = raw.match(/^\/([\s\S]*)\/([a-z]*)$/);
      var pattern = m ? m[1] : raw;
      var flags = m ? m[2] : '';
      if (!pattern) return;

      if (flags.indexOf('i') >= 0) {
        var widened = widenCase(pattern);
        try {
          new RegExp(widened, 'gms');
          pattern = widened;
        } catch (e) {
          /* 展开后不合法就保持原样，交给应用侧 try/catch 兜底 */
        }
      }

      var replacement = applyMacros(String(sc.replaceString == null ? '' : sc.replaceString), charName, userName);
      // ST 的 {{match}} 等价于 JS 替换串里的「整个匹配」，需写成 $& 的字面量
      replacement = replacement.replace(/\{\{\s*match\s*\}\}/gi, '$$&');

      out.push({
        categoryId: categoryId,
        name: firstNonEmpty(sc.scriptName, sc.name) || '正则',
        regex: pattern,
        html: replacement
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * IndexedDB（不加 version，避免触发 upgrade 破坏应用自身 schema）
   * ------------------------------------------------------------------ */
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('当前环境不支持 IndexedDB'));
      var req = indexedDB.open(DB_NAME);
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error('打开数据库失败'));
      };
      req.onblocked = function () {
        reject(new Error('数据库被其它页面占用，请关闭重复标签页后重试'));
      };
    });
  }

  function getAll(db, store) {
    return new Promise(function (resolve) {
      if (!db.objectStoreNames.contains(store)) return resolve([]);
      var tx = db.transaction(store, 'readonly');
      var req = tx.objectStore(store).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        resolve([]);
      };
    });
  }

  function putAll(db, store, records) {
    return new Promise(function (resolve, reject) {
      if (!records || records.length === 0) return resolve(0);
      if (!db.objectStoreNames.contains(store)) {
        return reject(new Error('数据库缺少数据表：' + store));
      }
      var tx = db.transaction(store, 'readwrite');
      var os = tx.objectStore(store);
      var keyPath = os.keyPath || 'id';
      records.forEach(function (r) {
        if (r[keyPath] === undefined || r[keyPath] === null || r[keyPath] === '') {
          r[keyPath] = uid('x_');
        }
        os.put(r);
      });
      tx.oncomplete = function () {
        resolve(records.length);
      };
      tx.onerror = function () {
        reject(tx.error || new Error('写入 ' + store + ' 失败'));
      };
      tx.onabort = function () {
        reject(tx.error || new Error('写入 ' + store + ' 被中止'));
      };
    });
  }

  /* 这些字段永远由本次导入覆盖，不从模板继承 */
  var NO_INHERIT = {
    id: 1, categoryId: 1, title: 1, content: 1, keywords: 1, isConstant: 1,
    position: 1, depth: 1, name: 1, scope: 1, regex: 1, html: 1,
    avatar: 1, persona: 1, bio: 1, handle: 1, link: 1, openingGreetings: 1
  };

  function stampOf(tpl, key) {
    if (!tpl || !(key in tpl)) return null;
    return typeof tpl[key] === 'string' ? new Date().toISOString() : Date.now();
  }

  /* 以现有记录为模板合成新记录，继承未知的必填字段 */
  function makeRecord(tpl, fields) {
    var rec = {};
    if (tpl && typeof tpl === 'object') {
      Object.keys(tpl).forEach(function (k) {
        if (NO_INHERIT[k]) return;
        rec[k] = tpl[k];
      });
    }
    Object.keys(fields).forEach(function (k) {
      if (fields[k] !== undefined) rec[k] = fields[k];
    });
    var c = stampOf(tpl, 'createdAt');
    var u = stampOf(tpl, 'updatedAt');
    if (c !== null) rec.createdAt = c;
    if (u !== null) rec.updatedAt = u;
    return rec;
  }

  function pickTemplate(list, predicate) {
    for (var i = 0; i < list.length; i++) {
      if (!predicate || predicate(list[i])) return list[i];
    }
    return list[0] || null;
  }

  /* ------------------------------------------------------------------ *
   * 读取卡片文件（PNG / JSON）
   * ------------------------------------------------------------------ */
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(String(fr.result || ''));
      };
      fr.onerror = function () {
        reject(new Error('读取图片失败'));
      };
      fr.readAsDataURL(blob);
    });
  }

  function normalizeRocheCard(contact) {
    var c = contact || {};
    return {
      spec: 'roche_contact_card',
      name: firstNonEmpty(c.name) || '未命名角色',
      description: firstNonEmpty(c.persona),
      personality: '',
      scenario: '',
      firstMes: Array.isArray(c.openingGreetings) ? firstNonEmpty(c.openingGreetings[0]) : '',
      alternateGreetings: Array.isArray(c.openingGreetings) ? c.openingGreetings.slice(1) : [],
      mesExample: '',
      systemPrompt: '',
      postHistoryInstructions: '',
      creatorNotes: firstNonEmpty(c.bio),
      creator: '',
      characterVersion: '',
      tags: [],
      characterBook: null,
      regexScripts: []
    };
  }

  async function readCardFile(file) {
    var fname = file.name || '';
    if (/\.png$/i.test(fname) || file.type === 'image/png') {
      var buf = await file.arrayBuffer();
      var chunks = parsePngChunks(buf);
      if (!chunks) throw new Error('PNG 文件解析失败');
      var payload = chunks.ccv3 || chunks.chara;
      if (!payload) throw new Error('这张 PNG 不含角色卡数据（缺少 chara / ccv3 文本块）');
      var jsonText = /^\s*[\{\[]/.test(payload) ? payload : b64ToUtf8(payload);
      var obj = safeJson(jsonText);
      if (!obj) throw new Error('角色卡内嵌 JSON 解析失败');
      return {
        card: normalizeCard(obj),
        avatar: await blobToDataUrl(file),
        fileName: fname
      };
    }

    var text = await file.text();
    var parsed = safeJson(text);
    if (!parsed) throw new Error('不是有效的 JSON 文件');

    if (parsed.type === 'roche_contact_card' && parsed.contact) {
      var rc = parsed.contact;
      return {
        card: normalizeRocheCard(rc),
        avatar: firstNonEmpty(rc.avatar),
        fileName: fname
      };
    }

    return { card: normalizeCard(parsed), avatar: '', fileName: fname };
  }

  /* ------------------------------------------------------------------ *
   * 导入编排
   * ------------------------------------------------------------------ */
  async function runImport(items, opts) {
    opts = opts || {};
    var userName = opts.userName || '我';
    var db = await openDb();

    var lists = await Promise.all([
      getAll(db, S.contacts),
      getAll(db, S.wbCat),
      getAll(db, S.wbEntry),
      getAll(db, S.reCat),
      getAll(db, S.reEntry)
    ]);
    var tplContact = pickTemplate(lists[0]);
    var tplWbCat = pickTemplate(lists[1]);
    var tplWbEntry = pickTemplate(lists[2]);
    var tplReCat = pickTemplate(lists[3]);
    var tplReEntry = pickTemplate(lists[4]);

    /* handle 在应用里是「唯一用户名」，重名时自动加序号，避免覆盖已有角色 */
    var usedHandles = {};
    lists[0].forEach(function (c) {
      if (c && c.handle) usedHandles[String(c.handle).toLowerCase()] = 1;
    });
    function uniqueHandle(base) {
      var lower = base.toLowerCase();
      if (!usedHandles[lower]) {
        usedHandles[lower] = 1;
        return base;
      }
      for (var i = 2; i < 1000; i++) {
        var h = base + i;
        if (!usedHandles[h.toLowerCase()]) {
          usedHandles[h.toLowerCase()] = 1;
          return h;
        }
      }
      return base + rand(3);
    }

    var ts = nowTs();
    var out = {
      contacts: [], wbCats: [], wbEntries: [],
      reCats: [], reEntries: [], mounts: []
    };

    items.forEach(function (it, idx) {
      var card = it.card;
      var charName = card.name;
      var contactId = 'c_' + (ts + idx) + rand(3);
      var wbCatId = null;
      var reCatId = null;

      /* ---------- 世界书 ---------- */
      if (opts.worldbook) {
        var entries = [];
        if (card.characterBook) {
          wbCatId = uid('wbc_');
          entries = buildWorldEntries(card.characterBook, wbCatId, charName, userName);
        }
        if (opts.promptOverrides) {
          var extras = [];
          if (card.systemPrompt) {
            extras.push({
              title: '系统提示词（角色卡）',
              content: applyMacros(card.systemPrompt, charName, userName),
              isConstant: true,
              position: 'front',
              depth: 0
            });
          }
          if (card.postHistoryInstructions) {
            // ST 的 PHI 等价于「历史最后一条之后」，应用里 depth=1 最接近
            extras.push({
              title: '历史后指令（角色卡）',
              content: applyMacros(card.postHistoryInstructions, charName, userName),
              isConstant: true,
              position: 'back',
              depth: 1
            });
          }
          if (extras.length) {
            if (!wbCatId) wbCatId = uid('wbc_');
            extras.forEach(function (e) {
              e.categoryId = wbCatId;
              e.scope = 'local';
              e.keywords = [];
              entries.push(e);
            });
          }
        }
        if (wbCatId && entries.length) {
          out.wbCats.push(
            makeRecord(tplWbCat, { id: wbCatId, name: charName + ' · 世界书', scope: 'local' })
          );
          entries.forEach(function (e) {
            out.wbEntries.push(makeRecord(tplWbEntry, e));
          });
        } else {
          wbCatId = null;
        }
      }

      /* ---------- 正则 ---------- */
      if (opts.regex && card.regexScripts && card.regexScripts.length) {
        var cid = uid('rec_');
        var res = buildRegexEntries(card.regexScripts, cid, charName, userName);
        if (res.length) {
          reCatId = cid;
          out.reCats.push(
            makeRecord(tplReCat, { id: cid, name: charName + ' · 正则', scope: 'local' })
          );
          res.forEach(function (r) {
            out.reEntries.push(makeRecord(tplReEntry, r));
          });
        }
      }

      /* ---------- 角色 ---------- */
      var greetings = opts.greetings
        ? buildGreetings(card, charName, userName)
        : card.firstMes
          ? [applyMacros(card.firstMes, charName, userName)]
          : [];

      out.contacts.push(
        makeRecord(tplContact, {
          id: contactId,
          name: charName,
          handle: uniqueHandle(buildHandle(charName)),
          persona: buildPersona(card, charName, userName),
          bio: '',
          link: '',
          avatar: it.avatar || '',
          openingGreetings: greetings,
          professionalAccountEnabled: false,
          patAction: 'pat',
          patTarget: '',
          charcard: {
            spec: card.spec,
            source: it.fileName,
            creator: card.creator,
            creatorNotes: card.creatorNotes,
            tags: card.tags,
            version: card.characterVersion,
            worldbookId: wbCatId,
            regexCategoryId: reCatId
          }
        })
      );

      if (wbCatId) out.mounts.push({ contactId: contactId, catId: wbCatId });
    });

    await putAll(db, S.contacts, out.contacts);
    await putAll(db, S.wbCat, out.wbCats);
    await putAll(db, S.wbEntry, out.wbEntries);
    await putAll(db, S.reCat, out.reCats);
    await putAll(db, S.reEntry, out.reEntries);

    /* ---------- 把世界书挂到该角色已有的会话上 ---------- */
    var patched = 0;
    if (out.mounts.length) {
      var convs = await getAll(db, S.conv);
      var updates = [];
      convs.forEach(function (c) {
        var raw = '';
        try {
          raw = JSON.stringify(c);
        } catch (e) {
          return;
        }
        var ls = Object.assign({}, c.localSettings || {});
        var arr = Array.isArray(ls.mountedWorldbooks) ? ls.mountedWorldbooks.slice() : [];
        var changed = false;
        out.mounts.forEach(function (m) {
          if (raw.indexOf(m.contactId) < 0) return;
          if (arr.indexOf(m.catId) >= 0) return;
          arr.push(m.catId);
          changed = true;
        });
        if (changed) {
          ls.mountedWorldbooks = arr;
          updates.push(Object.assign({}, c, { localSettings: ls }));
          patched++;
        }
      });
      await putAll(db, S.conv, updates);
    }

    try {
      db.close();
    } catch (e) {}

    return {
      contacts: out.contacts.length,
      wbCats: out.wbCats.length,
      wbEntries: out.wbEntries.length,
      reCats: out.reCats.length,
      reEntries: out.reEntries.length,
      conversations: patched,
      /* 写进库里的原始记录，导入后要拿它同步到应用内存里 */
      records: out.contacts,
      names: out.contacts.map(function (c) {
        return c.name;
      })
    };
  }

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */
  var CSS = [
    '.cc-btn{width:40px;height:40px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;',
    'border:0;background:transparent;border-radius:9999px;color:inherit;cursor:pointer;',
    'transition:background .15s ease,transform .15s ease;-webkit-tap-highlight-color:transparent}',
    '.cc-btn:hover{background:rgba(0,0,0,.06)}.cc-btn:active{transform:scale(.94)}',
    '.cc-btn svg{width:21px;height:21px;display:block}',
    '.cc-slot{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto}',
    '.cc-slot>:first-child{margin-right:0}',
    '.cc-slot .cc-btn{margin-right:-8px}',
    '.cc-mask{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);',
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;',
    'align-items:center;justify-content:center;padding:20px;animation:ccFade .18s ease}',
    '@keyframes ccFade{from{opacity:0}to{opacity:1}}',
    '@keyframes ccZoom{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}',
    '.cc-panel{width:100%;max-width:430px;max-height:86vh;overflow:auto;background:#fff;',
    'border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.28);padding:22px;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
    'color:#111;animation:ccZoom .2s ease}',
    '.cc-h{font-size:15px;font-weight:800;letter-spacing:.02em;margin:0 0 4px}',
    '.cc-sub{font-size:11px;color:#8b8b8b;margin:0 0 16px;line-height:1.5}',
    '.cc-card{display:flex;gap:12px;padding:12px;border-radius:18px;background:#f6f6f6;margin-bottom:10px}',
    '.cc-av{width:52px;height:52px;border-radius:14px;object-fit:cover;background:#e6e6e6;flex:0 0 auto}',
    '.cc-av-ph{width:52px;height:52px;border-radius:14px;background:#e6e6e6;flex:0 0 auto;',
    'display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#9a9a9a}',
    '.cc-nm{font-size:13px;font-weight:700;line-height:1.3;word-break:break-all}',
    '.cc-meta{font-size:10px;color:#8b8b8b;margin-top:3px;line-height:1.5}',
    '.cc-tag{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:999px;',
    'background:#111;color:#fff;margin-right:4px;margin-top:5px;letter-spacing:.04em}',
    '.cc-opt{display:flex;align-items:center;gap:10px;padding:10px 2px;font-size:12px;color:#333}',
    '.cc-opt input{width:17px;height:17px;accent-color:#111;flex:0 0 auto}',
    '.cc-opt small{display:block;color:#9a9a9a;font-size:10px;margin-top:2px;line-height:1.45}',
    '.cc-row{display:flex;gap:10px;margin-top:16px}',
    '.cc-b{flex:1;padding:13px;border-radius:999px;border:0;font-size:12px;font-weight:800;',
    'letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.cc-b.ghost{background:#f2f2f2;color:#555}.cc-b.primary{background:#111;color:#fff}',
    '.cc-b[disabled]{opacity:.45;pointer-events:none}',
    '.cc-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 88px);',
    'background:#111;color:#fff;font-size:12px;font-weight:600;padding:11px 18px;border-radius:999px;',
    'z-index:100000;box-shadow:0 12px 30px rgba(0,0,0,.3);max-width:80vw;text-align:center;line-height:1.45}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('cc-style')) return;
    var st = document.createElement('style');
    st.id = 'cc-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var toastTimer = null;
  function toast(msg, ms) {
    try {
      var old = document.querySelector('.cc-toast');
      if (old) old.remove();
      var el = document.createElement('div');
      el.className = 'cc-toast';
      el.textContent = msg;
      document.body.appendChild(el);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        el.remove();
      }, ms || 2600);
    } catch (e) {
      log('toast failed', e);
    }
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function hasClass(node, token) {
    if (!node || typeof node.className !== 'string') return false;
    return (' ' + node.className + ' ').indexOf(' ' + token + ' ') >= 0;
  }

  /* 向上找页面头部容器（Following 页头：flex justify-between + sticky） */
  function headerOf(node) {
    var p = node;
    for (var i = 0; i < 5 && p; i++) {
      if (hasClass(p, 'justify-between')) return p;
      p = p.parentNode;
    }
    return null;
  }

  /* 只在「Following / 个人页」注入，避免污染其它页面头部 */
  function isProfileHeader(head) {
    if (!head) return false;
    if (/following/i.test(String(head.textContent || ''))) return true;
    var icons = head.querySelectorAll ? head.querySelectorAll('.material-symbols-outlined') : [];
    for (var i = 0; i < icons.length; i++) {
      if (String(icons[i].textContent || '').trim() === 'person_add') return true;
    }
    return false;
  }

  /* 主锚点：头部右侧的按钮组「flex items-center gap-2 ml-4」 */
  function findHeaderGroup() {
    var list = document.querySelectorAll('[class*="ml-4"]');
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!hasClass(g, 'ml-4') || !hasClass(g, 'flex')) continue;
      if (!g.children || !g.children.length) continue;
      if (!isVisible(g)) continue;
      if (!isProfileHeader(g.parentNode)) continue;
      return g;
    }
    return null;
  }

  /* 兜底锚点：头部里某个图标按钮（person_add / add / search）
     root 可选：只在某个容器内找，通常是头部右侧按钮组 */
  function findIconButton(name, root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('.material-symbols-outlined');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (String(n.textContent || '').trim() !== name) continue;
      if (hasClass(n, 'text-zinc-300')) continue; // 空状态插图，非按钮
      if (!isVisible(n)) continue;
      var btn = n.closest ? n.closest('button,a,[role="button"]') : null;
      if (!btn && n.parentNode && String(n.parentNode.tagName).toLowerCase() === 'button') {
        btn = n.parentNode;
      }
      if (!btn || !isVisible(btn)) continue;
      if (!isProfileHeader(headerOf(btn))) continue;
      return btn;
    }
    return null;
  }

  /* 兼容旧兜底：页面顶部搜索按钮 */
  function findSearchButton() {
    return findIconButton('search');
  }

  var ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="4" width="13" height="16" rx="3"></rect>' +
    '<path d="M16 10h5M18.5 7.5v5"></path>' +
    '<path d="M6.5 9.5h6M6.5 13h4"></path></svg>';

  function buildButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cc-btn';
    btn.setAttribute('data-cc-import', '1');
    btn.setAttribute('aria-label', '导入角色卡');
    btn.title = '导入 SillyTavern 角色卡';
    btn.innerHTML = ICON_SVG;
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      pickFiles();
    });
    return btn;
  }

  /* 把节点插到 ref 的右边（ref 后面没有兄弟节点时直接 append） */
  function insertAfter(node, ref) {
    if (!node || !ref || !ref.parentNode) return false;
    if (ref.nextSibling) ref.parentNode.insertBefore(node, ref.nextSibling);
    else ref.parentNode.appendChild(node);
    return true;
  }

  /* 两端对齐的横排容器（justify-between 之类）：直接加同级会被均匀撑开 */
  function isSpreadRow(node) {
    if (!node || !node.children) return false;
    if (hasClass(node, 'justify-between') || hasClass(node, 'justify-around') || hasClass(node, 'justify-evenly')) return true;
    try {
      var jc = getComputedStyle(node).justifyContent;
      return jc === 'space-between' || jc === 'space-around' || jc === 'space-evenly';
    } catch (e) {
      return false;
    }
  }

  /* 把导入按钮挂到 anchor 右边：
     - anchor 在按钮组里 → 直接插到它后面（组的 gap 自然给出间距）
     - anchor 在两端对齐的页头里 → 用一个小 flex 槽把「原按钮 + 导入按钮」包成一组，
       这样页头的 justify-between 不会把两者撑开 */
  function placeAfter(anchor, btn) {
    var parent = anchor.parentNode;
    if (!parent) return false;
    if (!isSpreadRow(parent)) return insertAfter(btn, anchor);

    var slot = document.createElement('div');
    slot.className = 'cc-slot';
    parent.insertBefore(slot, anchor);
    slot.appendChild(anchor);
    slot.appendChild(btn);
    return true;
  }

  /* 组内最后一个按钮（找不到 person_add 图标时，用它当「添加角色」） */
  function lastButtonIn(group) {
    var kids = (group && group.children) || [];
    for (var i = kids.length - 1; i >= 0; i--) {
      var k = kids[i];
      if (!k) continue;
      if (String(k.tagName || '').toLowerCase() === 'button') return k;
      if (k.getAttribute && k.getAttribute('role') === 'button') return k;
    }
    return null;
  }

  function tryInject() {
    var existing = document.querySelector('[data-cc-import]');
    var stale = false;
    if (existing && existing.isConnected) {
      /* 已经插好；只有「槽里的原按钮被前端重新渲染掉」时才需要重排 */
      var slot = existing.parentNode;
      stale = !!(slot && hasClass(slot, 'cc-slot') && slot.children && slot.children.length < 2);
      if (!stale) return;
    }

    /* 锚点：优先头部按钮组里的「添加角色」(person_add)，其次整页的 person_add / add / search */
    var group = findHeaderGroup();
    var addBtn = group ? findIconButton('person_add', group) || lastButtonIn(group) : null;
    var anchor = addBtn || findIconButton('person_add') || findIconButton('add') || findSearchButton();
    if (!anchor || !anchor.parentNode) return; /* 找不到锚点就保持现状，别把已有按钮删掉 */

    if (stale) {
      try {
        existing.remove();
      } catch (e) {
        return;
      }
    }

    placeAfter(anchor, buildButton());
  }

  function startObserver() {
    injectStyles();
    tryInject();
    var mo = new MutationObserver(function () {
      var existing = document.querySelector('[data-cc-import]');
      if (existing && existing.isConnected) return;
      tryInject();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setInterval(tryInject, 1500);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var fileInput = null;
  function pickFiles() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.png,.json,application/json,image/png';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(fileInput.files || []);
        fileInput.value = '';
        if (files.length) handleFiles(files);
      });
    }
    fileInput.click();
  }

  async function handleFiles(files) {
    var items = [];
    var errors = [];
    for (var i = 0; i < files.length; i++) {
      try {
        items.push(await readCardFile(files[i]));
      } catch (e) {
        errors.push((files[i].name || '文件') + '：' + (e && e.message ? e.message : '解析失败'));
      }
    }
    if (errors.length) toast(errors.join('\n'), 4200);
    if (!items.length) return;
    openModal(items);
  }

  function openModal(items) {
    injectStyles();
    var mask = el('div', 'cc-mask');
    var panel = el('div', 'cc-panel');
    mask.appendChild(panel);

    panel.appendChild(el('div', 'cc-h', '导入角色卡'));
    panel.appendChild(
      el(
        'div',
        'cc-sub',
        '支持 SillyTavern v1 / v2 / v3 的 PNG 或 JSON 卡片；世界书、全部开场白与正则一并写入。'
      )
    );

    items.forEach(function (it) {
      var card = it.card;
      var box = el('div', 'cc-card');
      if (it.avatar) {
        var img = el('img', 'cc-av');
        img.src = it.avatar;
        img.alt = '';
        box.appendChild(img);
      } else {
        box.appendChild(el('div', 'cc-av-ph', String(card.name || '?').slice(0, 1)));
      }

      var info = el('div');
      info.style.minWidth = '0';
      info.appendChild(el('div', 'cc-nm', card.name));

      var bookCount =
        card.characterBook && Array.isArray(card.characterBook.entries)
          ? card.characterBook.entries.length
          : 0;
      var greet = (card.firstMes ? 1 : 0) + card.alternateGreetings.length;

      info.appendChild(
        el(
          'div',
          'cc-meta',
          '开场白 ' + greet + ' 条 · 世界书 ' + bookCount + ' 条 · 正则 ' + card.regexScripts.length + ' 条'
        )
      );
      if (card.creatorNotes) {
        info.appendChild(el('div', 'cc-meta', '备注：' + String(card.creatorNotes).slice(0, 56)));
      }

      var tags = el('div');
      [card.spec, card.creator].forEach(function (t) {
        if (t) tags.appendChild(el('span', 'cc-tag', String(t)));
      });
      info.appendChild(tags);
      box.appendChild(info);
      panel.appendChild(box);
    });

    var optsBox = el('div');
    function opt(label, sub, def) {
      var row = el('label', 'cc-opt');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = def;
      var txt = el('span');
      txt.appendChild(document.createTextNode(label));
      if (sub) txt.appendChild(el('small', null, sub));
      row.appendChild(cb);
      row.appendChild(txt);
      optsBox.appendChild(row);
      return cb;
    }

    var ckWb = opt('导入世界书', '关键词 / 注入位置 / 逻辑深度原样映射，并挂载到该角色的会话', true);
    var ckRe = opt('导入正则', 'ST regex_scripts → 正则库（名称 / 匹配 / 替换）', true);
    var ckGr = opt('保留全部开场白', '关闭则只保留 first_mes', true);
    var ckSys = opt('导入系统提示词 / 历史后指令', '以常驻世界书条目形式落地', true);
    panel.appendChild(optsBox);

    var row = el('div', 'cc-row');
    var cancel = el('button', 'cc-b ghost', '取消');
    var go = el('button', 'cc-b primary', '开始导入');
    cancel.type = 'button';
    go.type = 'button';
    row.appendChild(cancel);
    row.appendChild(go);
    panel.appendChild(row);

    mask.addEventListener('click', function (e) {
      if (e.target === mask) mask.remove();
    });
    cancel.addEventListener('click', function () {
      mask.remove();
    });

    go.addEventListener('click', async function () {
      go.disabled = true;
      cancel.disabled = true;
      go.textContent = '导入中…';
      try {
        var r = await runImport(items, {
          worldbook: ckWb.checked,
          regex: ckRe.checked,
          greetings: ckGr.checked,
          promptOverrides: ckSys.checked
        });
        /* 免重启的关键一步：把刚写进库的记录同步进应用的内存 store */
        var live = await syncLive(r.records, mask);
        showResult(panel, r, live);
      } catch (e) {
        go.disabled = false;
        cancel.disabled = false;
        go.textContent = '开始导入';
        toast('导入失败：' + (e && e.message ? e.message : e), 4200);
        log(e);
      }
    });

    document.body.appendChild(mask);
  }

  function showResult(panel, r, live) {
    var mask = panel.parentNode;
    var ok = !!(live && live.ok);

    panel.innerHTML = '';
    panel.appendChild(el('div', 'cc-h', ok ? '导入完成 · 已加入列表' : '导入完成'));
    panel.appendChild(
      el(
        'div',
        'cc-sub',
        ok
          ? (live.visible
              ? '已直接写进应用的内存，回到 Following 就能看到新角色，不需要重启或刷新。'
              : '数据已写入本地数据库并同步到应用内存，返回 Following 即可看到。')
          : '数据已写入本地数据库，但没能同步到当前页面；点「刷新页面」后生效。'
      )
    );

    var lines = [
      '角色：' + r.contacts + ' 个' + (r.names && r.names.length ? '（' + r.names.join('、') + '）' : ''),
      '世界书分类：' + r.wbCats + ' 个 · 条目：' + r.wbEntries + ' 条',
      '正则分类：' + r.reCats + ' 个 · 条目：' + r.reEntries + ' 条',
      '已自动挂载世界书的会话：' + r.conversations + ' 个'
    ];
    lines.forEach(function (t) {
      panel.appendChild(el('div', 'cc-meta', t));
    });

    if (r.wbEntries > 0 && r.conversations === 0) {
      panel.appendChild(
        el(
          'div',
          'cc-meta',
          '提示：该角色尚无历史会话。首次开始对话后，若世界书未触发，请在会话的世界书里勾选「' +
            (r.names && r.names[0] ? r.names[0] : '角色') +
            ' · 世界书」一次即可。'
        )
      );
    }

    var row = el('div', 'cc-row');
    var done = el('button', 'cc-b primary', '完成');
    done.type = 'button';
    done.addEventListener('click', function () {
      if (mask && mask.parentNode) mask.remove();
    });

    if (!ok) {
      var reload = el('button', 'cc-b ghost', '刷新页面');
      reload.type = 'button';
      reload.addEventListener('click', function () {
        location.reload();
      });
      row.appendChild(reload);
      row.appendChild(done);
    } else {
      row.appendChild(done);
    }
    panel.appendChild(row);

    toast(ok ? '已加入列表：' + r.contacts + ' 个角色' : '已导入 ' + r.contacts + ' 个角色，刷新后可见', 2800);
  }

  /* ------------------------------------------------------------------ *
   * 导入后免重启：直接把新角色写进应用的内存 store
   *
   * 应用把联系人放在一个全局 reactive 对象里（构建产物 index-*.js 导出 s），
   * Following 页就是从它的 contacts 数组渲染的；启动时它从 IndexedDB 水合一次，
   * 之后没有任何对外的「重新读库」接口 —— 这也是以前必须刷新页面的原因。
   *
   * 这里换了个思路：构建产物是 ES 模块，同一个模块在页面里只会执行一次，所以
   * 用 import() 拿到的命名空间和页面自己用的是同一个对象。导入写完库之后，按
   * 「含 contacts / personas / conversations 三个数组」的形状把这个 store 找出来，
   * 把新记录合并进 contacts —— Vue 的响应式会马上刷新列表，不需要重启。
   *
   * 找不到 store（应用换版本、结构变了）时降级：照常写库，并提示可手动刷新。
   * ------------------------------------------------------------------ */
  var STORE_CACHE = null;
  var STORE_WRAPPERS = ['value', 'state', '$state', 'store', 'data'];

  /* store 的形状特征：这几个数组同时存在 */
  function looksLikeStore(v) {
    return !!(
      v &&
      typeof v === 'object' &&
      Array.isArray(v.contacts) &&
      Array.isArray(v.personas) &&
      Array.isArray(v.conversations)
    );
  }

  function unwrapStore(v) {
    if (looksLikeStore(v)) return v;
    if (!v || typeof v !== 'object') return null;
    for (var i = 0; i < STORE_WRAPPERS.length; i++) {
      var inner = v[STORE_WRAPPERS[i]];
      if (looksLikeStore(inner)) return inner;
    }
    return null;
  }

  /* 在已加载的 /assets/*.js 模块里找 store：只 import 已经执行过的模块，无副作用 */
  async function findStore() {
    if (looksLikeStore(STORE_CACHE)) return STORE_CACHE;
    if (looksLikeStore(window.__CC_STORE__)) {
      STORE_CACHE = window.__CC_STORE__;
      return STORE_CACHE;
    }

    var urls = [];
    try {
      var res =
        window.performance && performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      for (var i = 0; i < res.length; i++) {
        var u = res[i] && res[i].name ? String(res[i].name) : '';
        if (u.indexOf('/assets/') < 0 || !/\.js(\?|$)/.test(u)) continue;
        urls.push(u);
      }
    } catch (e) {}

    for (var j = 0; j < urls.length; j++) {
      var ns = null;
      try {
        ns = await import(urls[j]);
      } catch (e) {
        continue;
      }
      var keys = ns ? Object.keys(ns) : [];
      for (var k = 0; k < keys.length; k++) {
        var hit = unwrapStore(ns[keys[k]]);
        if (!hit) continue;
        STORE_CACHE = hit;
        try {
          window.__CC_STORE__ = hit;
        } catch (e) {}
        log('store found at ' + urls[j].split('/').pop() + '#' + keys[k]);
        return STORE_CACHE;
      }
    }
    log('store not found');
    return null;
  }

  /* 合并进 store.contacts：同 id 覆盖，新角色放在最前面 */
  function mergeIntoStore(store, rows) {
    var res = { added: 0, replaced: 0 };
    if (!store || !rows || !rows.length) return res;

    var byId = {};
    var noId = [];
    rows.forEach(function (row) {
      if (!row) return;
      if (row.id != null) byId[String(row.id)] = row;
      else noId.push(row);
    });

    for (var i = 0; i < store.contacts.length; i++) {
      var c = store.contacts[i];
      var key = c && c.id != null ? String(c.id) : '';
      if (key && byId[key]) {
        store.contacts.splice(i, 1, byId[key]);
        delete byId[key];
        res.replaced += 1;
      }
    }

    var add = [];
    rows.forEach(function (row) {
      if (!row || row.id == null) return;
      var k = String(row.id);
      if (byId[k]) {
        add.push(byId[k]);
        delete byId[k];
      }
    });
    add = add.concat(noId);
    for (var n = add.length - 1; n >= 0; n--) store.contacts.unshift(add[n]);
    res.added = add.length;
    return res;
  }

  /* 提醒视图重算一次（个别页面用了快照式列表时的兜底） */
  function pokeUi() {
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e) {}
  }

  function countIn(hay, needle) {
    if (!hay || !needle) return 0;
    var n = 0;
    var i = 0;
    while ((i = hay.indexOf(needle, i)) >= 0) {
      n += 1;
      i += needle.length;
    }
    return n;
  }

  /* 名字是否真的出现在列表里（要排掉我们自己的弹层，弹层里也写着这些名字） */
  function listShows(names, own) {
    var body = '';
    var mine = '';
    try {
      body = String(document.body ? document.body.innerText : '');
    } catch (e) {}
    try {
      mine = own ? String(own.innerText || '') : '';
    } catch (e) {}
    for (var i = 0; i < names.length; i++) {
      if (names[i] && countIn(body, names[i]) > countIn(mine, names[i])) return true;
    }
    return false;
  }

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /* 写库之后调用：把新记录塞进内存 store，页面立刻就能看到 */
  async function syncLive(rows, own) {
    var names = (rows || []).map(function (r) {
      return r && r.name;
    });
    var store = await findStore();
    if (!store) return { ok: false, reason: 'no-store', added: 0, replaced: 0, visible: false };

    var merged = mergeIntoStore(store, rows);
    pokeUi();
    var visible = listShows(names, own);
    if (!visible) {
      await wait(260);
      pokeUi();
      visible = listShows(names, own);
    }
    return { ok: true, added: merged.added, replaced: merged.replaced, visible: visible };
  }

  function boot() {
    try {
      startObserver();
    } catch (e) {
      log('boot failed', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 暴露内部方法，便于调试与自动化验证 */
  window.__CC_IMPORT__ = {
    parsePngChunks: parsePngChunks,
    normalizeCard: normalizeCard,
    readCardFile: readCardFile,
    buildWorldEntries: buildWorldEntries,
    buildRegexEntries: buildRegexEntries,
    buildPersona: buildPersona,
    buildGreetings: buildGreetings,
    buildHandle: buildHandle,
    buildKeywords: buildKeywords,
    mapEntryPosition: mapEntryPosition,
    injectButton: tryInject,
    runImport: runImport,
    /* 免重启相关：找 store / 合并 / 同步（供自动化验证与调试） */
    looksLikeStore: looksLikeStore,
    findStore: findStore,
    mergeIntoStore: mergeIntoStore,
    syncLive: syncLive,
    listShows: listShows
  };
})();
