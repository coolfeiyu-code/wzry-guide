/* ============================================================================
 * 王者万象棋 · 连锁界面（chain UI）
 * ----------------------------------------------------------------------------
 * 这一层只负责画，不含任何规则：词条怎么算、成不成环，全在 B/C 两层。
 * 拿不到 WXQ_RULES / WXQ_ENGINE 就老老实实显示「规则未加载」，不装作能用。
 *
 * ── 三层分工（改代码前先读） ──────────────────────────────────────────────
 *   A 快照层  wanxiangqi-data.js      官方原文 / 图标 / id
 *   B 规则层  wanxiangqi-rules.js     原文 → Effect
 *   C 引擎层  wanxiangqi-engine.js    上场 → 时间轴
 *   D 界面层  本文件                  只负责画
 *
 * ── 本版边界（页面上也要写清楚） ──────────────────────────────────────────
 *   · 只演算词条触发关系，不模拟打架（不算 DPS / 站位 / 胜率）
 *   · 6 个英雄槽 + 0~4 张效果牌；棋手位留到下个版本（schema 已预留）
 *   · 随机目标不掷骰：候选少就全展开成「若…」，候选多就只登记一句「随机 N 名」
 *   · 解析不了的官方长句按原文显示，但不计入任何数字
 * ========================================================================== */
