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
  // 触屏手机只看阵容：星标、「在用」筛选、对局浮窗都没有意义（游戏在电脑上）
  function phoneView() {
    return !!(global.WXQ_HUD && WXQ_HUD.touch && WXQ_HUD.touch());
  }
  function esc(s) { return ui().esc ? ui().esc(s) : String(s || ''); }
  function fmt(s) { return ui().fmt ? ui().fmt(s) : esc(s); }
  function data() {
    var jobs = global.WXQ_JOBS || { meta: {}, list: [] };
    if (jobs._wxqView) return jobs._wxqView;
    var stats = global.WXQ_STATS || { overlay: [], list: [] };
    var ov = {};
    (stats.overlay || []).forEach(function (r) { ov[String(r.officialKey)] = r; });
    var list = (jobs.list || []).map(function (L) {
      var r = ov[String(L.key)];
      if (!r) return L;
      var o = {};
      for (var k in L) o[k] = L[k];
      if (r.stats) o.stats7d = r.stats;
      // 棋手适配：来自近7日详情里各棋手自己的前三/登顶/场次，不是推测
      if (r.bestLords && r.bestLords.length) o.bestLords = r.bestLords;
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

  // 登顶率和前三率分开上色：登顶更稀有，用更重的色；前三用次一级的色。
  // 只在卡片副行用，详情页沿用同样标记，避免两处观感不一致。
  function statsLine(L) {
    var s = L.stats7d;
    if (!s) return '';
    var t = pct(s.top3Rate);
    var f = pct(s.firstRate);
    var bits = [];
    if (t) bits.push('<i class="st top3">7日前三 ' + t + '</i>');
    if (f) bits.push('<i class="st first">登顶 ' + f + '</i>');
    // 场次少时比率容易偏高，标出来别当成稳定结论
    if (s.count) bits.push((s.count < 150 ? '<i class="st thin">' + s.count + ' 场·样本少</i>' : s.count + ' 场'));
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

  // 19 位棋手各给一对固定色（按官方 WXQ_PLAYERS 顺序取）：
  // [浅色主题: 深底白字, 深色主题: 亮底深字]。深浅各一套是因为单一色值
  // 在另一套主题上必然糊掉（之前就是这个问题）。两套都不含黑、不重复。
  var LORD_COLORS = [
    ['#B91C1C', '#F2A0A0'],
    ['#C2410C', '#F5B57F'],
    ['#A16207', '#EFCC6A'],
    ['#4D7C0F', '#BCE06E'],
    ['#15803D', '#7FDFA6'],
    ['#0F766E', '#6ED9CB'],
    ['#0E7490', '#74CBE2'],
    ['#0369A1', '#8BC0EE'],
    ['#1D4ED8', '#9CABF0'],
    ['#4338CA', '#AEA6EE'],
    ['#6D28D9', '#C1ACEE'],
    ['#7E22CE', '#D3ACEE'],
    ['#A21CAF', '#E5A4E8'],
    ['#BE185D', '#EE9FC0'],
    ['#BE123C', '#F0A3AC'],
    ['#78350F', '#D8AE8A'],
    ['#334155', '#BCC9DA'],
    ['#155E75', '#93D0DC'],
    ['#9D174D', '#EE99B8']
  ];
  var lordColorMap = null;
  function lordThemePair(name) {
    if (!lordColorMap) {
      lordColorMap = {};
      var P = (ui().PLAYERS) || global.WXQ_PLAYERS || [];
      P.forEach(function (p, i) {
        var pair = LORD_COLORS[i % LORD_COLORS.length];
        lordColorMap[p.name] = { light: pair[0], dark: pair[1] };
      });
    }
    return lordColorMap[name] || { light: '#52525B', dark: '#D4D4D8' };
  }
  function lordColor(name) { return lordThemePair(name).light; }
  function lordChip(name) {
    var pair = lordThemePair(name);
    return '<i class="lc" style="--lc-l:' + pair.light + ';--lc-d:' + pair.dark + '">' + esc(name) + '</i>';
  }
  // 浮窗没有 jobs 的 ui() 上下文，配色表要能被它拿到
  global.WXQ_LORD_COLORS = { pairs: LORD_COLORS, themePair: lordThemePair };
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
    else if (js.filter === 'official') list = list.filter(function (L) { return L.official; });
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
      if (js.sort === 'first') {
        var fa = (a.stats7d && a.stats7d.firstRate) || 0;
        var fb = (b.stats7d && b.stats7d.firstRate) || 0;
        if (fb !== fa) return fb - fa;
      }
      if (js.sort === 'score') {
        var ds = (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0);
        if (ds) return ds;
      } else if (js.sort === 'new') {
        var dt = (b.ts || 0) - (a.ts || 0);
        if (dt) return dt;
      }
      // 默认（使用量）排序：官方教学套置顶 —— 它们使用量是 0，
      // 300 套的规模下否则会沉到最后一页，新手根本看不到。
      if (js.sort === 'use') {
        var ao = a.official ? 1 : 0;
        var bo = b.official ? 1 : 0;
        if (ao !== bo) return bo - ao;
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
    var tag = (L.official ? '<span class="jtag god">官方</span>' : '')
      + (L.hot ? '<span class="jtag hot">热门</span>' : '')
      + (L.beg ? '<span class="jtag beg">新手</span>' : '')
      + (L.badge === '万象棋大神' ? '<span class="jtag god">大神</span>' : '')
      + (L.source === 'datawxq' ? '<span class="jtag d7">7日</span>' : '')
      + (on ? '<span class="jtag using">在用</span>' : '')
      + (global.WXQ_EXPLAIN && global.WXQ_EXPLAIN.match(L) ? '<span class="jtag exp">讲解</span>' : '');
    var sc = parseFloat(L.score) || 0;
    var st = statsLine(L);
    // 卡片上直接标出棋手（各自配色），一眼能看出这套是谁在带
    var lords = cardLordNames(L).map(lordChip).join('');
    return '<article class="jcard" data-job="' + esc(L.key) + '">'
      + (phoneView() ? '' : '<button type="button" class="jstar' + (on ? ' on' : '') + '" data-job-using="' + esc(L.key) + '" title="' + (on ? '取消在用' : '收藏为在用') + '" aria-label="' + (on ? '取消在用' : '收藏为在用') + '">★</button>')
      + '<div class="jcard-avs">' + (faces || '') + '</div>'
      + '<div class="jcard-nm">' + esc(L.name) + '</div>'
      + (lords ? '<div class="jcard-lords">' + lords + '</div>' : '')
      + '<div class="jcard-au">' + esc(L.author || '匿名')
      + (tag ? ' ' + tag : '')
      + (L.source === 'datawxq'
        ? (st ? ' · ' + st : '')
        : ' · ' + wan(L.useNum) + ' 使用' + (sc > 0 ? ' · ' + esc(L.score) + ' 分' : '') + (st ? ' · ' + st : ''))
      + '</div></article>';
  }

  // 卡片上直接标出棋手（各自配色）：有近7日适配数据就以数据为准并用数据的顺序，
  // 没有再退回官方库原文的 lords。用户要求「数据第一位」。
  function cardLordNames(L) {
    var adapt = (L.bestLords || []).length ? L.bestLords
      : ((L.d7 && L.d7.lords) || []);
    if (adapt.length) return adapt.slice(0, 3).map(function (r) { return r.name; });
    return (L.lords || []).slice(0, 3);
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

  // 棋手块：有近7日适配数据就**以数据为准**（名单、顺序、每个棋手自己的成绩都用
  // 统计里的），官方库原文里的 lords 只在没有数据时兜底。用户要求「数据第一位」。
  function lordsHtml(L) {
    var adapt = (L.bestLords || []).length ? L.bestLords
      : ((L.d7 && L.d7.lords) || []).filter(function (r) { return (r.app || 0) >= 0.08; });
    var names, stat = {};
    if (adapt.length) {
      adapt.forEach(function (r) { stat[r.name] = r; });
      names = adapt.map(function (r) { return r.name; });
    } else {
      names = (L.lords || []).slice();
    }
    if (!names.length) return '<div class="jmuted">未标注棋手</div>';
    var html = names.map(function (n) {
      var p = playerByName(n);
      var r = stat[n];
      // 点名字进图鉴（棋手页），配色与卡片一致
      var head = '<div class="jlord-h" data-job-lord-go="' + esc(n) + '">'
        + av(playerImg(n), n, 'jav')
        + '<div><div class="jlord-n">' + lordChip(n) + '</div>'
        + (p ? '<div class="jlord-k">棋手 · 点开图鉴</div>' : '<div class="jlord-k">官方库棋手（图鉴未收录）</div>')
        + '</div></div>';
      // 有统计就把这个棋手用这套的成绩直接摆在名字下面
      var line = r ? '<div class="jlord-stat">'
        + '<span class="rt n">登场 ' + pct(r.app) + (r.count ? ' · ' + r.count + ' 场' : '') + '</span>'
        + (r.top3 != null ? '<span class="rt top3">前三 ' + pct(r.top3) + '</span>' : '')
        + (r.first != null ? '<span class="rt first">登顶 ' + pct(r.first) + '</span>' : '')
        + (r.avg ? '<span class="rt n">平均 ' + Number(r.avg).toFixed(2) + '</span>' : '')
        + '</div>' : '';
      if (!p || !p.skills || !p.skills.length) return '<div class="jlord-block">' + head + line + '</div>';
      var sk = p.skills.map(function (s) {
        return '<div class="jsk"><span class="jsk-k">' + esc(s.kind) + '</span>'
          + '<span class="jsk-n">' + esc(s.name) + '</span>'
          + '<div class="jsk-d">' + fmt(s.desc) + '</div></div>';
      }).join('');
      return '<div class="jlord-block">' + head + line + sk + '</div>';
    }).join('');
    if (adapt.length) {
      html += '<p class="d7-src">棋手与顺序按近7日第三方统计（登场 ≥8% 且 ≥200 场，按前三率排），'
        + '不是官方库原文的棋手标注。数据来自 datawxq.com。</p>';
    }
    return html;
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

  /* ---------- 7 日数据卡专属：把接口带回来的胜率用上 ---------- */
  // 第三方聚类只给统计、不给攻略，所以把「谁胜率高、带什么、配什么天赋」
  // 按胜率排出来，比一句「样本 N 场」有用得多。
  function rateBits(o) {
    var bits = [];
    if (o.top3) bits.push('<span class="rt top3">前三 ' + pct(o.top3) + '</span>');
    if (o.first) bits.push('<span class="rt first">登顶 ' + pct(o.first) + '</span>');
    if (o.count) bits.push('<span class="rt n">' + o.count + ' 场</span>');
    return bits.join('');
  }

  function d7LordsHtml(L) {
    var rows = (L.d7 && L.d7.lords) || [];
    if (!rows.length) return lordsHtml(L);
    return '<div class="d7-list">' + rows.map(function (r) {
      var p = playerByName(r.name);
      return '<div class="d7-row">'
        + '<div class="d7-name">' + av(playerImg(r.name), r.name, 'jav sm')
        + '<b>' + esc(r.name) + '</b>'
        + '<span class="d7-app">登场 ' + pct(r.app) + '</span></div>'
        + (p ? '<div class="d7-sk">' + fmt(p.skill || p.skillDesc || '') + '</div>' : '')
        + '<div class="d7-stats">' + rateBits(r) + (r.avg ? '<span class="rt n">平均名次 ' + r.avg.toFixed(2) + '</span>' : '') + '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function d7TalentsHtml(L) {
    var rows = (L.d7 && L.d7.talents) || [];
    if (!rows.length) return talentsHtml(L);
    return '<div class="d7-list">' + rows.map(function (r) {
      var t = talentByName(r.name);
      return '<div class="d7-row">'
        + '<div class="d7-name">' + av(talentImg(r.name), r.name, 'jav sm')
        + '<b>' + esc(r.name) + '</b>'
        + '<span class="d7-app">登场 ' + pct(r.app) + '</span></div>'
        + (t ? '<div class="d7-sk">' + fmt(t.desc || '') + '</div>' : '')
        + '<div class="d7-stats">' + rateBits(r) + '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function d7BuildsHtml(L) {
    var rows = (L.d7 && L.d7.builds) || [];
    if (!rows.length) return '';
    return '<div class="d7-list">' + rows.map(function (h) {
      return '<div class="d7-row">'
        + '<div class="d7-name">' + av(heroImg(h.name), h.name, 'jav sm')
        + '<b>' + esc(h.name) + '</b>'
        + (h.level ? '<span class="d7-app">平均 ' + h.level + ' 级</span>' : '')
        + (h.awaken ? '<span class="d7-app">觉醒 ' + pct(h.awaken) + '</span>' : '')
        + '</div>'
        + h.builds.map(function (b) {
          return '<div class="d7-build">' + b.items.map(function (e) {
            return av(equipImg(e), e, 'jav eq');
          }).join('') + '<span class="d7-stats">' + rateBits(b) + '</span></div>';
        }).join('')
        + '</div>';
    }).join('') + '</div>';
  }

  function d7VariantsHtml(L) {
    var rows = (L.d7 && L.d7.variants) || [];
    if (!rows.length) return '';
    return '<div class="d7-list">' + rows.map(function (v) {
      var diff = [];
      v.add.forEach(function (n) { diff.push('<span class="d7-add">+' + esc(n) + '</span>'); });
      v.remove.forEach(function (n) { diff.push('<span class="d7-rm">−' + esc(n) + '</span>'); });
      return '<div class="d7-row d7-var">'
        + '<div class="d7-name"><b>' + (v.size ? v.size + ' 人' : '变体') + '</b>'
        + diff.join('') + '</div>'
        + '<div class="d7-stats">' + rateBits({ count: v.count, top3: v.top3 }) + '</div>'
        + '</div>';
    }).join('') + '</div>'
      + ((L.d7 && L.d7.variantCount > rows.length)
        ? '<div class="jmuted">另有 ' + (L.d7.variantCount - rows.length) + ' 种搭配，这里只列场次最多的几种。</div>' : '');
  }

  // 多条参考站位并排，每张图下面标该局名次
  function d7BoardsHtml(L) {
    var boards = (L.d7 && L.d7.boards) || [];
    if (boards.length < 2) return '';
    return '<div class="d7-boards">' + boards.map(function (b, i) {
      return '<div class="d7-board">'
        + '<div class="d7-board-h">参考 ' + (i + 1) + (b.placement ? ' · 第 ' + b.placement + ' 名' : '') + '</div>'
        + boardHtml({ heroes: b.heroes })
        + '</div>';
    }).join('') + '</div>';
  }

  function detailHtml(L) {
    var d7 = L.source === 'datawxq';
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
      + (phoneView() ? '' : '<button type="button" class="jbtn' + (global.WXQ_HUD && WXQ_HUD.has && WXQ_HUD.has(L.key) ? ' on' : '') + '" data-job-using="' + esc(L.key) + '">'
        + (global.WXQ_HUD && WXQ_HUD.has && WXQ_HUD.has(L.key) ? '已在用' : '收藏为在用') + '</button>'
        + '<button type="button" class="jbtn loud" data-hud-open="' + esc(L.key) + '">对局浮窗</button>')
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
      + '<section class="jbox"><h3>棋手 <span>按登场率</span></h3>' + (d7 ? d7LordsHtml(L) : lordsHtml(L)) + '</section>'
      + '<div>'
      + '<section class="jbox"><h3>阵容站位</h3>' + boardHtml(L) + '</section>'
      + '<section class="jbox" style="margin-top:12px"><h3>推荐装备</h3>' + equipsHtml(L) + '</section>'
      + '</div></div>'
      + ((L.ops && L.ops.length) ? '<section class="jbox"><h3>运营思路 <span>前 / 中 / 后期上阵</span></h3>' + opsHtml(L) + '</section>' : '')
      + ((L.talents && L.talents.length) ? '<section class="jbox"><h3>关键天赋</h3>' + (d7 ? d7TalentsHtml(L) : talentsHtml(L)) + '</section>' : '')
      // 7 日数据卡专属：接口带回来的装备组合、变体阵容、多套参考站位
      + (d7 && (L.d7.builds || []).length ? '<section class="jbox"><h3>装备组合 <span>按前三率排序，只列场次≥5 的搭配</span></h3>' + d7BuildsHtml(L) + '</section>' : '')
      + (d7 && (L.d7.variants || []).length ? '<section class="jbox"><h3>同类变体 <span>同一套英雄，换了人之后的数据</span></h3>' + d7VariantsHtml(L) + '</section>' : '')
      + (d7 && (L.d7.boards || []).length > 1 ? '<section class="jbox"><h3>更多参考站位 <span>近 7 日登顶对局</span></h3>' + d7BoardsHtml(L) + '</section>' : '')
      + '</article>';
  }

  // 只用 replaceState 改地址，不用 pushState。
  // Chrome 规定：窗口的会话历史只要超过 1 条，脚本就再也关不掉它。
  // 助手要靠「开浮窗后关掉本窗口」来保证只留一个窗口，所以这里绝不能压历史。
  function setHash(h, push) {
    try {
      history.replaceState({ wxqJobs: 1 }, '', h);
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

  // 棋手名字点开图鉴（棋手弹窗，含技能/秘技/专属）
  function openLord(name) {
    var b = ui();
    if (b.openPlayer) b.openPlayer(name);
    else {
      var p = playerByName(name);
      if (p && b.openCard) b.openCard('player', p.id);
    }
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
    var phone = phoneView();
    var h = '<div class="jbar">'
      + '<div class="jbar-row">' + fbtn('all', '全部') + fbtn('official', '官方') + fbtn('hot', '热门') + fbtn('god', '大神') + fbtn('beg', '新手') + fbtn('d7', '7日数据')
      + (phone ? '' : fbtn('using', usingN ? ('在用 · ' + usingN) : '在用'))
      + (phone || !usingN ? '' : '<button type="button" class="jchip loud" data-hud-open="">对局浮窗</button>')
      + '</div>'
      + '<div class="jbar-row">' + sbtn('use', '使用量') + sbtn('score', '评分') + sbtn('top3', '前三率') + sbtn('first', '登顶率') + sbtn('new', '时间') + lordSel + '</div>'
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
    var lordGo = t.closest && t.closest('[data-job-lord-go]');
    if (lordGo) { openLord(lordGo.getAttribute('data-job-lord-go')); return 'open'; }
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
