/* ============================================================================
 * 王者万象棋 · 凑卡匹配
 * ----------------------------------------------------------------------------
 * 对局中最真实的决策是「我手里这些牌最接近哪套作业、还缺谁」。这里把官方池
 * 85 个英雄做成可勾选的卡池，勾上之后按重合度给全部阵容（官方库 + 7日无码卡）
 * 排序，标出「已有 N/M，缺某某」。不模拟打架，只做集合运算。
 * 勾选存在 localStorage（wxq-match-v1），刷新不丢。
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'wxq-match-v1';
  var SHOW = 30;
  var picks = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function load() {
    try {
      var o = JSON.parse(global.localStorage.getItem(STORE) || 'null');
      if (o && Array.isArray(o.picks)) picks = o.picks.map(String).filter(Boolean);
    } catch (e) { picks = []; }
  }
  function save() {
    try { global.localStorage.setItem(STORE, JSON.stringify({ v: 1, picks: picks })); } catch (e) {}
  }

  /* ---------- 数据 ---------- */
  // 与 jobs.data() 同构：官方库 + 7日无码卡 + 编辑覆盖层。不导出 jobs 内部，
  // 这里自算一份（WXQ_JOBS._wxqView 缓存键沿用，改过编辑后 jobs 会自己失效）。
  function allLineups() {
    var jobs = global.WXQ_JOBS || { list: [] };
    if (jobs._wxqView) return jobs._wxqView.list;
    var stats = global.WXQ_STATS || { overlay: [], list: [] };
    var ov = {};
    (stats.overlay || []).forEach(function (r) { ov[String(r.officialKey)] = r; });
    var list = (jobs.list || []).map(function (L) {
      var r = ov[String(L.key)];
      var o = L;
      if (r) {
        o = {};
        for (var k in L) o[k] = L[k];
        if (r.stats) o.stats7d = r.stats;
        if (r.bestLords && r.bestLords.length) o.bestLords = r.bestLords;
      }
      if (global.WXQ_EDIT && WXQ_EDIT.apply) o = WXQ_EDIT.apply(o);
      return o;
    });
    (stats.list || []).forEach(function (L) {
      if (global.WXQ_EDIT && WXQ_EDIT.apply) L = WXQ_EDIT.apply(L);
      list.push(L);
    });
    return list;
  }

  function heroPool() {
    // 池子以官方卡面为准（85 个），按阵营分组；出现顺序按官方 id，稳定不跳
    var H = global.WXQ_HEROES || [];
    var groups = {};
    var order = [];
    H.forEach(function (h) {
      if (!h || !h.name) return;
      var f = h.faction || '无阵营';
      if (!groups[f]) { groups[f] = []; order.push(f); }
      groups[f].push(h);
    });
    return { groups: groups, order: order };
  }

  /* ---------- 纯函数：给一套勾选打分（测试直接调） ---------- */
  function rankLineups(pickNames, list) {
    var set = {};
    (pickNames || []).forEach(function (n) { if (n) set[n] = 1; });
    var out = [];
    (list || []).forEach(function (L) {
      var heroes = (L.heroes || []);
      if (!heroes.length) return;
      var matched = [], missing = [];
      heroes.forEach(function (h) {
        if (!h || !h.name) return;
        (set[h.name] ? matched : missing).push(h.name);
      });
      if (!matched.length) return;
      out.push({
        lineup: L,
        matched: matched,
        missing: missing,
        total: heroes.length,
        coreHit: heroes.some(function (h) { return h.spot === 1 && set[h.name]; })
      });
    });
    out.sort(function (a, b) {
      if (b.matched.length !== a.matched.length) return b.matched.length - a.matched.length;
      var ra = a.matched.length / a.total, rb = b.matched.length / b.total;
      if (rb !== ra) return rb - ra;
      if (a.coreHit !== b.coreHit) return a.coreHit ? -1 : 1;
      var ta = (a.lineup.stats7d && a.lineup.stats7d.top3Rate) || 0;
      var tb = (b.lineup.stats7d && b.lineup.stats7d.top3Rate) || 0;
      if (tb !== ta) return tb - ta;
      return (b.lineup.useNum || 0) - (a.lineup.useNum || 0);
    });
    return out;
  }

  /* ---------- 渲染 ---------- */
  function heroImg(name) { return 'wxq-icon/heroes/' + encodeURIComponent(name) + '.png'; }

  function statsLine(L) {
    var s = L.stats7d;
    if (!s) return '';
    var bits = [];
    function pc(n) { n = Number(n); return Number.isFinite(n) && n > 0 ? (Math.round(n * 1000) / 10) + '%' : ''; }
    var t = pc(s.top3Rate), f = pc(s.firstRate);
    if (t) bits.push('前三 ' + t);
    if (f) bits.push('登顶 ' + f);
    if (s.count) bits.push(s.count + ' 场');
    return bits.length ? '<span class="mt-st">' + bits.join(' · ') + '</span>' : '';
  }

  function resultsHtml() {
    if (!picks.length) {
      return '<div class="mt-empty">先在下面勾上你手里的英雄（上阵的 + 备战的），这里会按重合度排出最接近的阵容。</div>';
    }
    var rows = rankLineups(picks, allLineups()).slice(0, SHOW).map(function (r, i) {
      var L = r.lineup;
      var miss = r.missing.map(function (n) {
        return '<span class="mt-miss">' + esc(n) + '</span>';
      }).join('');
      var have = r.matched.map(function (n) {
        return '<span class="mt-have">' + esc(n) + '</span>';
      }).join('');
      var done = r.missing.length === 0 ? '<span class="mt-full">已凑齐</span>' : '';
      return '<button type="button" class="mt-row" data-mt-open="' + esc(L.key) + '">'
        + '<span class="mt-rank">' + (i + 1) + '</span>'
        + '<span class="mt-nm">' + esc(L.name) + (L.source === 'datawxq' ? ' <i class="mt-tag">7日</i>' : '') + done + '</span>'
        + '<span class="mt-cnt">' + r.matched.length + '/' + r.total + '</span>'
        + '<span class="mt-names">' + have + (miss ? '<i class="mt-lack">缺</i>' + miss : '') + '</span>'
        + statsLine(L)
        + '</button>';
    }).join('');
    var n = rankLineups(picks, allLineups()).length;
    return '<div class="mt-list">' + rows + '</div>'
      + (n > SHOW ? '<div class="mt-more">共 ' + n + ' 套有重合，只列前 ' + SHOW + '。</div>' : '');
  }

  function pageHtml() {
    if (!picks.length) load();
    var pool = heroPool();
    var set = {};
    picks.forEach(function (n) { set[n] = 1; });
    var groups = pool.order.map(function (f) {
      var chips = pool.groups[f].map(function (h) {
        var on = !!set[h.name];
        return '<button type="button" class="mt-hero' + (on ? ' on' : '') + '" data-mt-pick="' + esc(h.name) + '" title="' + esc(h.name) + '">'
          + '<img loading="lazy" src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '" onerror="this.style.display=\'none\'">'
          + '<span>' + esc(h.name) + '</span>'
          + '</button>';
      }).join('');
      return '<div class="mt-fac"><div class="mt-fac-n">' + esc(f) + '</div><div class="mt-fac-g">' + chips + '</div></div>';
    }).join('');
    return '<div class="mt-root" data-mt-root>'
      + '<div class="mt-head">'
      + '<button type="button" class="jback" data-mt-back title="返回列表" aria-label="返回列表">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4 7.5 12l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</button>'
      + '<div class="mt-tit"><h1>凑卡匹配</h1>'
      + '<div class="mt-sub">已选 <b data-mt-count>' + picks.length + '</b> 个英雄 · 勾掉即取消</div></div>'
      + (picks.length ? '<button type="button" class="jbtn" data-mt-clear>清空</button>' : '')
      + '</div>'
      + '<div data-mt-results>' + resultsHtml() + '</div>'
      + '<div class="mt-pool">' + groups + '</div>'
      + '</div>';
  }

  /* ---------- 交互：只局部更新，不整页重画（勾一下滚回顶上没法用） ---------- */
  function back() {
    // 匹配视图没有 openKey，closeDetail 会直接 return，必须走 closeView
    if (global.WXQ_JOBS_UI && WXQ_JOBS_UI.closeView) WXQ_JOBS_UI.closeView(false);
    else if (global.WXQ_JOBS_UI && WXQ_JOBS_UI.closeDetail) WXQ_JOBS_UI.closeDetail(false);
  }

  function refresh(root) {
    var res = root.querySelector('[data-mt-results]');
    if (res) res.innerHTML = resultsHtml();
    var cnt = root.querySelector('[data-mt-count]');
    if (cnt) cnt.textContent = String(picks.length);
    var head = root.querySelector('.mt-head');
    var clearBtn = head && head.querySelector('[data-mt-clear]');
    if (picks.length && !clearBtn) {
      var b = global.document.createElement('button');
      b.type = 'button'; b.className = 'jbtn'; b.setAttribute('data-mt-clear', ''); b.textContent = '清空';
      head.appendChild(b);
    } else if (!picks.length && clearBtn) clearBtn.parentNode.removeChild(clearBtn);
  }

  function bind(root) {
    if (root._mtBound) return;
    root._mtBound = true;
    root.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest && t.closest('[data-mt-back]')) { back(); return; }
      var pick = t.closest && t.closest('[data-mt-pick]');
      if (pick) {
        var name = pick.getAttribute('data-mt-pick');
        var i = picks.indexOf(name);
        if (i >= 0) { picks.splice(i, 1); pick.classList.remove('on'); }
        else { picks.push(name); pick.classList.add('on'); }
        save();
        refresh(root);
        return;
      }
      if (t.closest && t.closest('[data-mt-clear]')) {
        picks = [];
        save();
        root.querySelectorAll('.mt-hero.on').forEach(function (x) { x.classList.remove('on'); });
        refresh(root);
        return;
      }
      var openBtn = t.closest && t.closest('[data-mt-open]');
      if (openBtn && global.WXQ_JOBS_UI) {
        global.WXQ_JOBS_UI.open(openBtn.getAttribute('data-mt-open'), false, 'match');
      }
    });
  }

  global.WXQ_MATCH = {
    pageHtml: pageHtml,
    bind: bind,
    back: back,
    rank: rankLineups,
    picks: function () { return picks.slice(); }
  };

  load();
})(window);
