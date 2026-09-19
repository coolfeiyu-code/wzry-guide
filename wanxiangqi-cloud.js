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

  function pickFolder() {
    if (!global.showDirectoryPicker) {
      download(snapshot());
      status(false, '已下载 ' + FILE + '，请保存到坚果云根目录（和王者助手.html 放一起）');
      return Promise.resolve(false);
    }
    return global.showDirectoryPicker({ id: 'wxq-nutstore', mode: 'readwrite' }).then(function (dir) {
      dirHandle = dir;
      return idbSet(dir).then(function () { return writeHandle(dir, snapshot()); });
    }).then(function () {
      status(true, '已写入坚果云 · ' + FILE);
      return true;
    }).catch(function () {
      download(snapshot());
      status(false, '已下载配置，请放到坚果云根目录');
      return false;
    });
  }

  function flush() {
    var cfg = snapshot();
    global.WXQ_CLOUD_BOOT = cfg;
    if (!dirHandle) return;
    writeHandle(dirHandle, cfg).then(function () {
      status(true, '已同步 · ' + FILE);
    }).catch(function () {});
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
    bar.innerHTML = '<span data-cloud-msg>在用阵容可跟坚果云走</span>'
      + '<button type="button" data-cloud-save>保存配置</button>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cloud-save]');
      if (b) pickFolder();
    });
    document.body.appendChild(bar);
  }

  if (global.WXQ_CLOUD_BOOT) apply(global.WXQ_CLOUD_BOOT);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintBar);
  } else {
    paintBar();
  }

  idbGet().then(function (h) { return ensurePerm(h); }).then(function (h) {
    if (!h) return;
    dirHandle = h;
    status(true, '坚果云文件夹已连接');
    return h.getFileHandle(FILE).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }).then(function (txt) {
      var m = String(txt).match(/window\.WXQ_CLOUD_BOOT\s*=\s*(\{[\s\S]*\});?/);
      if (!m) return;
      var cfg = parseJson(m[1]);
      if (!cfg) return;
      var boot = global.WXQ_CLOUD_BOOT;
      if (boot && boot.updatedAt && cfg.updatedAt && boot.updatedAt > cfg.updatedAt) return;
      apply(cfg);
      global.WXQ_CLOUD_BOOT = cfg;
      if (global.WXQ_HUD && WXQ_HUD.hydrate) WXQ_HUD.hydrate();
    }).catch(function () {});
  });

  global.WXQ_CLOUD = {
    touch: touch,
    save: pickFolder,
    snapshot: snapshot
  };
})(window);
