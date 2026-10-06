/* ============================================================================
 * 王者万象棋 · 个人战绩本
 * ----------------------------------------------------------------------------
 * 7 日大数据是全服均值，个人数据才是自己的真相。每局结束记一笔
 * （哪套阵容 + 第几名），攒起来就能看出「386 套里我用哪几套真的强」。
 * 数据存 localStorage（wxq-records-v1），跟在用阵容走同一条坚果云同步管线
 * （追加并集 + 删除墓碑，合并逻辑在 cloud.js/桥里）。
 * 名次可以手动点，也可以点「截屏识别」让本机同步桥截屏 OCR 自动填。
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'wxq-records-v1';
  var MAX = 2000;
  var BRIDGE_PORT = 17871;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function readStore() {
    try {
      var o = JSON.parse(global.localStorage.getItem(STORE) || 'null');
      if (!o || typeof o !== 'object') return { list: [], del: {} };
      if (!Array.isArray(o.list)) o.list = [];
      if (!o.del || typeof o.del !== 'object') o.del = {};
      return o;
    } catch (e) { return { list: [], del: {} }; }
  }
  function writeStore(st) {
    try { global.localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) {}
  }
  function alive() {
    var st = readStore();
    return st.list.filter(function (r) { return r && r.id && !st.del[r.id]; });
  }

  function add(key, name, rank) {
    var st = readStore();
    st.list.push({
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      at: Date.now(),
      key: String(key || ''),
      name: String(name || '').slice(0, 80),
      rank: Number(rank) || 0
    });
    if (st.list.length > MAX) st.list = st.list.slice(-MAX);
    writeStore(st);
    if (global.WXQ_CLOUD && WXQ_CLOUD.touch) WXQ_CLOUD.touch();
  }
  function remove(id) {
    var st = readStore();
    var has = st.list.some(function (r) { return r && r.id === id; });
    if (!has) return;
    st.list = st.list.filter(function (r) { return r.id !== id; });
    st.del[id] = Date.now();   // 墓碑：删除要能穿透同步（和 using 的 del 同思路）
    writeStore(st);
    if (global.WXQ_CLOUD && WXQ_CLOUD.touch) WXQ_CLOUD.touch();
  }

  /* ---------- 统计 ---------- */
  function stats(list) {
    var byKey = {};
    var games = 0, rankSum = 0, top3 = 0;
    (list || alive()).forEach(function (r) {
      if (!r.rank) return;
      games++; rankSum += r.rank;
      if (r.rank <= 3) top3++;
      var k = r.key || ('n:' + r.name);
      var b = byKey[k] || (byKey[k] = { key: r.key, name: r.name, games: 0, sum: 0, top3: 0, best: 99 });
      b.games++; b.sum += r.rank;
      if (r.rank <= 3) b.top3++;
      if (r.rank < b.best) b.best = r.rank;
    });
    var rows = Object.keys(byKey).map(function (k) {
      var b = byKey[k];
      return { key: b.key, name: b.name, games: b.games, avg: b.sum / b.games, top3: b.top3 / b.games, best: b.best };
    }).sort(function (a, b) {
      if (b.games !== a.games) return b.games - a.games;
      return a.avg - b.avg;
    });
    return {
      rows: rows,
      games: games,
      avg: games ? rankSum / games : 0,
      top3: games ? top3 / games : 0
    };
  }

  /* ---------- 云同步存储访问（合并决策在 cloud.js） ---------- */
  function cloudBase() {
    try {
      if (global.location && location.hostname === '127.0.0.1' && Number(location.port) === BRIDGE_PORT) return '';
      return 'http://127.0.0.1:' + BRIDGE_PORT;
    } catch (e) { return 'http://127.0.0.1:' + BRIDGE_PORT; }
  }

  /* ---------- 渲染 ---------- */
  function heroImg(name) { return 'wxq-icon/heroes/' + encodeURIComponent(name) + '.png'; }

  function lineupNames() {
    var jobs = global.WXQ_JOBS || { list: [] };
    var names = (jobs.list || []).map(function (L) { return L.name; }).filter(Boolean);
    var stats = global.WXQ_STATS || { list: [] };
    (stats.list || []).forEach(function (L) { if (L.name) names.push(L.name); });
    return names.filter(function (n, i) { return names.indexOf(n) === i; });
  }

  function usingLineups() {
    // 在用排最前（最可能刚打完的就是这几套），其余阵容进 datalist 兜底
    var hud = global.WXQ_HUD;
    var out = [];
    if (hud && hud.keys) {
      hud.keys().forEach(function (k) {
        var L = global.WXQ_JOBS_UI && WXQ_JOBS_UI.find ? WXQ_JOBS_UI.find(k) : null;
        out.push({ key: String(k), name: L ? L.name : ('阵容码 ' + k) });
      });
    }
    return out;
  }

  function rankClass(rank) {
    if (rank === 1) return 'r1';
    if (rank <= 3) return 'r3';
    if (rank <= 5) return 'r5';
    return 'r8';
  }

  function rankBtnsHtml(cur) {
    var h = '';
    for (var i = 1; i <= 8; i++) {
      h += '<button type="button" class="mt-rbtn' + (cur === i ? ' on' : '') + '" data-rec-rank="' + i + '">' + i + '</button>';
    }
    return h;
  }

  function contentHtml() {
    var s = stats();
    var using = usingLineups();
    var opts = using.map(function (u) {
      return '<option value="' + esc(u.key) + '">' + esc(u.name) + '</option>';
    }).join('');
    var datalist = lineupNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    var bridgeOn = global.WXQ_CLOUD && WXQ_CLOUD.mode && WXQ_CLOUD.mode() === 'bridge';
    var rows = s.rows.slice(0, 40).map(function (b, i) {
      return '<div class="rc-row' + (b.best === 1 ? ' got1' : '') + '">'
        + '<span class="rc-i">' + (i + 1) + '</span>'
        + '<span class="rc-nm">' + esc(b.name || '（手输名字）') + '</span>'
        + '<span class="rc-g">' + b.games + ' 局</span>'
        + '<span class="rc-a">平均 ' + b.avg.toFixed(2) + '</span>'
        + '<span class="rc-t">前三 ' + Math.round(b.top3 * 100) + '%</span>'
        + '<span class="rc-b">最好 #' + b.best + '</span>'
        + '</div>';
    }).join('');
    var list = alive().slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 60).map(function (r) {
      var d = new Date(r.at);
      var when = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      return '<div class="rc-item" data-rec-id="' + esc(r.id) + '">'
        + '<span class="rc-when">' + esc(when) + '</span>'
        + '<span class="rc-nm">' + esc(r.name || '（未记阵容）') + '</span>'
        + '<span class="rc-rk ' + rankClass(r.rank) + '">' + (r.rank ? '第 ' + r.rank + ' 名' : '未记名次') + '</span>'
        + '<button type="button" class="rc-del" data-rec-del="' + esc(r.id) + '">✕</button>'
        + '</div>';
    }).join('');
    return '<div class="rc-form">'
      + '<div class="rc-line"><label>阵容</label>'
      + (opts
        ? '<select data-rec-key>' + opts + '<option value="__other__">手动输入…</option></select>'
        : '<select data-rec-key><option value="__other__">手动输入…</option></select>')
      + '<input type="text" data-rec-name list="rc-names" placeholder="阵容名" style="display:none">'
      + '<datalist id="rc-names">' + datalist + '</datalist>'
      + '</div>'
      + '<div class="rc-line"><label>名次</label><span data-rec-ranks>' + rankBtnsHtml(0) + '</span></div>'
      + '<div class="rc-line rc-acts">'
      + (bridgeOn ? '<button type="button" class="jbtn" data-rec-capture>截屏识别名次</button>' : '<span class="rc-hint">截屏识别要装同步桥（坚果云文件夹里双击 安装同步桥.cmd）</span>')
      + '<button type="button" class="jbtn pri" data-rec-save disabled>记一笔</button>'
      + '</div>'
      + '<p class="rc-msg" data-rec-msg></p>'
      + '</div>'
      + (s.rows.length ? '<section class="jbox" style="margin-top:14px"><h3>哪套真的强 <span>按局数排</span></h3>' + rows + '</section>' : '')
      + (list ? '<section class="jbox" style="margin-top:14px"><h3>最近战绩 <span>最多显示 60 条</span></h3><div class="rc-list">' + list + '</div></section>' : '');
  }

  function pageHtml() {
    var s = stats();
    return '<div class="mt-root" data-rec-root>'
      + '<div class="mt-head">'
      + '<button type="button" class="jback" data-rec-back title="返回列表" aria-label="返回列表">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4 7.5 12l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</button>'
      + '<div class="mt-tit"><h1>个人战绩</h1>'
      + '<div class="mt-sub">' + (s.games ? s.games + ' 局 · 平均 ' + s.avg.toFixed(2) + ' 名 · 前三率 ' + Math.round(s.top3 * 100) + '%' : '还没记过，打完一局记一笔') + '</div></div>'
      + '</div>'
      + contentHtml()
      + '</div>';
  }

  /* ---------- 交互 ---------- */
  // ⚠ paintRank 重绘名次按钮后，被点过的那个按钮就成了游离节点，再对它
  // closest() 会拿到 null（冒烟实测踩过）。所以这些助手函数一律接收
  // bind 闭包里的 rootEl（#grid，永不游离），不收事件目标。
  var ui = { rank: 0, captureText: '' };

  function msg(rootEl, text, ok) {
    var m = rootEl.querySelector('[data-rec-msg]');
    if (m) { m.textContent = text || ''; m.className = 'rc-msg' + (ok ? ' ok' : (text ? ' bad' : '')); }
  }
  function paintRank(rootEl) {
    var box = rootEl.querySelector('[data-rec-ranks]');
    if (box) box.innerHTML = rankBtnsHtml(ui.rank);
    syncSave(rootEl);
  }
  function syncSave(rootEl) {
    var btn = rootEl.querySelector('[data-rec-save]');
    if (!btn) return;
    var sel = rootEl.querySelector('[data-rec-key]');
    var manual = sel && sel.value === '__other__';
    var nameInput = rootEl.querySelector('[data-rec-name]');
    if (nameInput) nameInput.style.display = manual ? '' : 'none';
    var name = manual ? (nameInput && nameInput.value.trim()) : (sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '');
    btn.disabled = !(ui.rank > 0 && name);
  }

  function capture(rootEl, btn) {
    msg(rootEl, '正在截屏识别…');
    btn.disabled = true;
    fetch(cloudBase() + '/api/capture', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false;
        if (!j || !j.ok) { msg(rootEl, '识别失败：' + ((j && j.err) || '桥没响应') , false); return; }
        if (j.rank) { ui.rank = j.rank; paintRank(rootEl); }
        msg(rootEl, j.rank
          ? '识别到第 ' + j.rank + ' 名，可修正后点「记一笔」。'
          : '没识别出名次。确认游戏在前台、画面停在结算页，或直接手动点。', !!j.rank);
        ui.captureText = String(j.text || '');
      })
      .catch(function (e) {
        btn.disabled = false;
        msg(rootEl, '识别失败：同步桥没开或超时（' + (e && e.message ? e.message : e) + '）', false);
      });
  }

  function bind(rootEl) {
    if (rootEl._rcBound) return;
    rootEl._rcBound = true;
    rootEl.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-rec-back]')) {
        // 战绩视图没有 openKey，closeDetail 会直接 return，必须走 closeView
        if (global.WXQ_JOBS_UI && WXQ_JOBS_UI.closeView) WXQ_JOBS_UI.closeView(false);
        else if (global.WXQ_JOBS_UI && WXQ_JOBS_UI.closeDetail) WXQ_JOBS_UI.closeDetail(false);
        return;
      }
      var rb = t.closest('[data-rec-rank]');
      if (rb) { ui.rank = Number(rb.getAttribute('data-rec-rank')); paintRank(rootEl); return; }
      var cap = t.closest('[data-rec-capture]');
      if (cap) { capture(rootEl, cap); return; }
      var del = t.closest('[data-rec-del]');
      if (del) {
        if (del.getAttribute('data-armed') === '1') { remove(del.getAttribute('data-rec-del')); paintList(rootEl); }
        else { del.setAttribute('data-armed', '1'); del.textContent = '确认删除'; setTimeout(function () { del.removeAttribute('data-armed'); del.textContent = '✕'; }, 2500); }
        return;
      }
      var save = t.closest('[data-rec-save]');
      if (save && !save.disabled) {
        var sel = rootEl.querySelector('[data-rec-key]');
        var manual = sel && sel.value === '__other__';
        var nameInput = rootEl.querySelector('[data-rec-name]');
        var name = manual ? (nameInput && nameInput.value.trim()) : (sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '');
        var key = manual ? '' : (sel ? sel.value : '');
        var rank = ui.rank;
        add(key, name, rank);
        ui.rank = 0;
        paintRank(rootEl);
        paintList(rootEl);
        var s = stats();
        var m = rootEl.querySelector('[data-rec-msg]');
        if (m) { m.textContent = '已记录「' + name + '」第 ' + rank + ' 名，现在是 ' + s.games + ' 局 · 平均 ' + s.avg.toFixed(2); m.className = 'rc-msg ok'; }
        return;
      }
    });
    rootEl.addEventListener('change', function (e) {
      // data-rec-key 是布尔属性，getAttribute 返回空串（不是 null），别直接当真值用
      if (e.target.getAttribute && e.target.getAttribute('data-rec-key') != null) syncSave(rootEl);
    });
    rootEl.addEventListener('input', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-rec-name') != null) syncSave(rootEl);
    });
  }

  // 删除/新增后整块重画（战绩本不在对局中使用，整页重画可接受）。
  // 只换 innerHTML：监听器绑在 root 元素上走事件委托，重画后依然有效，不能重复 bind。
  function paintList(rootEl) {
    var box = rootEl.querySelector('[data-rec-root]');
    if (!box) return;
    var head = box.querySelector('.mt-head');
    var s = stats();
    if (head) {
      head.querySelector('.mt-sub').textContent = s.games
        ? s.games + ' 局 · 平均 ' + s.avg.toFixed(2) + ' 名 · 前三率 ' + Math.round(s.top3 * 100) + '%'
        : '还没记过，打完一局记一笔';
    }
    // 头部之后的旧内容全部移除再重建；监听器绑在 box 上走事件委托，不受影响
    var n;
    while ((n = head ? head.nextSibling : box.firstChild)) box.removeChild(n);
    var frag = global.document.createElement('div');
    frag.innerHTML = contentHtml();
    while (frag.firstChild) {
      n = frag.firstChild;
      frag.removeChild(n);
      box.appendChild(n);
    }
    ui.rank = 0;
  }

  global.WXQ_RECORD = {
    pageHtml: pageHtml,
    bind: bind,
    stats: stats,
    add: add,
    remove: remove,
    readStore: readStore,
    writeStore: writeStore
  };
})(window);
