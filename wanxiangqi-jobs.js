/* ============================================================================
 * 王者万象棋 · 官方阵容作业（jobs UI）
 * ----------------------------------------------------------------------------
 * 只渲染 WXQ_JOBS。数据由 scripts/sync-wxq-lineups.js 从官网推荐库生成。
 * 不模拟打架；阵容码 = key，对应游戏内「导入阵容」。
 * ========================================================================== */
(function (global) {
  'use strict';

  var PAGE = 24;
  var COLS = 7;
  var ROWS = 4;
  var js = { filter: 'all', sort: 'use', page: 1, lord: '' };

  function ui() { return global.__wxqUI || {}; }
  function esc(s) { return ui().esc ? ui().esc(s) : String(s || ''); }
  function data() { return global.WXQ_JOBS || { meta: {}, list: [] }; }

  function wan(n) {
    n = Number(n) || 0;
    if (n >= 10000) {
      var v = (n / 10000);
      return (Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(1)) + '万';
    }
    return String(n);
  }

  function heroImg(name) { return 'wxq-icon/heroes/' + encodeURIComponent(name) + '.png'; }
  function playerImg(name) { return 'wxq-icon/players/' + encodeURIComponent(name) + '_icon.png'; }

  function heroByName(name) {
    var H = (ui().HEROES) || global.WXQ_HEROES || [];
    for (var i = 0; i < H.length; i++) if (H[i].name === name) return H[i];
    return null;
  }
  function playerByName(name) {
    var P = (ui().PLAYERS) || global.WXQ_PLAYERS || [];
    for (var i = 0; i < P.length; i++) if (P[i].name === name) return P[i];
    return null;
  }

  function find(key) {
    var list = data().list || [];
    key = String(key);
    for (var i = 0; i < list.length; i++) if (String(list[i].key) === key) return list[i];
    return null;
  }

  function hay(L) {
    var parts = [L.name, L.author, L.brief, (L.lords || []).join(' '), (L.heroes || []).map(function (h) { return h.name; }).join(' '), (L.tags || []).join(' ')];
    return parts.join(' ').toLowerCase();
  }

  function filtered(q) {
    var list = (data().list || []).slice();
    var qq = (q || '').toLowerCase();
    if (qq) list = list.filter(function (L) { return hay(L).indexOf(qq) >= 0; });
    if (js.filter === 'hot') list = list.filter(function (L) { return L.hot; });
    else if (js.filter === 'god') list = list.filter(function (L) { return L.badge === '万象棋大神'; });
    else if (js.filter === 'beg') list = list.filter(function (L) { return L.beg; });
    if (js.lord) list = list.filter(function (L) { return (L.lords || []).indexOf(js.lord) >= 0; });
    list.sort(function (a, b) {
      if (js.sort === 'score') {
        var ds = (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0);
        if (ds) return ds;
      } else if (js.sort === 'new') {
        var dt = (b.ts || 0) - (a.ts || 0);
        if (dt) return dt;
      }
      if (a.hot && !b.hot) return -1;
      if (!a.hot && b.hot) return 1;
      if (a.hot && b.hot) return (a.hotRank || 99) - (b.hotRank || 99);
      return (b.useNum || 0) - (a.useNum || 0);
    });
    return list;
  }

  function lordOptions() {
    var c = {};
    (data().list || []).forEach(function (L) {
      (L.lords || []).forEach(function (n) { c[n] = (c[n] || 0) + 1; });
    });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (n) {
      return { name: n, n: c[n] };
    });
  }

  function ph(name) {
    return '<span class="jph">' + esc((name || '？').slice(0, 1)) + '</span>';
  }

  function cardHtml(L) {
    var hs = (L.heroes || []).slice(0, 8).map(function (h) {
      return '<span class="hchip">' + esc(h.name) + (h.evo ? '' : '') + '</span>';
    }).join('');
    var lords = (L.lords || []).map(function (n) { return '<span class="hchip p">' + esc(n) + '</span>'; }).join('');
    var tag = (L.hot ? '<span class="jtag hot">热门</span>' : '')
      + (L.badge === '万象棋大神' ? '<span class="jtag god">大神</span>' : '')
      + (L.beg ? '<span class="jtag beg">新手</span>' : '');
    var sc = parseFloat(L.score) || 0;
    return '<article class="jcard" data-job="' + esc(L.key) + '">'
      + '<div class="jcard-top">' + tag
      + '<span class="jcard-use">' + wan(L.useNum) + ' 使用</span>'
      + (sc > 0 ? '<span class="jcard-sc">' + esc(L.score) + ' 分</span>' : '')
      + '</div>'
      + '<div class="jcard-nm">' + esc(L.name) + '</div>'
      + '<div class="jcard-au">' + esc(L.author || '匿名投稿')
      + (L.badge ? ' · ' + esc(L.badge) : '') + '</div>'
      + '<div class="lu-row"><span class="lu-k">棋手</span><span class="chips">' + (lords || '—') + '</span></div>'
      + '<div class="lu-row"><span class="lu-k">英雄</span><span class="chips">' + hs + '</span></div>'
      + (L.brief ? '<div class="jcard-br">' + esc(L.brief) + '</div>' : '')
      + '</article>';
  }

  function boardHtml(L) {
    var map = {};
    (L.heroes || []).forEach(function (h) {
      map[h.x + ',' + h.z] = h;
    });
    var rows = '';
    for (var z = ROWS - 1; z >= 0; z--) {
      var cells = '';
      for (var x = 0; x < COLS; x++) {
        var h = map[x + ',' + z];
        if (!h) { cells += '<div class="jcell"></div>'; continue; }
        cells += '<button type="button" class="jcell filled" data-job-hero="' + esc(h.name) + '" title="' + esc(h.name) + '">'
          + '<img src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
          + ph(h.name)
          + '<span class="jcn">' + esc(h.name) + (h.evo ? ' · 觉' : '') + '</span>'
          + '</button>';
      }
      rows += '<div class="jrow">' + cells + '</div>';
    }
    return '<div class="jboard-wrap"><div class="jboard-lab"><span>前排</span><span>后排</span></div>'
      + '<div class="jboard">' + rows + '</div></div>';
  }

  function open(key) {
    var L = find(key);
    var b = ui();
    if (!L || !b.openModal) return;
    var lords = (L.lords || []).map(function (n) { return '<span class="hchip p">' + esc(n) + '</span>'; }).join('');
    var eqs = [];
    (L.heroes || []).forEach(function (h) {
      if (h.eqs && h.eqs.length) eqs.push('<b>' + esc(h.name) + '</b> · ' + h.eqs.map(esc).join(' ＋ '));
    });
    var ops = (L.ops || []).map(function (o) {
      var r = (o.from && o.to) ? (o.from === o.to ? '第 ' + o.from + ' 回合' : o.from + '–' + o.to + ' 回合') : '';
      var who = (o.main || []).concat(o.sub || []);
      return '<div class="jop"><div class="jop-r">' + esc(r) + (who.length ? ' · ' + who.map(esc).join(' / ') : '') + '</div>'
        + '<div class="jop-d">' + esc(o.desc) + '</div></div>';
    }).join('');
    var tal = (L.talents || []).map(function (n) { return '<span class="hchip">' + esc(n) + '</span>'; }).join('');
    var eff = (L.effects || []).map(function (n) { return '<span class="hchip">' + esc(n) + '</span>'; }).join('');
    var sc = parseFloat(L.score) || 0;
    var pos = L.positionDesc && L.positionDesc !== '如图所示' ? L.positionDesc : '';
    var html = '<div class="m-head">'
      + '<div class="jhead-mark">阵</div>'
      + '<div><div class="m-tit">' + esc(L.name) + '</div>'
      + '<div class="m-sub">' + esc(L.author || '匿名') + (L.badge ? ' · ' + esc(L.badge) : '')
      + ' · ' + wan(L.useNum) + ' 使用' + (sc > 0 ? ' · ' + esc(L.score) + ' 分' : '') + '</div></div>'
      + '<button class="modal-close" onclick="__wxq.close()" aria-label="返回"><span class="mc-x">×</span><span class="mc-back">← 返回</span></button></div>'
      + '<div class="m-scroll">'
      + (L.brief ? '<div class="gnote">' + esc(L.brief) + '</div>' : '')
      + '<div class="jact">'
      + '<button type="button" class="jbtn pri" data-copy-key="' + esc(L.key) + '">复制阵容码</button>'
      + '<button type="button" class="jbtn" data-job-chain="' + esc(L.key) + '">在连锁里打开</button>'
      + '<code class="jcode">' + esc(L.key) + '</code>'
      + '</div>'
      + '<div class="lu-row"><span class="lu-k">棋手</span><span class="chips">' + (lords || '—') + '</span></div>'
      + '<h4>摆法</h4>'
      + boardHtml(L)
      + (pos ? '<div class="jpos">' + esc(pos) + '</div>' : '')
      + '<div class="jleg">上排靠近对手（前排），下排靠近己方（后排）。坐标取自官方阵容库，不是本站推演。</div>'
      + (eqs.length ? '<h4>装备</h4><div class="jops">' + eqs.map(function (x) { return '<div class="jop-d">' + x + '</div>'; }).join('') + '</div>' : '')
      + (L.equipDesc ? '<div class="lu-eq">' + esc(L.equipDesc) + '</div>' : '')
      + (ops ? '<h4>运营节奏</h4><div class="jops">' + ops + '</div>' : '')
      + (tal ? '<h4>天赋</h4><div class="chips" style="margin-top:8px">' + tal + '</div>' + (L.talentDesc ? '<div class="lu-eq">' + esc(L.talentDesc) + '</div>' : '') : '')
      + (eff ? '<h4>效果牌</h4><div class="chips" style="margin-top:8px">' + eff + '</div>' + (L.effectDesc ? '<div class="lu-eq">' + esc(L.effectDesc) + '</div>' : '') : '')
      + '<div class="foot" style="margin-top:16px">来源：王者万象棋官方阵容推荐库 · 阵容码导入游戏即可抄作业。本页不计算胜率。</div>'
      + '</div>';
    b.openModal(html, '#j-' + encodeURIComponent(L.key), { wide: true });
  }

  function openHero(name) {
    var c = heroByName(name);
    var b = ui();
    if (c && b.openCard) b.openCard('hero', c.id);
  }

  function openChain(key) {
    var L = find(key);
    if (!L || !global.WXQ_CHAIN || !global.WXQ_CHAIN.openHeroNames) return;
    var b = ui();
    if (b.closeSilent) b.closeSilent();
    var names = (L.heroes || []).map(function (h) { return h.name; });
    var fx = (L.effects || []).slice();
    global.WXQ_CHAIN.openHeroNames(names, fx);
  }

  function copyKey(key, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? '已复制' : '复制失败';
      setTimeout(function () { btn.textContent = old; }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(key)).then(function () { done(true); }, function () { done(fallback(key)); });
    } else done(fallback(key));
  }
  function fallback(key) {
    try {
      var t = document.createElement('textarea');
      t.value = String(key);
      t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.left = '-9999px';
      document.body.appendChild(t); t.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(t);
      return ok;
    } catch (e) { return false; }
  }

  function render(grid, state) {
    var D = data();
    var q = (state && state.q) || '';
    var list = filtered(q);
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (js.page > pages) js.page = pages;
    if (js.page < 1) js.page = 1;
    var slice = list.slice((js.page - 1) * PAGE, js.page * PAGE);
    var countEl = document.getElementById('count');
    if (countEl) countEl.textContent = list.length + ' 套作业';
    grid.className = 'jobs-root';
    grid.style.gridTemplateColumns = '';

    var lords = lordOptions();
    var fbtn = function (id, lab) {
      return '<button type="button" class="jchip' + (js.filter === id ? ' on' : '') + '" data-job-filter="' + id + '">' + lab + '</button>';
    };
    var sbtn = function (id, lab) {
      return '<button type="button" class="jchip' + (js.sort === id ? ' on' : '') + '" data-job-sort="' + id + '">' + lab + '</button>';
    };
    var lordSel = '<select class="filter jlord" data-job-lord="1"><option value="">全部棋手</option>'
      + lords.map(function (x) {
        return '<option value="' + esc(x.name) + '"' + (js.lord === x.name ? ' selected' : '') + '>' + esc(x.name) + ' · ' + x.n + '</option>';
      }).join('') + '</select>';

    var note = (D.meta && D.meta.note) ? D.meta.note : '';
    var h = '<div class="jobs-head">'
      + '<div class="chain-title">主播作业 · 官方推荐库</div>'
      + '<div class="chain-sub">来自官网阵容推荐 / 热门 / 新手三份公开库，作者栏就是投稿人（含认证「万象棋大神」）。'
      + '<b>不是战斗模拟，也不另算一套最强。</b> 复制阵容码后，在游戏「阵容 → 我的阵容 → 导入」使用。</div>'
      + (note ? '<div class="chain-meta">同步 ' + esc(D.meta.capturedAt) + ' · 共 ' + (D.meta.counts && D.meta.counts.total || list.length) + ' 套 · ' + (D.meta.counts && D.meta.counts.uniqueAuthors || '') + ' 位作者</div>' : '')
      + '</div>'
      + '<div class="jbar">'
      + '<div class="jbar-row">' + fbtn('all', '全部') + fbtn('hot', '热门榜') + fbtn('god', '大神') + fbtn('beg', '官方新手') + '</div>'
      + '<div class="jbar-row">' + sbtn('use', '按使用量') + sbtn('score', '按评分') + sbtn('new', '按时间') + lordSel + '</div>'
      + '</div>';
    if (!slice.length) {
      grid.innerHTML = h + '<div class="empty">没有匹配的作业，换个筛选或关键词试试</div>';
      return;
    }
    h += '<div class="jgrid">' + slice.map(cardHtml).join('') + '</div>';
    if (pages > 1) {
      h += '<div class="jpager">';
      if (js.page > 1) h += '<button type="button" class="jbtn" data-job-page="' + (js.page - 1) + '">上一页</button>';
      h += '<span class="jp-n">' + js.page + ' / ' + pages + '</span>';
      if (js.page < pages) h += '<button type="button" class="jbtn" data-job-page="' + (js.page + 1) + '">下一页</button>';
      h += '</div>';
    }
    grid.innerHTML = h;
  }

  function onGridClick(e) {
    var t = e.target;
    var f = t.closest && t.closest('[data-job-filter]');
    if (f) { js.filter = f.getAttribute('data-job-filter'); js.page = 1; return 'rerender'; }
    var s = t.closest && t.closest('[data-job-sort]');
    if (s) { js.sort = s.getAttribute('data-job-sort'); js.page = 1; return 'rerender'; }
    var p = t.closest && t.closest('[data-job-page]');
    if (p) { js.page = +p.getAttribute('data-job-page') || 1; return 'rerender'; }
    var card = t.closest && t.closest('.jcard[data-job]');
    if (card) { open(card.getAttribute('data-job')); return 'open'; }
    return null;
  }

  function onModalClick(e) {
    var t = e.target;
    var h = t.closest && t.closest('[data-job-hero]');
    if (h) { openHero(h.getAttribute('data-job-hero')); return true; }
    var c = t.closest && t.closest('[data-copy-key]');
    if (c) { copyKey(c.getAttribute('data-copy-key'), c); return true; }
    var ch = t.closest && t.closest('[data-job-chain]');
    if (ch) { openChain(ch.getAttribute('data-job-chain')); return true; }
    return false;
  }

  function onLordChange(sel) {
    js.lord = sel.value || '';
    js.page = 1;
  }

  global.WXQ_JOBS_UI = {
    render: render,
    open: open,
    onGridClick: onGridClick,
    onModalClick: onModalClick,
    onLordChange: onLordChange,
    find: find,
    state: js
  };
})(window);
