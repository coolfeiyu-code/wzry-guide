/* ============================================================================
 * 王者万象棋 · 配置同步
 * ----------------------------------------------------------------------------
 * 在用阵容 / 浮窗尺寸 / 主题写在坚果云的 王者助手.json.js，跟着坚果云走。
 *
 * 两条路，优先第一条：
 *  1) 本机同步桥（scripts/wxq-cloud-bridge.js，127.0.0.1:17871）
 *     页面用 fetch 读写，**不需要任何授权、没有任何弹窗**，开机即静默。
 *     桥没开时自动退回第 2 条。
 *  2) 浏览器文件授权（File System Access）
 *     需要点一次「开启自动保存」并选文件夹。注意 file:// 下浏览器不会记住
 *     这个授权，所以每次重开页面都要再点一次 —— 这正是同步桥要解决的问题。
 *
 * 打开页面时先读云上配置，与本机收藏取并集，再静默写回，各台电脑收敛到同一份。
 * ========================================================================== */
(function (global) {
  'use strict';

  var FILE = '王者助手.json.js';
  var BRIDGE_PORT = 17871;
  var KEYS = {
    using: 'wxq-using-v1',
    edits: 'wxq-lineup-edits-v1',
    records: 'wxq-records-v1',
    hudSize: 'wxq-hud-size',
    hudPos: 'wxq-hud-pos',
    hudDb: 'wxq-hud-db',
    theme: 'wzry-theme'
  };

  var bridge = '';        // 同步桥的地址，空 = 不可用
  var mode = 'none';      // 'bridge' | 'file' | 'none'
  var dirHandle = null;
  var granted = false;
  var writing = false;
  var dirty = false;
  var flashTimer = 0;
  var touchTimer = 0;
  var grantAsked = false;
  var bootAt = Date.now();

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
  // 手机只用来翻阵容：坚果云同步、选文件夹、浮窗都用不上，
  // 整条链路直接不启用（不探桥、不显示云条、不请求任何授权）。
  function isPhone() {
    try {
      if (global.WXQ_HUD && WXQ_HUD.touch) return WXQ_HUD.touch();
      if (global.matchMedia && global.matchMedia('(pointer:coarse)').matches) return true;
      var ua = navigator.userAgent || '';
      if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
      return Math.min(screen.width || 0, screen.height || 0) <= 480;
    } catch (e) { return false; }
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
    var edits = parseJson(lsGet(KEYS.edits));
    if (edits && edits.items && Object.keys(edits.items).length) o.edits = edits;
    var records = parseJson(lsGet(KEYS.records));
    if (records && ((records.list && records.list.length) || (records.del && Object.keys(records.del).length))) o.records = records;
    return o;
  }
  // 阵容编辑按套合并：rev 大的赢，rev 相同才看 at。
  // 不能整组按时间戳覆盖，否则慢时钟的电脑会把另一台改过的套清掉。
  function decideEdits(cfgEdits) {
    if (!cfgEdits || !cfgEdits.items || typeof cfgEdits.items !== 'object') return 'none';
    var local = parseJson(lsGet(KEYS.edits)) || { items: {} };
    var localItems = (local.items && typeof local.items === 'object') ? local.items : {};
    var cloudItems = cfgEdits.items;
    var seen = {};
    var items = {};
    var localNewer = false;
    function consider(k) {
      if (!k || seen[k]) return;
      seen[k] = 1;
      var a = localItems[k];
      var b = cloudItems[k];
      var pick = a || b;
      if (a && b) {
        var ar = Number(a.rev || 0);
        var br = Number(b.rev || 0);
        if (br > ar) pick = b;
        else if (ar > br) { pick = a; localNewer = true; }
        else pick = Number(b.at || 0) >= Number(a.at || 0) ? b : a;
      } else if (a && !b) {
        pick = a;
        localNewer = true;
      }
      if (pick) items[k] = pick;
      if (b && (!a || Number(b.rev || 0) > Number(a.rev || 0)) && global.WXQ_EDIT && WXQ_EDIT.noteRemote) {
        WXQ_EDIT.noteRemote(k, b);
      }
    }
    Object.keys(localItems).forEach(consider);
    Object.keys(cloudItems).forEach(consider);
    var same = JSON.stringify(items) === JSON.stringify(localItems);
    if (!same) {
      lsSet(KEYS.edits, JSON.stringify({ items: items }));
      if (global.WXQ_JOBS) delete global.WXQ_JOBS._wxqView;
    }
    if (localNewer) return 'local_newer';
    return same ? 'none' : 'adopt';
  }
  // 返回 'adopt'(云端新，整组覆盖本机) | 'local_newer'(本机新，需写回云端) | 'none'(云端空)
  // 返回 'adopt'(云端有本机没有的，整组收敛) | 'local_newer'(本机有云端没有的，写回) | 'none'(无变化)
  //
  // 关键：不能按时间戳整组覆盖。多台电脑时钟有偏差，慢的那台每次拉云端都会被
  // 覆盖回去，用户表现为「我刚加的阵容一会就没了」。这里改成集合并集：
  //   - 云端有、本机没有 → 采纳云端（多台机器的收藏会互相补齐）
  //   - 本机有、云端没有 → 保留本机并回写（下次 bridgeWrite 会推上去）
  // 删除靠 del 墓碑穿透，不靠时间戳。
  function decideUsing(cfgUsing) {
    if (!cfgUsing || !cfgUsing.keys) return 'none';
    var local = parseJson(lsGet(KEYS.using)) || { keys: [], last: '' };
    var cloudKeys = (cfgUsing.keys || []).map(String).filter(Boolean);
    if (!cloudKeys.length && !(cfgUsing.del && Object.keys(cfgUsing.del).length)) return 'none';

    var localKeys = (local.keys || []).map(String).filter(Boolean);
    var hasNew = false;
    for (var i = 0; i < cloudKeys.length; i++) {
      if (localKeys.indexOf(cloudKeys[i]) < 0) { hasNew = true; break; }
    }
    if (!hasNew) return 'none';   // 云端没有本机缺的东西，不用动

    // 合并：云端顺序在前（云端是大家共同的最新状态），本机独有的追加在后
    var merged = [];
    var seen = {};
    var all = cloudKeys.concat(localKeys);
    for (var j = 0; j < all.length; j++) {
      if (all[j] && !seen[all[j]]) { seen[all[j]] = 1; merged.push(all[j]); }
    }
    merged = merged.slice(0, 1000);
    // ⚠️ 把云端的 del 墓碑也采纳进来。以前只写 keys/last/at/rev 没写 del，
    //    导致：A 机器删了一套 → 云端有墓碑 → A 重启拉云端，本机 rev/del 都没了 →
    //    A 再推云端 → 云端 mergeUsing 因为 A 没有墓碑，就把那套又加回来 →
    //    用户看到「浮窗里一直在显示已下架，明明已经删了」（2026-10-02）。
    //    这里做「墓碑并集 + addAt 取最大」（和桥 mergeUsing 里一样的逻辑）。
    var localDel = (local.del && typeof local.del === 'object') ? local.del : {};
    var cloudDel = (cfgUsing.del && typeof cfgUsing.del === 'object') ? cfgUsing.del : {};
    var delMap = {};
    Object.keys(localDel).forEach(function (k) {
      const t = Number(localDel[k] || 0);
      if (!delMap[k] || t > delMap[k]) delMap[k] = t;
    });
    Object.keys(cloudDel).forEach(function (k) {
      const t = Number(cloudDel[k] || 0);
      if (!delMap[k] || t > delMap[k]) delMap[k] = t;
    });
    // addAt 取最大（整机级别的编辑时间戳）
    var addAtMap = {};
    const allSrcs = [cfgUsing, local];
    allSrcs.forEach(function (src) {
      const at = Number(src.at || 0);
      (src.keys || []).forEach(function (k) {
        const key = String(k);
        if (!key) return;
        if (!addAtMap[key] || at > addAtMap[key]) addAtMap[key] = at;
      });
    });
    const keptKeys = merged.filter(function (k) {
      const t = delMap[k];
      if (!t) return true;
      // 墓碑时间 >= 新增时间 → 这条真的该删
      return t < Number(addAtMap[k] || 0);
    });
    const out = {
      keys: keptKeys,
      last: keptKeys.indexOf(String(cfgUsing.last || '')) >= 0
        ? String(cfgUsing.last)
        : (keptKeys.indexOf(String(local.last || '')) >= 0
           ? String(local.last)
           : (keptKeys[0] || '')),
      at: Math.max(Number(cfgUsing.at || 0), Number(local.at || 0), Date.now()),
      rev: Math.max(Number(cfgUsing.rev || 0), Number(local.rev || 0))
    };
    if (Object.keys(delMap).length) out.del = delMap;
    lsSet(KEYS.using, JSON.stringify(out));
    return 'adopt';
  }
  // 个人战绩合并：战绩是「记完不改」的追加流水，按 id 并集即可，谁的副本都一样。
  // 删除靠 del 墓碑穿透（和 using 同思路）；战绩没有「同 id 重加」的场景，墓碑永续。
  function decideRecords(cfgRecords) {
    if (!cfgRecords || typeof cfgRecords !== 'object') return 'none';
    var cList = Array.isArray(cfgRecords.list) ? cfgRecords.list : [];
    var cDel = (cfgRecords.del && typeof cfgRecords.del === 'object') ? cfgRecords.del : {};
    if (!cList.length && !Object.keys(cDel).length) return 'none';
    var local = parseJson(lsGet(KEYS.records)) || { v: 1, list: [], del: {} };
    var lList = Array.isArray(local.list) ? local.list : [];
    var lDel = (local.del && typeof local.del === 'object') ? local.del : {};
    var byId = {};
    lList.forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    cList.forEach(function (r) { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
    var delMap = {};
    Object.keys(lDel).forEach(function (k) { delMap[k] = Number(lDel[k] || 0); });
    Object.keys(cDel).forEach(function (k) {
      var t = Number(cDel[k] || 0);
      if (!delMap[k] || t > delMap[k]) delMap[k] = t;
    });
    var kept = [];
    lList.concat(cList).forEach(function (r) {
      if (!r || !r.id || delMap[r.id]) return;
      var cur = byId[r.id];
      if (kept.indexOf(cur) < 0) kept.push(cur);
    });
    var out = { v: 1, list: kept, del: delMap };
    var lKept = lList.filter(function (r) { return r && !lDel[r.id]; });
    var same = JSON.stringify(out) === JSON.stringify({ v: 1, list: lKept, del: lDel });
    if (!same) lsSet(KEYS.records, JSON.stringify(out));
    var localOnly = lKept.some(function (r) {
      return !cList.some(function (c) { return c && c.id === r.id; });
    });
    if (localOnly) return 'local_newer';
    return same ? 'none' : 'adopt';
  }
  // 云端配置合进本机：在用阵容按时间戳整组覆盖（删除可穿透），其余字段本机没有才采纳。
  function mergeBoot(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    var changed = false;
    if (decideUsing(cfg.using) === 'adopt') changed = true;
    if (decideEdits(cfg.edits) === 'adopt') changed = true;
    if (decideRecords(cfg.records) === 'adopt') changed = true;
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

  function msg(text, ok) {
    var el = document.getElementById('wxqCloudBar');
    if (!el) return;
    var t = el.querySelector('[data-cloud-msg]');
    if (t) t.textContent = text;
    var good = ok == null ? (granted || mode === 'bridge') : !!ok;
    if (el.classList) el.classList[good ? 'add' : 'remove']('ok');
    var btn = el.querySelector('[data-cloud-save]');
    if (btn) btn.style.display = good ? 'none' : '';
  }
  function idleText() {
    if (mode === 'bridge') return '自动保存已开启（静默同步）';
    if (granted) return '已开启自动保存';
    return '点一下开启自动保存（或双击文件夹里的 安装同步桥.cmd 免掉这一步）';
  }
  function flash(text) {
    msg(text);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { msg(idleText()); }, 1500);
  }

  /* ---------- 同步桥 ---------- */
  // 页面由桥本身托管时同源，直接用相对地址；否则探本机端口。
  function bridgeBase() {
    try {
      if (location.hostname === '127.0.0.1' && Number(location.port) === BRIDGE_PORT) return '';
      return 'http://127.0.0.1:' + BRIDGE_PORT;
    } catch (e) { return 'http://127.0.0.1:' + BRIDGE_PORT; }
  }
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function bridgeCall(pathname, opt, ms) {
    return withTimeout(fetch(bridge + pathname, opt), ms || 2500).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }
  function detectBridge() {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    var base = bridgeBase();
    return withTimeout(fetch(base + '/api/health'), 1800)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok) return false;
        bridge = base;
        mode = 'bridge';
        return true;
      }).catch(function () { return false; });
  }
  function bridgePull() {
    if (mode !== 'bridge') return Promise.resolve(false);
    return bridgeCall('/api/cloud', null, 3000).then(function (j) {
      if (!j || !j.ok) return false;
      var cfg = j.cfg || { v: 1 };
      return afterPull(cfg);
    }).catch(function () { return false; });
  }
  function bridgeWrite() {
    var cfg = snapshot();
    global.WXQ_CLOUD_BOOT = cfg;
    return bridgeCall('/api/cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    }, 3500).then(function (j) {
      if (!j || !j.ok) return false;
      // 关键：把云端 ack 的 using（mergeCfg 最终确定的 at）同步回 localStorage，
      // 让本设备知道「我最后一次成功推到云端的版本号」。否则下次 bridgePull 比较
      // localStorage.at vs 云端 at 没有单调关系，会把本设备旧数据反写覆盖新设备。
      if (j.cfg && j.cfg.using && j.cfg.using.keys) {
        // 必须「全量」回写。以前只写 keys/last/at，把 rev 和 del 丢了：
        //   - rev 一丢，本机 rev 永远是 0，而桥那边 rev 随每次合并递增，
        //     mergeUsing 里 dRev > iRev 恒成立 → 云端永远被当成「较新」，
        //     at 顺序和 last 都取自云端，用户刚点星标收藏的那套不会成为当前阵容。
        //   - del 一丢，本机失去墓碑，删掉的老收藏更容易被别的机器同步回来。
        var ack = j.cfg.using;
        var keep = {
          keys: ack.keys.slice(0, 1000),
          last: String(ack.last || ''),
          at: Number(ack.at || Date.now()),
          rev: Number(ack.rev || 0)
        };
        if (ack.del && typeof ack.del === 'object') keep.del = ack.del;
        lsSet(KEYS.using, JSON.stringify(keep));
      }
      if (j.cfg && j.cfg.edits) {
        var ed = decideEdits(j.cfg.edits);
        if (ed === 'adopt' && global.WXQ_HUD && WXQ_HUD.hydrate) WXQ_HUD.hydrate();
      }
      return true;
    });
  }

  /* ---------- 文件授权（桥不可用时的退路） ---------- */
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
  function writeFileHandle(text) {
    return dirHandle.getFileHandle(FILE, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
    });
  }
  function fileWrite() {
    var cfg = snapshot();
    global.WXQ_CLOUD_BOOT = cfg;
    return writeFileHandle(fileText(cfg));
  }

  /* ---------- 统一的读写 ---------- */
  function queueWrite(tries) {
    if (mode === 'bridge') {
      if (writing) { dirty = true; return Promise.resolve(true); }
      writing = true;
      return bridgeWrite().then(function (ok) {
        writing = false;
        if (dirty) { dirty = false; return queueWrite(); }
        return ok;
      }).catch(function () {
        writing = false;
        dirty = false;
        return false;
      });
    }
    if (granted && dirHandle) {
      return fileWrite().then(function () { return true; }, function () {
        granted = false;
        msg('点一下开启自动保存');
        return false;
      });
    }
    return Promise.resolve(false);
  }
  function scheduledWrite(text) {
    clearTimeout(touchTimer);
    touchTimer = setTimeout(function () {
      queueWrite().then(function (ok) { if (ok) flash(text || '已自动保存'); });
    }, 250);
  }
  // 收藏 / 尺寸 / 主题变了
  function touch() {
    if (mode !== 'bridge' && !(granted && dirHandle)) return;
    scheduledWrite('已自动保存');
  }

  function afterPull(cfg) {
    cfg = cfg || {};
    var d = decideUsing(cfg.using);
    var e = decideEdits(cfg.edits);
    var r = decideRecords(cfg.records);
    if ((d === 'adopt' || e === 'adopt') && global.WXQ_HUD && WXQ_HUD.hydrate) WXQ_HUD.hydrate();
    if (d === 'local_newer' || e === 'local_newer' || r === 'local_newer') return queueWrite();
    return false;
  }
  function pull() {
    if (mode === 'bridge') return bridgePull();
    if (!dirHandle) return Promise.resolve(false);
    return dirHandle.getFileHandle(FILE).then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); })
      .then(function (txt) {
        var m = String(txt).match(/window\.WXQ_CLOUD_BOOT\s*=\s*(\{[\s\S]*\});?/);
        var cfg = m ? parseJson(m[1]) : null;
        if (!cfg) cfg = { v: 1 };
        return afterPull(cfg);
      }).catch(function () { return false; });
  }

  function askPermission() {
    if (!dirHandle || !dirHandle.requestPermission) return Promise.resolve(false);
    if (grantAsked) return Promise.resolve(false);
    grantAsked = true;
    return dirHandle.requestPermission({ mode: 'readwrite' }).then(function (st) {
      if (st !== 'granted') return false;
      granted = true;
      msg(idleText());
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
      mode = 'file';
      return idbSet(dir).then(function () { return queueWrite(); });
    }).then(function () {
      flash('已开启自动保存');
      return true;
    }).catch(function () { return false; });
  }
  function saveNow() {
    if (mode === 'bridge') return queueWrite();
    if (granted && dirHandle) return queueWrite();
    if (dirHandle) return askPermission().then(function (ok) { return ok ? true : pickFolder(); });
    return pickFolder();
  }

  function paintBar() {
    if (isPhone()) return;   // 手机上不显示云同步条
    if (document.getElementById('wxqCloudBar')) return;
    var bar = document.createElement('div');
    bar.id = 'wxqCloudBar';
    bar.className = 'on';
    bar.innerHTML = '<span data-cloud-msg></span>'
      + '<button type="button" data-cloud-save title="装了同步桥就无需这一步；否则选一次「王者万象棋助手」文件夹">开启自动保存</button>';
    bar.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-cloud-save]')) saveNow();
    });
    document.body.appendChild(bar);
    msg(idleText());
  }

  // 注意是 merge 而不是覆盖：本机可能已经攒了别的收藏，
  // 直接覆盖会把另一台机器上的收藏冲掉（2026-07 丢配置就是这个原因）。
  if (global.WXQ_CLOUD_BOOT) mergeBoot(global.WXQ_CLOUD_BOOT);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintBar);
  } else {
    paintBar();
  }

  // 手机上到此为止：不探桥、不读文件、不请求授权、不挂手势监听。
  if (isPhone()) {
    global.WXQ_CLOUD = {
      touch: function () {},
      save: function () { return Promise.resolve(false); },
      pull: function () { return Promise.resolve(false); },
      snapshot: snapshot,
      mode: function () { return 'off'; }
    };
    return;
  }

  detectBridge().then(function (ok) {
    if (ok) {
      msg(idleText());
      return bridgePull();
    }
    // 桥没开：走文件授权这条老路
    return idbGet().then(function (h) {
      if (!h) { msg('点一下开启自动保存'); return; }
      dirHandle = h;
      mode = 'file';
      if (!h.queryPermission) {
        granted = true;
        msg(idleText());
        return pull();
      }
      return h.queryPermission({ mode: 'readwrite' }).then(function (st) {
        if (st === 'granted') {
          granted = true;
          return pull().then(function () { msg(idleText()); });
        }
        msg('点一下页面任意处即开启自动保存');
      }).catch(function () { msg('点一下开启自动保存'); });
    });
  });

  global.WXQ_CLOUD = {
    touch: touch,
    save: saveNow,
    pull: pull,
    snapshot: snapshot,
    mode: function () { return mode; }
  };
})(window);
