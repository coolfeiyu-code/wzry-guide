/* ============================================================================
 * 王者万象棋 · 规则层（chain rules）
 * ----------------------------------------------------------------------------
 * 这一层只做一件事：把官方卡面原文（wanxiangqi-data.js 的 desc）翻译成
 * 「可演算的 Effect 列表」。它不碰 DOM、不读 window 以外的全局、不认识阵容。
 *
 * ── 三层分工（改代码前先读） ──────────────────────────────────────────────
 *   A 快照层  wanxiangqi-data.js      官方原文 / 图标 / id。换赛季 = 整份替换。
 *   B 规则层  本文件                  原文 → Effect；手工覆盖；阵营别名。
 *   C 引擎层  wanxiangqi-engine.js    吃 Effect，出时间轴。纯函数，无 DOM。
 *   D 界面层  wanxiangqi-chain.js     只负责画，不含任何规则。
 *
 * 主键纪律：一律用 String(card.id) 对齐，绝不拿中文名当主键（名可重复、可改）。
 *
 * ── 以后版本怎么扩（硬性约定） ────────────────────────────────────────────
 *  1. 换官方快照：只替换 wanxiangqi-data.js 并把 patch 改成新的 capturedAt。
 *     然后跑 resolve() → 只 diff「parse==='manual' 且 desc 变了」的卡，人工核对。
 *     （自动解析的卡不用逐张看，它们本来就是从原文推的。）
 *  2. 新词条：往 keywords.byHref / order / phases 追加即可，旧卡不受影响。
 *     注意 phases 决定时间轴分段顺序，没进 phases 的词条只能当「标签」。
 *  3. 新效果类型：给 Effect 加【可选】字段（如 stealLevel / summon），引擎对未知
 *     字段一律忽略。**禁止 if (name === '某某')** —— 那等于把规则写回了引擎。
 *  4. 棋手进沙盒：上场加 playerId，把该棋手 skills 编成 kind:'playerSkill' 的
 *     effects，when 用一个新 phase（如「棋手技能」）或 listen 现有事件。
 *     schema 已允许 kind:'playerSkill'，本版不上，避免下个版本推翻结构。
 *  5. schema 升主版本：仅当 Effect 的**必填字段改名 / 删除**时才 +1。
 *     纯加字段不算破坏性变更，不要升。
 *  6. 禁止把「版本 T0 阵容」写进本文件。阵容是 wanxiangqi-guide.js 的事，
 *     这一层只认规则。
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 词条表
   * ------------------------------------------------------------------ */

  // 官方 <a href=N> 的 N → 词条汉字。整张表是从官方快照里扫出来的（不是抄的）。
  // 未知 href 也会被 parseDesc 收录（key 用官方汉字），所以漏一个不影响可用性。
  var BY_HREF = {
    '1': '登场',
    '3': '开团',
    '4': '凯旋',
    '5': '败阵',
    '9': '退场',
    '10': '牺牲',
    '11': '整备',
    '13': '合成',
    '16': '复生',
    '100': '闪现',
    '200': '夺取',
    '321': '图腾',
    '322': '往生图腾',
    '323': '因缘图腾',
    '324': '先知图腾',
    '3130011': '临时等级',
    '3130012': '转瞬',
    '3140012': '阿科米亚核心'
  };

  // 词条 chip 的展示顺序（先后 = 重要度）
  var ORDER = ['登场', '整备', '开团', '交锋', '牺牲', '夺取', '复生', '闪现', '退场', '凯旋', '合成', '转瞬', '觉醒'];

  // 时间轴分段顺序。只有落在这里的词条才是「时机（when）」，
  // 其余（闪现 / 夺取 / 图腾 / 临时等级…）是标签（trait）。
  // 注：交锋目前官方卡面里没有出现过，先占位，将来有卡直接用。
  //
  // 「转瞬」是效果牌（古币 / 战术牌）自带的时机词，也必须在 phases 里，
  // 否则效果牌永远排不进时间轴。本版把它放在**最后**：玩家本回合打出的效果牌
  // 统一在回合末结算，时间轴读起来是「先棋子链，再效果牌叠加」。
  // 想改成回合最先结算，只动这一行，其余代码不用改。
  var PHASES = ['整备', '开团', '交锋', '登场', '合成', '牺牲', '退场', '凯旋', '转瞬'];

  // 官方文案里的简称 → WXQ_*.faction 真实取值。
  // 原文写「【三分】」时，实际 faction 是「三分之地」——不映射就匹配不到人。
  var ALIASES = {
    '三分': '三分之地',
    '日落河': '日落海',
    '日落': '日落海',
    '大河': '大河流域',
    '河洛之地': '河洛'
  };

  // 标签型词条（不是时机，但值得在卡面显示）
  var TRAITS = ['闪现', '夺取', '图腾', '往生图腾', '因缘图腾', '先知图腾', '临时等级', '阿科米亚核心', '复生'];

  var DESCS = {
    '登场': '英雄被放到场上时立即结算一次效果，不占行动、不需要存活。',
    '整备': '回合开始阶段的准备类效果，通常给等级、古币或核心等级，是资源产出主力。',
    '开团': '战斗开始时结算，常与场上数量（图腾 / 觉醒 / 装备）挂钩，铺得越多越强。',
    '交锋': '对位交锋时结算。官方卡面目前很少用到这个时机。',
    '牺牲': '阵亡或付出代价时结算，多为永久增益，前期铺路、中后期收网。',
    '夺取': '从身边或战场「拿」等级 / 收益，数量少但节奏强。',
    '复生': '阵亡后再次参战。常和牺牲写在同一条上。',
    '闪现': '位移类标签，常和击败数、装备、古币挂钩。',
    '退场': '英雄离开战场时结算，把消耗掉的资源再转一次。',
    '凯旋': '战斗获胜时结算。',
    '败阵': '战斗失败时结算。',
    '合成': '同名卡合成时触发，低费体系用数量换质量。',
    '转瞬': '效果牌专属：只在本回合生效，回合结束作废。',
    '觉醒': '英雄进阶状态。场上觉醒越多，部分开团收益越高。',
    '图腾': '大河流域召唤物，给等级或保护。',
    '往生图腾': '大司命在场时召唤的图腾。',
    '因缘图腾': '少司缘在场时召唤的图腾。',
    '先知图腾': '鬼谷子在场时召唤的图腾。',
    '临时等级': '只在本场战斗有效的等级，部分英雄能转成永久。',
    '阿科米亚核心': '日落海共享等级池。整备给核心，开战时再分给日落海英雄。'
  };

  /* ------------------------------------------------------------------ *
   * 解析工具（纯函数）
   * ------------------------------------------------------------------ */

  var OPEN = '\u0001', CLOSE = '\u0002';
  var RE_TOK = new RegExp('^' + OPEN + '(\\d+)\\|([^' + CLOSE + ']*?)' + CLOSE + '\\s*');
  var KW = '[\\u4e00-\\u9fa5]{2,6}';

  function stripAll(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

  // 去掉标签 + 还原 token（保留词条汉字）。任何要展示 / 比对原文的地方都必须先过这里，
  // 否则会残留 \u0001..\u0002 导致「看起来抽不干净」。
  var RE_TOK_ALL = new RegExp(OPEN + '(\\d+)\\|([^' + CLOSE + ']*)' + CLOSE, 'g');
  function plainify(s) {
    return String(s || '').replace(RE_TOK_ALL, '$2').replace(/<[^>]*>/g, '');
  }

  /** 把 <a href=N>词</a> 换成不可见 token，便于后续按段切分；其余标签直接剥掉。 */
  function tokenize(desc) {
    return String(desc || '')
      .replace(/<a\s*href\s*=\s*(\d+)\s*>([\s\S]*?)<\/a>/gi, function (_, n, inner) {
        return OPEN + n + '|' + stripAll(inner).trim() + CLOSE;
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '');
  }

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /** 阵营名归一：文案「三分」→ 数据「三分之地」 */
  function normFaction(f) {
    if (!f) return null;
    var t = norm(f).replace(/[【】]/g, '');
    return ALIASES[t] || t;
  }

  /* ---- target ---- */
  function parseTarget(text, leadKws) {
    var t = { type: 'self', faction: null, keyword: null, count: 1, filter: [] };
    var m;

    if (/阿科米亚核心/.test(text)) { t.type = 'core'; return t; }

    if ((m = text.match(/【([^】]+)】/))) { t.type = 'faction'; t.faction = normFaction(m[1]); }

    if (/图腾/.test(text) && t.type !== 'faction') { t.type = 'keyword'; t.keyword = '图腾'; }
    if (/已觉醒/.test(text)) { t.type = 'keyword'; t.keyword = '觉醒'; }

    if (/距离最近/.test(text)) { t.type = 'nearest'; }
    if (/穿戴装备最多/.test(text)) { t.type = 'equippedMost'; }

    if ((m = text.match(/等级最高的\s*(\d+)\s*名/))) { t.count = +m[1]; if (t.type === 'self') t.type = 'core'; }
    if ((m = text.match(/(?:随机|指定)\s*(?:对\s*)?(\d+)\s*名/))) { t.count = +m[1]; }
    if ((m = text.match(/随机\s*(\d+)\s*名/))) { t.count = +m[1]; }
    if ((m = text.match(/随机\s*1\s*名/))) { t.count = 1; }

    if (/全体|所有|全队/.test(text) && t.type === 'self') { t.type = 'allies'; t.count = 0; }
    if (/自身及随机/.test(text)) { t.type = t.type === 'self' ? 'allies' : t.type; }

    // named：只认「若目标为X」这种显式指名，避免把技能名误当英雄
    if ((m = text.match(/(?:若)?目标为\s*([\u4e00-\u9fa5]{2,4})/))) { t.filter.push('named:' + m[1]); }

    return t;
  }

  /* ---- gain ---- */
  function parseGain(text, rawSegment) {
    var g = {
      level: { perm: 0, temp: 0, team: false },
      energy: 0, goldCoin: 0,
      draw: { type: 'hero', count: 0, spec: null },
      refresh: 0, opaque: null
    };
    var m, touched = false;
    var permContext = /永久/.test(text);

    // 注意：正则字面量在循环里每次求值都会新建对象 → lastIndex 永远归零 → 死循环。
    // 必须先建好带 g 的实例再用。
    var reLv = /等级\s*[+＋]\s*(\d+)/g;
    while ((m = reLv.exec(text))) {
      var n = +m[1];
      var near = text.slice(Math.max(0, m.index - 14), m.index + 8);
      if (permContext && !/临时/.test(near)) g.level.perm += n;
      else g.level.temp += n;
      touched = true;
    }
    if ((m = /临时等级\s*\+?\s*(\d+)/.exec(text))) { g.level.temp += +m[1]; touched = true; }
    if ((m = /(\d+)\s*临时等级/.exec(text))) { g.level.temp += +m[1]; touched = true; }

    if ((m = /获得\s*(\d+)\s*张([^，。；\s]{2,10})/.exec(text))) {
      var spec = m[2];
      g.draw.count += +m[1];
      g.draw.spec = spec;
      if (/英雄/.test(spec)) g.draw.type = 'hero';
      else if (/战术|效果|古币|兑换券|补贴/.test(spec)) g.draw.type = 'effect';
      else g.draw.type = 'named';
      touched = true;
    }
    if ((m = /获得\s*(\d+)\s*次(?:免费)?刷新/.exec(text)) || (m = /(\d+)\s*次免费刷新/.exec(text))) {
      g.refresh += +m[1]; touched = true;
    } else if (/免费刷新/.test(text)) { g.refresh += 1; touched = true; }

    if ((m = /获得\s*(\d+)\s*能量/.exec(text)) || (m = /(\d+)\s*(?:点)?能量/.exec(text))) { g.energy += +m[1]; touched = true; }

    if ((m = /(\d+)\s*张古币/.exec(text)) || (m = /(\d+)\s*张\s*古币/.exec(text))) { g.goldCoin += +m[1]; touched = true; }
    else if (/古币牌?/.test(text)) { g.goldCoin += 1; touched = true; }

    if (/全队|全体|所有/.test(text) && !g.level.team && (g.level.perm || g.level.temp)) g.level.team = true;

    // opaque 的判定标准：这段里有没有「我们这一版明确不模拟」的东西。
    // 只有这种情况才留原文——否则整张卡会被误标 partial（早期版本曾因此把 77% 的卡
    // 判成 partial，全是假阳性）。
    var NO_SIM = /免疫|控制|吸血|护盾|伤害|攻击力|攻击速度|攻速|生命值|生命|法力|技能|法术|物理|召唤|复活|复生|摧毁|转化为|不被优先攻击|击败|阵亡/;
    var plain = norm(plainify(rawSegment)) || norm(text);
    if (!touched || NO_SIM.test(plain)) g.opaque = plain;

    return g;
  }

  /* ---- retrigger ---- */
  function parseRetrigger(text) {
    var m;
    if ((m = /随机触发\s*(\d*)\s*名[^的]{0,16}?的\s*([\u4e00-\u9fa5]{2,5})\s*效果/.exec(text))) {
      return { event: m[2], maxHops: 8, random: true, count: m[1] ? +m[1] : 1 };
    }
    if ((m = /触发\s*(\d+)\s*名英雄的\s*([\u4e00-\u9fa5]{2,5})\s*效果/.exec(text))) {
      return { event: m[2], maxHops: 8, random: false, count: +m[1] };
    }
    if ((m = /(?:每当|每当你)?[^，。]{0,10}触发\s*([\u4e00-\u9fa5]{2,5})\s*效果/.exec(text))) {
      return { event: m[1], maxHops: 8, random: false, count: 1 };
    }
    return null;
  }

  /**
   * 原文 → Effect[]（自动解析）。抽不干净的地方会留 gain.opaque，
   * 并把 parse 标成 'partial'，让界面/后续人工都能看出哪些还没吃透。
   */
  function parseDesc(desc, card) {
    var txt = tokenize(desc);
    var lines = txt.split(/\n+/).map(norm).filter(Boolean);
    var effects = [];
    var traits = [];       // 跨行累积的标签（官方常把「闪现」单独写成一行）
    var allKws = [];
    var partial = false;

    function pushKw(k) { if (k && allKws.indexOf(k) < 0) allKws.push(k); }

    lines.forEach(function (line) {
      var rest = line, lead = [], m;
      while ((m = rest.match(RE_TOK))) {
        lead.push(m[2] || BY_HREF[m[1]] || ('#' + m[1]));
        rest = rest.slice(m[0].length);
      }
      rest = rest.replace(/^[：:]\s*/, '');
      lead.forEach(pushKw);

      // 只有标签、没有正文 → 记成 trait，等下一段认领
      if (!rest) { lead.forEach(function (k) { if (traits.indexOf(k) < 0) traits.push(k); }); return; }

      var when = null;
      for (var i = 0; i < lead.length; i++) {
        if (PHASES.indexOf(lead[i]) >= 0) { when = lead[i]; break; }
        // 「每当…触发【登场】效果时」这种把时机写在正文里的
      }
      var listen = null;
      if (/每当|每有|每次|在场时/.test(rest)) {
        var wm = rest.match(new RegExp('触发\\s*(' + KW + ')\\s*效果'));
        if (wm && PHASES.indexOf(wm[1]) >= 0) listen = wm[1];
        if (!listen && when) listen = when;
      }
      // 监听类效果（如小乔「每当你的英雄触发登场效果时」）本身没有时机主词，
      // 统一写成 when = 被监听的事件，引擎才能按 phase 归位。
      if (!when && listen) when = listen;

      var gain = parseGain(rest, rest);
      var rt = parseRetrigger(rest);

      // 产牌型：「获得1张其他的登场英雄牌」→ 抽到的牌会入场，等价于再触发一次 登场
      var emit = rt ? rt.event : null;
      if (!emit && gain.draw.count > 0 && gain.draw.spec &&
          /登场|整备|开团|牺牲|复生|合成/.test(gain.draw.spec)) {
        var dm = gain.draw.spec.match(new RegExp('(' + PHASES.join('|') + ')'));
        if (dm) emit = dm[1];
      }
      if (!emit && gain.opaque && /登场英雄牌/.test(gain.opaque)) emit = '登场';

      if (!when && !rt && !listen && gain.opaque) { /* 纯被动，下面照常建 effect */ }
      if (gain.opaque) partial = true;

      var idx = effects.length;
      effects.push({
        id: String(card.id) + '-a' + idx,
        // raw = 这一段官方原文（已还原词条汉字）。时间轴优先显示它，
        // 保证「界面上看到的 = 官方写的」，不会因为解析而改写原话。
        raw: norm(plainify(line)),
        when: when,
        listen: listen,
        emit: emit,
        target: parseTarget(rest, lead),
        gain: gain,
        retrigger: rt ? { event: rt.event, maxHops: rt.maxHops, random: rt.random } : { event: null, maxHops: 8, random: false },
        flags: []
      });
      traits = [];   // 被本段认领
    });

    return {
      id: card.id,
      name: card.name,
      kind: card.kind,
      faction: card.faction || null,
      quality: card.quality,
      keywords: allKws,
      effects: effects,
      parse: partial ? 'partial' : 'auto',
      notes: ''
    };
  }

  /* ------------------------------------------------------------------ *
   * 手工覆盖
   * ------------------------------------------------------------------------
   * 只写自动解析吃不透、或连锁里必须精确的卡。每张都能回答一句话：
   * 「自动解析哪里不对？」——答不上来就别写，交给 auto 更省心。
   * replaceAll:true 表示完全以手工为准（不做逐条合并）。
   * ------------------------------------------------------------------ */

  function L(perm, temp, team) { return { perm: perm || 0, temp: temp || 0, team: !!team }; }
  function D(type, count, spec) { return { type: type || 'hero', count: count || 0, spec: spec || null }; }
  function G(o) {
    o = o || {};
    return {
      level: o.level || L(0, 0, false),
      energy: o.energy || 0,
      goldCoin: o.goldCoin || 0,
      draw: o.draw || D('hero', 0, null),
      refresh: o.refresh || 0,
      // 【扩展字段 · schema 1 之后新增，引擎对未知字段一律忽略】
      // 阿科米亚核心不是场上单位，它的等级不能混进 summary 的英雄等级池，
      // 否则「全体等级合计」会虚高。单列一个 coreLevel 统计。
      coreLevel: o.coreLevel || 0,
      opaque: o.opaque || null
    };
  }
  function T(type, o) {
    o = o || {};
    return { type: type, faction: o.faction || null, keyword: o.keyword || null, count: o.count == null ? 1 : o.count, filter: o.filter || [] };
  }
  function RT(event, o) {
    o = o || {};
    return { event: event || null, maxHops: o.maxHops || 8, random: !!o.random };
  }
  function E(id, when, o) {
    o = o || {};
    return {
      id: id, when: when, listen: o.listen || null, emit: o.emit || null,
      target: o.target || T('self'), gain: o.gain || G(), retrigger: o.retrigger || RT(null),
      flags: o.flags || []
    };
  }
  function card(id, name, kind, faction, effects, kws, notes) {
    return { id: id, name: name, kind: kind, faction: faction, keywords: kws, effects: effects, parse: 'manual', replaceAll: true, notes: notes || '' };
  }

  var MANUAL = {
    /* ===== 三分登场无限循环的核心三张（连锁必须精确） ===== */
    '1281': card(1281, '曹操', 'hero', '三分之地', [
      E('caocao-prep', '整备', {
        emit: '登场',
        target: T('faction', { faction: '三分之地', count: 1 }),
        retrigger: RT('登场', { random: true })
      })
    ], ['整备', '登场'], '整备随机触发 1 名【三分之地】的登场；三分循环的发动机。'),

    '1271': card(1271, '甄姬', 'hero', '三分之地', [
      E('zhenji-enter', '登场', {
        emit: '登场',
        // 官方原文是「获得 1 张**其他的**登场英雄牌」——抽到的那张牌入场即再触发一次登场。
        // 目标写成 keyword:登场 而不是 self，否则引擎会在甄姬身上立刻自环，链就假了。
        target: T('keyword', { keyword: '登场', count: 1, filter: ['excludeSelf'] }),
        gain: G({ draw: D('hero', 1, '登场英雄牌') }),
        retrigger: RT('登场', { random: true })
      })
    ], ['登场'], '曹操链的续命环：把「下一个登场」递给场外的新牌。拿掉她，链就停在曹操。'),

    '1461': card(1461, '露娜', 'hero', '日落海', [
      E('luna-enter', '登场', {
        emit: '整备',
        target: T('allies', { count: 2 }),
        gain: G({ coreLevel: 2 }),
        retrigger: RT('整备', { random: true })
      })
    ], ['闪现', '登场', '整备', '阿科米亚核心'], '登场：核心 +2，且随机触发 2 名英雄的整备——回手指向曹操，闭环成立。'),

    /* ===== GUIDE.combos 里出现、且自动解析会走样的卡 ===== */
    '1061': card(1061, '小乔', 'hero', '三分之地', [
      E('xiaoqiao-listen', '登场', {
        listen: '登场',
        target: T('random', { count: 3 }),
        gain: G({ level: L(0, 1) })
      })
    ], ['登场'], '监听「登场」：任何人（含曹操触发的）登场都让它给随机 3 名+1。'),

    '1241': card(1241, '周瑜', 'hero', '三分之地', [
      E('zhouyu-enter', '登场', { target: T('allies', { count: 0 }), gain: G({ level: L(0, 1, true) }) })
    ], ['登场'], '★ 全场 +1，但不会回头触发整备——曹操链缺甄姬时就是停在这里。'),

    '1591': card(1591, '朵莉亚', 'hero', '日落海', [
      E('dolia-listen', '整备', {
        listen: '整备',
        target: T('random', { count: 3 }),
        gain: G({ level: L(0, 1) })
      })
    ], ['整备'], '监听「整备」的第二个接收者，会让整备链变宽。'),

    '1541': card(1541, '花木兰', 'hero', '河洛', [
      E('hmulan-gold', null, {
        listen: '转瞬',
        target: T('self'),
        gain: G({ opaque: '本回合每使用 5 张古币牌，获得 1 次复生' })
      }),
      E('hmulan-sac', '牺牲', { target: T('self'), gain: G({ level: L(0, 10) }) })
    ], ['复生', '牺牲', '临时等级'], '第一段是计数型被动（每 5 张古币换 1 次复生），没有固定时机，标 opaque。'),

    '1991': card(1991, '公孙离', 'hero', '无阵营', [
      E('gongsunli-kaituan', '开团', {
        target: T('keyword', { keyword: '觉醒', count: 0 }),
        gain: G({ opaque: '场上每有 1 名已觉醒英雄，攻击速度 +15%' })
      })
    ], ['夺取', '开团', '觉醒'], '收益是攻速（战斗数值），本版不模拟打架，记 opaque。'),

    '5011': card(5011, '明世隐', 'hero', '无阵营', [
      E('mingshiyin-convert', null, {
        target: T('nearest'),
        gain: G({ level: L(2, 0), opaque: '把临时等级中的 2 级转为永久等级' })
      }),
      E('mingshiyin-enter', '登场', { target: T('self'), gain: G({ opaque: '可转化的等级 +2' }) })
    ], ['临时等级', '登场'], '转永久是「临时→永久」的搬运，本版只记数字 2，不扣减临时池。'),

    '5111': card(5111, '猪八戒', 'hero', '无阵营', [
      E('zhubajie-listen', '合成', {
        listen: '合成',
        target: T('keyword', { keyword: '同阶', count: 0 }),
        gain: G({ level: L(0, 1) })
      })
    ], ['夺取', '合成'], '监听「合成」：3 阶及以下合成时同阶+1。'),

    '5061': card(5061, '云中君', 'hero', '大河流域', [
      E('yunzhongjun-kaituan', '开团', {
        target: T('equippedMost', { count: 0 }),
        gain: G({ level: L(1, 0, false), opaque: '每穿戴 1 件装备 +1 永久等级；装备件数不进沙盒，按 1 件记' })
      })
    ], ['闪现', '开团'], '永久+1／件，件数本版按 1 记（装备数量不进沙盒）。'),

    '1311': card(1311, '李白', 'hero', '河洛', [
      E('libai-gold', null, {
        listen: '转瞬',
        target: T('self'),
        gain: G({ level: L(0, 4), opaque: '古币牌额外提供 4 临时等级；若目标为李白再 +3' })
      })
    ], ['闪现', '临时等级'], '古币放大器：把古币的 +2 变成 +6。'),

    '1931': card(1931, '铠', 'hero', '河洛', [
      E('kai-sac', '牺牲', { target: T('faction', { faction: '河洛', count: 0 }), gain: G({ level: L(0, 5, true) }) })
    ], ['复生', '牺牲', '临时等级'], '复生是防御机制（不演算战斗），只取「牺牲 → 全河洛 +5 临时等级」。'),

    '1941': card(1941, '苏烈', 'hero', '河洛', [
      E('sulie-sac', '牺牲', { target: T('self'), gain: G({ level: L(2, 0) }) })
    ], ['牺牲'], '用户截图那张卡：牺牲 → 等级永久+2。'),

    '1351': card(1351, '项羽', 'hero', '大河流域', [
      E('xiangyu-sac', '牺牲', {
        target: T('keyword', { keyword: '图腾', count: 0 }),
        gain: G({ level: L(3, 0, true), opaque: '本回合你的召唤物免疫控制' })
      })
    ], ['牺牲', '图腾'], '图腾永久+3 计入；「免疫控制」是战斗效果，记 opaque。'),

    '5041': card(5041, '米莱狄', 'hero', '日落海', [
      E('milady-summon', null, { target: T('self'), gain: G({ opaque: '召唤单位获得 3 临时等级' }) }),
      E('milady-prep', '整备', {
        target: T('core'),
        gain: G({ coreLevel: 3, opaque: '该临时等级额外 +3（作用于召唤单位）' })
      })
    ], ['临时等级', '整备', '阿科米亚核心'], '两段都作用在召唤单位／核心上，本版不建模召唤物 → 记 opaque，核心那 3 级走 coreLevel。'),

    '1951': card(1951, '百里玄策', 'hero', '河洛', [
      E('xuanze-prep', '整备', {
        listen: '整备',
        target: T('keyword', { keyword: '闪现', count: 1 }),
        gain: G({ level: L(0, 1), opaque: '需上回合闪现英雄有击败记录（击败次数：0）' })
      })
    ], ['闪现', '整备'], '收益挂在上回合击败次数上——本版没有战斗，条件默认不成立，标 opaque。'),

    '1731': card(1731, '李元芳', 'hero', '河洛', [
      E('liyuanfang-prep', '整备', {
        target: T('nearest', { faction: '河洛' }),
        gain: G({ goldCoin: 1 })
      })
    ], ['整备'], '整备产 1 张古币，对最近的【河洛】使用 → 等价于给河洛 +2。'),

    '1441': card(1441, '程咬金', 'hero', '河洛', [
      E('chengyaojin-prep', '整备', { target: T('self'), gain: G({ goldCoin: 2 }) })
    ], ['整备'], '获得 1 张古币 + 对自己用 1 张 = 2 张古币的收益。'),

    '5131': card(5131, '上官婉儿', 'hero', '河洛', [
      E('shangguan-prep', '整备', {
        target: T('faction', { faction: '河洛', count: 3 }),
        gain: G({ goldCoin: 3 })
      })
    ], ['整备'], '随机对 3 名不同【河洛】各用 1 张古币 = 3 张。'),

    '5091': card(5091, '盾山', 'hero', '河洛', [
      E('dunshan-sac', '牺牲', { target: T('self'), gain: G({ goldCoin: 1 }) })
    ], ['牺牲'], '牺牲换 1 张古币。'),

    '1741': card(1741, '虞姬', 'hero', '大河流域', [
      E('yuji-kaituan', '开团', {
        target: T('faction', { faction: '大河流域', count: 3 }),
        gain: G({ level: L(0, 1) })
      })
    ], ['开团', '图腾'], '每有 1 个图腾就给自身+随机 2 名大河 +1（图腾数不进沙盒，按 1 次记）。'),

    '1761': card(1761, '杨玉环', 'hero', '无阵营', [
      E('yangyuhuan-passive', null, { target: T('self'), gain: G({ draw: D('named', 1, '弦音') }) }),
      E('yangyuhuan-exit', '退场', { target: T('self'), gain: G({ draw: D('named', 1, '弦音') }) })
    ], ['退场'], '每 3 回合 + 退场各产 1 张弦音，用来推进觉醒。'),

    '1101': card(1101, '嬴政', 'hero', '逐鹿', [
      E('yingzheng-kaituan', '开团', { target: T('self'), gain: G({ opaque: '法术攻击力 +7，每次使用战术牌提升该加成' }) })
    ], ['开团'], '纯战斗数值，本版不模拟打架，整段标 opaque。'),

    '1231': card(1231, '吕布', 'hero', '三分之地', [
      E('lvbu-kaituan', '开团', {
        target: T('faction', { faction: '三分之地', count: 3 }),
        gain: G({ opaque: '等级最高的 3 名【三分之地】获得 20% 吸血，若目标为吕布则翻倍' })
      })
    ], ['开团'], '吸血是战斗数值 → opaque。注意吕布没有登场，所以曹操触发不到他。'),

    '1411': card(1411, '貂蝉', 'hero', '三分之地', [
      E('diaochan-enter', '登场', { target: T('faction', { faction: '三分之地', count: 0 }), gain: G({ level: L(0, 1) }) })
    ], ['登场'], '登场给全【三分之地】+1。'),

    '1071': card(1071, '赵云', 'hero', '三分之地', [
      E('zhaoyun-enter', '登场', { target: T('allies', { count: 3 }), gain: G({ level: L(0, 1) }) })
    ], ['登场'], '自身及随机 2 名其他英雄 +1。'),

    '1111': card(1111, '孙尚香', 'hero', '三分之地', [
      E('sunshangxiang-enter', '登场', { target: T('self'), gain: G({ refresh: 1 }) })
    ], ['登场'], '登场给 1 次免费刷新。'),

    '1161': card(1161, '阿轲', 'hero', '无阵营', [
      E('ake-enter', '登场', {
        target: T('allies', { count: 2 }),
        gain: G({ level: L(0, 1) }),
        flags: ['repeatOnHp']
      })
    ], ['闪现', '登场'], '棋手生命每降 10 点重复 1 次——重复次数取决于战况，本版按 1 次记并标不确定。'),

    '5031': card(5031, '狂铁', 'hero', '日落海', [
      E('kuangtie-prep', '整备', { target: T('core'), gain: G({ coreLevel: 2 }) })
    ], ['整备', '阿科米亚核心'], '整备给核心 +2。核心不是场上英雄 → 走 coreLevel，不进英雄等级池。'),

    '5141': card(5141, '亚连', 'hero', '日落海', [
      E('yalian-prep', '整备', {
        target: T('equippedMost', { faction: '日落海', count: 1 }),
        gain: G({ level: L(0, 2), coreLevel: 1 })
      })
    ], ['整备', '阿科米亚核心'], '官方是「装备最多的 1 名【日落海】+2 且核心 +1」，合并成一条，避免时间轴出现两行同源步骤。'),

    '1751': card(1751, '钟馗', 'hero', '河洛', [
      E('zhongkui-grantSac', null, {
        target: T('allies', { count: 3 }),
        gain: G({ opaque: '自身及左右 1 格获得「牺牲：击败者等级临时降低 10%」' }),
        flags: ['oncePerCombat', 'grantsKeyword']
      })
    ], ['牺牲'], '它是「把牺牲授予别人」而不是自己触发 → 记 opaque，别让它混进牺牲链。'),

    '5221': card(5221, '曜', 'hero', '逐鹿', [
      E('yao-passive', null, { target: T('self'), gain: G({ opaque: '你的英雄合成提升的等级 +1' }) })
    ], ['合成'], '合成增幅器（被动），本版记 opaque。'),

    '1391': card(1391, '老夫子', 'hero', '逐鹿', [
      E('laofuzi-listen', '合成', {
        listen: '合成',
        target: T('self'),
        gain: G({ draw: D('effect', 1, '招募战术') })
      })
    ], ['合成'], '每回合首次合成产 1 张招募战术。'),

    '1121': card(1121, '鲁班七号', 'hero', '逐鹿', [
      E('luban-listen', '合成', {
        listen: '合成',
        target: T('self'),
        gain: G({ draw: D('effect', 1, '战术牌') })
      })
    ], ['合成'], '每合成 3 次随机产 1 张战术牌。'),

    '1131': card(1131, '庄周', 'hero', '逐鹿', [
      E('zhuangzhou-enter', '登场', { target: T('self'), gain: G({ level: L(0, 2), draw: D('effect', 1, '招募战术') }) })
    ], ['登场'], '登场自身+2 且产 1 张招募战术。'),

    '1361': card(1361, '武则天', 'hero', '河洛', [
      E('wuzetian-gold', null, { target: T('self'), gain: G({ opaque: '古币牌提升的等级 +1' }) }),
      E('wuzetian-enter', '登场', { target: T('self'), gain: G({ draw: D('effect', 1, '精致古币') }) })
    ], ['登场'], '古币增幅器 + 登场产精致古币。'),

    '1871': card(1871, '东皇太一', 'hero', '大河流域', [
      E('donghuang-kaituan', '开团', {
        target: T('keyword', { keyword: '图腾', count: 0 }),
        gain: G({ level: L(0, 1), opaque: '获得每个图腾等级数 15% 的临时等级' })
      })
    ], ['图腾', '开团', '临时等级'], '图腾保护 + 开团吃图腾等级。'),

    '5771': card(5771, '少司缘', 'hero', '大河流域', [
      E('shaosiyuan-summon', null, { target: T('keyword', { keyword: '因缘图腾', count: 1 }), gain: G({ opaque: '在场时召唤因缘图腾' }) })
    ], ['因缘图腾'], '召唤图腾，纯铺垫。'),

    '5171': card(5171, '大司命', 'hero', '大河流域', [
      E('dasiming-summon', null, { target: T('keyword', { keyword: '往生图腾', count: 1 }), gain: G({ opaque: '在场时召唤往生图腾' }) }),
      E('dasiming-sac', '牺牲', { listen: '牺牲', target: T('keyword', { keyword: '往生图腾' }), gain: G({ level: L(2, 0) }) })
    ], ['往生图腾', '牺牲'], '监听牺牲给往生图腾永久+2。'),

    '1891': card(1891, '鬼谷子', 'hero', '大河流域', [
      E('guiguzi-summon', null, { target: T('keyword', { keyword: '先知图腾', count: 1 }), gain: G({ opaque: '在场时召唤先知图腾' }) })
    ], ['先知图腾'], '召唤先知图腾，纯铺垫。'),

    '5271': card(5271, '蒙恬', 'hero', '逐鹿', [
      E('mengtian-sac', '牺牲', { target: T('self'), gain: G({ opaque: '召唤 2 名与自身等级相同的玄雍士兵' }) })
    ], ['牺牲'], '召唤单位，本版不建模召唤物 → opaque。'),

    '1051': card(1051, '廉颇', 'hero', '逐鹿', [
      E('lianpo-passive', null, { target: T('allies', { count: 0 }), gain: G({ opaque: '释放技能时其他英雄获得 5 点护盾值' }) })
    ], [], '护盾是战斗数值 → opaque。'),

    '1201': card(1201, '白起', 'hero', '逐鹿', [
      E('baiqi-passive', null, { listen: '转瞬', target: T('self'), gain: G({ draw: D('effect', 1, '援护战术') }) })
    ], ['转瞬'], '每回合首次使用效果牌产 1 张援护战术。'),

    /* ===== 效果牌：古币与刷新（连锁里唯一会真的改变数值的一类） ===== */
    '311002': card(311002, '古币', 'effect', '河洛', [
      E('gold-coin', '转瞬', { target: T('faction', { faction: '河洛', count: 1 }), gain: G({ level: L(0, 2) }) })
    ], ['转瞬'], '指定 1 名【河洛】+2——花木兰 / 李白 / 百里玄策链条的燃料。'),

    '311003': card(311003, '精致古币', 'effect', '河洛', [
      E('fine-gold-coin', '转瞬', { target: T('faction', { faction: '河洛', count: 1 }), gain: G({ level: L(0, 4) }) })
    ], ['转瞬'], '古币的升级版：+4。'),

    '7087': card(7087, '惊喜补贴', 'effect', '通用', [
      E('surprise-sub', null, { target: T('self'), gain: G({ refresh: 3 }) })
    ], [], '3 次免费刷新。'),

    '7502': card(7502, '古币多多', 'effect', '河洛', [
      E('more-gold', null, { target: T('self'), gain: G({ goldCoin: 2 }) })
    ], [], '直接产 2 张古币。')
  };

  /* ------------------------------------------------------------------ *
   * 合并：手工覆盖 > 自动解析
   * ------------------------------------------------------------------ */

  function mergeCard(auto, man) {
    if (!man) return auto;
    if (man.replaceAll !== false) {
      return {
        id: man.id, name: man.name, kind: man.kind, faction: man.faction,
        quality: auto.quality, keywords: man.keywords || auto.keywords,
        effects: man.effects, parse: 'manual', notes: man.notes || ''
      };
    }
    var byId = {}, order = [];
    auto.effects.forEach(function (e) { if (!byId[e.id]) order.push(e.id); byId[e.id] = e; });
    man.effects.forEach(function (e) { if (!byId[e.id]) order.push(e.id); byId[e.id] = e; });
    var kws = auto.keywords.slice();
    (man.keywords || []).forEach(function (k) { if (kws.indexOf(k) < 0) kws.push(k); });
    return {
      id: man.id, name: man.name, kind: man.kind, faction: man.faction,
      quality: auto.quality, keywords: kws,
      effects: order.map(function (k) { return byId[k]; }),
      parse: 'manual', notes: man.notes || ''
    };
  }

  /**
   * 把 A 层的卡池解析成「id → 卡规则」。
   * pools: [{ kind:'hero'|'effect'|'equip'|'talent'|'player', cards:[...] }, ...]
   */
  function resolve(pools) {
    var out = {};
    (pools || []).forEach(function (p) {
      (p.cards || []).forEach(function (c) {
        var auto = parseDesc(c.desc, { id: c.id, name: c.name, kind: p.kind, faction: c.faction, quality: c.quality });
        var man = MANUAL[String(c.id)];
        out[String(c.id)] = mergeCard(auto, man);
      });
    });
    // 统计在合并完成后再数，避免手工条目被覆盖时数错
    var stats = { total: 0, auto: 0, manual: 0, partial: 0, withKeywords: 0, withRetrigger: 0, withOpaque: 0 };
    Object.keys(out).forEach(function (k) {
      var c = out[k];
      stats.total++;
      stats[c.parse] = (stats[c.parse] || 0) + 1;
      if (c.keywords && c.keywords.length) stats.withKeywords++;
      if (c.effects.some(function (e) { return e.retrigger && e.retrigger.event; })) stats.withRetrigger++;
      if (c.effects.some(function (e) { return e.gain && e.gain.opaque; })) stats.withOpaque++;
    });
    return { cards: out, stats: stats };
  }

  /**
   * 从 A 层快照（window.WXQ_*）现取卡池。列在这里是为了让 UI / 引擎 / 自测
   * 用同一个口径，不要在别处另写一份「哪些卡算数」。
   * 注意：沙盒只上英雄牌与效果牌；装备/天赋会解析（供词条检索），但不上场。
   */
  function snapshotPools() {
    var g = (typeof window !== 'undefined' ? window : {});
    return [
      { kind: 'hero', cards: g.WXQ_HEROES || [] },
      { kind: 'effect', cards: g.WXQ_EFFECTS || [] },
      { kind: 'equip', cards: g.WXQ_EQUIPS || [] },
      { kind: 'talent', cards: g.WXQ_TALENTS || [] }
    ];
  }

  var _cache = null;
  function resolved() {
    if (!_cache) _cache = resolve(snapshotPools());
    return _cache;
  }

  var API = {
    schema: 1,
    patch: '2026-09-14',
    keywords: { byHref: BY_HREF, order: ORDER, phases: PHASES, traits: TRAITS, descs: DESCS },
    aliases: ALIASES,
    manual: MANUAL,            // 只放手工覆盖（原样保留，供补丁时 diff）
    // 供引擎 / UI / 自测调用的纯函数
    parseDesc: parseDesc,
    parseGain: parseGain,
    resolve: resolve,
    snapshotPools: snapshotPools,
    plainify: plainify,
    normFaction: normFaction,
    isPhase: function (k) { return PHASES.indexOf(k) >= 0; },
    manualIds: Object.keys(MANUAL)
  };

  // cards：官方 id(String) → 合并后的卡规则。惰性构建，首次访问时才解析 511 张卡。
  // 用 getter 而不是直接赋值，是为了「直接用 <script> 打开也能跑」（无构建、无异步）。
  Object.defineProperty(API, 'cards', {
    enumerable: true,
    get: function () { return resolved().cards; }
  });
  Object.defineProperty(API, 'stats', {
    enumerable: true,
    get: function () { return resolved().stats; }
  });
  // 换赛季后如果同页面重跑了数据，用这个清缓存
  API.invalidate = function () { _cache = null; return API; };

  window.WXQ_RULES = API;
})();
