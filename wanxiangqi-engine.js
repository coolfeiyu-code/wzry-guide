/* ============================================================================
 * 王者万象棋 · 连锁引擎（chain engine）
 * ----------------------------------------------------------------------------
 * 只做一件事：把「上场了哪几张牌」推演成「这一回合的触发序列」。
 *
 *   ⚠️ 只演算词条触发关系，不模拟打架。
 *      不算 DPS、不算站位伤害、不算胜率、不掷随机数。
 *
 * ── 三层分工（改代码前先读） ──────────────────────────────────────────────
 *   A 快照层  wanxiangqi-data.js      官方原文 / 图标 / id。换赛季 = 整份替换。
 *   B 规则层  wanxiangqi-rules.js     原文 → Effect；手工覆盖；阵营别名。
 *   C 引擎层  本文件                  吃 Effect，出时间轴。纯函数，无 DOM。
 *   D 界面层  wanxiangqi-chain.js     只负责画，不含任何规则。
 *
 * 本文件不读 window 上的任何业务全局（card 表 / 规则表都当参数传进来），
 * 唯一例外是文件末尾的自动自检——它会读 window.WXQ_* 来构造用例。
 *
 * ── 回合模型（四条约定，改之前先想清楚） ─────────────────────────────────
 *  1. 顶层按 rules.keywords.phases 顺序扫场：谁的 when 命中这个阶段，谁结算一次。
 *     同一个「单位 + 效果」一回合只**开局结算一次**（firedOnce）；
 *     被触发链拉起来的是额外结算，不算重复。
 *  2. 成环判定用**路径栈**，不是「访问计数」：
 *     只有「当前这条链的祖先里已经有我」才算环。
 *     反例（旧版踩过）：露娜登场回触发曹操整备、曹操整备又触发周瑜登场 ——
 *     曹操被结算了两次，但链是 曹操→周瑜 就走完了，**这不是环**。
 *     用访问计数会把这种有限链误判成死循环。
 *  3. 触发「X 的【E】效果」时，候选先过滤成**真的有【E】效果的牌**——
 *     「触发登场效果」这句话本身就蕴含对方有登场效果。
 *     过滤后为空，才退回去报「落空」，而不是把空触发混在正常链里。
 *  4. 随机一律不掷骰：候选 ≤ EXPAND_LIMIT 时全部展开成「若…」分支，
 *     超过就只记一句「随机 N 名」并入 uncertain。绝不假装算中某一个。
 *
 * ── 以后版本怎么扩（硬性约定） ────────────────────────────────────────────
 *  1. 新效果类型：去 B 层给 Effect 加【可选】字段，本引擎对未知字段一律忽略。
 *     **禁止 if (name === '某某')** —— 那等于把规则写回了引擎。
 *  2. 新时机：只在 B 层往 keywords.phases 追加；本引擎不硬编码阶段名。
 *  3. 棋手进沙盒：board 加 playerId，走 kind:'playerSkill' 的 effects，
 *     when 用一个新阶段（如「棋手技能」）。本版 schema 已允许，只是没上。
 *  4. 禁止把「版本 T0 阵容」写进本文件。阵容是 wanxiangqi-guide.js 的事。
 * ========================================================================== */