(function (global) {
  'use strict';

  var MAX_HERO_SLOTS = 8;
  var MAX_EFFECT_SLOTS = 4;

  /* 沙盒状态：单独存，切 tab / 改筛选都不丢 */
  var sb = {
    heroes: new Array(MAX_HERO_SLOTS).fill(null),
    effects: new Array(MAX_EFFECT_SLOTS).fill(null),
    kw: [], join: 'or', deriv: [],
    picker: null,          // { kind:'hero'|'effect', slot:n, q:'' }
    source: null,          // { key, name, hint } 从阵容点进来
    last: null, lastBoardKey: ''
  };

  var KINDS = [
    { key: 'hero', label: '英雄牌', src: 'WXQ_HEROES' },
    { key: 'effect', label: '效果牌', src: 'WXQ_EFFECTS' },
    { key: 'equip', label: '装备牌', src: 'WXQ_EQUIPS' },
    { key: 'talent', label: '天赋牌', src: 'WXQ_TALENTS' }
  ];

  function ui() { return global.__wxqUI || {}; }
  function esc(s) { var f = ui().esc; return f ? f(s) : String(s == null ? '' : s); }

  function allCards() {
    var out = [];
    KINDS.forEach(function (k) {
      (global[k.src] || []).forEach(function (c) {
        out.push({ card: c, kind: k.key, kindLabel: k.label });
      });
    });
    return out;
  }

  function ruleOf(id) {
    var R = global.WXQ_RULES;
    if (!R) return null;
    return R.cards[String(id)] || null;
  }

  function heroById(id) {
    var H = global.WXQ_HEROES || [];
    for (var i = 0; i < H.length; i++) if (String(H[i].id) === String(id)) return H[i];
    return null;
  }
  function cardByType(type, id) {
    var ui2 = ui();
    var arr = ui2.TYPE && ui2.TYPE[type];
    if (arr) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; }
    return null;
  }
  function heroIdByName(name) {
    var H = global.WXQ_HEROES || [];
    for (var i = 0; i < H.length; i++) if (H[i].name === name) return H[i].id;
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 词条 / 派生过滤
   * ------------------------------------------------------------------ */

  function keywordTable() {
    var R = global.WXQ_RULES;
    if (!R) return [];
    var count = {}, order = R.keywords.order.slice();
    allCards().forEach(function (it) {
      var r = ruleOf(it.card.id);
      if (!r) return;
      (r.keywords || []).forEach(function (k) { count[k] = (count[k] || 0) + 1; });
    });
    // 只显示当前卡池实际出现过的
    var known = Object.keys(count);
    order = order.filter(function (k) { return count[k]; })
      .concat(known.filter(function (k) { return order.indexOf(k) < 0; }));
    return order.map(function (k) { return { name: k, n: count[k], isPhase: R.keywords.phases.indexOf(k) >= 0 }; });
  }

  function derivHit(rule, d) {
    var effs = (rule && rule.effects) || [];
    if (d === 'retrigger') return effs.some(function (e) { return (e.retrigger && e.retrigger.event) || e.emit; });
    if (d === 'level') return effs.some(function (e) { return e.gain && e.gain.level && (e.gain.level.perm || e.gain.level.temp); });
    if (d === 'produce') return effs.some(function (e) {
      return e.gain && ((e.gain.draw && e.gain.draw.count) || e.gain.goldCoin);
    });
    return true;
  }

  function passes(it, opt) {
    var R = global.WXQ_RULES; if (!R) return false;
    var r = ruleOf(it.card.id); if (!r) return false;
    var st = (opt && opt.state) || {};
    var kws = r.keywords || [];

    if (it.kind === 'hero' || it.kind === 'effect') { /* 场上牌，正常走 */ }
    if (sb.kw.length) {
      if (sb.join === 'and') { if (!sb.kw.every(function (k) { return kws.indexOf(k) >= 0; })) return false; }
      else if (!sb.kw.some(function (k) { return kws.indexOf(k) >= 0; })) return false;
    }
    if (sb.deriv.length && !sb.deriv.every(function (d) { return derivHit(r, d); })) return false;
    if (st.q && it.card.name.indexOf(st.q) < 0) return false;
    if (st.fac && (it.card.faction || '无阵营') !== st.fac) return false;
    if (st.qual && String(it.card.quality) !== String(st.qual)) return false;
    return true;
  }

  function filtered(opt) {
    var order = { hero: 0, effect: 1, equip: 2, talent: 3 };
    return allCards().filter(function (it) { return passes(it, opt); })
      .sort(function (a, b) { return order[a.kind] - order[b.kind]; });
  }

  /* ------------------------------------------------------------------ *
   * 分区 1：按词条查
   * ------------------------------------------------------------------ */

  function sectionFilter(state) {
    var R = global.WXQ_RULES;
    if (!R) return '<div class="tl-empty">规则层未加载，按词条查暂时不可用。</div>';
    var kws = keywordTable();
    var h = '';

    h += '<div class="chkw">' + kws.map(function (k) {
      var on = sb.kw.indexOf(k.name) >= 0 ? ' on' : '';
      return '<button class="chchip' + on + (k.isPhase ? ' ph' : '') + '" data-kw="' + esc(k.name) + '">' +
        esc(k.name) + '<i>' + k.n + '</i></button>';
    }).join('') + '</div>';

    h += '<div class="chrow">';
    h += '<span class="chlab">多选匹配</span><span class="chjoin">' +
      '<button class="chj' + (sb.join === 'or' ? ' on' : '') + '" data-join="or">或</button>' +
      '<button class="chj' + (sb.join === 'and' ? ' on' : '') + '" data-join="and">且</button></span>';
    h += '<span class="chlab">派生筛选</span>' +
      '<button class="chchip d' + (sb.deriv.indexOf('retrigger') >= 0 ? ' on' : '') + '" data-d="retrigger">会再触发事件</button>' +
      '<button class="chchip d' + (sb.deriv.indexOf('level') >= 0 ? ' on' : '') + '" data-d="level">会加等级</button>' +
      '<button class="chchip d' + (sb.deriv.indexOf('produce') >= 0 ? ' on' : '') + '" data-d="produce">会产牌 / 产古币</button>';
    if (sb.kw.length || sb.deriv.length || state.q || state.fac || state.qual) {
      h += '<button class="chclear" data-clear="filter">清空筛选</button>';
    }
    h += '</div>';

    var list = filtered({ state: state });
    var noFilter = !sb.kw.length && !sb.deriv.length && !state.q && !state.fac && !state.qual;
    h += '<div class="chcount">' + (noFilter ? '全部牌' : '命中的牌') + ' <b>' + list.length + '</b> 张' +
      (noFilter
        ? '<span class="chs">（含装备 / 天赋；只有英雄牌与效果牌能上场 —— 点上面的词条开始筛）</span>'
        : (list.length ? '<span class="chs">（含装备 / 天赋，但只有英雄牌与效果牌能上场）</span>' : '')) + '</div>';
    h += '<div class="grid chain-grid" id="chGrid">' + (list.length
      ? list.map(function (it) { return cardHtml(it); }).join('')
      : '<div class="empty">没有同时满足这些词条的牌 —— 放宽一个条件试试</div>') + '</div>';
    return h;
  }

  function cardHtml(it) {
    var c = it.card;
    var r = ruleOf(c.id);
    var kw = ((r && r.keywords) || []).slice(0, 3).map(function (k) {
      return '<span class="badge kw">' + esc(k) + '</span>';
    }).join('');
    var q = ui().qBadge ? ui().qBadge(c.quality) : '';
    return '<div class="ccard" data-type="' + it.kind + '" data-id="' + c.id + '">' +
      '<img class="img" loading="lazy" src="' + c.img + '" alt="' + esc(c.name) + '">' +
      '<div class="meta"><div class="nm">' + esc(c.name) + '</div>' +
      '<div class="bd">' + (it.kind === 'hero' || it.kind === 'effect' ? q : '<span class="badge">' + it.kindLabel + '</span>') + kw + '</div></div></div>';
  }

  /* ------------------------------------------------------------------ *
   * 分区 2：上场沙盒
   * ------------------------------------------------------------------ */

  function boardKey() {
    return sb.heroes.filter(Boolean).join(',') + '|' + sb.effects.filter(Boolean).join(',');
  }

  function sim() {
    var E = global.WXQ_ENGINE, R = global.WXQ_RULES;
    var k = boardKey();
    if (sb.last && sb.lastBoardKey === k) return sb.last;
    if (!E || !R) { sb.last = null; sb.lastBoardKey = k; return null; }
    sb.last = E.simulate({ heroes: sb.heroes.filter(Boolean), effects: sb.effects.filter(Boolean) }, R, R.cards);
    sb.lastBoardKey = k;
    return sb.last;
  }

  function slotHtml(kind, i, id) {
    if (!id) {
      var open = sb.picker && sb.picker.kind === kind && sb.picker.slot === i;
      return '<button class="slot empty' + (open ? ' active' : '') + '" data-slot="' + kind + ':' + i + '">' +
        '<span class="sl-plus">＋</span><span class="sl-t">加牌</span></button>';
    }
    var c = kind === 'hero' ? heroById(id) : cardByType('effect', id);
    if (!c) return '<button class="slot empty" data-slot="' + kind + ':' + i + '">＋</button>';
    return '<button class="slot filled" data-rm="' + kind + ':' + i + '" title="点一下移除">' +
      '<img loading="lazy" src="' + c.img + '" alt="' + esc(c.name) + '">' +
      '<span class="sl-n">' + esc(c.name) + '</span>' +
      '<span class="sl-x">×</span></button>';
  }

  function pickerHtml() {
    if (!sb.picker) return '';
    var isHero = sb.picker.kind === 'hero';
    var pool = isHero
      ? (global.WXQ_HEROES || []).map(function (c) { return { card: c, kind: 'hero', kindLabel: '英雄牌' }; })
      : (global.WXQ_EFFECTS || []).map(function (c) { return { card: c, kind: 'effect', kindLabel: '效果牌' }; });
    var on = {};
    (isHero ? sb.heroes : sb.effects).forEach(function (x) { if (x != null) on[String(x)] = 1; });
    var q = (sb.picker.q || '').trim();
    var list = pool.filter(function (it) {
      if (on[String(it.card.id)]) return false;
      if (q) return it.card.name.indexOf(q) >= 0;
      return passes(it, { state: {} });   // 跟着上面的词条筛选走
    });
    var h = '<div class="pk-panel"><div class="pk-h">' +
      (isHero ? '选一张英雄牌放进 ' + (sb.picker.slot + 1) + ' 号槽' : '选一张效果牌') +
      '<button class="pk-close" data-pkclose="1">收起</button></div>' +
      '<div class="pk-tools"><input class="pk-q" id="pkQ" type="text" placeholder="搜索名字…" value="' + esc(q) + '">' +
      (q ? '' : '<span class="pk-tip">默认只列上面筛选出来的牌</span>') + '</div>';
    h += '<div class="pk-grid">' + (list.length ? list.map(function (it) {
      var c = it.card;
      return '<button class="pk-item" data-pk="' + it.kind + ':' + c.id + '">' +
        '<img loading="lazy" src="' + c.img + '" alt="' + esc(c.name) + '"><span>' + esc(c.name) + '</span></button>';
    }).join('') : '<div class="empty">没有可选的牌；清掉搜索词或放宽上面的筛选</div>') + '</div></div>';
    return h;
  }

  function sourceHtml() {
    if (!sb.source) return '';
    return '<div class="sb-from">' +
      '<span>来自阵容 · <b>' + esc(sb.source.name) + '</b></span>' +
      (sb.source.hint ? '<span class="preset-hint">' + esc(sb.source.hint) + '</span>' : '') +
      '<button type="button" class="jbtn" data-chain-back="1">返回阵容</button>' +
      '</div>';
  }

  function boardHtml() {
    var h = '<div class="sb-board">';
    h += sourceHtml();
    h += '<div class="sb-h">上场 · ' + MAX_HERO_SLOTS + ' 个英雄槽 <span>点空槽加牌，点已上的牌移除</span></div>';
    h += '<div class="sb-slots">';
    for (var i = 0; i < MAX_HERO_SLOTS; i++) h += slotHtml('hero', i, sb.heroes[i]);
    h += '</div>';
    h += '<div class="sb-h">效果牌 · 0~' + MAX_EFFECT_SLOTS + ' 张 <span>可选，古币 / 战术牌会影响链</span></div>';
    h += '<div class="sb-slots eff">';
    for (var j = 0; j < MAX_EFFECT_SLOTS; j++) h += slotHtml('effect', j, sb.effects[j]);
    h += '</div>';
    h += pickerHtml();
    h += '<div class="sb-actions"><button class="sbtn" data-sb="clear">清空上场</button></div>';
    h += '</div>';
    return h;
  }

  /* ---- 时间轴 ---- */

  var PHASE_LABEL = { '常驻': '常驻 · 无时机被动', '转瞬': '转瞬 · 效果牌立即结算' };

  function phaseLabel(p) { return PHASE_LABEL[p] || (p + ' 阶段'); }

  function timelineHtml() {
    var E = global.WXQ_ENGINE, R = global.WXQ_RULES;
    if (!E || !R) return '<div class="tl-empty">规则层 / 引擎层没加载，时间轴暂时出不来。</div>';
    var res = sim();
    var n = sb.heroes.filter(Boolean).length + sb.effects.filter(Boolean).length;
    if (!n || n < 2) return '<div class="tl-empty">上场至少 2 张牌，看它们这一回合会怎么咬。</div>';
    if (!res) return '<div class="tl-empty">演算没有返回结果，先清空再上两张试试。</div>';
    if (!res.ok) return '<div class="tl-empty">演算失败：' + esc(res.error || '未知错误') + '（这不是「没有成环」，是算不出来）</div>';

    var h = '';
    var groups = [];
    res.steps.forEach(function (s) {
      var g = groups[groups.length - 1];
      if (!g || g.phase !== s.phase) { g = { phase: s.phase, items: [] }; groups.push(g); }
      g.items.push(s);
    });

    if (!groups.length) {
      h += '<div class="tl-empty">这几张牌之间没有能对上的词条 —— 它们这一回合不会互相触发。</div>';
    } else {
      groups.forEach(function (g) {
        h += '<div class="tl-seg"><div class="tl-seg-h">' + esc(phaseLabel(g.phase)) + '</div>';
        g.items.forEach(function (s) {
          var cls = 'tl-row d' + Math.min(s.depth, 4);
          if (s.loop) cls += ' loop';
          if (s.repeat) cls += ' rep';
          if (s.hypothetical) cls += ' hyp';
          if (s.uncertain) cls += ' unc';
          h += '<div class="' + cls + '">';
          h += '<span class="tl-n">' + s.order + '</span>';
          h += '<span class="tl-when' + (s.when ? '' : ' nil') + '">' + esc(s.when || '—') + '</span>';
          h += '<span class="tl-src" data-type="' + s.sourceKind + '" data-id="' + s.sourceId + '" role="button">' + esc(s.sourceName) + '</span>';
          h += '<span class="tl-txt">' + esc(s.text || '') + '</span>';
          h += '<span class="tl-flags">';
          if (s.loop) h += '<span class="tflag loop">成环</span>';
          if (s.repeat) h += '<span class="tflag rep">重复</span>';
          if (s.hypothetical) h += '<span class="tflag hyp">若</span>';
          if (s.uncertain) h += '<span class="tflag unc">随机</span>';
          h += '</span>';
          if (s.note) h += '<span class="tl-note">' + esc(s.note) + '</span>';
          h += '</div>';
        });
        h += '</div>';
      });
    }

    /* ---- 结论条（不设胜率条） ---- */
    var S = res.summary;
    function numList(o) {
      var a = [];
      if (o.levelPerm) a.push('<b>永久等级</b> +' + o.levelPerm);
      if (o.levelTemp) a.push('<b>临时等级</b> +' + o.levelTemp);
      if (o.coreLevel) a.push('<b>阿科米亚核心</b> +' + o.coreLevel);
      if (o.goldCoins) a.push('<b>古币</b> ×' + o.goldCoins);
      if (o.refresh) a.push('<b>免费刷新</b> ×' + o.refresh);
      if (o.energy) a.push('<b>能量</b> +' + o.energy);
      if (o.draws) a.push('<b>产牌</b> ' + o.draws + ' 张');
      return a;
    }
    var EX = numList(S.exact || {}), HP = numList(S.hyp || {});
    var none = S.anyHyp
      ? '<span class="tl-dim">无 —— 这几张牌的收益全落在随机分支里，见下一行</span>'
      : '<span class="tl-dim">这几张牌本身不产生等级 / 古币 / 刷新</span>';

    h += '<div class="tl-end">';
    h += '<div class="tl-end-h">本回合结论 <span>' + esc(R.patch) + ' 规则</span></div>';
    h += '<div class="tl-res ' + (S.loops ? 'yes' : 'no') + '">' +
      (S.loops
        ? (S.loopConditional
          ? '⟲ 可能会成环 · 但闭环落在标「若」的随机分支里 —— 随机没中就是一条有终点的链'
          : '⟲ 会成环 · 这条链能一直转下去')
        : '→ 不成环 · 是一条有终点的链') + '</div>';

    h += '<div class="tl-end-row"><span class="tl-ek">确定收益</span><span>' +
      (EX.length ? EX.join('　') : none) + '</span></div>';
    if (HP.length) {
      h += '<div class="tl-end-row"><span class="tl-ek">若分支全走</span><span class="tl-hypwrap">' +
        HP.join('　') + '<span class="tl-hyptip">各「若…」分支的合计，实际只会走其中一条 —— 不能当成确定收益读</span></span></div>';
    }

    h += '<div class="tl-end-row"><span class="tl-ek">' + (S.loops ? '成环说明' : '断点') + '</span><span>' +
      (S.breaks.length ? S.breaks.map(function (b) { return '<span class="tl-bk">' + esc(b.replace(/\*\*/g, '')) + '</span>'; }).join('') : '无') +
      '</span></div>';
    h += '<div class="tl-end-row"><span class="tl-ek">不确定</span><span>' +
      (S.uncertain.length ? S.uncertain.map(function (b) { return '<span class="tl-uc">' + esc(b) + '</span>'; }).join('')
        : '无（随机目标已按「若…」逐条列出，没有假装算中）') + '</span></div>';
    h += '<div class="tl-disclaim">只演算词条，不模拟打架 —— 没有 DPS、站位伤害和胜率这些东西。</div>';
    h += '</div>';
    return h;
  }

  function sectionSandbox() {
    var h = '';
    h += '<div class="sb-wrap">' + boardHtml() +
      '<div class="sb-tl" id="sbTl"><div class="sb-h">本回合触发序列 <span>从上往下就是结算顺序</span></div>' +
      '<div id="tlBody">' + timelineHtml() + '</div></div></div>';
    return h;
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */

  function render(grid, state) {
    grid.className = 'chain-root';
    grid.style.gridTemplateColumns = '';
    var R = global.WXQ_RULES;
    var h = '<div class="chain-head">' +
      '<div class="chain-title">连锁 · 词条推演</div>' +
      '<div class="chain-sub">从阵容页点「查看连锁」把这套牌摊成一回合触发序列。也可以自己加牌。' +
      '<b>只演算词条，不模拟打架。</b></div>' +
      (R ? '<div class="chain-meta">规则层 schema ' + R.schema + ' · patch ' + esc(R.patch) +
        ' · 手工覆盖 ' + R.manualIds.length + ' 张</div>'
        : '<div class="chain-meta bad">规则层（wanxiangqi-rules.js）没加载 —— 这个 tab 需要它才能工作</div>') +
      '</div>';
    h += '<section class="chsec"><h2 class="chsec-h"><span class="gn">01</span>按词条查' +
      '<span class="gh">点词条看详情，返回即关</span></h2>' + sectionFilter(state) + '</section>';
    h += '<section class="chsec" id="sbWrap"><h2 class="chsec-h"><span class="gn">02</span>上场沙盒' +
      '<span class="gh">最多 ' + MAX_HERO_SLOTS + ' 英雄 + ' + MAX_EFFECT_SLOTS + ' 效果牌</span></h2>' +
      sectionSandbox() + '</section>';
    grid.innerHTML = h;

    var cEl = document.getElementById('count');
    if (cEl) cEl.textContent = '连锁 · 词条推演';
    var b = ui();
    if (b.linkify) b.linkify(grid);
    bind();
    return true;
  }

  /** 只重画时间轴，别把整个 tab 重建（保住搜索框焦点和滚动位置） */
  function refreshTimeline() {
    var body = document.getElementById('tlBody');
    if (body) {
      body.innerHTML = timelineHtml();
      var b = ui();
      if (b.linkify) b.linkify(body);
    }
  }

  /** 只重画槽位 + 时间轴 */
  function refreshBoard() {
    var wrap = document.querySelector('.sb-wrap');
    if (!wrap) return;
    wrap.outerHTML = '<div class="sb-wrap">' + boardHtml() +
      '<div class="sb-tl" id="sbTl"><div class="sb-h">本回合触发序列 <span>从上往下就是结算顺序</span></div>' +
      '<div id="tlBody">' + timelineHtml() + '</div></div></div>';
    bindPicker();
  }

  function bindPicker() {
    var q = document.getElementById('pkQ');
    if (!q || q.__bound) return;
    q.__bound = 1;
    q.addEventListener('input', function () {
      if (!sb.picker) return;
      sb.picker.q = this.value;
      refreshBoard();
      var el = document.getElementById('pkQ');
      if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { } }
    });
  }

  var bound = false;
  function bind() {
    var grid = document.getElementById('grid');
    if (!grid || bound) { bindPicker(); return; }
    bound = true;
    grid.addEventListener('click', function (e) {
      var t = e.target;
      var kw = t.closest('.chchip[data-kw]');
      if (kw) {
        var b = ui();
        if (b.openKeyword) b.openKeyword(kw.getAttribute('data-kw'));
        return;
      }
      var dj = t.closest('.chj[data-join]');
      if (dj) { sb.join = dj.getAttribute('data-join'); return rerender(); }
      var d = t.closest('.chchip[data-d]');
      if (d) {
        var v = d.getAttribute('data-d'), j = sb.deriv.indexOf(v);
        if (j >= 0) sb.deriv.splice(j, 1); else sb.deriv.push(v);
        return rerender();
      }
      if (t.closest('[data-clear="filter"]')) { sb.kw = []; sb.deriv = []; sb.join = 'or'; return rerender(); }

      var sl = t.closest('.slot[data-slot]');
      if (sl) {
        var p = sl.getAttribute('data-slot').split(':');
        var kind = p[0], idx = +p[1];
        if (sb.picker && sb.picker.kind === kind && sb.picker.slot === idx) sb.picker = null;
        else sb.picker = { kind: kind, slot: idx, q: '' };
        return refreshBoard();
      }
      var pk = t.closest('.pk-item[data-pk]');
      if (pk) {
        var q2 = pk.getAttribute('data-pk').split(':');
        var k2 = q2[0], id = q2[1];
        if (sb.picker) {
          if (k2 === 'hero') sb.heroes[sb.picker.slot] = id;
          else sb.effects[sb.picker.slot] = id;
        }
        sb.picker = null;
        sim();
        return refreshBoard();
      }
      if (t.closest('[data-pkclose]')) { sb.picker = null; return refreshBoard(); }

      var rm = t.closest('.slot[data-rm]');
      if (rm) {
        var p2 = rm.getAttribute('data-rm').split(':');
        if (p2[0] === 'hero') sb.heroes[+p2[1]] = null; else sb.effects[+p2[1]] = null;
        sim();
        return refreshBoard();
      }
      if (t.closest('[data-chain-back]') && sb.source && sb.source.key) {
        var jobKey = sb.source.key;
        var jt = document.querySelector('.tab[data-type="jobs"]');
        if (jt) jt.click();
        if (global.WXQ_JOBS_UI) global.WXQ_JOBS_UI.open(jobKey, true);
        return;
      }

      var sbb = t.closest('[data-sb]');
      if (sbb) {
        var a = sbb.getAttribute('data-sb');
        if (a === 'clear') {
          sb.heroes = new Array(MAX_HERO_SLOTS).fill(null);
          sb.effects = new Array(MAX_EFFECT_SLOTS).fill(null);
          sb.source = null;
          sb.picker = null; sim();
        }
        return rerender();
      }
      var src = t.closest('.tl-src[data-type]');
      if (src) {
        var b = ui(), kind = src.getAttribute('data-type'), sid = src.getAttribute('data-id');
        // 复用现有弹窗，别在这儿另开一套详情面板
        if (kind === 'player' && b.openPlayer) b.openPlayer(src.textContent.trim());
        else if (b.openCard) b.openCard(kind, +sid);
      }
    });
    bindPicker();
  }

  /** 整个 tab 重画 */
  function rerender() {
    var st = ui().state;
    render(document.getElementById('grid'), st || { q: '', fac: '', qual: '' });
  }

  function loadHeroNames(names, effectNames, meta) {
    var ids = [], skipped = [];
    (names || []).forEach(function (n) {
      var id = heroIdByName(n);
      if (id == null) skipped.push(n); else ids.push(id);
    });
    sb.heroes = new Array(MAX_HERO_SLOTS).fill(null);
    var over = 0;
    ids.forEach(function (id, k) {
      if (k < MAX_HERO_SLOTS) sb.heroes[k] = id; else over++;
    });
    sb.effects = new Array(MAX_EFFECT_SLOTS).fill(null);
    if (effectNames && effectNames.length) {
      var E = global.WXQ_EFFECTS || [];
      var ei = 0;
      effectNames.forEach(function (n) {
        if (ei >= MAX_EFFECT_SLOTS) return;
        for (var i = 0; i < E.length; i++) {
          if (E[i].name === n) { sb.effects[ei++] = E[i].id; break; }
        }
      });
    }
    var hint = [];
    if (skipped.length) hint.push('没能在英雄池里找到：' + skipped.join('、'));
    if (over) hint.push('还有 ' + over + ' 张没上（本版只有 ' + MAX_HERO_SLOTS + ' 个英雄槽）');
    sb.source = meta ? { key: meta.key, name: meta.name, hint: hint.join('；') } : (hint.length ? { key: '', name: '', hint: hint.join('；') } : null);
    sb.picker = null;
    sim();
  }

  function goSandbox() {
    var tab = document.querySelector('.tab[data-type="chain"]');
    if (tab) tab.click();
    else rerender();
    setTimeout(function () {
      var wrap = document.getElementById('sbWrap');
      if (wrap && wrap.scrollIntoView) {
        try { wrap.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) { wrap.scrollIntoView(); }
      }
    }, 30);
  }

  function openHeroNames(names, effectNames, meta) {
    loadHeroNames(names, effectNames, meta);
    goSandbox();
  }

  function toggleKw(name) {
    if (!name) return;
    if (sb.kw.indexOf(name) < 0) sb.kw.push(name);
    if (ui().state && ui().state.type === 'chain') rerender();
  }

  global.WXQ_CHAIN = {
    render: render,
    openHeroNames: openHeroNames,
    toggleKw: toggleKw,
    rerender: rerender,
    state: sb,
    diagnostics: function () {
      return {
        cards: global.WXQ_RULES ? Object.keys(global.WXQ_RULES.cards).length : 0,
        stats: global.WXQ_RULES ? global.WXQ_RULES.stats : null,
        heroes: sb.heroes.filter(Boolean).length,
        effects: sb.effects.filter(Boolean).length,
        last: sb.last && sb.last.summary
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
