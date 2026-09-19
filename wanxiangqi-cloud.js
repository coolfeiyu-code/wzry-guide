/* ============================================================================
 * 王者万象棋 · 坚果云配置
 * ----------------------------------------------------------------------------
 * 在用阵容 / 浮窗尺寸 / 主题写进 王者助手.json.js，跟着坚果云走。
 * 打开同目录的 王者助手.html 时自动读这份文件；改收藏后点「保存配置」写回。
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
  var timer = 0;

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

  function idbGet() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('wxq-cloud', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () {
          var db = req.result;
          var g = db.transaction('kv').objectStore('kv').get('dir');
          g.onsuccess = function () { resolve(g.result || null); db.close(); };
          g.onerror = function () { resolve(null); db.close(); };
        };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function idbSet(handle) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('wxq-cloud', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () {
          var db = req.result;
          var tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(handle, 'dir');
          tx.oncomplete = function () { db.close(); resolve(true); };
          tx.onerror = function () { db.close(); resolve(false); };
        };
        req.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }
  function ensurePerm(handle) {
    if (!handle || !handle.queryPermission) return Promise.resolve(handle);
    return handle.queryPermission({ mode: 'readwrite' }).then(function (st) {
      if (st === 'granted') return handle;
      if (!handle.requestPermission) return null;
      return handle.requestPermission({ mode: 'readwrite' }).then(function (st2) {
        return st2 === 'granted' ? handle : null;
      });
    }).catch(function () { return null; });
  }
  function writeHandle(handle, cfg) {
    return handle.getFileHandle(FILE, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(fileText(cfg)).then(function () { return w.close(); });
      });
    });
  }

  function rememberHandle(h) {
    dirHandle = h;
    try { localStorage.setItem('wxq-cloud-bound', '1'); } catch (e) {}
    return idbSet(h);
  }
  function writeNow(h) {
    dirHandle = h;
    return writeHandle(h, snapshot()).then(function () {
      status(true, '已自动保存');
      return true;
    });
  }
  function pickFolder() {
    if (!global.showDirectoryPicker) {
      download(snapshot());
      status(false, '这台浏览器不支持直写文件夹。已下载 ' + FILE + '，覆盖到坚果云「王者万象棋助手」即可');
      return Promise.resolve(false);
    }
    return global.showDirectoryPicker({ id: 'wxq-nutstore', mode: 'readwrite' }).then(function (dir) {
      return rememberHandle(dir).then(function () { return writeNow(dir); });
    }).then(function () {
      status(true, '已记住文件夹，之后会自动保存');
      return true;
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return false;
      download(snapshot());
      status(false, '没选到文件夹。已下载配置，请放到「王者万象棋助手」');
      return false;
    });
  }
  function saveNow() {
    function withHandle(h) {
      if (!h) return pickFolder();
      return ensurePerm(h).then(function (ok) {
        if (ok) return writeNow(ok);
        return pickFolder();
      });
    }
    if (dirHandle) return withHandle(dirHandle);
    return idbGet().then(withHandle);
  }

  function flush() {
    var cfg = snapshot();
    global.WXQ_CLOUD_BOOT = cfg;
    if (!dirHandle) return;
    writeHandle(dirHandle, cfg).then(function () {
      status(true, '已自动保存');
    }).catch(function () {
      dirHandle = null;
      status(false, '点一次保存配置重新授权，之后又会自动保存');
    });
  }
  function touch() {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
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
      + '<button type="button" data-cloud-save title="第一次选「王者万象棋助手」文件夹，之后自动保存">保存配置</button>';
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

  idbGet().then(function (h) {
    if (!h) return;
    dirHandle = h;
    if (!h.queryPermission) {
      status(true, '已记住文件夹，改收藏会自动保存');
      return;
    }
    return h.queryPermission({ mode: 'readwrite' }).then(function (st) {
      if (st === 'granted') status(true, '已记住文件夹，改收藏会自动保存');
      else status(false, '点一次保存配置即可记住，之后自动保存');
    }).catch(function () {});
  });

  global.WXQ_CLOUD = {
    touch: touch,
    save: saveNow,
    snapshot: snapshot
  };
})(window);
