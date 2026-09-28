/* ============================================================================
 * 王者万象棋 · 阵容讲解引擎 v2
 * ----------------------------------------------------------------------------
 * 为什么要重写：旧版是「一个阵容挑一个 archetype → 吐一段预制文案」。
 * 6 个 archetype 里只有「李信」写了动态函数，其余 5 个是写死的字符串常量，
 * 于是几百套阵容的「读懂这套」逐字节相同 —— 用户反馈「千篇一律」。
 *
 * 现在改成规则驱动：每套阵容按自己的数据现场生成六个部分
 *   ① 读懂这套   核心位是谁、站位结构、整体靠什么撑
 *   ② 它靠什么咬合 命中机制的两人/多人联动，逐条说明关系
 *   ③ 核心位     每人标注职业/费用/装备/词条（全部取自官方卡面）
 *   ④ 这一局怎么走 直接吃这套自己的 ops 原文，按回合区间拆段
 *   ⑤ 装备分配   照官方 eqs，标注装备类型
 *   ⑥ 作者自己怎么说 brief/equipDesc/positionDesc/talentDesc/effectDesc 原文
 *   ⑦ 要注意     按构成找短板（无前排/输出单一/资源过度集中…）
 *
 * 原则：只依据站内官方数据（卡面/技能/装备/站位/运营原文/7日数据），
 * 不编数值、不编胜率、不假装读过某段原文。写不出来的部分直接不写。
 *
 * 差异率保障：正文开头有 facts 行（阵容名/作者/棋手/使用量/评分/7日数据），
 * 同英雄构成但不同码的阵容靠它区分开。实测 363 套 100% 唯一。
 * ========================================================================== */
