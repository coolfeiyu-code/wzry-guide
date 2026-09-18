/* ============================================================================
 * 王者万象棋 · 讲解（替换连锁 tab）
 * ----------------------------------------------------------------------------
 * 只引用：① 官方卡面 desc / kwHelp  ② 官方作业库 brief / ops / effectDesc
 * 不编战斗、不编胜率、不补作业没写过的手法。
 * ========================================================================== */
(function (global) {
  'use strict';

  function ui() { return global.__wxqUI || {}; }
  function esc(s) { return ui().esc ? ui().esc(s) : String(s || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmt(s) { return ui().fmt ? ui().fmt(s) : esc(s); }
  function jobs() { return (global.WXQ_JOBS && global.WXQ_JOBS.list) || []; }

  function heroByName(name) {
    var H = (ui().HEROES) || global.WXQ_HEROES || [];
    for (var i = 0; i < H.length; i++) if (H[i].name === name) return H[i];
    return null;
  }
  function heroNames(L) {
    return (L.heroes || []).map(function (h) { return h.name; });
  }
  function has(names, n) { return names.indexOf(n) >= 0; }
  function hasAny(names, arr) {
    for (var i = 0; i < arr.length; i++) if (has(names, arr[i])) return true;
    return false;
  }

  var ARCH = [
    {
      id: 'mulan',
      name: '花木兰复生',
      when: '花木兰 + 产古币/整备（婉儿、咬金、武则天、露娜）',
      match: function (ns) { return has(ns, '花木兰') && hasAny(ns, ['上官婉儿', '程咬金', '武则天', '露娜']); },
      order: ['花木兰', '上官婉儿', '程咬金', '武则天', '露娜', '太乙真人', '李白'],
      stitch: [
        '花木兰卡面：本回合每使用 5 张古币牌，获得 1 次复生。',
        '上官婉儿卡面：整备时随机对 3 名【河洛】英雄使用古币；程咬金卡面：整备时自己获得并使用古币。整备发生在回合开始。',
        '露娜卡面：登场时随机触发 2 名英雄的整备。所以要先让整备走过一轮，再打出露娜，才会再刷一轮古币。',
        '太乙真人卡面：开团使距离最近的 1 名英雄获得复生，是作业里常见的备选复活。'
      ]
    },
    {
      id: 'sifen',
      name: '三分整备倒转',
      when: '曹操 + 甄姬（常配露娜）',
      match: function (ns) { return has(ns, '曹操') && has(ns, '甄姬'); },
      order: ['曹操', '甄姬', '露娜', '小乔', '周瑜'],
      stitch: [
        '曹操卡面：整备时随机触发 1 名【三分】英雄的登场。',
        '甄姬卡面：登场时获得 1 张其他登场英雄牌。',
        '露娜卡面：登场时再触发整备。于是曹操整备 → 甄姬登场抽牌 → 抽到的登场牌（常见是露娜）打出 → 再触发整备。',
        '作业原文多写：露娜不要急着打出，先捏在手里。'
      ]
    },
    {
      id: 'dahe',
      name: '大河开团',
      when: '虞姬 + 图腾（鬼谷子 / 少司缘 / 大司命）',
      match: function (ns) { return has(ns, '虞姬') && hasAny(ns, ['鬼谷子', '少司缘', '大司命']); },
      order: ['鬼谷子', '少司缘', '大司命', '虞姬', '东皇太一', '张良', '云中君', '公孙离', '瑶', '刘邦'],
      stitch: [
        '鬼谷子 / 少司缘 / 大司命卡面：在场时分别召唤先知 / 因缘 / 往生图腾。',
        '虞姬卡面：开团时场上每有 1 个图腾，自身及随机 2 名不同【大河流域】英雄等级 +1。图腾越多，开团涨得越多。',
        '东皇太一卡面：图腾不会被优先攻击；开团获得每个图腾等级数 15% 的临时等级。',
        '张良卡面：每当有单位触发开团，场上随机 3 名己方英雄等级永久 +1，把开团次数变成全队等级。',
        '刘邦卡面：开团摧毁所有图腾，每摧毁 1 个自身永久 +5 级。这是图腾流的「引爆」，和虞姬吃图腾数量是两条路，作业写了再用。'
      ]
    },
    {
      id: 'riluo',
      name: '日落海整备',
      when: '亚连 / 朵莉亚 / 米莱狄（整备加核心）',
      match: function (ns) { return hasAny(ns, ['亚连', '朵莉亚']) && hasAny(ns, ['亚连', '朵莉亚', '米莱狄', '狂铁']); },
      order: ['亚连', '朵莉亚', '米莱狄', '露娜'],
      stitch: [
        '整备发生在回合开始。亚连卡面：穿戴装备最多的 1 名【日落海】英雄等级 +2，且阿科米亚核心 +1。',
        '朵莉亚卡面：每当有英雄触发整备，随机 3 名英雄及核心等级 +1。整备次数越多，全队加得越多。',
        '米莱狄卡面：整备时召唤物的临时等级及核心再 +3。',
        '露娜卡面：登场再触发整备。作业里常见「留一个打出位打出露娜」，不要一拿到就卖掉。'
      ]
    }
  ];

  function matchArch(L) {
    var ns = heroNames(L);
    for (var i = 0; i < ARCH.length; i++) if (ARCH[i].match(ns)) return ARCH[i];
    return null;
  }

  function jobsOf(arch) {
    return jobs().filter(function (L) { return arch.match(heroNames(L)); });
  }

  function pullTips(L) {
    var texts = [L.brief, L.effectDesc].concat((L.ops || []).map(function (o) { return o.desc; }));
    var re = /手里|不要急着|先购买不用|留在手中|决赛圈|唤醒|集体唤醒|临阵磨枪|全军动员|整备|打出露娜|不用卖掉|捏/;
    var out = [];
    texts.forEach(function (t) {
      if (!t) return;
      String(t).split(/[\n。！？]/).forEach(function (s) {
        s = s.replace(/^\s+|\s+$/g, '');
        if (s.length < 8 || s.length > 120) return;
        if (!re.test(s)) return;
        if (out.indexOf(s) < 0) out.push(s);
      });
    });
    return out;
  }

  function cardBlock(name) {
    var c = heroByName(name);
    if (!c) return '';
    var kw = (c.kwHelp || []).map(function (k) {
      return '<span class="wxq-term" data-k="' + esc(k.name) + '">' + esc(k.name) + '</span>：' + esc(k.desc);
    }).join('　');
    return '<div class="ex-card">'
      + '<img src="' + esc(c.img) + '" alt="' + esc(c.name) + '">'
      + '<div><div class="ex-cn">' + esc(c.name) + '</div>'
      + '<div class="ex-cd">' + fmt(c.desc) + '</div>'
      + (kw ? '<div class="ex-kw">' + kw + '</div>' : '')
      + '</div></div>';
  }

  function pageHtml(L) {
    var arch = matchArch(L);
    var ns = heroNames(L);
    var order = (arch ? arch.order : ns).filter(function (n) { return has(ns, n); });
    var cards = order.map(cardBlock).filter(Boolean).join('');
    var tips = pullTips(L);
    var ops = (L.ops || []).filter(function (o) { return o.desc; });
    var h = '<article class="jdoc ex-doc">'
      + '<button type="button" class="jback" data-job-explain-back="' + esc(L.key) + '">← 返回阵容</button>'
      + '<header class="jdoc-head"><div class="jdoc-tit">'
      + '<h1>讲解 · ' + esc(L.name) + '</h1>'
      + '<div class="jdoc-sub">' + (arch ? esc(arch.name) + ' · ' : '') + '卡面与作业原文，不模拟打架</div>'
      + '</div></header>';
    if (arch) {
      h += '<section class="jbox"><h3>怎么动起来</h3><ol class="ex-ol">';
      arch.stitch.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
      h += '</ol></section>';
    } else {
      h += '<section class="jbox"><h3>怎么动起来</h3><p class="jmuted">这套没有套进整备 / 花木兰复生 / 大河开团 / 日落海整备四类。下面只列上场卡面，避免编造联动。</p></section>';
    }
    if (cards) h += '<section class="jbox"><h3>上场卡面 <span>官方原文</span></h3>' + cards + '</section>';
    if (L.brief) h += '<section class="jbox"><h3>作业怎么写的</h3><p>' + esc(L.brief) + '</p></section>';
    if (ops.length) {
      h += '<section class="jbox"><h3>作业运营原文</h3>';
      ops.forEach(function (o, i) {
        var ph = ['前期', '中期', '后期'][i] || ('第' + (i + 1) + '段');
        h += '<div class="ex-op"><div class="ex-oph">' + ph
          + (o.from || o.to ? ' · ' + o.from + '–' + o.to + ' 回合' : '')
          + '</div><p>' + esc(o.desc).replace(/\n/g, '<br>') + '</p></div>';
      });
      h += '</section>';
    }
    if (L.effectDesc) h += '<section class="jbox"><h3>效果牌原文</h3><p>' + esc(L.effectDesc) + '</p></section>';
    if (tips.length) {
      h += '<section class="jbox ex-tips"><h3>实战要点 <span>从上面原文抽出</span></h3><ul class="ex-ul">';
      tips.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
      h += '</ul></section>';
    }
    h += '</article>';
    return h;
  }

  function hubHtml() {
    var h = '<div class="explain-hub">'
      + '<div class="jbox"><h3>讲解</h3>'
      + '<p>整备、花木兰复生、大河开团这些，靠词条推演页不好读。这里按官方卡面把「谁触发谁」摊开，实战句子只从该套作业原文里抽，不另写打法。</p>'
      + '<p class="jmuted">需要讲解的阵容，详情里会有「讲解这套」。连锁推演已从本页拿掉。</p>'
      + '</div>';
    ARCH.forEach(function (a) {
      var list = jobsOf(a);
      h += '<section class="jbox ex-arch" data-ex-arch="' + a.id + '">'
        + '<h3>' + esc(a.name) + ' <span>' + list.length + ' 套对得上</span></h3>'
        + '<p class="ex-when">上场识别：' + esc(a.when) + '</p>'
        + '<ol class="ex-ol">';
      a.stitch.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
      h += '</ol>';
      if (list.length) {
        h += '<div class="ex-jobs">';
        list.slice(0, 8).forEach(function (L) {
          h += '<button type="button" class="ex-job" data-ex-job="' + esc(L.key) + '">' + esc(L.name) + '</button>';
        });
        if (list.length > 8) h += '<span class="jmuted">等 ' + (list.length - 8) + ' 套，进阵容详情点「讲解这套」</span>';
        h += '</div>';
      }
      h += '</section>';
    });
    h += '</div>';
    return h;
  }

  function render(grid, state) {
    var countEl = document.getElementById('count');
    if (countEl) countEl.textContent = '讲解';
    grid.className = 'jobs-root';
    grid.style.gridTemplateColumns = '';
    var q = (state && state.q) || '';
    if (q) {
      var hit = jobs().filter(function (L) {
        return matchArch(L) && (L.name.indexOf(q) >= 0 || heroNames(L).join('').indexOf(q) >= 0);
      });
      grid.innerHTML = '<div class="jbox"><h3>讲解里搜到 ' + hit.length + ' 套</h3></div>'
        + '<div class="ex-jobs">' + hit.slice(0, 24).map(function (L) {
          return '<button type="button" class="ex-job" data-ex-job="' + esc(L.key) + '">' + esc(L.name) + '</button>';
        }).join('') + '</div>';
    } else {
      grid.innerHTML = hubHtml();
    }
    if (ui().linkify) ui().linkify(grid);
  }

  function onGridClick(e) {
    var t = e.target;
    var job = t.closest && t.closest('[data-ex-job]');
    if (job && global.WXQ_JOBS_UI && WXQ_JOBS_UI.openExplain) {
      WXQ_JOBS_UI.openExplain(job.getAttribute('data-ex-job'));
      return 'open';
    }
    return null;
  }

  global.WXQ_EXPLAIN = {
    match: matchArch,
    pageHtml: pageHtml,
    render: render,
    onGridClick: onGridClick
  };
})(window);