(function (global) {
  'use strict';

  var SCHEMA = 1;

  var MAX_STEPS = 90;          // 时间轴行数硬上限，防止病态卡面把页面撑爆
  var MAX_INVOCATIONS = 3;     // 同一 (单位,效果) 一回合最多被结算几次
  var EXPAND_LIMIT = 6;        // 随机候选 ≤ 6 名时展开成「若…」分支，超过不展开
  var PASSIVE_SEGMENT = '常驻'; // when 为 null 且不监听事件的无时机被动

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function arr(x) { return Array.isArray(x) ? x : []; }
  function S(x) { return String(x == null ? '' : x); }
  function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }

  function describeTarget(t) {
    if (!t) return '自己';
    var fac = t.faction ? '【' + t.faction + '】' : '';
    var num = t.count ? '随机 ' + t.count + ' 名' : '';
    switch (t.type) {
      case 'self': return '自身';
      case 'allies': return (t.count ? '随机 ' + t.count + ' 名' : '全体') + '英雄';
      case 'faction': return num ? num + fac + '英雄' : fac + '全体英雄';
      case 'keyword': return (num ? num : '全部') + '带【' + (t.keyword || '') + '】的牌';
      case 'random': return '随机 ' + (t.count || 1) + ' 名英雄';
      case 'nearest': return '距离最近的' + fac + '英雄';
      case 'equippedMost': return '装备最多的' + fac + '英雄';
      case 'named': return t.keyword || '指定目标';
      case 'core': return '阿科米亚核心';
      default: return t.type;
    }
  }

  function describeGain(g) {
    if (!g) return [];
    var out = [];
    if (g.level && (g.level.perm || g.level.temp)) {
      var bits = [];
      if (g.level.perm) bits.push('永久 +' + g.level.perm);
      if (g.level.temp) bits.push('临时 +' + g.level.temp);
      out.push((g.level.team ? '全队等级 ' : '等级 ') + bits.join(' / '));
    }
    if (g.coreLevel) out.push('阿科米亚核心 +' + g.coreLevel);
    if (g.goldCoin) out.push('古币 ×' + g.goldCoin);
    if (g.refresh) out.push('免费刷新 ×' + g.refresh);
    if (g.energy) out.push('能量 +' + g.energy);
    if (g.draw && g.draw.count) {
      var what = g.draw.spec || ({ hero: '英雄牌', effect: '效果牌', named: '牌' }[g.draw.type] || '牌');
      out.push('获得 ' + g.draw.count + ' 张' + what);
    }
    return out;
  }

  function buildText(unit, eff) {
    // 有官方原文就直接用原文 —— 界面上看到的必须等于官方写的
    if (eff.raw) return eff.raw;
    if (eff.__noop) return '「' + unit.name + '」没有【' + eff.when + '】效果，本次触发落空';
    var parts = [];
    if (eff.emit) parts.push('触发' + describeTarget(eff.target) + '的【' + eff.emit + '】效果');
    var gt = describeGain(eff.gain);
    if (gt.length) parts.push(gt.join('，'));
    if (eff.gain && eff.gain.opaque) parts.push(eff.gain.opaque);
    if (!parts.length) parts.push('（无收益，只标记词条）');
    return parts.join('；');
  }

  function emptySummary() {
    return {
      levelPerm: 0, levelTemp: 0, coreLevel: 0,
      goldCoins: 0, refresh: 0, energy: 0,
      draws: [], loops: false,
      // 「若…」分支里的收益单独记：随机分支是「可能」，不能和确定收益混成一个数。
      // exact = 总数 - hyp，界面要分开显示，否则就是在假装算准。
      hyp: { levelPerm: 0, levelTemp: 0, coreLevel: 0, goldCoins: 0, refresh: 0, energy: 0, draws: 0 },
      exact: { levelPerm: 0, levelTemp: 0, coreLevel: 0, goldCoins: 0, refresh: 0, energy: 0, draws: 0 },
      anyHyp: false, loopConditional: false,
      breaks: [], uncertain: [], deadEnds: [], errors: [],
      steps: 0
    };
  }

  /* ------------------------------------------------------------------ *
   * 主函数
   * ------------------------------------------------------------------ */

  /**
   * @param board  { heroes:[id...], effects:[id...], playerId?:string }
   * @param rules  WXQ_RULES 形状：{ keywords:{phases}, aliases, isPhase? }
   * @param cards  String(id) → 已合并的卡规则（WXQ_RULES.cards）
   */
  function simulate(board, rules, cards) {
    var none = { steps: [], ok: true, empty: true, summary: emptySummary() };
    if (!rules || !cards) {
      return { steps: [], ok: false, error: '缺少规则层或卡表', summary: emptySummary() };
    }

    /* ---- 1. 组队 ---- */
    var units = [], seen = {};
    function addUnit(id, kind, slot) {
      id = S(id);
      if (!id) return;
      var c = cards[id];
      if (!c) return;
      var key = kind + ':' + slot;
      if (seen[key]) return;
      seen[key] = 1;
      units.push({
        uid: kind + slot + '_' + id,
        id: id, name: c.name, faction: c.faction || null,
        kind: kind, card: c, effects: arr(c.effects), slot: slot
      });
    }
    arr(board && board.heroes).forEach(function (id, i) { addUnit(id, 'hero', i); });
    arr(board && board.effects).forEach(function (id, i) { addUnit(id, 'effect', i); });

    var heroes = units.filter(function (u) { return u.kind === 'hero'; });
    if (units.length < 2) return none;

    /* ---- 2. 运行态 ---- */
    var steps = [], seq = 0, loops = false, truncated = false;
    var firedOnce = {}, invocations = {};
    var sum = emptySummary();

    function log(o) {
      seq++;
      steps.push({
        order: seq, phase: o.phase, depth: o.depth || 0,
        sourceId: o.unit.id, sourceName: o.unit.name, sourceKind: o.unit.kind,
        when: o.eff.when || null, effectId: o.eff.id,
        text: o.text, emit: o.eff.emit || null,
        gainText: describeGain(o.eff.gain),
        loop: !!o.loop, repeat: !!o.repeat, uncertain: !!o.uncertain,
        hypothetical: !!o.hypothetical, branchOf: o.branchOf || null,
        note: o.note || null
      });
    }

    /* ---- 3. 目标解析 ---- */
    function hasEffect(unit, ev) {
      return unit.effects.some(function (e) { return e.when === ev; });
    }

    // 沙盒没有棋盘几何、没有装备计数、没有召唤物 → nearest / equippedMost 取第一个匹配者并标不确定
    function looseTargets(sel) {
      return !!sel && (sel.type === 'nearest' || sel.type === 'equippedMost');
    }
    function looseNote(sel) {
      if (!sel) return null;
      if (sel.type === 'nearest') return '沙盒里没有棋盘距离，取第一个匹配者，没算「最近」';
      if (sel.type === 'equippedMost') return '装备件数不进沙盒，取第一个匹配者';
      return null;
    }

    function candidates(sel, src, ev) {
      if (!sel) return [];
      var pool = heroes.slice();
      switch (sel.type) {
        case 'self': return [src];
        case 'core': return [];
        case 'faction':
          pool = pool.filter(function (u) { return u.faction && u.faction === sel.faction; });
          break;
        case 'keyword':
          // 先按「有没有这个时机的效果」匹配：曹操的关键词里也有「登场」，
          // 那只是它*引用*了登场，不能当成登场单位
          var byEffect = pool.filter(function (u) { return hasEffect(u, sel.keyword); });
          pool = byEffect.length ? byEffect
            : pool.filter(function (u) { return (u.card.keywords || []).indexOf(sel.keyword) >= 0; });
          break;
        default: break; // random / allies / nearest / equippedMost → 全体英雄
      }
      if (sel.type !== 'self' && sel.type !== 'core' && arr(sel.filter).indexOf('excludeSelf') >= 0) {
        pool = pool.filter(function (u) { return u.uid !== src.uid; });
      }
      return pool;
    }

    /**
     * 选目标。约定 3：触发「X 的【E】效果」时，X 必须真的有【E】效果。
     * 过滤后为空才退回原集合（这样仍能报「落空」而不是假装链还在）。
     */
    function pickTargets(eff, src, ev) {
      var all = candidates(eff.target, src, ev);
      var narrowed = all, filtered = false;
      if (ev) {
        var withE = all.filter(function (u) { return hasEffect(u, ev); });
        if (withE.length) { narrowed = withE; filtered = true; }
      }
      var want = (eff.target && eff.target.count) || 0;
      var loose = looseTargets(eff.target);
      var uncertain = loose || (want > 0 && want < narrowed.length);

      if (loose && narrowed.length > 1) {
        return { list: [narrowed[0]], all: all, narrowed: narrowed, want: 1, uncertain: true, expanded: false, filtered: filtered, loose: true };
      }
      if (want > 0 && narrowed.length > want) {
        if (narrowed.length <= EXPAND_LIMIT) {
          // 候选不多 → 全展开成「若…」，让用户看到所有走向（成环/断链一目了然）
          return { list: narrowed, all: all, narrowed: narrowed, want: want, uncertain: true, expanded: true, filtered: filtered };
        }
        return { list: [], all: all, narrowed: narrowed, want: want, uncertain: true, expanded: false, filtered: filtered };
      }
      return { list: narrowed, all: all, narrowed: narrowed, want: want, uncertain: uncertain, expanded: true, filtered: filtered };
    }

    /* ---- 4. 结算一个效果（含递归触发） ---- */
    function fire(unit, eff, phase, depth, ctx) {
      if (steps.length >= MAX_STEPS) { truncated = true; return 0; }
      ctx = ctx || {};
      var path = ctx.path || [];
      var key = unit.id + '|' + eff.id;

      // 约定 2：只有「当前链的祖先里有我」才叫环
      if (path.indexOf(key) >= 0) {
        loops = true;
        // 这条环是在「若…」分支里绕回来的话，界面上不能说「一定会成环」
        if (ctx.hypothetical) sum.loopConditional = true;
        log({
          phase: phase, depth: depth, unit: unit, eff: eff,
          text: buildText(unit, eff),
          loop: true, hypothetical: ctx.hypothetical, branchOf: ctx.branchOf,
          note: '又回到「' + unit.name + '」的同一条效果 —— 这条链首尾相接，即成环。已停止继续展开。'
        });
        return 0;
      }
      var inv = invocations[key] || 0;
      if (inv >= MAX_INVOCATIONS) {
        log({
          phase: phase, depth: depth, unit: unit, eff: eff,
          text: buildText(unit, eff),
          repeat: true, hypothetical: ctx.hypothetical, branchOf: ctx.branchOf,
          note: '本回合「' + unit.name + '」这条效果已结算 ' + inv + ' 次，达到上限，不再展开'
        });
        return 0;
      }
      invocations[key] = inv + 1;
      firedOnce[key] = true;

      // 这个效果会触发什么事件 —— 也是「候选要不要过滤」的依据
      var ev = (eff.retrigger && eff.retrigger.event) || eff.emit || null;

      var tgt = pickTargets(eff, unit, ev);
      var text = buildText(unit, eff);
      log({
        phase: phase, depth: depth, unit: unit, eff: eff, text: text,
        uncertain: tgt.uncertain || looseTargets(eff.target),
        hypothetical: ctx.hypothetical, branchOf: ctx.branchOf,
        note: looseTargets(eff.target) ? looseNote(eff.target)
          : (tgt.uncertain && tgt.expanded && tgt.want > 0
            ? '随机 ' + tgt.want + ' 名，共 ' + tgt.narrowed.length + ' 名候选 —— 下面按「若…」逐条列出，这不是掷骰结果' : null)
      });
      applyGain(eff.gain, heroes.length, ctx.hypothetical);

      if (!ev) {
        sum.deadEnds.push({ id: unit.id, name: unit.name, when: eff.when || null, depth: depth });
        return 0;
      }
      var maxHops = (eff.retrigger && eff.retrigger.maxHops) || 8;
      if (depth >= maxHops) {
        sum.uncertain.push('「' + unit.name + '」的触发链达到跳数上限（' + maxHops + ' 跳），后续未展开');
        return 0;
      }

      if (!tgt.expanded && tgt.narrowed.length > tgt.want) {
        sum.uncertain.push('「' + unit.name + '」触发的【' + ev + '】是随机 ' + tgt.want +
          ' 名（候选 ' + tgt.narrowed.length + ' 名），候选太多，本版不逐个展开');
      }

      var nextPath = path.concat([key]);
      var root = ctx.rootBranch || (seq + 1);
      var fired = 0;

      tgt.list.forEach(function (tu) {
        var childCtx = {
          path: nextPath, event: ev, rootBranch: root,
          hypothetical: ctx.hypothetical || (tgt.uncertain && tgt.want > 0)
        };
        fired += fireOn(tu, ev, phase, depth + 1, childCtx);
      });
      // 全局监听者：监听的是「阶段/事件」本身，谁都叫得动
      listenerTargets(phase, ev).forEach(function (lt) {
        lt.effects.forEach(function (le) {
          fired += fire(lt.unit, le, phase, depth + 1, {
            path: nextPath, event: ev, rootBranch: root, hypothetical: ctx.hypothetical
          });
        });
      });

      if (!fired && tgt.list.length && tgt.filtered === false) {
        sum.breaks.push('「' + unit.name + '」触发的【' + ev + '】落到' +
          tgt.list.map(function (u) { return '「' + u.name + '」'; }).join('、') +
          '身上是空的 —— 这几张牌本身没有【' + ev + '】效果，链在这里断。');
        suggestFor(ev);
      } else if (!fired && !tgt.list.length) {
        sum.breaks.push('「' + unit.name + '」触发的【' + ev + '】没有接收者：场上没有符合条件的牌。');
        suggestFor(ev);
      }
      return fired;
    }

    /** 让某个单位响应事件 ev（找它 when === ev 的效果） */
    function fireOn(unit, ev, phase, depth, ctx) {
      var hits = unit.effects.filter(function (e) { return e.when === ev; });
      if (!hits.length) {
        log({
          phase: phase, depth: depth, unit: unit,
          eff: { id: unit.id + '-noop', when: ev, __noop: true, emit: null, gain: {}, target: null },
          text: '「' + unit.name + '」没有【' + ev + '】效果，本次触发落空',
          hypothetical: ctx && ctx.hypothetical, branchOf: ctx && ctx.branchOf,
          uncertain: true, note: '空触发：它接不住这个事件'
        });
        return 0;
      }
      var n = 0;
      hits.forEach(function (e) { n += fire(unit, e, phase, depth, ctx); });
      return n;
    }

    /** 监听某阶段/事件的单位（纯查询，不往 unit 上挂东西） */
    function listenerTargets(phase, ev) {
      var out = [];
      units.forEach(function (u) {
        var le = u.effects.filter(function (e) {
          return e.listen && (e.listen === ev || e.listen === phase) && e.when !== phase;
        });
        if (le.length) out.push({ unit: u, effects: le });
      });
      return out;
    }

    /** 「缺哪张」→ 去卡池里找能接回这个事件的牌 */
    function suggestFor(ev) {
      var on = {};
      units.forEach(function (u) { on[u.id] = 1; });
      var cands = [];
      Object.keys(cards).forEach(function (id) {
        if (on[id]) return;
        var c = cards[id];
        if (c.kind !== 'hero' && c.kind !== 'effect') return;
        var ok = arr(c.effects).some(function (e) {
          // 能响应这个事件、且自己还能往下触发 → 才算「接得上」
          return e.when === ev && ((e.retrigger && e.retrigger.event) || e.emit);
        });
        if (ok) cands.push(c.name);
      });
      if (!cands.length) return;
      var line = '想接着往下走【' + ev + '】，可以补：' + cands.slice(0, 4).join(' / ') +
        (cands.length > 4 ? ' 等 ' + cands.length + ' 张' : '') + '。';
      if (sum.breaks.indexOf(line) < 0) sum.breaks.push(line);
    }

    function applyGain(g, heroCount, hyp) {
      if (!g) return;
      var mult = g.level && g.level.team ? (heroCount || 1) : 1;
      var dPerm = (g.level ? g.level.perm : 0) * mult;
      var dTemp = (g.level ? g.level.temp : 0) * mult;
      sum.levelPerm += dPerm;
      sum.levelTemp += dTemp;
      sum.coreLevel += g.coreLevel || 0;
      sum.goldCoins += g.goldCoin || 0;
      sum.refresh += g.refresh || 0;
      sum.energy += g.energy || 0;
      if (g.draw && g.draw.count) sum.draws.push({ type: g.draw.type, count: g.draw.count, spec: g.draw.spec });
      if (g.opaque) sum.opaqueCount++;
      if (hyp) {
        sum.anyHyp = true;
        sum.hyp.levelPerm += dPerm; sum.hyp.levelTemp += dTemp;
        sum.hyp.coreLevel += g.coreLevel || 0;
        sum.hyp.goldCoins += g.goldCoin || 0;
        sum.hyp.refresh += g.refresh || 0;
        sum.hyp.energy += g.energy || 0;
        if (g.draw && g.draw.count) sum.hyp.draws += g.draw.count;
      }
    }

    /* ---- 5. 跑时间轴 ---- */
    var phases = arr(rules.keywords && rules.keywords.phases);
    var segments = [PASSIVE_SEGMENT].concat(phases);

    segments.forEach(function (phase) {
      var hits = [];
      units.forEach(function (u) {
        u.effects.forEach(function (e) {
          if (phase === PASSIVE_SEGMENT) { if (!e.when && !e.listen) hits.push({ u: u, e: e }); }
          else if (e.when === phase) hits.push({ u: u, e: e });
        });
      });
      var before = steps.length;
      hits.forEach(function (h) {
        if (steps.length >= MAX_STEPS) { truncated = true; return; }
        // 约定 1：开局结算过一次的，顶层阶段扫描不再重复（它已经入场过了）
        if (firedOnce[h.u.id + '|' + h.e.id]) return;
        fire(h.u, h.e, phase, 0, { path: [], event: phase });
      });
      // 该阶段确实发生了事情 → 叫醒监听这个阶段的被动（李白对古币、白起对效果牌…）
      if (phase !== PASSIVE_SEGMENT && steps.length > before) {
        units.forEach(function (u) {
          u.effects.forEach(function (e) {
            if (e.listen === phase && e.when !== phase) {
              if (firedOnce[u.id + '|' + e.id]) return;
              fire(u, e, phase, 1, { path: [], event: phase });
            }
          });
        });
      }
    });

    if (truncated) sum.uncertain.push('时间轴达到 ' + MAX_STEPS + ' 行上限，后面还有未展开的步骤。');

    /* ---- 6. 收尾 ---- */
    sum.heroes = heroes.map(function (u) { return { id: u.id, name: u.name, faction: u.faction }; });
    sum.effects = units.filter(function (u) { return u.kind === 'effect'; })
      .map(function (u) { return { id: u.id, name: u.name }; });
    sum.loops = loops;
    sum.steps = steps.length;
    sum.uncertain = uniq(sum.uncertain);
    // 确定收益 = 总收益 - 「若…」分支收益
    sum.exact = {
      levelPerm: sum.levelPerm - sum.hyp.levelPerm,
      levelTemp: sum.levelTemp - sum.hyp.levelTemp,
      coreLevel: sum.coreLevel - sum.hyp.coreLevel,
      goldCoins: sum.goldCoins - sum.hyp.goldCoins,
      refresh: sum.refresh - sum.hyp.refresh,
      energy: sum.energy - sum.hyp.energy,
      draws: sum.draws.reduce(function (a, d) { return a + d.count; }, 0) - sum.hyp.draws
    };

    if (loops) {
      sum.breaks.unshift(sum.loopConditional
        ? '本回合**可能会成环**：但那条闭环落在标了「若」的随机分支里 —— 随机没落到那一条，链就是有终点的。'
        : '本回合**成环**：有一条触发链回到了自己已经走过的效果，理论上可以一直循环下去。');
    } else if (steps.length) {
      var deepest = sum.deadEnds.slice().sort(function (a, b) { return b.depth - a.depth; })[0];
      if (deepest) {
        sum.breaks.unshift('本回合没有成环。链在「' + deepest.name + '」停下 —— ' +
          (deepest.when ? '它的【' + deepest.when + '】' : '它的效果') + '不会再触发任何后续事件。');
      } else {
        sum.breaks.unshift('本回合没有成环：场上的触发关系是一条直线，没有回到已经走过的效果。');
      }
    }

    return { steps: steps, summary: sum, ok: true };
  }

  /* ------------------------------------------------------------------ *
   * 自检（页面加载时在 console 里跑；失败走 console.error，不弹 alert）
   * ------------------------------------------------------------------ */

  function idByName(cards, name) {
    var keys = Object.keys(cards);
    for (var i = 0; i < keys.length; i++) if (cards[keys[i]].name === name) return keys[i];
    return null;
  }

  function selfTest(rules, cards, guide) {
    rules = rules || global.WXQ_RULES;
    cards = cards || (rules && rules.cards);
    guide = guide || global.WXQ_GUIDE;
    if (!rules || !cards) return { ok: false, skipped: '规则层或卡表还没就绪' };

    var results = [];
    function check(name, cond, extra) {
      results.push({ name: name, ok: !!cond, extra: extra });
      if (!cond) console.error('[连锁自检] ✗ ' + name, extra === undefined ? '' : extra);
      return !!cond;
    }

    // 用例取 GUIDE 里「曹操 ⇄ 甄姬 ⇄ 露娜 · 三分登场无限循环」那套 partners
    var partners = null, missing = [];
    try {
      var hit = null;
      arr(guide && guide.combos && guide.combos.list).forEach(function (c) {
        if (!hit && arr(c.partners).indexOf('曹操') >= 0 && arr(c.partners).indexOf('甄姬') >= 0) hit = c;
      });
      partners = hit ? arr(hit.partners) : null;
    } catch (e) { /* 拿不到就用兜底名单 */ }

    var ids = [];
    (partners || ['曹操', '甄姬', '露娜', '周瑜', '吕布']).forEach(function (n) {
      var id = idByName(cards, n);
      if (id) ids.push(id); else missing.push(n);
    });

    var full = simulate({ heroes: ids }, rules, cards);
    check('曹操链：能跑出时间轴', full.steps.length > 0, { steps: full.steps.length });
    check('曹操链：时间轴含「整备」段',
      full.steps.some(function (s) { return s.phase === '整备'; }));
    check('曹操链：时间轴里出现过「登场」',
      full.steps.some(function (s) { return s.when === '登场'; }));
    check('曹操链：带甄姬 → 成环',
      full.summary.loops === true, { loops: full.summary.loops, steps: full.steps.length });

    var loopStep = full.steps.filter(function (s) { return s.loop; })[0];
    check('曹操链：成环那一步有中文说明', !!(loopStep && loopStep.note), loopStep && loopStep.note);
    // 循环应该绕回链条开头的那张牌，而不是随便在哪成环
    check('曹操链：循环绕回起点（曹操）而非随机某张',
      !!loopStep && loopStep.sourceName === '曹操',
      { loopAt: loopStep && loopStep.sourceName });

    var noZhenji = ids.filter(function (id) { return cards[id].name !== '甄姬'; });
    var broken = simulate({ heroes: noZhenji }, rules, cards);
    check('曹操链：拿掉甄姬 → 不成环', broken.summary.loops === false, { loops: broken.summary.loops });
    check('曹操链：拿掉甄姬 → 断点有中文说明',
      broken.summary.breaks.length > 0 && /断|停|补：/.test(broken.summary.breaks.join('')),
      broken.summary.breaks);

    check('随机触发：展开成「若…」而不是假装算准',
      full.steps.filter(function (s) { return s.hypothetical; }).every(function (s) { return !!s.note || !!s.text; }) &&
      full.steps.some(function (s) { return s.hypothetical || s.uncertain; }));

    // 数字口径：确定收益 + 若分支收益 必须等于总数，否则界面上会把「可能」读成「一定」
    var S = full.summary, sumOk = true;
    ['levelPerm', 'levelTemp', 'coreLevel', 'goldCoins', 'refresh', 'energy', 'draws'].forEach(function (k) {
      var total = (k === 'draws') ? (S.draws || []).reduce(function (a, d) { return a + d.count; }, 0) : S[k];
      if ((S.exact[k] || 0) + (S.hyp[k] || 0) !== total) sumOk = false;
    });
    check('结论数字：确定 + 若分支 = 总数（不把可能当一定）', sumOk, { exact: S.exact, hyp: S.hyp });

    if (S.loops && S.loopConditional) {
      check('成环若是随机分支才成立，说明里要写「可能」',
        S.breaks.some(function (b) { return /可能/.test(b); }), S.breaks[0]);
    }

    check('规则层：schema 是数字', typeof rules.schema === 'number', rules.schema);
    check('规则层：phases 非空', arr(rules.keywords && rules.keywords.phases).length > 0);

    var failed = results.filter(function (r) { return !r.ok; });
    console.log('[连锁自检] ' + (failed.length ? '✗' : '✓') + ' ' +
      (results.length - failed.length) + '/' + results.length + ' 通过' +
      (missing.length ? '（卡池里没有：' + missing.join('、') + '）' : '') +
      ' · engine schema=' + SCHEMA + ' · rules patch=' + (rules.patch || '?'));
    if (failed.length) console.error('[连锁自检] 失败项：', failed.map(function (f) { return f.name; }));

    return { ok: !failed.length, results: results, full: full, broken: broken };
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  var API = {
    schema: SCHEMA,
    simulate: simulate,
    selfTest: selfTest,
    describeTarget: describeTarget,
    describeGain: describeGain,
    idByName: idByName,
    MAX_STEPS: MAX_STEPS
  };
  global.WXQ_ENGINE = API;

  // 页面加载时自检（script 顺序保证 rules / data 已经就位）。
  // 放到下一个事件循环，不拖首屏；失败只进 console，不打断页面。
  if (typeof global.setTimeout === 'function') {
    global.setTimeout(function () {
      try {
        if (global.WXQ_RULES && global.WXQ_HEROES) API.selfTest();
      } catch (e) {
        console.error('[连锁自检] 抛异常：', e && e.message);
      }
    }, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
