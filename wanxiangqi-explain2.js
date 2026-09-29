/* ============================================================================
 * 王者万象棋 · 阵容讲解（游戏内版式）
 * ----------------------------------------------------------------------------
 * 页面按游戏里的讲解来排：大卡、英雄墙、思路图、棋盘、推荐棋手。
 *
 * 谁是王牌 / 坦克核心 / 功能核心：用官方在这一套上标的 spot
 *   1 王牌（大卡，思路图右边）
 *   2 坦克核心
 *   3 功能核心（思路图中间）
 *   0 其余
 * 资料站阵容没有 spot。大卡改用近7日觉醒率或平均等级，并写明数字来源。
 * 功能核心只在卡面原文写了「每当你…」且关键词能对上棋盘上其他人时才标。
 *
 * 【阵容思路】【站位解读】官方接口里没有这两段短文，按下面的材料现写，
 * 不使用写死的流派文案：
 *   思路  —— 作者运营里点名的英雄 + 卡面里的【关键词】和「每当你使用」
 *   站位  —— 战斗技能原文里的范围（周围 / 身前 / 最远 / 牺牲）
 * 写不出来的句子直接不写。
 * ========================================================================== */
(function (global) {
  'use strict';

  function ui() { return global.__wxqUI || {}; }
  function esc(s) {
    if (ui().esc) return ui().esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmt(s) { return ui().fmt ? ui().fmt(s) : esc(plain(s)); }
  function plain(s) {
    return String(s == null ? '' : s)
      .replace(/<a[^>]*>/gi, '').replace(/<\/a>/gi, '')
      .replace(/<color[^>]*>/gi, '').replace(/<\/color>/gi, '')
      .replace(/<\/?b>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function pct(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) return '';
    return (Math.round(n * 1000) / 10) + '%';
  }

  var VERBS = ['登场', '整备', '牺牲', '开团', '复生', '觉醒', '唤醒', '过载', '连击', '召唤'];
  var SPOT_NAME = { 1: '王牌', 2: '坦克核心', 3: '功能核心' };

  function poolOf(name) {
    var m = Object.create(null);
    (global[name] || []).forEach(function (x) { if (x && x.name) m[x.name] = x; });
    return m;
  }
  var POOL = null;
  function pools() {
    if (!POOL) POOL = { hero: poolOf('WXQ_HEROES'), lord: poolOf('WXQ_PLAYERS'), equip: poolOf('WXQ_EQUIPS') };
    return POOL;
  }

  function parse(L) {
    var P = pools();
    var hs = (L.heroes || []).map(function (h) {
      var n = typeof h === 'string' ? h : h.name;
      var card = P.hero[n] || null;
      var spot = (h && typeof h === 'object' && h.spot != null && h.spot !== '') ? Number(h.spot) : null;
      if (spot != null && !Number.isFinite(spot)) spot = null;
      return {
        name: n,
        x: (h && typeof h === 'object') ? Number(h.x) : -1,
        z: (h && typeof h === 'object') ? Number(h.z) : -1,
        evo: !!(h && typeof h === 'object' && h.evo),
        eqs: (h && typeof h === 'object' && h.eqs) || [],
        spot: spot,
        card: card,
        cost: card ? (Number(card.cost && card.cost.count) || 0) : 0,
        quality: card ? (Number(card.quality) || 0) : 0,
      };
    }).filter(function (h) { return h.name; });
    return { L: L, hs: hs, P: P };
  }

  function cardRaw(h, awake) {
    var c = h && h.card;
    if (!c) return '';
    if (awake) return c.awakeDesc || '';
    return c.desc || '';
  }
  function cardPlain(h) { return plain(cardRaw(h, false)); }
  function skillPlain(h) {
    var sk = h && h.card && h.card.skills && h.card.skills[0];
    return sk ? plain(sk.desc) : '';
  }

  function keywords(desc) {
    var out = [], re = /【([^】]+)】/g, m;
    while ((m = re.exec(desc))) {
      var k = m[1].replace(/英雄牌|阵营|关键词/g, '').trim();
      if (k && out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }
  function verbs(desc) {
    return VERBS.filter(function (v) { return desc.indexOf(v) >= 0; });
  }
  function factionHit(h, word) {
    var f = h && h.card && h.card.faction || '';
    return !!(word && f.indexOf(word) >= 0);
  }

  function inferFunc(hs, ace) {
    var best = null, bestS = 0;
    hs.forEach(function (h) {
      if (ace && h === ace) return;
      var d = cardPlain(h);
      var s = 0;
      if (d.indexOf('每当你') >= 0) s += 5;
      keywords(d).forEach(function (k) {
        var n = 0;
        hs.forEach(function (o) {
          if (o === h) return;
          if (factionHit(o, k) || cardPlain(o).indexOf(k) >= 0) n++;
        });
        if (n >= 2) s += 3;
      });
      if (s > bestS) { bestS = s; best = h; }
    });
    return bestS >= 5 ? best : null;
  }

  function pickRoles(p) {
    var hs = p.hs, L = p.L;
    var ace = null, tank = null, func = null, aceWhy = '';
    hs.forEach(function (h) {
      if (h.spot === 1 && !ace) ace = h;
      if (h.spot === 2 && !tank) tank = h;
      if (h.spot === 3 && !func) func = h;
    });
    if (ace) aceWhy = '';
    if (!ace) {
      var builds = (L.d7 && L.d7.builds) || [];
      var best = null, bestS = -1, why = '';
      builds.forEach(function (b) {
        var h = null;
        hs.forEach(function (x) { if (x.name === b.name) h = x; });
        if (!h) return;
        var s = (Number(b.awaken) || 0) * 100 + (Number(b.level) || 0);
        if (s > bestS) {
          bestS = s;
          best = h;
          why = b.awaken ? ('近7日觉醒率 ' + pct(b.awaken)) : (b.level ? ('近7日平均 ' + b.level + ' 级') : '');
        }
      });
      if (best) { ace = best; aceWhy = why; }
      else if (hs.length) {
        var sorted = hs.slice().sort(function (a, b) { return (b.eqs.length - a.eqs.length) || (b.cost - a.cost); });
        ace = sorted[0];
        aceWhy = ace.eqs.length ? '这套把装备给了这张' : '按费用先看这张';
      }
    }
    if (!func) func = inferFunc(hs, ace);
    return { ace: ace, tank: tank, func: func, aceWhy: aceWhy };
  }

  function phaseName(op) {
    var from = Number(op && op.from) || 0;
    if (from && from <= 3) return '前期';
    if (from && from <= 10) return '中期';
    if (from) return '后期';
    return '';
  }
  function opMentions(ops, name) {
    for (var i = 0; i < ops.length; i++) {
      if (ops[i].desc && ops[i].desc.indexOf(name) >= 0) return ops[i];
    }
    return null;
  }
  function sentenceWith(desc, name) {
    var parts = String(desc || '').split(/[。！？]/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(name) >= 0) return parts[i].replace(/^\s+|\s+$/g, '');
    }
    return '';
  }

  function secondHero(ops, hs, func, ace) {
    var named = null;
    ops.forEach(function (o) {
      if (named || !o.desc || o.desc.indexOf('核心') < 0) return;
      hs.forEach(function (h) {
        if (named || h === func || h === ace) return;
        if (o.desc.indexOf('核心英雄' + h.name) >= 0 || o.desc.indexOf('核心' + h.name) >= 0) named = h;
      });
    });
    if (named) return named;
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h === func || h === ace) continue;
      if (cardPlain(h).indexOf('每当') >= 0) return h;
    }
    return null;
  }

  function keywordStats(hs) {
    var m = Object.create(null);
    hs.forEach(function (h) {
      var d = cardPlain(h);
      var seen = Object.create(null);
      keywords(d).concat(verbs(d)).forEach(function (k) {
        if (!k || seen[k]) return;
        seen[k] = 1;
        if (!m[k]) m[k] = { k: k, n: 0, fac: false };
        m[k].n++;
        if (factionHit(h, k)) m[k].fac = true;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return (b.fac - a.fac) || (b.n - a.n) || (a.k < b.k ? -1 : 1); });
  }

  function mechanismSentence(func) {
    var raw = cardPlain(func);
    if (!raw) return '';
    var kw = keywords(raw)[0];
    if (kw && /每当你使用|使用【/.test(raw)) {
      var tail = raw.indexOf('等级') >= 0 ? '，提升英雄等级' : '';
      return func.name + '上阵后不断使用【' + kw + '】英雄牌来触发' + func.name + '的卡牌效果' + tail + '。';
    }
    if (raw.indexOf('每当') >= 0) {
      var body = raw.replace(/。$/, '');
      if (body.length > 72) body = body.slice(0, 72) + '…';
      return func.name + '上阵后，' + body + '。';
    }
    return func.name + '的卡面是：' + raw.replace(/。$/, '') + '。';
  }

  function followSentence(hero, ops) {
    var op = opMentions(ops, hero.name);
    var sent = op ? sentenceWith(op.desc, hero.name) : '';
    var d = cardPlain(hero);
    var kw = keywords(d)[0] || keywords(sent)[0] || verbs(d)[0] || verbs(sent)[0];
    var shopping = /拍卖|优先选|优先买|升\d/.test(sent);
    if (kw && sent.indexOf(kw) >= 0 && (d.indexOf('等级') >= 0 || sent.indexOf('等级') >= 0)) {
      return hero.name + '来了后，配合【' + kw + '】英雄提升等级。';
    }
    if (kw && sent.indexOf('【' + kw + '】') >= 0) {
      return hero.name + '来了后，配合【' + kw + '】。';
    }
    if (sent && !shopping && sent.length <= 42 && sent.indexOf(hero.name) >= 0) {
      return hero.name + '来了后，' + sent.replace(/。$/, '') + '。';
    }
    if (d.indexOf('每当') >= 0) return hero.name + '的卡面是：' + d.replace(/。$/, '') + '。';
    return '';
  }

  function ideaText(p, roles) {
    var L = p.L, hs = p.hs, func = roles.func, ace = roles.ace;
    var ops = (L.ops || []).filter(function (o) { return o && plain(o.desc); });
    var third = !!(L.nocode || L.source === 'datawxq');
    var parts = [];
    if (third) {
      var st = L.stats7d;
      if (st && st.count) {
        parts.push('近7日样本 ' + st.count + ' 场，前三率 ' + (pct(st.top3Rate) || '—') + '。这套没有作者写的运营。');
      } else {
        parts.push('这套来自对局聚类，没有作者写的运营。');
      }
    }
    if (func && !third) {
      var hit = opMentions(ops, func.name);
      if (hit) {
        var ph = phaseName(hit) || '开局';
        parts.push(ph + '优先找' + func.name + '。');
      }
    }
    if (func) {
      var mech = mechanismSentence(func);
      if (mech) parts.push(mech);
    } else if (ace && cardPlain(ace)) {
      parts.push(ace.name + '的卡面是：' + cardPlain(ace).replace(/。$/, '') + '。');
    }
    if (!third) {
      var second = secondHero(ops, hs, func, ace);
      if (second) {
        var fol = followSentence(second, ops);
        if (fol) parts.push(fol);
      }
    }
    if (plain(L.talentDesc)) {
      parts.push('天赋方面' + plain(L.talentDesc).replace(/。$/, '') + '。');
    } else {
      var stats = keywordStats(hs).slice(0, 2);
      if (stats.length) {
        var label = stats.map(function (x) { return x.fac ? (x.k + '阵营') : x.k; }).join('、');
        parts.push('天赋方面优先选' + label + '相关的天赋。');
      }
    }
    return parts.join('');
  }

  function stanceOf(h) {
    var d = skillPlain(h);
    if (!d) return '';
    if (/周围|相邻/.test(d) && /友军|队友|英雄/.test(d) && /恢复|回血|治疗|生命/.test(d)) {
      var range = (d.match(/周围\d*格/) || ['周围'])[0];
      return h.name + '的技能可以给' + range + '的友军回血，建议放在同伴中间。';
    }
    if (/周围|相邻|范围内/.test(d) && /友军|队友/.test(d)) {
      return h.name + '的技能作用于周围友军，建议放在同伴中间。';
    }
    if (/身前|面前|前方/.test(d)) {
      return h.name + '的技能打身前的敌人，建议放在前排。';
    }
    if (/附近\d*格敌人|\d格内敌人|\d格敌人/.test(d)) {
      return h.name + '的技能要打到身边的敌人，建议放在前排。';
    }
    if (d.indexOf('后排') >= 0) {
      return h.name + '的技能适合后排，建议放在后排。';
    }
    if (/牺牲|阵亡/.test(d)) {
      return h.name + '要被击败才触发技能，建议放在会先接触敌人的位置。';
    }
    return '';
  }

  function stanceText(p, roles) {
    var L = p.L;
    var order = [roles.func, roles.tank, roles.ace];
    p.hs.forEach(function (h) { if (order.indexOf(h) < 0) order.push(h); });
    var lines = [];
    order.forEach(function (h) {
      if (!h || lines.length >= 2) return;
      var s = stanceOf(h);
      if (s && lines.indexOf(s) < 0) lines.push(s);
    });
    var pos = plain(L.positionDesc);
    if (!lines.length && pos && pos.indexOf('datawxq') < 0 && pos !== '如图所示' && pos.indexOf('不是官方投稿') < 0) {
      lines.push(pos);
    }
    return lines.join('');
  }

  function arrowIn(func) {
    var d = cardPlain(func);
    if (/每当你使用|使用【/.test(d)) return '触发效果';
    if (d.indexOf('牺牲') >= 0) return '牺牲';
    if (d.indexOf('整备') >= 0) return '整备';
    if (d.indexOf('登场') >= 0) return '登场';
    if (d.indexOf('开团') >= 0) return '开团';
    return '卡面效果';
  }
  function arrowOut(func, ace) {
    var fd = cardPlain(func), ad = cardPlain(ace);
    if (fd.indexOf('等级') >= 0 && (ad.indexOf('等级') >= 0 || /等级\s*\+|等级\+/.test(fd))) return '升级';
    if (fd.indexOf('牺牲') >= 0 && ad.indexOf('牺牲') >= 0) return '牺牲';
    if (ad.indexOf('复生') >= 0) return '复生';
    var v = verbs(ad)[0];
    return v || '生效';
  }

  function leftHeroes(hs, func) {
    var evo = hs.filter(function (h) { return h.evo && h !== func; });
    if (evo.length) return evo.slice(0, 4);
    var kw = func ? keywords(cardPlain(func))[0] : '';
    if (!kw) return [];
    return hs.filter(function (h) {
      if (h === func) return false;
      return factionHit(h, kw) || cardPlain(h).indexOf('【' + kw + '】') >= 0 || cardPlain(h).indexOf(kw) >= 0;
    }).slice(0, 4);
  }

  function heroImg(name) { return 'wxq-icon/heroes/' + encodeURIComponent(name) + '.png'; }
  function lordImg(name) { return 'wxq-icon/players/' + encodeURIComponent(name) + '_icon.png'; }
  function equipImg(name) { return 'wxq-icon/equips/' + encodeURIComponent(name) + '.png'; }

  function pips(q) {
    q = Math.max(0, Math.min(5, Number(q) || 0));
    var s = '';
    for (var i = 0; i < q; i++) s += '<i></i>';
    return q ? '<span class="gx-pips">' + s + '</span>' : '';
  }

  function face(h, cls) {
    return '<button type="button" class="gx-face' + (cls ? ' ' + cls : '') + '" data-job-hero="' + esc(h.name) + '">'
      + pips(h.quality)
      + '<img src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '">'
      + '<em>' + esc(h.name) + '</em>'
      + (h.evo ? '<b class="gx-evo">觉</b>' : '')
      + '</button>';
  }

  function cardBox(h) {
    if (!h) return '';
    var raw = cardRaw(h, false);
    var awake = h.evo ? plain(cardRaw(h, true)) : '';
    var base = cardPlain(h);
    var fac = h.card && h.card.faction || '';
    return '<div class="gx-mini-card">'
      + '<button type="button" class="gx-mini-img" data-job-hero="' + esc(h.name) + '">'
      + '<img src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '">'
      + '</button>'
      + '<div class="gx-mini-tx"><b>' + esc(h.name) + '</b>'
      + (raw ? '<p>' + fmt(raw) + '</p>' : '')
      + (awake && awake !== base ? '<p class="gx-awake">觉醒后：' + fmt(cardRaw(h, true)) + '</p>' : '')
      + (fac ? '<i>' + esc(fac) + '</i>' : '')
      + '</div></div>';
  }

  function flowHtml(p, roles) {
    var func = roles.func, ace = roles.ace;
    if (!func || !ace || func === ace) return '';
    var left = leftHeroes(p.hs, func);
    if (!left.length) return '';
    var facLabel = func.card && func.card.faction ? func.card.faction : '';
    var side = left.map(function (h) {
      var tag = (h.card && h.card.faction) || facLabel;
      return '<div class="gx-side-row">' + face(h, 'sm')
        + '<span><b>' + esc(h.name) + '</b>' + (tag ? '<i>' + esc(tag) + '</i>' : '') + '</span></div>';
    }).join('');
    return '<div class="gx-flow">'
      + '<div class="gx-side">' + side + '</div>'
      + '<div class="gx-arrow"><i></i><em>' + esc(arrowIn(func)) + '</em></div>'
      + cardBox(func)
      + '<div class="gx-arrow"><i></i><em>' + esc(arrowOut(func, ace)) + '</em></div>'
      + cardBox(ace)
      + '</div>';
  }

  function boardHtml(p) {
    var L = p.L;
    var map = {};
    p.hs.forEach(function (h) {
      if (h.x < 0 || h.z < 0) return;
      map[h.x + ',' + h.z] = h;
    });
    var rows = '';
    for (var z = 3; z >= 0; z--) {
      var cells = '';
      for (var x = 0; x < 7; x++) {
        var h = map[x + ',' + z];
        if (!h) { cells += '<div class="gx-cell"></div>'; continue; }
        var eqs = (h.eqs || []).slice(0, 3).map(function (n) {
          return '<img src="' + equipImg(n) + '" alt="' + esc(n) + '" title="' + esc(n) + '">';
        }).join('');
        cells += '<button type="button" class="gx-cell filled" data-job-hero="' + esc(h.name) + '" title="' + esc(h.name + (h.eqs.length ? ' · ' + h.eqs.join('、') : '')) + '">'
          + '<span class="gx-slot">'
          + pips(h.quality)
          + '<img class="gx-ava" src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '">'
          + (eqs ? '<span class="gx-eqs">' + eqs + '</span>' : '')
          + '</span>'
          + '<em>' + esc(h.name) + '</em>'
          + '</button>';
      }
      rows += '<div class="gx-row">' + cells + '</div>';
    }
    var third = !!(L.nocode || L.source === 'datawxq');
    var cap = third ? '一条登顶对局的站位' : '作者摆的站位';
    var lord = (L.lordGuide && L.lordGuide[0] && L.lordGuide[0].name) || (L.lords && L.lords[0]) || '';
    var foot = lord
      ? '<button type="button" class="gx-lord-pin" data-job-lord-go="' + esc(lord) + '"><img src="' + lordImg(lord) + '" alt="' + esc(lord) + '"><span>' + esc(lord) + '</span></button>'
      : '';
    return '<div class="gx-board"><div class="gx-board-cap">' + cap + ' · 上为前排</div>' + rows + foot + '</div>';
  }

  function lordRows(L) {
    var guide = L.lordGuide || [];
    var byName = Object.create(null);
    guide.forEach(function (g) { if (g && g.name) byName[g.name] = g; });
    var stat = Object.create(null);
    ((L.d7 && L.d7.lords) || L.bestLords || []).forEach(function (r) { if (r && r.name) stat[r.name] = r; });
    var names = [];
    if (guide.length) guide.forEach(function (g) { if (names.indexOf(g.name) < 0) names.push(g.name); });
    else Object.keys(stat).sort(function (a, b) {
      return (Number(stat[b].top3) || 0) - (Number(stat[a].top3) || 0);
    }).forEach(function (n) { names.push(n); });
    if (!names.length) (L.lords || []).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    return names.slice(0, 3).map(function (n) {
      return { name: n, guide: byName[n] || null, stat: stat[n] || null, player: pools().lord[n] || null };
    });
  }

  function lordsHtml(L) {
    var rows = lordRows(L);
    if (!rows.length) return '';
    return rows.map(function (r) {
      var skills = '';
      if (r.guide && r.guide.skills && r.guide.skills.length) {
        skills = r.guide.skills.map(function (s) {
          return '<span class="gx-sk">' + (s.icon ? '<img src="' + esc(s.icon) + '" alt="">' : '') + '<i>' + esc(s.name) + '</i></span>';
        }).join('');
      } else if (r.player && r.player.skills) {
        skills = r.player.skills.map(function (s) {
          return '<span class="gx-sk"><i>' + esc(s.kind || s.name || '') + '</i></span>';
        }).join('');
      }
      var desc = (r.guide && r.guide.desc) || '';
      if (!desc && r.player && r.player.skills && r.player.skills[0]) desc = plain(r.player.skills[0].desc);
      var rate = '';
      if (r.stat) {
        var bits = [];
        if (r.stat.count) bits.push(r.stat.count + ' 场');
        if (pct(r.stat.top3)) bits.push('前三 ' + pct(r.stat.top3));
        if (pct(r.stat.first)) bits.push('登顶 ' + pct(r.stat.first));
        if (bits.length) rate = '<em class="gx-rate">' + esc(bits.join(' · ')) + '</em>';
      }
      return '<div class="gx-lord">'
        + '<button type="button" class="gx-lord-av" data-job-lord-go="' + esc(r.name) + '"><img src="' + lordImg(r.name) + '" alt="' + esc(r.name) + '"><span>' + esc(r.name) + '</span></button>'
        + '<div class="gx-lord-sk">' + skills + '</div>'
        + '<div class="gx-lord-tx"><p>' + (desc ? fmt(desc) : '') + '</p>' + rate + '</div>'
        + '</div>';
    }).join('');
  }

  function opsHtml(L) {
    var ops = (L.ops || []).filter(function (o) { return o && plain(o.desc); });
    if (!ops.length) return '';
    var h = '<section class="gx-sec"><h3>作者运营 <span>原文</span></h3>';
    ops.forEach(function (o, i) {
      var ph = phaseName(o) || ('第' + (i + 1) + '段');
      var range = (o.from || o.to) ? (' · ' + o.from + (o.from === o.to ? '' : '–' + o.to) + ' 回合') : '';
      h += '<div class="gx-op"><b>' + esc(ph + range) + '</b><p>' + esc(plain(o.desc)) + '</p></div>';
    });
    return h + '</section>';
  }

  function compose(L) {
    var p = parse(L || {});
    var roles = pickRoles(p);
    return {
      p: p,
      roles: roles,
      idea: ideaText(p, roles),
      stance: stanceText(p, roles),
    };
  }

  function pageHtml(L) {
    var c = compose(L);
    var p = c.p, roles = c.roles;
    var ace = roles.ace;
    var chips = [];
    p.hs.forEach(function (h) {
      if (SPOT_NAME[h.spot] && chips.indexOf(SPOT_NAME[h.spot]) < 0) chips.push(SPOT_NAME[h.spot]);
    });
    if (!chips.length && (L.nocode || L.source === 'datawxq')) chips.push('对局聚类');
    var wall = p.hs.map(function (h) { return face(h, h === ace ? 'on' : ''); }).join('');
    var brief = plain(L.brief);
    var h = '<div class="gx">';
    h += '<div class="gx-top">';
    if (ace) {
      var raw = cardRaw(ace, false);
      var awake = ace.evo ? plain(cardRaw(ace, true)) : '';
      h += '<div class="gx-hero">'
        + '<button type="button" class="gx-hero-img" data-job-hero="' + esc(ace.name) + '"><img src="' + heroImg(ace.name) + '" alt="' + esc(ace.name) + '"></button>'
        + '<div class="gx-hero-tx"><b>' + esc(ace.name) + '</b>'
        + (roles.aceWhy ? '<i class="gx-why">' + esc(roles.aceWhy) + '</i>' : '')
        + (raw ? '<p>' + fmt(raw) + '</p>' : '')
        + (awake && awake !== cardPlain(ace) ? '<p class="gx-awake">觉醒后：' + fmt(cardRaw(ace, true)) + '</p>' : '')
        + ((ace.card && ace.card.faction) ? '<em>' + esc(ace.card.faction) + '</em>' : '')
        + '</div></div>';
    }
    h += '<div class="gx-wall">' + wall
      + (brief ? '<p class="gx-brief">' + esc(brief) + '</p>' : '')
      + '</div></div>';

    var flow = flowHtml(p, roles);
    if (flow || c.idea) {
      h += '<section class="gx-sec"><h3>阵容思路</h3>' + flow
        + (c.idea ? '<p class="gx-idea">' + esc(c.idea) + '</p><p class="gx-src">根据这套的卡面' + ((L.ops && L.ops.length) ? '和作者运营' : '') + '写成。</p>' : '')
        + '</section>';
    }

    h += '<section class="gx-sec"><h3>阵容构成'
      + (chips.length ? ' <span class="gx-chips">' + chips.map(function (t) { return '<i>' + esc(t) + '</i>'; }).join('') + '</span>' : '')
      + '</h3>' + boardHtml(p)
      + (c.stance ? '<p class="gx-idea"><b>【站位解读】</b>' + esc(c.stance) + '</p><p class="gx-src">根据战斗技能的攻击或治疗范围写成。</p>' : '')
      + '</section>';

    var lords = lordsHtml(L);
    if (lords) h += '<section class="gx-sec"><h3>推荐棋手</h3>' + lords + '</section>';
    h += opsHtml(L);
    h += '</div>';
    return h;
  }

  global.WXQ_EXPLAIN_V2 = { pageHtml: pageHtml, compose: compose, _parse: parse };
})(window);
