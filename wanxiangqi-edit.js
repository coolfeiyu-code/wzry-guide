/* ============================================================================
 * 王者万象棋 · 阵容编辑
 * ----------------------------------------------------------------------------
 * 不改官方阵容库文件。每套的修改存在 localStorage（wxq-lineup-edits-v1），
 * 打开阵容时盖在官方数据上面。同步桥按「每一套自己的 rev」合并，
 * 慢时钟不能把另一台改过的套整组盖掉。恢复官方会写 cleared 墓碑。
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'wxq-lineup-edits-v1';
  var COLS = 7;
  var ROWS = 4;
  var PHASE = ['前期', '中期', '后期'];
  var SPOTS = ['其余', '王牌', '坦克核心', '功能核心'];
  var draft = null;
  var pendingY = -1;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(msg) {
    try {
      var doc = global.document;
      if (!doc || !doc.getElementById) return;
      var el = doc.getElementById('wxqHudToast');
      if (!el) {
        el = doc.createElement('div');
        el.id = 'wxqHudToast';
        doc.body.appendChild(el);
      }
      el.textContent = msg;
      el.className = 'on';
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { el.className = ''; }, 1800);
    } catch (e) {}
  }
  function readStore() {
    try {
      var o = JSON.parse(global.localStorage.getItem(STORE) || '');
      if (!o || typeof o !== 'object') return { items: {} };
      if (!o.items || typeof o.items !== 'object') o.items = {};
      return o;
    } catch (e) { return { items: {} }; }
  }
  function writeStore(st) {
    global.localStorage.setItem(STORE, JSON.stringify(st));
  }
  function invalidate() {
    if (global.WXQ_JOBS && global.WXQ_JOBS._wxqView) delete global.WXQ_JOBS._wxqView;
  }
  function itemOf(key) {
    var it = readStore().items[String(key)];
    return it && typeof it === 'object' ? it : null;
  }
  function namesOf(list) {
    var out = [];
    (list || []).forEach(function (x) {
      if (x && x.name && out.indexOf(x.name) < 0) out.push(x.name);
    });
    return out;
  }
  function cats() {
    return {
      hero: namesOf(global.WXQ_HEROES),
      lord: namesOf(global.WXQ_PLAYERS),
      equip: namesOf(global.WXQ_EQUIPS),
      talent: namesOf(global.WXQ_TALENTS),
      effect: namesOf(global.WXQ_EFFECTS)
    };
  }
  function qualityOf(name) {
    var H = global.WXQ_HEROES || [];
    for (var i = 0; i < H.length; i++) if (H[i].name === name) return H[i].quality || 0;
    return 0;
  }
  function heroImg(name) { return 'wxq-icon/heroes/' + encodeURIComponent(name) + '.png'; }
  function blankHero(name, x, z) {
    return { name: name, x: x, z: z, evo: false, spot: 0, eqs: ['', '', ''] };
  }
  function blankOp() { return { from: '', to: '', desc: '', main: [], sub: [] }; }
  function usedMap(heroes, skip) {
    var m = {};
    (heroes || []).forEach(function (h, i) {
      if (i === skip) return;
      if (h && Number.isFinite(Number(h.x)) && Number.isFinite(Number(h.z))) m[Number(h.x) + ',' + Number(h.z)] = 1;
    });
    return m;
  }
  function firstEmpty(used) {
    for (var z = 0; z < ROWS; z++) {
      for (var x = 0; x < COLS; x++) if (!used[x + ',' + z]) return { x: x, z: z };
    }
    return null;
  }
  function placeHeroes(heroes) {
    var used = {};
    heroes.forEach(function (h) {
      var x = Number(h.x);
      var z = Number(h.z);
      var ok = Number.isFinite(x) && Number.isFinite(z) && x >= 0 && x < COLS && z >= 0 && z < ROWS && !used[x + ',' + z];
      if (!ok) {
        var p = firstEmpty(used);
        if (!p) return;
        x = p.x; z = p.z;
      }
      h.x = x; h.z = z;
      used[x + ',' + z] = 1;
    });
  }
  function copyHero(h) {
    var eqs = (h && h.eqs) || [];
    return {
      name: h.name,
      x: Number(h.x) || 0,
      z: Number(h.z) || 0,
      evo: !!h.evo,
      spot: Number(h.spot) || 0,
      eqs: [eqs[0] || '', eqs[1] || '', eqs[2] || '']
    };
  }
  function shownLords(L) {
    if (L._editLords) return (L.lords || []).slice();
    var adapt = (L.bestLords || []).length ? L.bestLords : ((L.d7 && L.d7.lords) || []);
    if (adapt.length) return adapt.map(function (r) { return r.name; }).filter(Boolean);
    return (L.lords || []).slice();
  }
  function shownTalents(L) {
    if (L.talents && L.talents.length) return L.talents.slice();
    if (L.d7 && L.d7.talents && L.d7.talents.length) {
      return L.d7.talents.map(function (t) { return t.name; }).filter(Boolean);
    }
    return [];
  }

  function apply(L) {
    if (!L) return L;
    var p = itemOf(L.key);
    if (!p || p.cleared) return L;
    var o = {};
    var k;
    for (k in L) o[k] = L[k];
    ['name', 'brief', 'positionDesc', 'equipDesc', 'talentDesc', 'effectDesc'].forEach(function (f) {
      if (p[f] != null) o[f] = p[f];
    });
    if (p.lords) {
      o.lords = p.lords.slice();
      o._editLords = true;
    }
    if (p.heroes) {
      o.heroes = p.heroes.map(function (h) {
        var eqs = (h.eqs || []).filter(Boolean);
        return {
          name: h.name, x: Number(h.x) || 0, z: Number(h.z) || 0,
          evo: !!h.evo, spot: Number(h.spot) || 0, eqs: eqs, quality: qualityOf(h.name)
        };
      });
    }
    if (p.ops) {
      o.ops = p.ops.map(function (op) {
        return {
          from: op.from, to: op.to, desc: op.desc || '',
          main: (op.main || []).slice(), sub: (op.sub || []).slice()
        };
      });
    }
    if (p.talents) o.talents = p.talents.slice();
    if (p.effects) o.effects = p.effects.slice();
    o._edited = true;
    return o;
  }

  function begin(L) {
    var prev = itemOf(L.key);
    var lordsFromStats = !L._editLords && !!((L.bestLords && L.bestLords.length) || (L.d7 && L.d7.lords && L.d7.lords.length));
    var ops = (L.ops || []).map(function (op) {
      return {
        from: op.from != null && op.from !== '' ? op.from : '',
        to: op.to != null && op.to !== '' ? op.to : '',
        desc: op.desc || '',
        main: (op.main || []).slice(),
        sub: (op.sub || []).slice()
      };
    });
    while (ops.length < 3) ops.push(blankOp());
    ops = ops.slice(0, 3);
    var heroes = (L.heroes || []).map(copyHero);
    placeHeroes(heroes);
    draft = {
      key: String(L.key),
      rev: prev ? Number(prev.rev || 0) : 0,
      arm: 0,
      sel: -1,
      lordsFromStats: lordsFromStats,
      name: L.name || '',
      brief: L.brief || '',
      positionDesc: L.positionDesc || '',
      equipDesc: L.equipDesc || '',
      talentDesc: L.talentDesc || '',
      effectDesc: L.effectDesc || '',
      lords: shownLords(L),
      heroes: heroes,
      ops: ops,
      talents: shownTalents(L),
      effects: (L.effects || []).slice()
    };
    return draft;
  }

  function num(v) {
    if (v == null || String(v).trim() === '') return '';
    var n = Number(v);
    return Number.isFinite(n) ? n : '';
  }
  function uniq(list) {
    var out = [];
    (list || []).forEach(function (n) { if (n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function harvest(root) {
    if (!draft || !root) return;
    root.querySelectorAll('[data-ed-field]').forEach(function (el) {
      draft[el.getAttribute('data-ed-field')] = el.value;
    });
    var lords = [];
    root.querySelectorAll('[data-ed-lord]').forEach(function (el) { if (el.value) lords.push(el.value); });
    draft.lords = uniq(lords);
    root.querySelectorAll('[data-ed-hero]').forEach(function (el) {
      var i = +el.getAttribute('data-ed-hero');
      if (draft.heroes[i]) draft.heroes[i].name = el.value;
    });
    root.querySelectorAll('[data-ed-spot]').forEach(function (el) {
      var i = +el.getAttribute('data-ed-spot');
      if (draft.heroes[i]) draft.heroes[i].spot = +el.value || 0;
    });
    root.querySelectorAll('[data-ed-evo]').forEach(function (el) {
      var i = +el.getAttribute('data-ed-evo');
      if (draft.heroes[i]) draft.heroes[i].evo = !!el.checked;
    });
    draft.heroes.forEach(function (h) { h.eqs = ['', '', '']; });
    root.querySelectorAll('[data-ed-eq]').forEach(function (el) {
      var p = el.getAttribute('data-ed-eq').split(',');
      var h = draft.heroes[+p[0]];
      if (h) h.eqs[+p[1]] = el.value || '';
    });
    draft.ops.forEach(function (op) { op.main = []; op.sub = []; });
    root.querySelectorAll('[data-ed-op-from]').forEach(function (el) {
      var op = draft.ops[+el.getAttribute('data-ed-op-from')];
      if (op) op.from = num(el.value);
    });
    root.querySelectorAll('[data-ed-op-to]').forEach(function (el) {
      var op = draft.ops[+el.getAttribute('data-ed-op-to')];
      if (op) op.to = num(el.value);
    });
    root.querySelectorAll('[data-ed-op-desc]').forEach(function (el) {
      var op = draft.ops[+el.getAttribute('data-ed-op-desc')];
      if (op) op.desc = el.value;
    });
    root.querySelectorAll('[data-ed-op-main]').forEach(function (el) {
      if (!el.checked) return;
      var op = draft.ops[+el.getAttribute('data-ed-op-main')];
      if (op && op.main.indexOf(el.value) < 0) op.main.push(el.value);
    });
    root.querySelectorAll('[data-ed-op-sub]').forEach(function (el) {
      if (!el.checked) return;
      var op = draft.ops[+el.getAttribute('data-ed-op-sub')];
      if (op && op.sub.indexOf(el.value) < 0) op.sub.push(el.value);
    });
  }

  function patchFromDraft() {
    var heroNames = {};
    draft.heroes.forEach(function (h) { if (h.name) heroNames[h.name] = 1; });
    return {
      rev: Number(draft.rev || 0) + 1,
      at: Date.now(),
      name: String(draft.name || '').trim(),
      brief: draft.brief || '',
      positionDesc: draft.positionDesc || '',
      equipDesc: draft.equipDesc || '',
      talentDesc: draft.talentDesc || '',
      effectDesc: draft.effectDesc || '',
      lords: uniq(draft.lords),
      heroes: draft.heroes.filter(function (h) { return h.name; }).map(function (h) {
        return {
          name: h.name, x: Number(h.x) || 0, z: Number(h.z) || 0,
          evo: !!h.evo, spot: Number(h.spot) || 0,
          eqs: (h.eqs || []).filter(Boolean)
        };
      }),
      ops: draft.ops.map(function (op) {
        return {
          from: op.from, to: op.to, desc: op.desc || '',
          main: (op.main || []).filter(function (n) { return heroNames[n]; }),
          sub: (op.sub || []).filter(function (n) { return heroNames[n]; })
        };
      }),
      talents: uniq(draft.talents),
      effects: uniq(draft.effects)
    };
  }
  function save() {
    if (!draft) return false;
    var patch = patchFromDraft();
    if (!patch.name) { toast('阵容名不能空'); return false; }
    if (!patch.heroes.length) { toast('至少留一名英雄'); return false; }
    var st = readStore();
    st.items[draft.key] = patch;
    try { writeStore(st); }
    catch (e) { toast('保存失败：浏览器本地存储写不进去（已满或处于隐私模式）'); return false; }
    draft.rev = patch.rev;
    invalidate();
    if (global.WXQ_CLOUD && WXQ_CLOUD.touch) WXQ_CLOUD.touch();
    toast('已保存「' + patch.name + '」');
    draft = null;
    return true;
  }
  function reset() {
    if (!draft) return false;
    var st = readStore();
    st.items[draft.key] = { cleared: true, rev: Number(draft.rev || 0) + 1, at: Date.now() };
    try { writeStore(st); }
    catch (e) { toast('恢复失败：本地存储写不进去'); return false; }
    invalidate();
    if (global.WXQ_CLOUD && WXQ_CLOUD.touch) WXQ_CLOUD.touch();
    toast('已恢复官方内容');
    draft = null;
    return true;
  }

  function opts(list, current, blank) {
    var html = '<option value="">' + esc(blank || '请选择') + '</option>';
    var seen = {};
    var all = list.slice();
    if (current && all.indexOf(current) < 0) all.unshift(current);
    all.forEach(function (n) {
      if (!n || seen[n]) return;
      seen[n] = 1;
      html += '<option value="' + esc(n) + '"' + (n === current ? ' selected' : '') + '>' + esc(n) + '</option>';
    });
    return html;
  }
  function optsKeep(list, current) {
    var html = '';
    var seen = {};
    var all = list.slice();
    if (current && all.indexOf(current) < 0) all.unshift(current);
    all.forEach(function (n) {
      if (!n || seen[n]) return;
      seen[n] = 1;
      html += '<option value="' + esc(n) + '"' + (n === current ? ' selected' : '') + '>' + esc(n) + '</option>';
    });
    return html;
  }
  function field(label, key, multiline) {
    var v = esc(draft[key] || '');
    var box = multiline
      ? '<textarea data-ed-field="' + key + '">' + v + '</textarea>'
      : '<input data-ed-field="' + key + '" value="' + v + '">';
    return '<label class="ed-lab">' + label + '</label>' + box;
  }
  function chipList(list, delAttr) {
    if (!list.length) return '<div class="jmuted">还没有</div>';
    return list.map(function (n, i) {
      return '<span class="ed-chip">' + esc(n)
        + '<button type="button" data-ed-del-' + delAttr + '="' + i + '" aria-label="移除">×</button></span>';
    }).join('');
  }
  function addRow(kind, label, blank) {
    var list = cats()[kind] || [];
    return '<div class="ed-add">'
      + '<input type="search" data-ed-filter="' + kind + '" placeholder="搜索' + label + '" autocomplete="off">'
      + '<select data-ed-pick="' + kind + '">' + opts(list, '', blank || ('选择' + label)) + '</select>'
      + '<button type="button" class="jbtn" data-ed-add="' + kind + '">添加</button>'
      + '</div>';
  }
  function boardHtml() {
    var map = {};
    draft.heroes.forEach(function (h, i) { map[h.x + ',' + h.z] = { h: h, i: i }; });
    var rows = '';
    for (var z = ROWS - 1; z >= 0; z--) {
      var cells = '';
      for (var x = 0; x < COLS; x++) {
        var hit = map[x + ',' + z];
        if (!hit) {
          cells += '<button type="button" class="jcell" data-ed-cell="' + x + ',' + z + '" aria-label="空位"></button>';
          continue;
        }
        var h = hit.h;
        cells += '<button type="button" class="jcell filled' + (draft.sel === hit.i ? ' on' : '') + '" data-ed-cell="' + x + ',' + z + '" title="' + esc(h.name) + '">'
          + '<img src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
          + '<i class="jph">' + esc((h.name || '？').slice(0, 1)) + '</i>'
          + '<span class="jcn">' + esc(h.name) + '</span></button>';
      }
      rows += '<div class="jrow">' + cells + '</div>';
    }
    return '<div class="jboard">' + rows + '</div>'
      + '<p class="ed-note">上为前排。先点英雄，再点空格移动；再点一次已选中的英雄取消选择。</p>';
  }
  function heroBlocks() {
    var C = cats();
    if (!draft.heroes.length) return '<div class="jmuted">棋盘上还没有英雄</div>';
    return draft.heroes.map(function (h, i) {
      var spot = SPOTS.map(function (t, s) {
        return '<option value="' + s + '"' + (Number(h.spot) === s ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      var eqs = [0, 1, 2].map(function (s) {
        return '<select data-ed-eq="' + i + ',' + s + '" aria-label="' + esc(h.name) + '装备' + (s + 1) + '">'
          + opts(C.equip, h.eqs[s] || '', '不装备') + '</select>';
      }).join('');
      return '<div class="ed-hero">'
        + '<div class="ed-row">'
        + '<select data-ed-hero="' + i + '" aria-label="英雄">' + optsKeep(C.hero, h.name) + '</select>'
        + '<select class="ed-spot" data-ed-spot="' + i + '" aria-label="站位角色">' + spot + '</select>'
        + '<label class="ed-check"><input type="checkbox" data-ed-evo="' + i + '"' + (h.evo ? ' checked' : '') + '>觉醒</label>'
        + '<button type="button" class="jbtn" data-ed-del-hero="' + i + '">移出</button>'
        + '</div>'
        + '<div class="ed-row ed-eqs">' + eqs + '</div>'
        + '</div>';
    }).join('');
  }
  function checks(list, attr, picked) {
    if (!list.length) return '<div class="jmuted">先把英雄放到棋盘上</div>';
    return '<div class="ed-checks">' + list.map(function (n) {
      var on = picked.indexOf(n) >= 0;
      return '<label class="ed-check"><input type="checkbox" data-ed-' + attr + ' value="' + esc(n) + '"' + (on ? ' checked' : '') + '>' + esc(n) + '</label>';
    }).join('') + '</div>';
  }
  function opsHtml() {
    var names = draft.heroes.map(function (h) { return h.name; }).filter(Boolean);
    return draft.ops.map(function (op, i) {
      return '<div class="ed-phase"><div class="ed-ph">' + PHASE[i] + '</div>'
        + '<div class="ed-row ed-rounds">'
        + '<label>从回合 <input type="number" min="1" max="50" data-ed-op-from="' + i + '" value="' + esc(op.from) + '"></label>'
        + '<label>到 <input type="number" min="1" max="50" data-ed-op-to="' + i + '" value="' + esc(op.to) + '"></label>'
        + '</div>'
        + '<label class="ed-lab">这段怎么打</label>'
        + '<textarea data-ed-op-desc="' + i + '">' + esc(op.desc || '') + '</textarea>'
        + '<label class="ed-lab">主要上阵</label>' + checks(names, 'op-main="' + i + '"', op.main || [])
        + '<label class="ed-lab">备选</label>' + checks(names, 'op-sub="' + i + '"', op.sub || [])
        + '</div>';
    }).join('');
  }
  function lordRows() {
    var list = cats().lord;
    if (!draft.lords.length) return '<div class="jmuted">还没选棋手</div>';
    return draft.lords.map(function (n, i) {
      return '<div class="ed-row">'
        + '<select data-ed-lord="' + i + '" aria-label="棋手">' + optsKeep(list, n) + '</select>'
        + '<button type="button" class="jbtn" data-ed-del-lord="' + i + '">移除</button>'
        + '</div>';
    }).join('');
  }

  function pageHtml(L) {
    if (!draft || draft.key !== String(L.key)) begin(L);
    var resetLabel = draft.arm === 1 ? '再点确认恢复' : '恢复官方';
    return '<article class="jdoc ed" data-ed-root="1">'
      + '<button type="button" class="jback" data-ed="cancel" title="取消并返回" aria-label="取消并返回">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4 7.5 12l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</button>'
      + '<div class="ed-bar">'
      + '<button type="button" class="jbtn pri" data-ed="save">保存</button>'
      + '<button type="button" class="jbtn" data-ed="cancel">取消</button>'
      + '<button type="button" class="jbtn' + (draft.arm === 1 ? ' loud' : '') + '" data-ed="reset">' + resetLabel + '</button>'
      + '<span class="ed-note">存在这台浏览器。开了同步桥会带到别的电脑。保存后以你的修改为准，官方库以后更新不会盖掉这套。</span>'
      + '</div>'
      + '<section class="jbox">' + field('阵容名', 'name', false) + field('玩法介绍', 'brief', true) + '</section>'
      + '<section class="jbox"><h3>棋手</h3>'
      + (draft.lordsFromStats ? '<p class="ed-note">现在填的是页面上按近7日数据显示的棋手。保存之后就固定成你选的名单。</p>' : '')
      + lordRows() + addRow('lord', '棋手', '选择棋手') + '</section>'
      + '<section class="jbox"><h3>站位</h3>' + boardHtml() + '</section>'
      + '<section class="jbox"><h3>英雄与装备</h3>' + heroBlocks() + addRow('hero', '英雄', '选择英雄') + '</section>'
      + '<section class="jbox"><h3>运营 <span>前 / 中 / 后期</span></h3>' + opsHtml() + '</section>'
      + '<section class="jbox"><h3>分析</h3>'
      + field('站位分析', 'positionDesc', true)
      + field('装备分析', 'equipDesc', true)
      + field('天赋说明', 'talentDesc', true)
      + field('效果说明', 'effectDesc', true)
      + '</section>'
      + '<section class="jbox"><h3>天赋</h3><div class="ed-chips">' + chipList(draft.talents, 'talent') + '</div>'
      + addRow('talent', '天赋', '选择天赋') + '</section>'
      + '<section class="jbox"><h3>效果牌</h3><div class="ed-chips">' + chipList(draft.effects, 'effect') + '</div>'
      + addRow('effect', '效果', '选择效果') + '</section>'
      + '</article>';
  }

  function rerender() {
    pendingY = global.scrollY || 0;
    var grid = global.document && document.getElementById('grid');
    var st = (global.__wxqUI && global.__wxqUI.state) || { q: '' };
    if (grid && global.WXQ_JOBS_UI && WXQ_JOBS_UI.render) WXQ_JOBS_UI.render(grid, st);
  }
  function pickValue(root, kind) {
    var sel = root.querySelector('[data-ed-pick="' + kind + '"]');
    return sel ? sel.value : '';
  }
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest || !draft) return null;
    var root = t.closest('[data-ed-root]');
    if (!root) return null;
    var act = t.closest('[data-ed]');
    var cell = t.closest('[data-ed-cell]');
    var add = t.closest('[data-ed-add]');
    var delL = t.closest('[data-ed-del-lord]');
    var delH = t.closest('[data-ed-del-hero]');
    var delT = t.closest('[data-ed-del-talent]');
    var delE = t.closest('[data-ed-del-effect]');
    if (!act && !cell && !add && !delL && !delH && !delT && !delE) return null;
    harvest(root);
    var kind = act ? act.getAttribute('data-ed') : '';
    if (kind !== 'reset') draft.arm = 0;
    if (kind === 'save') return save() ? 'detail' : null;
    if (kind === 'cancel') { draft = null; return 'detail'; }
    if (kind === 'reset') {
      if (draft.arm !== 1) {
        draft.arm = 1;
        toast('再点一次「恢复官方」才会清掉这套的修改');
        return 'rerender';
      }
      return reset() ? 'detail' : null;
    }
    if (add) {
      var ak = add.getAttribute('data-ed-add');
      var v = pickValue(root, ak);
      if (!v) { toast('先在下拉里选一个'); return null; }
      if (ak === 'lord') {
        if (draft.lords.indexOf(v) >= 0) { toast('已经有这个棋手'); return null; }
        draft.lords.push(v);
      } else if (ak === 'hero') {
        if (draft.heroes.some(function (h) { return h.name === v; })) { toast('这套里已经有「' + v + '」'); return null; }
        var pos = firstEmpty(usedMap(draft.heroes));
        if (!pos) { toast('棋盘满了'); return null; }
        draft.heroes.push(blankHero(v, pos.x, pos.z));
        draft.sel = draft.heroes.length - 1;
      } else if (ak === 'talent') {
        if (draft.talents.indexOf(v) < 0) draft.talents.push(v);
      } else if (ak === 'effect') {
        if (draft.effects.indexOf(v) < 0) draft.effects.push(v);
      }
      return 'rerender';
    }
    if (delL) { draft.lords.splice(+delL.getAttribute('data-ed-del-lord'), 1); return 'rerender'; }
    if (delT) { draft.talents.splice(+delT.getAttribute('data-ed-del-talent'), 1); return 'rerender'; }
    if (delE) { draft.effects.splice(+delE.getAttribute('data-ed-del-effect'), 1); return 'rerender'; }
    if (delH) {
      var hi = +delH.getAttribute('data-ed-del-hero');
      var gone = draft.heroes[hi] && draft.heroes[hi].name;
      draft.heroes.splice(hi, 1);
      if (draft.sel === hi) draft.sel = -1;
      else if (draft.sel > hi) draft.sel -= 1;
      if (gone) draft.ops.forEach(function (op) {
        op.main = op.main.filter(function (n) { return n !== gone; });
        op.sub = op.sub.filter(function (n) { return n !== gone; });
      });
      return 'rerender';
    }
    if (cell) {
      var xy = cell.getAttribute('data-ed-cell').split(',');
      var x = +xy[0];
      var z = +xy[1];
      var occ = -1;
      for (var i = 0; i < draft.heroes.length; i++) {
        if (Number(draft.heroes[i].x) === x && Number(draft.heroes[i].z) === z) occ = i;
      }
      if (occ >= 0) draft.sel = (draft.sel === occ ? -1 : occ);
      else if (draft.sel >= 0 && draft.heroes[draft.sel]) {
        draft.heroes[draft.sel].x = x;
        draft.heroes[draft.sel].z = z;
      } else toast('先点一个英雄，再点空格');
      return 'rerender';
    }
    return null;
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute || !draft) return;
    if (!t.closest || !t.closest('[data-ed-root]')) return;
    harvest(t.closest('[data-ed-root]'));
    if (t.getAttribute('data-ed-hero') == null) return;
    var i = +t.getAttribute('data-ed-hero');
    var name = draft.heroes[i] && draft.heroes[i].name;
    var dup = false;
    for (var j = 0; j < draft.heroes.length; j++) if (j !== i && draft.heroes[j].name === name) dup = true;
    if (dup) {
      toast('「' + name + '」已经在这套里');
      draft.heroes[i].name = t.getAttribute('data-prev') || draft.heroes[i].name;
    }
    rerender();
  }
  function onFilter(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var kind = t.getAttribute('data-ed-filter');
    if (!kind) return;
    var sel = t.parentNode && t.parentNode.querySelector('select');
    if (!sel) return;
    var q = String(t.value || '').trim();
    var list = (cats()[kind] || []).filter(function (n) { return !q || n.indexOf(q) >= 0; });
    var cur = sel.value;
    sel.innerHTML = opts(list, list.indexOf(cur) >= 0 ? cur : '', q ? '没有匹配' : '请选择');
  }
  function onFocus(e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-ed-hero') != null) t.setAttribute('data-prev', t.value);
  }
  function bind(grid) {
    if (!grid || grid._wxqEditBound) return;
    grid._wxqEditBound = true;
    grid.addEventListener('change', onChange);
    grid.addEventListener('input', onFilter);
    grid.addEventListener('focusin', onFocus);
    if (pendingY >= 0) {
      var y = pendingY;
      pendingY = -1;
      try { global.scrollTo(0, y); } catch (e) {}
    }
  }
  // 云端这份 rev 更高时丢掉正在写的草稿，避免保存时把别人的修改盖回去。
  function noteRemote(key, item) {
    if (!draft || String(draft.key) !== String(key) || !item) return;
    if (Number(item.rev || 0) > Number(draft.rev || 0)) draft = null;
  }

  global.WXQ_EDIT = {
    apply: apply,
    begin: begin,
    save: save,
    reset: reset,
    pageHtml: pageHtml,
    onClick: onClick,
    bind: bind,
    noteRemote: noteRemote,
    _draft: function () { return draft; }
  };
})(window);
