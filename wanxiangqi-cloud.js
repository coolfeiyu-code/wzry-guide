/* ============================================================================
 * 王者万象棋 · 坚果云配置
 * ----------------------------------------------------------------------------
 * 在用阵容 / 浮窗尺寸 / 主题写进 王者助手.json.js，跟着坚果云走。
 * 打开同目录的 王者助手.html 时自动读这份文件。
 *
 * 保存要快，所以路径分两档：
 *   1) 已经拿到文件夹授权（本会话内 / 浏览器记住了）→ 点一下就直接写，不等任何异步。
 *   2) 还没有授权 → 才弹一次文件夹选择；选完记住，之后都走第 1 档。
 * 自动保存（改收藏等）在后台合并写入，不会和手动保存抢文件。
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

  var dirHandle = null;
  var granted = false;   // 句柄已拿到 readwrite 授权，可直接写
  var writing = false;
  var dirty = false;
  var idleTimer = 0;

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
  function apply(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.using) lsSet(KEYS.using, JSON.stringify(cfg.using));
    if (cfg.hudSize) lsSet(KEYS.hudSize, JSON.stringify(cfg.hudSize));
    if (cfg.hudPos) lsSet(KEYS.hudPos, JSON.stringify(cfg.hudPos));
    if (cfg.hudDb != null) lsSet(KEYS.hudDb, String(cfg.hudDb));
    if (cfg.theme) {
      lsSet(KEYS.theme, cfg.theme);
      try { document.documentElement.setAttribute('data-theme', cfg.theme); } catch (e) {}
    }
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
  function status(ok, msg) {
    var el = document.getElementById('wxqCloudBar');
    if (!el) return;
    el.className = ok ? 'on ok' : 'on';
    var t = el.querySelector('[data-cloud-msg]');
    if (t) t.textContent = msg;
  }
  function flash(msg) {
    status(true, msg);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      status(true, granted ? '自动保存已开启' : '打开会自动带上已保存的配置');
    }, 1600);
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

  function writeFile(handle, cfg) {
    return handle.getFileHandle(FILE, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(fileText(cfg)).then(function () { return w.close(); });
      });
    });
  }

  // 一旦在写，就把后续请求合并成一次，写完再补。避免连点排队。
  // 坚果云客户端偶尔会短暂占用文件，失败后隔一会儿再试一次。
  function writeOnce(tries) {
    var cfg = snapshot();
    global.WXQ_CLOUD_BOOT = cfg;
    return writeFile(dirHandle, cfg).catch(function (err) {
      if (tries > 0) {
        return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return writeOnce(tries - 1); });
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
      return false;
    });
  }

  function saveNow() {
    // 有授权：直接写，不 await 任何东西，点击就是写。
    if (dirHandle && granted) {
      status(true, '保存中…');
      return queueWrite().then(function (ok) {
        flash(ok ? '已保存' : '保存失败，点一次重新授权');
        return ok;
      });
    }
    // 有句柄但本会话还没确认授权：同步申请（保留用户手势），授权即写。
    if (dirHandle && dirHandle.requestPermission) {
      return dirHandle.requestPermission({ mode: 'readwrite' }).then(function (st) {
        if (st === 'granted') {
          granted = true;
          return queueWrite().then(function () { flash('已保存'); return true; });
        }
        return pickFolder();
      }).catch(function () { return pickFolder(); });
    }
    return pickFolder();
  }

  function pickFolder() {
    if (!global.showDirectoryPicker) {
      download(snapshot());
      status(false, '这台浏览器不能直写文件夹。已下载 ' + FILE + '，拖到坚果云「王者万象棋助手」即可');
      return Promise.resolve(false);
    }
    return global.showDirectoryPicker({ id: 'wxq-nutstore', mode: 'readwrite' }).then(function (dir) {
      dirHandle = dir;
      granted = true;
      return idbSet(dir).then(function () { return queueWrite(); });
    }).then(function () {
      flash('已记住文件夹，之后自动保存');
      return true;
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return false;
      return false;
    });
  }

  function touch() {
    if (!granted || !dirHandle) return;
    clearTimeout(touch._t);
    touch._t = setTimeout(function () {
      queueWrite().then(function (ok) { if (ok) flash('已自动保存'); });
    }, 350);
  }

  function paintBar() {
    if (document.getElementById('wxqCloudBar')) return;
    var bar = document.createElement('div');
    bar.id = 'wxqCloudBar';
    bar.className = 'on';
    bar.innerHTML = '<span data-cloud-msg>'
      + (global.WXQ_CLOUD_BOOT && global.WXQ_CLOUD_BOOT.using && global.WXQ_CLOUD_BOOT.using.keys && global.WXQ_CLOUD_BOOT.using.keys.length
        ? '已自动载入坚果云里的在用配置'
        : '打开会自动带上已保存的配置，不用导入')
      + '</span>'
      + '<button type="button" data-cloud-save title="第一次选「王者万象棋助手」文件夹，之后点一下即保存">保存配置</button>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cloud-save]');
      if (b) saveNow();
    });
    document.body.appendChild(bar);
  }

  if (global.WXQ_CLOUD_BOOT) apply(global.WXQ_CLOUD_BOOT);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintBar);
  } else {
    paintBar();
  }

  // 启动时把句柄取回内存并确认一次授权，之后的点击就不用再等异步了。
  idbGet().then(function (h) {
    if (!h) return;
    dirHandle = h;
    if (!h.queryPermission) { granted = true; status(true, '自动保存已开启'); return; }
    return h.queryPermission({ mode: 'readwrite' }).then(function (st) {
      if (st === 'granted') { granted = true; status(true, '自动保存已开启'); }
      else status(true, '点一次「保存配置」授权，之后自动保存');
    }).catch(function () {});
  });

  global.WXQ_CLOUD = {
    touch: touch,
    save: saveNow,
    snapshot: snapshot
  };
})(window);
