/* ============================================================================
 * 王者万象棋 · 坚果云配置
 * ----------------------------------------------------------------------------
 * 在用阵容 / 浮窗尺寸 / 主题写在 王者助手.json.js，跟着坚果云走。
 *
 * 自动读取：发布出来的 王者助手.html 开头会用 <script src="王者助手.json.js">
 *   载入这份配置，页面跑起来之前就已经生效，不需要点任何东西。
 * 自动保存：收藏 / 取消收藏、拖动浮窗、改主题都会立刻静默写回文件，
 *   不弹窗、不点按钮。浏览器要求「写文件夹」必须授权过一次（选一次文件夹），
 *   授权在首次点击页面任意位置时顺手申请，之后这台机器就一直静默。
 * ========================================================================== */
(function (global) {
  'use strict';

  var FILE = '王者助手.json.js';
  var KEYS = {
    using: 'wxq-using-v1',
    hudSize: 'wxq-hud-size',
    hudPos: 'wxq-hud-pos',
    hudDb: 'wxq-hud-db',
    theme: 'wzry-theme'
  };

  var dirHandle = null;   // 文件夹句柄
  var granted = false;    // 已可写，之后全程静默
  var writing = false;    // 正在写
  var dirty = false;      // 写的时候又改了，写完补一次
  var flashTimer = 0;
  var touchTimer = 0;
  var grantAsked = false;

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {}
  }
  function parseJson(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function snapshot() {
    var o = { v: 1, updatedAt: new Date().toISOString() };
    var using = parseJson(lsGet(KEYS.using));
    if (using) o.using = using;
    var size = parseJson(lsGet(KEYS.hudSize));
    if (size) o.hudSize = size;
    var pos = parseJson(lsGet(KEYS.hudPos));
    if (pos) o.hudPos = pos;
    var db = lsGet(KEYS.hudDb);
    if (db != null) o.hudDb = db;
    var theme = lsGet(KEYS.theme);
    if (theme) o.theme = theme;
    return o;
  }
  // 多台机器时两边都可能收藏过：并起来，别让后打开的那台把对方的冲掉。
  function mergeUsing(a, b) {
    var out = [];
    var seen = {};
    var last = '';
    [a, b].forEach(function (o) {
      if (!o) return;
      (o.keys || []).forEach(function (k) {
        k = String(k || '');
        if (!k || seen[k]) return;
        seen[k] = 1;
        out.push(k);
      });
      if (o.last && out.indexOf(String(o.last)) >= 0) last = String(o.last);
    });
    if (!last) last = out[out.length - 1] || '';
    return { keys: out.slice(0, 8), last: last };
  }
  // 云端配置合进本机：并集收藏，其余字段本机没有才采纳。
  function mergeBoot(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    var changed = false;
    if (cfg.using && cfg.using.keys && cfg.using.keys.length) {
      var local = parseJson(lsGet(KEYS.using));
      var merged = mergeUsing(local, cfg.using);
      var before = local ? JSON.stringify({ k: local.keys || [], l: local.last || '' }) : '';
      var after = JSON.stringify({ k: merged.keys, l: merged.last });
      if (before !== after) {
        lsSet(KEYS.using, JSON.stringify(merged));
        changed = true;
      }
    }
    if (cfg.theme && lsGet(KEYS.theme) == null) { lsSet(KEYS.theme, cfg.theme); changed = true; }
    if (cfg.hudSize && lsGet(KEYS.hudSize) == null) { lsSet(KEYS.hudSize, JSON.stringify(cfg.hudSize)); changed = true; }
    if (cfg.hudPos && lsGet(KEYS.hudPos) == null) { lsSet(KEYS.hudPos, JSON.stringify(cfg.hudPos)); changed = true; }
    if (cfg.hudDb != null && lsGet(KEYS.hudDb) == null) { lsSet(KEYS.hudDb, String(cfg.hudDb)); changed = true; }
    return changed;
  }
  function fileText(cfg) {
    return 'window.WXQ_CLOUD_BOOT = ' + JSON.stringify(cfg) + ';\n';
  }
  function download(cfg) {
    var blob = new Blob([fileText(cfg)], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = FILE;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 800);
  }

  function msg(text) {
    var el = document.getElementById('wxqCloudBar');
    if (!el) return;
    var t = el.querySelector('[data-cloud-msg]');
    if (t) t.textContent = text;
    if (el.classList) {
      if (granted) el.classList.add('ok');
      else el.classList.remove('ok');
    }
    var btn = el.querySelector('[data-cloud-save]');
    if (btn) btn.style.display = granted ? 'none' : '';
  }
  function flash(text) {
    msg(text);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      msg(granted ? '已开启自动保存' : '点一下开启自动保存');
    }, 1500);
  }

  function idbOpen() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('wxq-cloud', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function idbGet() {
    return idbOpen().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var g = db.transaction('kv').objectStore('kv').get('dir');
          g.onsuccess = function () { resolve(g.result || null); db.close(); };
          g.onerror = function () { resolve(null); db.close(); };
        } catch (e) { try { db.close(); } catch (e2) {} resolve(null); }
      });
    });
  }
  function idbSet(handle) {
    return idbOpen().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(handle, 'dir');
          tx.oncomplete = function () { db.close(); resolve(true); };
          tx.onerror = function () { db.close(); resolve(false); };
        } catch (e) { try { db.close(); } catch (e2) {} resolve(false); }
      });
    });
  }

  function writeFile(handle, text) {
    return handle.getFileHandle(FILE, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
    });
  }

  // 写的时候又改了，就合并成一次；坚果云偶尔占用文件，失败隔 300ms 再试一次。
  function writeOnce(tries) {
    var cfg = snapshot();
    global.WXQ_CLOUD_BOOT = cfg;
    return writeFile(dirHandle, fileText(cfg)).catch(function (err) {
      if (tries > 0) {
        return new Promise(function (r) { setTimeout(r, 300); }).then(function () { return writeOnce(tries - 1); });
      }
      throw err;
    });
  }
  function queueWrite() {
    if (!dirHandle) return Promise.resolve(false);
    if (writing) { dirty = true; return Promise.resolve(true); }
    writing = true;
    return writeOnce(1).then(function () {
      writing = false;
      granted = true;
      if (dirty) { dirty = false; return queueWrite(); }
      return true;
    }).catch(function () {
      writing = false;
      dirty = false;
      granted = false;
      msg('点一下开启自动保存');
      return false;
    });
  }

  // HUD 的收藏变了：先给页面刷新，再静默写回。
  function touch() {
    if (!granted || !dirHandle) return;
    clearTimeout(touchTimer);
    touchTimer = setTimeout(function () {
      queueWrite().then(function (ok) { if (ok) flash('已自动保存'); });
    }, 250);
  }

  // 打开时读一次云上配置并合进本机，两边收藏取并集。
  // 云端比合并结果旧（或本机有云上没有的）时回写一次，让各台收敛到同一份。
  function pull() {
    if (!dirHandle) return Promise.resolve(false);
    return dirHandle.getFileHandle(FILE).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); })
      .then(function (txt) {
        var m = String(txt).match(/window\.WXQ_CLOUD_BOOT\s*=\s*(\{[\s\S]*\});?/);
        var cfg = m ? parseJson(m[1]) : null;
        if (!cfg) cfg = { v: 1 };
        var cloudKeys = (cfg.using && cfg.using.keys) || [];
        var merged = mergeBoot(cfg);
        var local = parseJson(lsGet(KEYS.using)) || { keys: [], last: '' };
        var union = mergeUsing({ keys: cloudKeys, last: cfg.using && cfg.using.last }, local);
        var stale = union.keys.join('|') !== cloudKeys.join('|');
        if (merged && global.WXQ_HUD && WXQ_HUD.hydrate) WXQ_HUD.hydrate();
        if (merged || stale) {
          return queueWrite().then(function () {
            msg('已并入坚果云里的在用配置');
            return true;
          });
        }
        return false;
      }).catch(function () { return false; });
  }

  function askPermission() {
    if (!dirHandle || !dirHandle.requestPermission) return Promise.resolve(false);
    if (grantAsked) return Promise.resolve(false);
    grantAsked = true;
    return dirHandle.requestPermission({ mode: 'readwrite' }).then(function (st) {
      if (st !== 'granted') return false;
      granted = true;
      msg('已开启自动保存');
      return queueWrite();
    }).catch(function () { return false; });
  }

  function pickFolder() {
    if (!global.showDirectoryPicker) {
      download(snapshot());
      msg('这台浏览器不能直写文件夹，已下载 ' + FILE);
      return Promise.resolve(false);
    }
    return global.showDirectoryPicker({ id: 'wxq-nutstore', mode: 'readwrite' }).then(function (dir) {
      dirHandle = dir;
      granted = true;
      return idbSet(dir).then(function () { return queueWrite(); });
    }).then(function () {
      flash('已开启自动保存');
      return true;
    }).catch(function () { return false; });
  }

  // 手动点：已授权时什么都不用做（因为改动已自动写过），仅在未授权时用。
  function saveNow() {
    if (granted && dirHandle) return queueWrite();
    if (dirHandle) {
      return askPermission().then(function (ok) {
        return ok ? true : pickFolder();
      });
    }
    return pickFolder();
  }

  function paintBar() {
    if (document.getElementById('wxqCloudBar')) return;
    var bar = document.createElement('div');
    bar.id = 'wxqCloudBar';
    bar.className = 'on';
    bar.innerHTML = '<span data-cloud-msg></span>'
      + '<button type="button" data-cloud-save title="只需选一次「王者万象棋助手」文件夹">开启自动保存</button>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cloud-save]');
      if (b) saveNow();
    });
    document.body.appendChild(bar);
    msg(granted ? '已开启自动保存' : '点一下开启自动保存');
  }

  // 注意这里是 merge 而不是 apply：本机可能已经攒了别的收藏，
  // 直接覆盖会把另一台机器上的收藏冲掉（这正是之前丢配置的原因）。
  if (global.WXQ_CLOUD_BOOT) mergeBoot(global.WXQ_CLOUD_BOOT);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintBar);
  } else {
    paintBar();
  }

  // 首次点击页面任意位置时顺手申请授权，用户不用专门去找按钮。
  function onFirstGesture() {
    if (granted || !dirHandle) return;
    askPermission();
  }
  document.addEventListener('pointerdown', onFirstGesture, true);
  document.addEventListener('keydown', onFirstGesture, true);

  idbGet().then(function (h) {
    if (!h) { msg('点一下开启自动保存'); return; }
    dirHandle = h;
    if (!h.queryPermission) {
      granted = true;
      msg('已开启自动保存');
      return pull();
    }
    return h.queryPermission({ mode: 'readwrite' }).then(function (st) {
      if (st === 'granted') {
        granted = true;
        return pull().then(function () { if (!flashTimer) msg('已开启自动保存'); });
      }
      msg('点一下页面任意处即开启自动保存');
    }).catch(function () { msg('点一下开启自动保存'); });
  });

  global.WXQ_CLOUD = {
    touch: touch,
    save: saveNow,
    pull: pull,
    snapshot: snapshot
  };
})(window);
