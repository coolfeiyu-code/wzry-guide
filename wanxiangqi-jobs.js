/* ============================================================================
 * 王者万象棋 · 官方阵容库（jobs UI）
 * ----------------------------------------------------------------------------
 * 列表 + 通栏详情。详情排版对齐官网阵容页：玩法 / 站位 / 装备、棋盘、
 * 分阶段运营、关键天赋。不模拟打架。
 * ========================================================================== */
(function (global) {
  'use strict';

  var PAGE = 24;
  var COLS = 7;
  var ROWS = 4;
  var PHASE = ['前期', '中期', '后期'];
  var js = { filter: 'all', sort: 'use', page: 1, lord: '', openKey: '', view: '' };

  function ui() { return global.__wxqUI || {}; }
  function esc(s) { return ui().esc ? ui().esc(s) : String(s || ''); }
  function fmt(s) { return ui().fmt ? ui().fmt(s) : esc(s); }
  function data() {
    var jobs = global.WXQ_JOBS || { meta: {}, list: [] };
    if (jobs._wxqView) return jobs._wxqView;
    var stats = global.WXQ_STATS || { overlay: [], list: [] };
    var ov = {};
    (stats.overlay || []).forEach(function (r) { ov[String(r.officialKey)] = r.stats; });
    var list = (jobs.list || []).map(function (L) {
      var s = ov[String(L.key)];
      if (!s) return L;
      var o = {};
      for (var k in L) o[k] = L[k];
      o.stats7d = s;
      return o;
    });
    (stats.list || []).forEach(function (L) { list.push(L); });
    jobs._wxqView = { meta: jobs.meta, list: list };
    return jobs._wxqView;
  }

  function wan(n) {
    n = Number(n) || 0;
    if (n >= 10000) {
      var v = n / 10000;
      return (Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(1)) + '万';
    }
    return String(n);
  }

  function pct(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) return '';
    return (Math.round(n * 1000) / 10) + '%';
  }

  function statsLine(L) {
    var s = L.stats7d;
    if (!s) return '';
    var t = pct(s.top3Rate);
    var f = pct(s.firstRate);
    var bits = [];
    if (t) bits.push('7日前三 ' + t);
    if (f) bits.push('登顶 ' + f);
    if (s.count) bits.push(s.count + ' 场');
    var m = global.WXQ_STATS && WXQ_STATS.meta;
    if (m && m.dataVersion) bits.push(m.dataVersion);
    if (m && m.capturedAt) bits.push('截至 ' + m.capturedAt);
    return bits.join(' · ');
  }

  function heroImg(name) { return 'wxq-icon/heroes/' + encodeURIComponent(name) + '.png'; }
  function playerImg(name) { return 'wxq-icon/players/' + encodeURIComponent(name) + '_icon.png'; }
  function equipImg(name) { return 'wxq-icon/equips/' + encodeURIComponent(name) + '.png'; }
  function talentImg(name) { return 'wxq-icon/talents/' + encodeURIComponent(name) + '.png'; }

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
  function talentByName(name) {
    var T = global.WXQ_TALENTS || [];
    for (var i = 0; i < T.length; i++) if (T[i].name === name) return T[i];
    return null;
  }

  function find(key) {
    var list = data().list || [];
    key = String(key);
    for (var i = 0; i < list.length; i++) if (String(list[i].key) === key) return list[i];
    return null;
  }

  function hay(L) {
    var parts = [L.name, L.author, L.brief, L.source === 'datawxq' ? '7日数据 datawxq' : '', (L.lords || []).join(' '), (L.heroes || []).map(function (h) { return h.name; }).join(' ')];
    return parts.join(' ').toLowerCase();
  }

  function filtered(q) {
    var list = (data().list || []).slice();
    var qq = (q || '').toLowerCase();
    if (qq) list = list.filter(function (L) { return hay(L).indexOf(qq) >= 0; });
    if (js.filter === 'hot') list = list.filter(function (L) { return L.hot; });
    else if (js.filter === 'god') list = list.filter(function (L) { return L.badge === '万象棋大神'; });
    else if (js.filter === 'beg') list = list.filter(function (L) { return L.beg; });
    else if (js.filter === 'd7') list = list.filter(function (L) { return L.source === 'datawxq'; });
    else if (js.filter === 'using') {
      var using = (global.WXQ_HUD && WXQ_HUD.keys) ? WXQ_HUD.keys() : [];
      list = list.filter(function (L) { return using.indexOf(String(L.key)) >= 0; });
    }
    if (js.lord) list = list.filter(function (L) { return (L.lords || []).indexOf(js.lord) >= 0; });
    list.sort(function (a, b) {
      if (js.filter === 'd7' || js.sort === 'top3') {
        var ta = (a.stats7d && a.stats7d.top3Rate) || 0;
        var tb = (b.stats7d && b.stats7d.top3Rate) || 0;
        if (tb !== ta) return tb - ta;
      }
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
      var ad = a.source === 'datawxq' ? 1 : 0;
      var bd = b.source === 'datawxq' ? 1 : 0;
      if (ad !== bd) return bd - ad;
      if (ad && bd) {
        var ta = (a.stats7d && a.stats7d.top3Rate) || 0;
        var tb = (b.stats7d && b.stats7d.top3Rate) || 0;
        if (tb !== ta) return tb - ta;
      }
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

  function av(src, name, cls, attr) {
    return '<span class="' + (cls || 'jav') + '"' + (attr || '') + '>'
      + '<img src="' + src + '" alt="' + esc(name) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
      + '<i>' + esc((name || '？').slice(0, 1)) + '</i>'
      + '</span>';
  }

  function cardHtml(L) {
    var faces = (L.heroes || []).slice(0, 7).map(function (h) {
      return av(heroImg(h.name), h.name, 'jav sm');
    }).join('');
    var on = global.WXQ_HUD && WXQ_HUD.has && WXQ_HUD.has(L.key);
    var tag = (L.hot ? '<span class="jtag hot">热门</span>' : '')
      + (L.badge === '万象棋大神' ? '<span class="jtag god">大神</span>' : '')
      + (L.source === 'datawxq' ? '<span class="jtag d7">7日</span>' : '')
      + (on ? '<span class="jtag using">在用</span>' : '')
      + (global.WXQ_EXPLAIN && global.WXQ_EXPLAIN.match(L) ? '<span class="jtag exp">讲解</span>' : '');
    var sc = parseFloat(L.score) || 0;
    var st = statsLine(L);
    return '<article class="jcard" data-job="' + esc(L.key) + '">'
      + '<button type="button" class="jstar' + (on ? ' on' : '') + '" data-job-using="' + esc(L.key) + '" title="' + (on ? '取消在用' : '收藏为在用') + '" aria-label="' + (on ? '取消在用' : '收藏为在用') + '">★</button>'
      + '<div class="jcard-avs">' + (faces || '') + '</div>'
      + '<div class="jcard-nm">' + esc(L.name) + '</div>'
      + '<div class="jcard-au">' + esc(L.author || '匿名')
      + (tag ? ' ' + tag : '')
      + (L.source === 'datawxq'
        ? (st ? ' · ' + st : '')
        : ' · ' + wan(L.useNum) + ' 使用' + (sc > 0 ? ' · ' + esc(L.score) + ' 分' : '') + (st ? ' · ' + st : ''))
      + '</div></article>';
  }

  function boardHtml(L) {
    var map = {};
    (L.heroes || []).forEach(function (h) { map[h.x + ',' + h.z] = h; });
    var rows = '';
    for (var z = ROWS - 1; z >= 0; z--) {
      var cells = '';
      for (var x = 0; x < COLS; x++) {
        var h = map[x + ',' + z];
        if (!h) { cells += '<div class="jcell"></div>'; continue; }
        cells += '<button type="button" class="jcell filled" data-job-hero="' + esc(h.name) + '" title="' + esc(h.name) + '">'
          + '<img src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
          + '<i class="jph">' + esc(h.name.slice(0, 1)) + '</i>'
          + '<span class="jcn">' + esc(h.name) + '</span>'
          + '</button>';
      }
      rows += '<div class="jrow">' + cells + '</div>';
    }
    return '<div class="jboard">' + rows + '</div>';
  }

  function lordsHtml(L) {
    var names = L.lords || [];
    if (!names.length) return '<div class="jmuted">未标注棋手</div>';
    return names.map(function (n) {
      var p = playerByName(n);
      var head = '<div class="jlord-h">'
        + av(playerImg(n), n, 'jav')
        + '<div><div class="jlord-n">' + esc(n) + '</div>'
        + (p ? '<div class="jlord-k">棋手</div>' : '<div class="jlord-k">官方库棋手（图鉴未收录）</div>')
        + '</div></div>';
      if (!p || !p.skills || !p.skills.length) return '<div class="jlord-block">' + head + '</div>';
      var sk = p.skills.map(function (s) {
        return '<div class="jsk"><span class="jsk-k">' + esc(s.kind) + '</span>'
          + '<span class="jsk-n">' + esc(s.name) + '</span>'
          + '<div class="jsk-d">' + fmt(s.desc) + '</div></div>';
      }).join('');
      return '<div class="jlord-block">' + head + sk + '</div>';
    }).join('');
  }

  function equipsHtml(L) {
    var rows = (L.heroes || []).filter(function (h) { return h.eqs && h.eqs.length; });
    if (!rows.length) return L.equipDesc ? '' : '<div class="jmuted">这套没有标注装备</div>';
    return rows.map(function (h) {
      var items = h.eqs.map(function (e) {
        return av(equipImg(e), e, 'jav eq') + '<span class="jeq-n">' + esc(e) + '</span>';
      }).join('');
      return '<div class="jeq-row">'
        + av(heroImg(h.name), h.name, 'jav')
        + '<span class="jeq-hero">' + esc(h.name) + '</span>'
        + '<div class="jeq-items">' + items + '</div></div>';
    }).join('');
  }

  function opsHtml(L) {
    var ops = L.ops || [];
    if (!ops.length) return '';
    return ops.map(function (o, i) {
      var label = PHASE[i] || ('阶段 ' + (i + 1));
      var round = (o.from && o.to) ? (o.from === o.to ? o.from + ' 回合' : o.from + '–' + o.to + ' 回合') : '';
      var who = (o.main || []).concat(o.sub || []);
      var faces = who.map(function (n) {
        return '<span class="jphero">' + av(heroImg(n), n, 'jav sm') + '<em>' + esc(n) + '</em></span>';
      }).join('');
      return '<div class="jphase">'
        + '<div class="jph-h">' + esc(label) + (round ? '<span>' + esc(round) + ' · ' + who.length + ' 张</span>' : '') + '</div>'
        + (faces ? '<div class="jph-faces">' + faces + '</div>' : '')
        + (o.desc ? '<p>' + esc(o.desc) + '</p>' : '')
        + '</div>';
    }).join('');
  }

  function talentsHtml(L) {
    var names = L.talents || [];
    if (!names.length) return '';
    return '<div class="jtal-grid">' + names.map(function (n) {
      var t = talentByName(n);
      return '<div class="jtal">'
        + av(talentImg(n), n, 'jav eq')
        + '<div><div class="jtal-n">' + esc(n) + '</div>'
        + '<div class="jtal-d">' + (t ? fmt(t.desc) : '') + '</div></div></div>';
    }).join('') + '</div>';
  }

  function detailHtml(L) {
    var cover = (L.heroes && L.heroes[0]) ? heroImg(L.heroes[0].name) : playerImg((L.lords || [])[0] || '');
    var coverName = (L.heroes && L.heroes[0] && L.heroes[0].name) || (L.lords || [])[0] || '';
    var sc = parseFloat(L.score) || 0;
    var pos = L.positionDesc && L.positionDesc !== '如图所示' ? L.positionDesc : '按图中站位即可。';
    var play = L.brief || '官方推荐库未写玩法介绍。';
    var eqTx = L.equipDesc || '见下方推荐装备。';
    var st = statsLine(L);
    var sm = global.WXQ_STATS && WXQ_STATS.meta;
    var dv = (sm && sm.dataVersion) ? sm.dataVersion : '';
    var dc = (sm && sm.capturedAt) ? ('截至 ' + sm.capturedAt) : '';
    var sub = L.source === 'datawxq'
      ? ('来源 · 万象棋大数据近7日' + (dv ? ' · ' + dv : '') + (dc ? ' · ' + dc : '') + (st ? ' · ' + st : ''))
      : ('作者 · ' + esc(L.author || '匿名')
        + (L.badge ? ' · ' + esc(L.badge) : '')
        + ' · ' + wan(L.useNum) + ' 使用'
        + (sc > 0 ? ' · ' + esc(L.score) + ' 分' : '')
        + (st ? ' · ' + st : ''));
    return '<article class="jdoc">'
      + '<button type="button" class="jback" data-job-back>← 返回列表</button>'
      + '<header class="jdoc-head">'
      + av(cover, coverName, 'jav lg')
      + '<div class="jdoc-tit"><h1>' + esc(L.name) + '</h1>'
      + '<div class="jdoc-sub">' + sub + '</div></div>'
      + '<div class="jdoc-acts">'
      + (L.nocode
        ? '<span class="jmuted">无导入阵容码</span>'
        : '<button type="button" class="jbtn pri" data-copy-key="' + esc(L.key) + '">复制阵容码</button>')
      + '<button type="button" class="jbtn' + (global.WXQ_HUD && WXQ_HUD.has && WXQ_HUD.has(L.key) ? ' on' : '') + '" data-job-using="' + esc(L.key) + '">'
      + (global.WXQ_HUD && WXQ_HUD.has && WXQ_HUD.has(L.key) ? '已在用' : '收藏为在用') + '</button>'
      + '<button type="button" class="jbtn loud" data-hud-open="' + esc(L.key) + '">对局浮窗</button>'
      + (global.WXQ_EXPLAIN && global.WXQ_EXPLAIN.match(L)
        ? '<button type="button" class="jbtn" data-job-explain="' + esc(L.key) + '">讲解这套</button>'
        : '')
      + '</div>'
      + '</header>'
      + '<div class="jtri">'
      + '<section class="jbox"><h3>玩法介绍</h3><p>' + esc(play) + '</p></section>'
      + '<section class="jbox"><h3>站位分析</h3><p>' + esc(pos) + '</p></section>'
      + '<section class="jbox"><h3>装备分析</h3><p>' + esc(eqTx) + '</p></section>'
      + '</div>'
      + '<div class="jtwo">'
      + '<section class="jbox"><h3>推荐棋手</h3>' + lordsHtml(L) + '</section>'
      + '<div>'
      + '<section class="jbox"><h3>阵容站位</h3>' + boardHtml(L) + '</section>'
      + '<section class="jbox" style="margin-top:12px"><h3>推荐装备</h3>' + equipsHtml(L) + '</section>'
      + '</div></div>'
      + ((L.ops && L.ops.length) ? '<section class="jbox"><h3>运营思路 <span>前 / 中 / 后期上阵</span></h3>' + opsHtml(L) + '</section>' : '')
      + ((L.talents && L.talents.length) ? '<section class="jbox"><h3>关键天赋</h3>' + talentsHtml(L) + '</section>' : '')
      + '</article>';
  }

  function setHash(h, push) {
    try {
      if (push) history.pushState({ wxqJobs: 1 }, '', h);
      else history.replaceState({ wxqJobs: 1 }, '', h);
    } catch (e) {}
  }

  function open(key, fromRoute) {
    var L = find(key);
    if (!L) return;
    js.openKey = String(L.key);
    js.view = '';
    if (!fromRoute) setHash('#j-' + encodeURIComponent(L.key), true);
    var grid = document.getElementById('grid');
    if (grid) render(grid, ui().state || { q: '' });
  }

  function openExplain(key, fromRoute) {
    var L = find(key);
    if (!L || !global.WXQ_EXPLAIN) return;
    js.openKey = String(L.key);
    js.view = 'explain';
    if (!fromRoute) setHash('#x-' + encodeURIComponent(L.key), true);
    var st = ui().state;
    if (st && st.type !== 'jobs') {
      st.type = 'jobs';
      var tabs = document.querySelectorAll('#tabs .tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-type') === 'jobs');
      }
    }
    var grid = document.getElementById('grid');
    if (grid) render(grid, st || { q: '', type: 'jobs' });
  }

  function closeDetail(fromRoute) {
    if (!js.openKey) return;
    js.openKey = '';
    js.view = '';
    if (!fromRoute) setHash('#j', true);
    var grid = document.getElementById('grid');
    if (grid) render(grid, ui().state || { q: '' });
  }

  function openHero(name) {
    var c = heroByName(name);
    var b = ui();
    if (c && b.openCard) b.openCard('hero', c.id);
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
    var qEl = document.getElementById('q');
    var countEl = document.getElementById('count');
    if (js.openKey) {
      var L = find(js.openKey);
      if (qEl) qEl.style.display = 'none';
      if (!L) { js.openKey = ''; js.view = ''; }
      else {
        grid.className = 'jobs-root';
        grid.style.gridTemplateColumns = '';
        if (countEl) countEl.textContent = L.name;
        if (js.view === 'explain' && global.WXQ_EXPLAIN && global.WXQ_EXPLAIN.pageHtml) {
          grid.innerHTML = global.WXQ_EXPLAIN.pageHtml(L);
        } else {
          grid.innerHTML = detailHtml(L);
        }
        if (ui().linkify) ui().linkify(grid);
        return;
      }
    }
    if (qEl && state && state.type === 'jobs') {
      qEl.style.display = 'block';
      qEl.placeholder = '搜索阵容 / 作者 / 英雄 / 棋手…';
    }
    var q = (state && state.q) || '';
    var list = filtered(q);
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (js.page > pages) js.page = pages;
    if (js.page < 1) js.page = 1;
    var slice = list.slice((js.page - 1) * PAGE, js.page * PAGE);
    if (countEl) countEl.textContent = list.length + ' 套';
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

    var usingN = (global.WXQ_HUD && WXQ_HUD.count) ? WXQ_HUD.count() : 0;
    var h = '<div class="jbar">'
      + '<div class="jbar-row">' + fbtn('all', '全部') + fbtn('hot', '热门') + fbtn('god', '大神') + fbtn('beg', '新手') + fbtn('d7', '7日数据')
      + fbtn('using', usingN ? ('在用 · ' + usingN) : '在用')
      + (usingN ? '<button type="button" class="jchip loud" data-hud-open="">对局浮窗</button>' : '')
      + '</div>'
      + '<div class="jbar-row">' + sbtn('use', '使用量') + sbtn('score', '评分') + sbtn('top3', '前三率') + sbtn('new', '时间') + lordSel + '</div>'
      + '</div>';
    if (!slice.length) {
      grid.innerHTML = h + '<div class="empty">'
        + (js.filter === 'using' ? '还没有在用阵容。点卡片右上角星标，收藏这几天要打的几套。' : '没有匹配的阵容')
        + '</div>';
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
    if (ui().linkify) ui().linkify(grid);
  }

  function onGridClick(e) {
    var t = e.target;
    var usingBtn = t.closest && t.closest('[data-job-using]');
    if (usingBtn && global.WXQ_HUD) {
      global.WXQ_HUD.toggle(usingBtn.getAttribute('data-job-using'));
      return 'rerender';
    }
    var hudBtn = t.closest && t.closest('[data-hud-open]');
    if (hudBtn && global.WXQ_HUD) {
      global.WXQ_HUD.open(hudBtn.getAttribute('data-hud-open') || '');
      return 'open';
    }
    var back = t.closest && t.closest('[data-job-back]');
    if (back) { closeDetail(false); return 'open'; }
    var hero = t.closest && t.closest('[data-job-hero]');
    if (hero) { openHero(hero.getAttribute('data-job-hero')); return 'open'; }
    var cp = t.closest && t.closest('[data-copy-key]');
    if (cp) { copyKey(cp.getAttribute('data-copy-key'), cp); return 'open'; }
    var exb = t.closest && t.closest('[data-job-explain-back]');
    if (exb) { open(exb.getAttribute('data-job-explain-back')); return 'open'; }
    var ex = t.closest && t.closest('[data-job-explain]');
    if (ex) { openExplain(ex.getAttribute('data-job-explain')); return 'open'; }
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

  function onModalClick() { return false; }

  function onLordChange(sel) {
    js.lord = sel.value || '';
    js.page = 1;
  }

  global.WXQ_JOBS_UI = {
    render: render,
    open: open,
    openExplain: openExplain,
    closeDetail: closeDetail,
    onGridClick: onGridClick,
    onModalClick: onModalClick,
    onLordChange: onLordChange,
    find: find,
    state: js
  };
})(window);
