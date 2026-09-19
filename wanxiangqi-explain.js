/* ============================================================================
 * 王者万象棋 · 讲解
 * ----------------------------------------------------------------------------
 * 卡面、词条、阵容库原文保持官方；「读懂这套 / 这一回合」是按卡面触发顺序写的读法，
 * 不编胜率、不编没写在卡面上的数值。
 * ========================================================================== */
(function (global) {
  'use strict';

  function ui() { return global.__wxqUI || {}; }
  function esc(s) { return ui().esc ? ui().esc(s) : String(s || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmt(s) { return ui().fmt ? ui().fmt(s) : esc(s); }
  function jobs() {
    var a = (global.WXQ_JOBS && global.WXQ_JOBS.list) || [];
    var b = (global.WXQ_STATS && global.WXQ_STATS.list) || [];
    return a.concat(b);
  }

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
      id: 'lixin',
      name: '李信牺牲',
      when: '李信 + 牺牲位（铠 / 花木兰 / 盾山 / 钟馗 / 苏烈）',
      match: function (ns) { return has(ns, '李信') && hasAny(ns, ['铠', '花木兰', '盾山', '钟馗', '苏烈']); },
      order: ['李信', '明世隐', '钟馗', '铠', '花木兰', '盾山', '程咬金', '苏烈', '太乙真人', '大司命'],
      read: '李信只吃「带牺牲词条的人阵亡」，每人死一次他临时等级+7（觉醒+14）。临时等级打完就清，所以明世隐必须贴李信，把临时里的一部分转成永久。各套差别就在牺牲位：铠和木兰自带牺牲还能复生，一个人能喂两口；盾山是经济位，死了给古币；咬金卡面上没有牺牲，必须挨钟馗刷上才能喂；大司命的往生图腾顺带吃同一波牺牲，但不给李信加等级。点进各套会按实际上场的人拆开讲。',
      readOf: function (ns) {
        var kai = has(ns, '铠');
        var mulan = has(ns, '花木兰');
        var dun = has(ns, '盾山');
        var yaojin = has(ns, '程咬金');
        var dsm = has(ns, '大司命');
        var sl = has(ns, '苏烈');
        var zk = has(ns, '钟馗');
        var bits = ['李信只吃「带牺牲词条的人阵亡」，每人死一次他临时等级+7（觉醒+14）。临时等级打完就清，所以要明世隐站他旁边，把临时里的一部分转成永久。'];
        var seats = [];
        if (kai) seats.push('铠');
        if (mulan) seats.push('花木兰');
        if (dun) seats.push('盾山');
        if (yaojin) seats.push('程咬金');
        if (sl) seats.push('苏烈');
        if (zk) seats.push('钟馗');
        if (dsm) seats.push('大司命');
        if (seats.length) bits.push('这套上场跟牺牲有关的人是' + seats.join('、') + '。');
        if (kai && mulan && dsm && !dun && !yaojin) {
          bits.push('搭配上这是铠+木兰双复生喂李信。大司命只是顺带：同一波牺牲给他的往生图腾升级，不给李信加等级。');
        } else if (kai && dun && yaojin && !mulan) {
          bits.push('搭配上这套没有木兰。铠是主牺牲位，自带复生能喂两次；盾山死了换钱；咬金卡面没有牺牲，必须挨钟馗刷上才能喂李信。');
        } else if (kai && mulan && dun && !yaojin) {
          bits.push('搭配上这是铠+木兰喂等级，盾山死了给古币。古币给木兰叠复生，让她多死几次再喂李信。');
        } else if (kai && mulan && yaojin && !dun) {
          bits.push('搭配上这是铠+木兰喂等级，咬金整备产古币给木兰叠复生。咬金自己没有牺牲词条，必须挨钟馗才喂得动李信。');
        } else if (sl && kai && !mulan && !dun && !yaojin) {
          bits.push('搭配上牺牲位很少：苏烈死了自己永久升级，同时也喂李信一口；铠有复生，能再喂一口。');
        }
        if (zk) bits.push('钟馗给自己和左右一格刷上牺牲。卡面上没有牺牲的人（常见是咬金）必须贴着钟馗站，死了李信才吃得到。钟馗自己死一次也算一口。明世隐是转化位，不要把他当祭品去挨钟馗。');
        if (kai) bits.push('铠自己带着牺牲和复生：死两次等于李信吃两次，而且铠牺牲时全体河洛再加临时等级，李信是河洛，等于又叠一层。');
        if (mulan) bits.push('木兰自己有牺牲，死一次李信吃一次；她还能靠古币拿复生，复生后再死，李信再吃。这套里木兰是牺牲位，不是古币复生那套的主C。');
        if (dun) {
          if (mulan) bits.push('盾山牺牲给古币，是经济位。他死一次李信吃一次，古币拿去给木兰叠复生。');
          else bits.push('盾山牺牲给古币，是经济位。他死一次李信吃一次。');
        }
        if (yaojin) {
          var yb = '咬金卡面上没有牺牲，整备产古币。要让他喂李信，得靠钟馗把牺牲刷到他身上。';
          if (mulan) yb += '古币给木兰叠复生。';
          bits.push(yb);
        }
        if (sl) bits.push('苏烈自己带着牺牲：死一次李信吃一次，同时苏烈本人永久+2（觉醒+4）。他是给自己涨等级的牺牲位，不是经济位。');
        if (has(ns, '太乙真人')) {
          var who = [];
          if (kai) who.push('铠');
          if (mulan) who.push('木兰');
          var tb = '太乙开团给最近的人一次复生。贴李信等于李信多一条命。';
          if (who.length) tb += '贴' + who.join('或') + '等于牺牲位多死一次，李信多吃一次。';
          bits.push(tb);
        }
        if (dsm) bits.push('大司命不给李信加等级。场上每次牺牲，他的往生图腾自己升级。这是顺带的第二条，别把图腾当李信的主粮。');
        if (has(ns, '明世隐')) bits.push('明世隐转化的是「距离最近」的人，必须贴李信，别贴错人。');
        return bits.join('');
      },
      turnOf: function (ns) {
        var steps = [];
        steps.push({ text: '李信只在带牺牲的人阵亡时加临时等级。没刷上牺牲的人死了，他一口吃不到。' });
        if (has(ns, '明世隐')) steps.push({ text: '明世隐贴李信。转化的是最近的人，贴错就转给别人了。' });
        if (has(ns, '钟馗')) {
          if (has(ns, '程咬金')) steps.push({ text: '咬金没有牺牲词条，必须挨着钟馗站，死了李信才吃得到。' });
          else steps.push({ text: '钟馗给自己和左右一格刷上牺牲。卡面上没牺牲的人要挨着他站。' });
        }
        if (has(ns, '铠')) steps.push({ text: '铠放前排送。他有复生，死两次李信吃两次，河洛全员再加临时等级。' });
        if (has(ns, '花木兰')) steps.push({ text: '木兰也是前排牺牲位，不是这套的主C。有复生就让她多死几次。' });
        if (has(ns, '盾山')) {
          if (has(ns, '花木兰')) steps.push({ text: '盾山前排送，死了给古币给木兰叠复生，同时李信吃一次牺牲。' });
          else steps.push({ text: '盾山前排送，死了给古币，同时李信吃一次牺牲。' });
        }
        if (has(ns, '程咬金') && has(ns, '花木兰')) {
          steps.push({ text: '咬金整备产的古币给木兰叠复生。' });
        }
        if (has(ns, '苏烈')) steps.push({ text: '苏烈前排送。他死一次李信吃一次，苏烈自己再永久升级。' });
        if (has(ns, '太乙真人')) {
          var who = [];
          if (has(ns, '铠')) who.push('铠');
          if (has(ns, '花木兰')) who.push('木兰');
          var t = '太乙开团复生给最近的人。优先贴李信保命';
          if (who.length === 1) t += '，或贴' + who[0] + '让他多死一次';
          else if (who.length) t += '，或贴' + who.join('/') + '让他们多死一次';
          steps.push({ text: t + '。' });
        }
        if (has(ns, '大司命')) steps.push({ text: '大司命的图腾吃同一波牺牲，不跟李信抢临时等级，但也不给李信加等级。' });
        return steps;
      },
      turn: [
        { need: ['李信'], text: '李信只在带牺牲的人阵亡时加临时等级。没刷上牺牲的人死了，他一口吃不到。' },
        { need: ['明世隐'], text: '明世隐贴李信。转化的是最近的人，贴错就转给别人了。' },
        { need: ['钟馗'], text: '钟馗左右各站一个要喂李信、但自己没牺牲词条的人（咬金常见）。' },
        { need: ['铠'], text: '铠放前排送。他有复生，死两次李信吃两次，河洛全员再加临时等级。' },
        { need: ['花木兰'], text: '木兰也是前排牺牲位，不是这套的主C。有复生就让她多死几次。' },
        { need: ['盾山'], text: '盾山前排送，死了给古币，同时李信吃一次牺牲。' },
        { need: ['程咬金'], text: '咬金没有牺牲词条，必须挨着钟馗。' },
        { need: ['苏烈'], text: '苏烈前排送。他死一次李信吃一次，苏烈自己再永久升级。' },
        { need: ['太乙真人'], text: '太乙开团复生给最近的人。优先贴李信保命，或贴铠/木兰让他们多死一次。' },
        { need: ['大司命'], text: '大司命的图腾吃同一波牺牲，不跟李信抢临时等级，但也不给李信加等级。' }
      ]
    },
    {
      id: 'mulan',
      name: '花木兰复生',
      when: '花木兰 + 产古币/整备（婉儿、咬金、武则天、露娜）',
      match: function (ns) { return has(ns, '花木兰') && hasAny(ns, ['上官婉儿', '程咬金', '武则天', '露娜']); },
      order: ['花木兰', '上官婉儿', '程咬金', '武则天', '露娜', '太乙真人', '李白'],
      read: '木兰吃的不是「手里有古币」，而是「这回合用掉了几张古币」。每用 5 张，她才多 1 次复生，单回合最多 10 次。所以这套的发动机在整备：回合一开始，婉儿会给河洛用古币、咬金给自己用古币，木兰还没出手，次数已经在涨。露娜的登场会再触发一轮整备——如果她开局就在场上，登场和整备挤在一起，你很难再「买」第二次；捏在手里，等整备走完再打出，等于额外刷一轮古币。武则天让每张古币更值钱，并在登场时再给精致古币。太乙是保险：开团给最近的人一次复生，不是主引擎。',
      turn: [
        { need: [], text: '回合开始 → 整备。婉儿、咬金若在场，自动打出古币。' },
        { need: ['露娜'], text: '整备结束，再打出捏在手里的露娜。她登场会再触发整备，古币次数再跳一次。' },
        { need: ['花木兰'], text: '开战。木兰按本回合已使用的古币张数拿复生，阵亡后还能再打。' }
      ]
    },
    {
      id: 'sifen',
      name: '三分整备倒转',
      when: '曹操 + 甄姬（常配露娜）',
      match: function (ns) { return has(ns, '曹操') && has(ns, '甄姬'); },
      order: ['曹操', '甄姬', '露娜', '小乔', '周瑜'],
      read: '这套在倒「登场」。曹操整备会随机让一名三分英雄再登场一次；甄姬一登场就再给你一张登场牌。若那张是露娜，露娜登场又会触发整备，曹操再点一次登场——登场刷登场，商店经济就被「倒」过来。随机点到谁你控制不了，所以露娜要捏手里：整备走完后你主动打出，保证第二次整备发生，而不是赌曹操随机抽中。',
      turn: [
        { need: ['曹操'], text: '回合开始 → 曹操整备，随机触发一名三分英雄的登场。' },
        { need: ['甄姬'], text: '若点到甄姬，她登场再给你一张登场英雄牌。' },
        { need: ['露娜'], text: '不要开局就把露娜放场上。整备后再打出，用她的登场再触发一轮整备。' }
      ]
    },
    {
      id: 'dahe',
      name: '大河开团',
      when: '虞姬 + 图腾（鬼谷子 / 少司缘 / 大司命）',
      match: function (ns) { return has(ns, '虞姬') && hasAny(ns, ['鬼谷子', '少司缘', '大司命']); },
      order: ['鬼谷子', '少司缘', '大司命', '虞姬', '东皇太一', '张良', '云中君', '公孙离', '瑶', '刘邦'],
      read: '图腾是计数器，不是主 C。鬼谷子、少司缘、大司命在场就会各立一根图腾。开战时虞姬按「场上有几根图腾」给自己和随机大河英雄加等级——三根图腾就是三次计数。张良把每一次开团再摊成全队永久等级。东皇让图腾不容易被点掉，并按图腾等级吃临时等级。刘邦是另一条路：开团拆掉全部图腾，每拆一根自己永久 +5，和虞姬抢同一资源，这套里不要当主轴，阵容写了再用。香香当棋手时，输出在棋手技能上，靠场上低阶英雄够级给弩炮加攻，不是靠虞姬单杀。',
      turn: [
        { need: [], text: '上场先保证图腾位在场（鬼谷子 / 少司缘 / 大司命）。' },
        { need: ['虞姬'], text: '战斗开始 → 开团。虞姬按图腾数量给大河升级。' },
        { need: ['张良'], text: '每有一次开团，张良再给随机三人永久等级。' }
      ]
    },
    {
      id: 'riluo',
      name: '日落海整备',
      when: '亚连 / 朵莉亚 / 米莱狄（整备加核心）',
      match: function (ns) { return hasAny(ns, ['亚连', '朵莉亚']) && hasAny(ns, ['亚连', '朵莉亚', '米莱狄', '狂铁']); },
      order: ['亚连', '朵莉亚', '米莱狄', '露娜'],
      read: '日落海不靠开团计数，靠把等级存进「阿科米亚核心」，开战再摊给日落海英雄。亚连整备给装备最多的日落海 +2，同时核心 +1。朵莉亚让「每一次整备」都再给随机三人加核心——所以整备次数就是这套的利率。米莱狄整备再给召唤物和核心加一层。露娜登场等于多买一次整备：留一个空位，整备走完再打出，核心会再跳一档。不要把露娜当普通战力卖掉。',
      turn: [
        { need: [], text: '回合开始 → 整备。亚连、米莱狄若在场，先给核心和日落海加等级。' },
        { need: ['朵莉亚'], text: '有人触发整备，朵莉亚再给随机三人及核心 +1。整备次数越多越肥。' },
        { need: ['露娜'], text: '留一个打出位。整备后再打露娜，登场再触发整备，核心多跳一次。' }
      ]
    },
    {
      id: 'wangsheng',
      name: '往生图腾',
      when: '大司命 + 米莱狄/蒙恬/项羽（不是虞姬大河）',
      match: function (ns) {
        return has(ns, '大司命') && hasAny(ns, ['米莱狄', '蒙恬', '项羽']) && !has(ns, '虞姬');
      },
      order: ['大司命', '米莱狄', '蒙恬', '项羽', '鲁班大师', '雅典娜', '钟馗'],
      read: '大司命在场会立一根往生图腾。场上每次牺牲，图腾永久加等级并回蓝。米莱狄给召唤物加临时等级，整备时再加一层；蒙恬牺牲会召唤和自己同级的士兵，士兵再死就继续给图腾喂牺牲。项羽自己牺牲时，所有图腾再加一截，并且这回合召唤物免疫控制。鲁班大师的傀儡等级跟他本人走，图腾等级高时等于多一个同级输出。雅典娜开团会再触发日落海整备，米莱狄在场就能多喂一轮召唤物等级。这套吃的是牺牲次数和图腾等级。卡面上写往生图腾，对局里常叫山鬼；它不是虞姬按图腾数量给大河升级的那条开团线。',
      turn: [
        { need: ['大司命'], text: '上场先保证大司命在，往生图腾立住。' },
        { need: ['蒙恬', '米莱狄'], text: '用蒙恬士兵、米莱狄召唤物去送死，把牺牲次数喂给图腾。' },
        { need: ['项羽'], text: '项羽前排牺牲：图腾再加等级，本回合召唤物免疫控制。' }
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
    var re = /手里|不要急着|先购买不用|留在手中|决赛圈|唤醒|集体唤醒|临阵磨枪|全军动员|整备|打出露娜|不用卖掉|捏|牺牲|前排|送死|明世隐|钟馗|复生/;
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
      + '<div class="jdoc-sub">' + (arch ? esc(arch.name) + ' · ' : '') + '先读懂机制，再对照卡面</div>'
      + '</div></header>';
    if (arch) {
      var readTxt = typeof arch.readOf === 'function' ? arch.readOf(ns) : arch.read;
      h += '<section class="jbox ex-read"><h3>读懂这套</h3><p>' + esc(readTxt) + '</p></section>';
      var steps = typeof arch.turnOf === 'function'
        ? arch.turnOf(ns)
        : (arch.turn || []).filter(function (s) {
          return !s.need || !s.need.length || s.need.every(function (n) { return has(ns, n); });
        });
      if (steps.length) {
        h += '<section class="jbox"><h3>这一回合怎么走</h3><ol class="ex-ol">';
        steps.forEach(function (s) { h += '<li>' + esc(s.text) + '</li>'; });
        h += '</ol></section>';
      }
    } else {
      h += '<section class="jbox"><h3>读懂这套</h3><p class="jmuted">这套没有对上李信牺牲、花木兰复生、三分倒转、大河开团、日落海整备、往生图腾。下面只列上场卡面。</p></section>';
    }
    if (cards) h += '<section class="jbox"><h3>上场卡面 <span>官方原文</span></h3>' + cards + '</section>';
    if (L.brief) h += '<section class="jbox"><h3>这套怎么介绍的</h3><p>' + esc(L.brief) + '</p></section>';
    if (ops.length) {
      h += '<section class="jbox"><h3>运营原文</h3>';
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
      h += '<section class="jbox ex-tips"><h3>实战要点 <span>从这套阵容原文抽出</span></h3><ul class="ex-ul">';
      tips.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
      h += '</ul></section>';
    }
    h += '</article>';
    return h;
  }

  function hubHtml() {
    var h = '<div class="explain-hub">'
      + '<div class="jbox"><h3>讲解</h3>'
      + '<p>李信牺牲、花木兰复生、大河开团，光看词条名不容易串起来。这里先用一段读法讲「这套到底在倒什么」，再对照官方卡面和该套阵容自己的介绍。</p>'
      + '<p class="jmuted">对得上的阵容，详情里会有「讲解这套」。</p>'
      + '</div>';
    ARCH.forEach(function (a) {
      var list = jobsOf(a);
      h += '<section class="jbox ex-arch" data-ex-arch="' + a.id + '">'
        + '<h3>' + esc(a.name) + ' <span>' + list.length + ' 套对得上</span></h3>'
        + '<p class="ex-when">上场识别：' + esc(a.when) + '</p>'
        + '<p class="ex-readp">' + esc(a.read) + '</p>';
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
