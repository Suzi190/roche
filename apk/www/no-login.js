/*
 * no-login.js —— 本地预览专用：去掉「账号验证」登录门
 *
 * 只在本地镜像（site/ + _serve.cjs）里生效，不影响真站。
 *
 * 原理：应用的登录门（AuthLock 组件）是否显示，取决于 auth store 里的 isLocked，
 * 而 isLocked 由 localStorage 中这组键推导：
 *     auth_email / auth_session_token / auth_status /
 *     auth_trial_expires_at / auth_approved_at / auth_last_verify_time
 * 判定函数（打包后 index-Bln7eOH8.js 内的 ut()）：
 *     locked = 强制锁 || 无 email
 *              || (status === 'trial' && trialExpiresAt > 0 && now > trialExpiresAt)
 *              || (now - lastVerifyTime > (status === 'trial' ? 6h : 12h))
 * 因此：有 email、status 非 trial、lastVerifyTime 是刚刚 → 不联网直接解锁。
 *
 * 只在本机没登录过（或登录的是本脚本写的那套标记值）时才写入，
 * 真用账号登录过就不会被覆盖。
 *
 * 诊断：window.__ccLs 记录应用读写的 localStorage 键名。
 */
(function () {
  'use strict';

  var MARK = 'local-preview-session';
  var KEYS = {
    email: 'auth_email',
    token: 'auth_session_token',
    status: 'auth_status',
    trial: 'auth_trial_expires_at',
    approved: 'auth_approved_at',
    verify: 'auth_last_verify_time',
  };

  function isOurs() {
    try { return !localStorage.getItem(KEYS.token) || localStorage.getItem(KEYS.token) === MARK; }
    catch (e) { return false; }
  }

  function seed() {
    try {
      if (!isOurs()) return false;
      var now = String(Date.now());
      localStorage.setItem(KEYS.email, 'local-preview@localhost');
      localStorage.setItem(KEYS.token, MARK);
      localStorage.setItem(KEYS.status, 'approved');
      localStorage.setItem(KEYS.trial, '0');
      localStorage.setItem(KEYS.approved, now);
      localStorage.setItem(KEYS.verify, now);
      window.__ccNoLogin = true;
      return true;
    } catch (e) { return false; }
  }

  /* 记录应用用了哪些 localStorage 键（排查用，同时顺手去重） */
  var LS = (window.__ccLs = window.__ccLs || []);
  function rec(kind, key) {
    var line = kind + ':' + key;
    if (LS.length < 200 && LS.indexOf(line) < 0) LS.push(line);
  }
  try {
    var proto = window.Storage && window.Storage.prototype;
    if (proto && !proto.__ccPatched) {
      proto.__ccPatched = true;
      var g = proto.getItem, s = proto.setItem, r = proto.removeItem;
      proto.getItem = function (k) { rec('get', k); return g.call(this, k); };
      proto.setItem = function (k, v) { rec('set', k); return s.call(this, k, v); };
      proto.removeItem = function (k) { rec('del', k); return r.call(this, k); };
    }
  } catch (e) {}

  seed();

  /* 兜底：万一还渲染出了登录遮罩，把它藏掉（只隐藏含密码框的那层 fixed 容器） */
  function hideLock() {
    var pw = document.querySelector('input[type="password"]');
    if (!pw) return;
    var el = pw;
    while (el && el !== document.body) {
      if (getComputedStyle(el).position === 'fixed') {
        el.style.display = 'none';
        window.__ccLockHidden = true;
        return;
      }
      el = el.parentElement;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideLock);
  else hideLock();
  var timer = setInterval(function () {
    hideLock();
    if (window.__ccLockHidden) clearInterval(timer);
  }, 500);
  setTimeout(function () { clearInterval(timer); }, 30000);

  /* 保持 lastVerifyTime 新鲜，避免长时间挂着后被 6h/12h 规则重新上锁 */
  setInterval(function () {
    try {
      if (localStorage.getItem(KEYS.token) === MARK) {
        localStorage.setItem(KEYS.verify, String(Date.now()));
      }
    } catch (e) {}
  }, 60000);
})();