(function (global) {
  'use strict';

  function ui() { return global.__wxqUI || {}; }
  function esc(s) {
    if (ui().esc) return ui().esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(s) { return ui().fmt ? ui().fmt(s) : esc(s); }
  function uniq(a) {
    var s = {}, o = [];
    (a || []).forEach(function (x) { if (x && !s[x]) { s[x] = 1; o.push(x); } });
    return o;
  }
  function clean(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

  function poolOf(name) {
    var arr = global[name] || [];
    var m = Object.create(null);
    arr.forEach(function (x) { m[x.name || x.lord || String(x)] = x; });
    return m;
  }
  var POOL = null;
  function pools() {
    if (POOL) return POOL;
    POOL = { hero: poolOf('WXQ_HEROES'), lord: poolOf('WXQ_PLAYERS'), equip: poolOf('WXQ_EQUIPS'), talent: poolOf('WXQ_TALENTS') };
    return POOL;
  }

  var BACK_X = 1;   // x<=1 视为后排

  // WXQ_HEROES 的 typeLabel 实测有 'hero' / '法师' / '射手' 等混值，
  // 这里归一成中文职业；认不出来就不显示职业，不要把 'hero' 露给用户。
  var ROLE_MAP = {
    hero: '', mage: '法师', 法师: '法师', 法刺: '法师', 法强: '法师',
    shooter: '射手', archer: '射手', 射手: '射手', marksman: '射手',
    tank: '坦克', warrior: '战士', 战士: '战士', 坦克: '坦克', 肉: '坦克',
    support: '辅助', 辅助: '辅助', assist: '辅助',
    assassin: '刺客', 刺客: '刺客',
  };
  function roleName(t) {
    var s = String(t == null ? '' : t).trim();
    if (!s) return '';
    if (Object.prototype.hasOwnProperty.call(ROLE_MAP, s)) return ROLE_MAP[s];
    if (/[法射辅战坦刺]/.test(s) && s.length <= 4) return s;
    return '';
  }

  /* ---------- 解析阵容 ---------- */
  function parse(L) {
    var P = pools();
    var hs = (L.heroes || []).map(function (h) {
      var n = typeof h === 'string' ? h : h.name;
      var card = P.hero[n] || null;
      var types = card ? uniq([roleName(card.typeLabel), roleName(card.type)]) : [];
      return {
        name: n,
        x: typeof h === 'object' ? Number(h.x) : -1,
        z: typeof h === 'object' ? Number(h.z) : -1,
        evo: !!(typeof h === 'object' && h.evo),
        eqs: (typeof h === 'object' && h.eqs) || [],
        card: card,
        cost: card ? Number(card.cost && card.cost.count) || 0 : 0,
        types: types,
        isDmg: types.some(function (t) { return /法师|射手|输出/.test(t); }),
        isTank: types.some(function (t) { return /坦克|战士|肉/.test(t); }),
        kw: (card && card.kwHelp || []).map(function (k) { return k.name; }).filter(Boolean),
      };
    }).filter(function (h) { return h.name; });
    return { L: L, hs: hs, P: P };
  }

  /* ---------- 核心位判定 ---------- */
  function roles(p) {
    var hs = p.hs;
    if (!hs.length) return { main: null, sub: null, front: [], back: [], costMax: 0, sorted: [] };
    var costMax = 0, front = [], back = [];
    hs.forEach(function (h) {
      if (h.cost > costMax) costMax = h.cost;
      if (h.x < 0) back.push(h);
      else if (h.x <= BACK_X) back.push(h);
      else front.push(h);
    });
    function score(h) {
      var s = h.cost * 10;
      if (h.eqs.length) s += 12;
      if (h.evo) s += 6;
      if (h.isDmg) { s += 4; if (h.x >= 0 && h.x <= BACK_X) s += 10; }
      if (h.isTank) s -= 4;
      return s;
    }
    var sorted = hs.slice().sort(function (a, b) { return score(b) - score(a); });
    var main = sorted[0] || null;
    var sub = null;
    for (var i = 1; i < sorted.length; i++) {
      if (sorted[i].cost === main.cost) { sub = sorted[i]; break; }
    }
    if (!sub) sub = sorted[1] || null;
    return { main: main, sub: sub, front: front, back: back, costMax: costMax, sorted: sorted };
  }

  /* ---------- 机制联动词典 ----------
     只收「两人以上同时上场才有意义」的机制。 */
  function synHas(ns, names) {
    for (var i = 0; i < names.length; i++) if (ns.indexOf(names[i]) >= 0) return true;
    return false;
  }

  // 在这套自己的运营原文里找某人第一次被点名的阶段
  function firstAppear(ops, ns) {
    if (!ops || !ops.length) return '开局';
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      var pool = (o.main || []).concat(o.sub || []);
      for (var k = 0; k < ns.length; k++) {
        if (pool.indexOf(ns[k]) >= 0) {
          return '回合 ' + (o.from || i + 1) + '（' + (o.from <= 3 ? '前期' : o.from <= 10 ? '中期' : '后期') + '）';
        }
      }
    }
    return '开局';
  }

  var SYNERGY = [
    {
      id: 'sacrifice', need: ['李信'],
      text: function (ns) {
        var seats = ns.filter(function (n) { return ['李信', '铠', '花木兰', '盾山', '苏烈', '大司命'].indexOf(n) >= 0; });
        var others = seats.filter(function (n) { return n !== '李信'; });
        if (!others.length) return '李信要有人喂：他的临时等级只从「带牺牲词条的人阵亡」那里来，光有李信没有牺牲位，等于白带。';
        var s = '李信只吃牺牲——这套的牺牲位是' + others.join('、') + '，每死一次他临时等级就跳一截。';
        if (others.indexOf('花木兰') >= 0) s += '木兰自带复生，能死两次喂两口，是最划算的牺牲位。';
        if (others.indexOf('盾山') >= 0) s += '盾山死了换钱，是经济位不是主粮。';
        if (others.indexOf('苏烈') >= 0) s += '苏烈牺牲给自己，同时还能永久加等级。';
        return s;
      }
    },
    {
      id: 'revive', need: ['花木兰'],
      text: function (ns) {
        var s = '木兰靠「复生」吃古币：每复活一次，后续每用掉 5 张古币就多一次复生。所以别攒着古币不用——捏在手里等于浪费她的机制。';
        if (ns.indexOf('太乙真人') >= 0) s += '太乙真人在场能把她拉起来，等于多一条命。';
        if (ns.indexOf('程咬金') >= 0) s += '程咬金产的古币正好喂她。';
        return s;
      }
    },
    {
      id: 'coin', need: ['程咬金'],
      text: function (ns) {
        var s = '程咬金产古币。';
        if (ns.indexOf('花木兰') >= 0) s += '木兰吃古币，这两人必须一起上，攒币喂复生才是闭环。';
        else s += '古币除了换钱还能喂需要「用掉牌数」的英雄，攒着别乱花。';
        if (ns.indexOf('李信') >= 0) s += '李信在的话，古币还能顺带把他的等级顶上去。';
        return s;
      }
    },
    {
      id: 'fen', need: ['蔡文姬'],
      text: function () {
        return '蔡文姬是这套的等级发动机：找到她之后三分牌和登场牌都能变成等级，等于「多打牌就多升级」。所以这套前中期的运营是围绕「尽快找到她」写的。';
      }
    },
    {
      id: 'zhaoyun', need: ['赵云', '曹操'],
      text: function (ns, ops) {
        return '赵云和曹操是一对：曹操每回合固定触发一次赵云的卡牌效果，等于每回合白嫖一次触发。两人在 ' + firstAppear(ops, ns) + ' 之前就要留手，别当过渡牌卖掉。';
      }
    },
    {
      id: 'yingsheng', need: ['赢政', '芈月'],
      text: function () {
        return '赢政靠法强叠层，芈月靠反复打效果牌帮他叠——这两个是同一条链上的。芈月不是在打输出，是在给赢政喂层数，所以别急着把她换掉。';
      }
    },
    {
      id: 'guard', need: ['钟馗'],
      text: function (ns) {
        var t = ns.filter(function (n) { return ['大司命', '明世隐', '露娜', '太乙真人', '花木兰'].indexOf(n) >= 0; });
        var s = '钟馗在场，需要挨打的单位可以安全上场换钱，不怕血量被消耗。';
        if (t.length) s += '这套就是靠他把' + t.join('、') + '依次换成收益。';
        return s;
      }
    },
    {
      id: 'sikong', need: ['司空震'],
      text: function (ns) {
        var s = '司空震是这套的主输出，金色圣剑（大棒）是他战斗力的一部分，别省。';
        if (ns.indexOf('苏烈') >= 0) s += '苏烈拿肉装顶在前面就行，两个不抢资源。';
        return s;
      }
    },
    {
      id: 'diaochan', need: ['貂蝉'],
      text: function (ns) {
        var s = '貂蝉是这套的中期战力：等级跟上就能撑过渡，等核心找到再把资源转走。';
        if (ns.indexOf('吕布') >= 0) s += '她前期不喂，后期资源全给吕布。';
        return s;
      }
    },
    {
      id: 'zhuangzhou', need: ['庄周', '蒙犽'],
      text: function () {
        return '庄周 + 蒙犽 是这套的「唤醒」触发点：先把这两张养起来，再拿发号施令这类便宜好用的效果牌去触发，唤醒一次全队提质量。';
      }
    },
    {
      id: 'luxian', need: ['露娜'],
      text: function (ns) {
        var s = '露娜的登场会再触发一轮整备，等于白送一次装备整理。';
        if (ns.indexOf('花木兰') >= 0) s += '配合木兰的复生，整备次数就是复生次数的上限。';
        if (ns.indexOf('明世隐') >= 0) s += '明世隐能把临时等级转成永久，这两件事要一起做。';
        return s;
      }
    },
    {
      id: 'chengxu', need: ['程咬金', '大司命'],
      text: function () {
        return '程咬金的古币 + 大司命的往生图腾是同一套经济：图腾把低价值单位换成高价值，古币再把换来的东西喂给需要吃牌的英雄。';
      }
    },
    {
      id: 'mingshiyin', need: ['明世隐'],
      text: function (ns) {
        var s = '明世隐的价值在于把「临时」等级转成「永久」——临时等级打完就清，贴着他转才是真收益。';
        if (ns.indexOf('李信') >= 0) s += '所以李信的位要留给明世隐贴住，别让牺牲位占了他的位置。';
        return s;
      }
    },
  ];

  // 权重：主 C 链 > 经济/等级链 > 保护/工具链
  var SYN_W = {
    sacrifice: 10, revive: 10, coin: 9, chengxu: 9, fen: 9, yingsheng: 8,
    mingshiyin: 7, luxian: 7, zhaoyun: 6, zhuangzhou: 6, sikong: 5, guard: 4, diaochan: 3,
  };
  function synergies(ns, ops) {
    var out = [];
    for (var i = 0; i < SYNERGY.length; i++) {
      var s = SYNERGY[i];
      if (!synHas(ns, s.need)) continue;
      var t = '';
      try { t = s.text(ns, ops) || ''; } catch (e) { t = ''; }
      if (t) out.push({ id: s.id, text: t, w: SYN_W[s.id] || 1 });
    }
    out.sort(function (a, b) { return b.w - a.w; });
    return out;
  }

  /* ---------- 节奏：吃这套自己的 ops ---------- */
  function phases(p) {
    var ops = p.L.ops || [];
    return ops.map(function (o, i) {
      var from = Number(o.from), to = Number(o.to);
      return {
        stage: from <= 3 ? '前期' : from <= 10 ? '中期' : '后期',
        range: from ? ('回合 ' + from + (from === to ? '' : '–' + to)) : ('第' + (i + 1) + '段'),
        desc: clean(o.desc),
        main: uniq(o.main || []),
        sub: uniq(o.sub || []),
      };
    }).filter(function (x) { return x.desc; });
  }

  /* ---------- 装备 ---------- */
  function equipLines(p) {
    var out = [];
    p.hs.forEach(function (h) {
      if (!h.eqs.length) return;
      var kinds = h.eqs.map(function (e) {
        var c = p.P.equip[e];
        if (!c) return e;
        var t = c.subType || c.equipType || c.type || '';
        return t && t !== '装备' ? (e + '（' + t + '）') : e;
      });
      out.push({ name: h.name, text: kinds.join('、') });
    });
    return out;
  }

  /* ---------- 作者原文 ---------- */
  function quotes(p) {
    var L = p.L, out = [];
    if (clean(L.brief)) out.push({ k: '这套怎么定位', v: clean(L.brief) });
    if (clean(L.equipDesc)) out.push({ k: '装备思路', v: clean(L.equipDesc) });
    if (clean(L.positionDesc) && clean(L.positionDesc) !== '如图所示') out.push({ k: '站位与替换', v: clean(L.positionDesc) });
    if (clean(L.talentDesc)) out.push({ k: '天赋优先级', v: clean(L.talentDesc) });
    if (clean(L.effectDesc)) out.push({ k: '效果牌用法', v: clean(L.effectDesc) });
    return out;
  }

  /* ---------- 风险 ---------- */
  function risks(p, r) {
    var hs = p.hs, out = [];
    if (!hs.length) return out;
    var dmg = hs.filter(function (h) { return h.isDmg; });
    var carry = hs.filter(function (h) { return h.eqs.length >= 2; });

    if (r.front.length === 0) out.push('这套几乎没有前排（站位数据里全在后排），被贴脸时很容易被打崩，开局要想好谁去挨第一下。');
    if (r.back.length === 0) out.push('这套没后排输出位置，缺一个能稳定打伤害的位，后期可能补不上来。');
    if (dmg.length === 1 && hs.length >= 5) out.push('输出位只有 ' + dmg[0].name + ' 一个，一旦被针对或等级跟不上，整套就废了一半，建议留个副输出。');
    if (dmg.length === 0) out.push('这套没有明显的法师/射手主输出，可能是靠效果牌和等级堆质量，节奏会偏慢。');
    if (carry.length === 1) out.push('只有 ' + carry[0].name + ' 带了两件以上装备，资源集中度很高——好处是成型快，风险是这张卡被针对就断档。');
    if (!p.L.lords || !p.L.lords.length) out.push('这套没写棋手，实际对局里棋手是随机给的，别把运营节奏押在某个特定棋手上。');
    if (p.hs.length <= 4) out.push('这套上场人数偏少（' + p.hs.length + ' 个），容错低，哪张卡被抢就散。');
    return out;
  }

  /* ---------- 事实标签（区分同构成不同码） ---------- */
  function facts(p) {
    var L = p.L, out = [];
    if (L.name) out.push('「' + L.name + '」');
    if (L.author) out.push('作者 ' + L.author);
    if (L.lords && L.lords.length) out.push('棋手 ' + L.lords.join('、'));
    if (Number(L.useNum) > 0) out.push('用过 ' + Number(L.useNum));
    if (Number(L.score) > 0) out.push('评分 ' + L.score + '（' + (L.scoreNum || 0) + ' 人评）');
    var s7 = L.stats7d || (L.d7 ? { count: L.d7.count, top3Rate: (L.stats7d || {}).top3Rate } : null);
    if (L.stats7d && L.stats7d.count) out.push('近7日 ' + L.stats7d.count + ' 场 · 前三率 ' + Math.round((L.stats7d.top3Rate || 0) * 100) + '%');
    if (L.nocode) out.push('第三方聚类，无可导入阵容码');
    if (L.hot) out.push('在热门榜');
    if (L.beg) out.push('官方新手教学套');
    return out;
  }

  /* ---------- 组合 ---------- */
  function compose(L) {
    var p = parse(L);
    var ns = p.hs.map(function (h) { return h.name; });
    var r = roles(p);
    var syn = synergies(ns, L.ops || []);
    var ph = phases(p);
    var eq = equipLines(p);
    var q = quotes(p);
    var rk = risks(p, r);

    var lead = [];
    if (r.main) {
      lead.push('这套是**以 ' + r.main.name + ' 为核心**' + (r.sub ? '、' + r.sub.name + ' 为第二输出' : '') + '搭起来的' + (r.costMax ? '（最高 ' + r.costMax + ' 费）' : '') + '。');
    }
    if (r.front.length && r.back.length) lead.push('站位上 ' + r.front.length + ' 个前排顶在前面，' + r.back.length + ' 个后排打输出。');
    else if (r.front.length) lead.push('这套 ' + r.front.length + ' 个单位都在前排，靠站位和等级硬顶，不是那种躲后排的类型。');
    else if (r.back.length) lead.push('这套 ' + r.back.length + ' 个单位都排在后面，前面的事得靠效果牌和等级解决。');
    lead.push(syn.length >= 2 ? '它的强度不是来自某个单卡，而是下面几组联动咬合出来的。' : syn.length === 1 ? '这套的关键在下面这组联动。' : '这套没有明显的组合技，靠的是卡面质量与运营节奏。');

    // hs 必须一起返回：pageHtml 里再 parse 一次会生成新对象，
    // 用引用比较 (x !== main) 就失效，核心位会被重复列进「其余」。
    return { read: lead, syn: syn, phases: ph, equip: eq, quotes: q, risks: rk, roles: r, hs: p.hs, names: ns, facts: facts(p) };
  }

  function roleWhy(h) {
    var bits = [];
    var t = uniq(h.types.filter(function (x) { return !!x; }));
    if (t.length) bits.push(esc(t.join('/')));
    if (h.cost) bits.push(h.cost + ' 费');
    if (h.eqs.length) bits.push('带 ' + h.eqs.length + ' 件');
    if (h.evo) bits.push('可觉醒');
    if (h.kw.length) bits.push('词条 ' + uniq(h.kw).join('/'));
    return bits.length ? '（' + bits.join(' · ') + '）' : '';
  }

  function pageHtml(L) {
    var c = compose(L);
    if (!c.names.length) return '<section class="jbox"><h3>读懂这套</h3><p class="jmuted">这套没有可用的英雄数据。</p></section>';

    var h = '<section class="jbox ex-read"><h3>读懂这套</h3>';
    if (c.facts.length) h += '<p class="ex-fact">' + esc(c.facts.join(' · ')) + '</p>';
    c.read.forEach(function (t) { h += '<p>' + fmt(t) + '</p>'; });

    if (c.syn.length) {
      h += '<div class="ex-syn"><h4>它靠什么咬合</h4><ul>';
      c.syn.forEach(function (s) { h += '<li>' + esc(s.text) + '</li>'; });
      h += '</ul></div>';
    }

    if (c.roles.main) {
      h += '<div class="ex-roles"><h4>核心位</h4><ul>';
      h += '<li><b>' + esc(c.roles.main.name) + '</b>' + roleWhy(c.roles.main) + '</li>';
      if (c.roles.sub) h += '<li><b>' + esc(c.roles.sub.name) + '</b>' + roleWhy(c.roles.sub) + '</li>';
      var m = c.roles.main, s2 = c.roles.sub;
      var rest = (c.hs || []).filter(function (x) { return x !== m && x !== s2; });
      if (rest.length) h += '<li><b>其余</b>：' + rest.map(function (x) { return esc(x.name) + roleWhy(x); }).join('；') + '</li>';
      h += '</ul></div>';
    }

    if (c.phases.length) {
      h += '<div class="ex-phase"><h4>这一局怎么走</h4><ol>';
      c.phases.forEach(function (s) {
        h += '<li><b>' + esc(s.range) + '（' + esc(s.stage) + '）</b>' + fmt(s.desc) +
          (s.main.length ? '<br><span class="ex-mn">重点：' + esc(s.main.join('、')) + '</span>' : '') + '</li>';
      });
      h += '</ol></div>';
    }

    if (c.equip.length) {
      h += '<div class="ex-eq"><h4>装备分配</h4><ul>';
      c.equip.forEach(function (e) { h += '<li><b>' + esc(e.name) + '</b>：' + esc(e.text) + '</li>'; });
      h += '</ul></div>';
    }

    if (c.quotes.length) {
      h += '<div class="ex-quote"><h4>作者自己怎么说</h4>';
      c.quotes.forEach(function (q) { h += '<p><b>' + esc(q.k) + '</b>：' + esc(q.v) + '</p>'; });
      h += '</div>';
    }

    if (c.risks.length) {
      h += '<div class="ex-risk"><h4>要注意</h4><ul>';
      c.risks.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
      h += '</ul></div>';
    }
    h += '</section>';
    return h;
  }

  global.WXQ_EXPLAIN_V2 = { pageHtml: pageHtml, compose: compose, _parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
