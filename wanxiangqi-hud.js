/* ============================================================================
 * 王者万象棋 · 对局浮窗
 * ----------------------------------------------------------------------------
 * 收藏「在用阵容」，把站位和要点贴在浮窗里，打的时候对着看。
 *
 * 窗口规则：同一时刻只留一个窗口。
 *   点「对局浮窗」→ 开一个小的浮窗，然后把当前的助手窗口关掉。
 *   当前窗口是双击打开的那种（浏览器不允许脚本关它），就撤回小窗，
 *   让本窗口自己变成浮窗，绝不让两个窗口同时挂着。
 *   浮窗点「回到助手」→ 反过来做同一件事。
 *
 * 要点只取官方卡面 + 该套阵容原文，不编胜率。
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'wxq-using-v1';
  var MAX = 8;
  var COLS = 7;
  var ROWS = 4;
  var PHASE = ['前期', '中期', '后期'];
  var MAIN_NAME = 'wxqMain';
  var HUD_NAME = 'wxqHud';
  var mainBound = false;
  var sizeBound = false;

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function abs(p) {
    try { return new URL(p, document.baseURI || location.href).href; } catch (e) { return p; }
  }
  function cloudTouch() {
    if (global.WXQ_CLOUD && WXQ_CLOUD.touch) WXQ_CLOUD.touch();
  }
  function heroImg(name) { return abs('wxq-icon/heroes/' + encodeURIComponent(name) + '.png'); }
  function equipImg(name) { return abs('wxq-icon/equips/' + encodeURIComponent(name) + '.png'); }

  function heroByName(name) {
    var H = global.WXQ_HEROES || [];
    for (var i = 0; i < H.length; i++) if (H[i].name === name) return H[i];
    return null;
  }
  function equipByName(name) {
    var E = global.WXQ_EQUIPS || [];
    for (var i = 0; i < E.length; i++) if (E[i].name === name) return E[i];
    return null;
  }
  function plain(s) {
    var t = String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '');
    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    t = t.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/[ \t]+\n/g, '\n');
    return t.replace(/\n{2,}/g, '\n').replace(/^\s+|\s+$/g, '');
  }
  function para(s) { return esc(plain(s)).replace(/\n/g, '<br>'); }

  function tipsOn() {
    try { return localStorage.getItem('wxq-hud-db') !== '0'; } catch (e) { return true; }
  }
  function setTips(on) {
    try { localStorage.setItem('wxq-hud-db', on ? '1' : '0'); } catch (e) {}
    cloudTouch();
    var hud = document.querySelector('.hud');
    if (hud) hud.setAttribute('data-hud-db', on ? '1' : '0');
    var btn = document.querySelector('[data-hud-tips]');
    // 文字保持两个字的宽度，状态靠底色，避免顶栏在窄窗里被挤出去
    if (btn) btn.classList[on ? 'add' : 'remove']('on');
    var tip = document.getElementById('hudTip');
    if (tip && !on) tip.style.display = 'none';
  }

  function craftOf(name) {
    var e = equipByName(name);
    if (!e || !e.craftFrom || !e.craftFrom.length) return '';
    var from = [];
    e.craftFrom.forEach(function (x) {
      var n = x && x.name;
      if (n && n !== name && from.indexOf(n) < 0) from.push(n);
    });
    return from.length ? '从' + from.join('、') + '合成' : '';
  }

  /* ---------- 在用收藏 ---------- */

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE) || '');
      if (!o || !o.keys) return { keys: [], last: '' };
      return { keys: o.keys.map(String).filter(Boolean).slice(0, MAX), last: String(o.last || '') };
    } catch (e) { return { keys: [], last: '' }; }
  }
  function save(st) {
    try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) {}
    paintDock();
    cloudTouch();
  }
  function find(key) {
    if (global.WXQ_JOBS_UI && WXQ_JOBS_UI.find) return WXQ_JOBS_UI.find(key);
    return null;
  }
  function aliveKeys() {
    return load().keys.filter(function (k) { return !!find(k); });
  }
  function has(key) { return load().keys.indexOf(String(key)) >= 0; }

  function toggle(key) {
    key = String(key || '');
    if (!key || !find(key)) return false;
    var st = load();
    var i = st.keys.indexOf(key);
    if (i >= 0) {
      st.keys.splice(i, 1);
      if (st.last === key) st.last = st.keys[0] || '';
      save(st);
      return false;
    }
    if (st.keys.length >= MAX) {
      toast('在用最多 ' + MAX + ' 套，先取消一套');
      return true;
    }
    st.keys.push(key);
    st.last = key;
    save(st);
    return true;
  }
  function setLast(key) {
    var st = load();
    st.last = String(key || '');
    save(st);
  }
  function lineupOf(key) {
    key = String(key || '');
    var L = key ? find(key) : null;
    if (L) return L;
    var st = load();
    return find(st.last) || find(aliveKeys()[0]) || null;
  }

  function toast(msg) {
    var el = document.getElementById('wxqHudToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wxqHudToast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'on';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.className = ''; }, 1600);
  }

  /* ---------- 尺寸 ---------- */

  function screenBox(win) {
    var w = win || global;
    var sc = w.screen || {};
    return {
      w: sc.availWidth || sc.width || w.innerWidth || 1280,
      h: sc.availHeight || sc.height || w.innerHeight || 720,
      left: sc.availLeft || 0,
      top: sc.availTop || 0
    };
  }
  function screenKey(win) {
    var s = screenBox(win);
    return s.w + 'x' + s.h;
  }
  function fitBand(h) {
    if (h >= 2000) return 'xl';
    if (h >= 1300) return 'lg';
    if (h >= 900) return 'md';
    return 'sm';
  }
  function bestSize(win) {
    var s = screenBox(win);
    var cell = 42;
    if (s.h >= 800) cell = 46;
    if (s.h >= 1000) cell = 52;
    if (s.h >= 1300) cell = 60;
    if (s.h >= 2000) cell = 72;
    var w = Math.min(s.w - 16, Math.max(380, 7 * cell + 36));
    var h = Math.max(480, s.h - 48);
    if (w < 280) w = Math.min(280, s.w - 8);
    if (h < 320) h = Math.min(320, s.h - 8);
    return { w: Math.round(w), h: Math.round(h), fit: fitBand(s.h) };
  }
  function loadSizeMap() {
    try {
      var raw = JSON.parse(localStorage.getItem('wxq-hud-size') || '');
      if (!raw || typeof raw !== 'object' || raw.w) return {};
      return raw;
    } catch (e) { return {}; }
  }
  function loadSize(win) {
    var best = bestSize(win);
    var o = loadSizeMap()[screenKey(win)];
    if (o && Number(o.w) >= 200 && Number(o.h) >= 160) {
      // 以前存过很矮的尺寸就忽略，避免浮窗一开始就挤成一条
      if (Number(o.h) < best.h * 0.55 || Number(o.w) > best.w * 1.65) return best;
      return { w: Math.round(Number(o.w)), h: Math.round(Number(o.h)), fit: best.fit };
    }
    return best;
  }
  function saveSize(w, h, win) {
    if (!(w >= 200 && h >= 160)) return;
    var map = loadSizeMap();
    map[screenKey(win || global)] = { w: Math.round(w), h: Math.round(h) };
    try { localStorage.setItem('wxq-hud-size', JSON.stringify(map)); } catch (e) {}
    cloudTouch();
  }
  function clearSize(win) {
    var map = loadSizeMap();
    delete map[screenKey(win || global)];
    try { localStorage.setItem('wxq-hud-size', JSON.stringify(map)); } catch (e) {}
  }
  // 浮窗是自己开的窗口，记一下用户拉出来的大小
  function rememberSize(win) {
    if (sizeBound) return;
    sizeBound = true;
    var t = 0;
    win.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { saveSize(win.innerWidth, win.innerHeight, win); }, 250);
    });
  }
  function resetFit() {
    clearSize(global);
    if (!canResizeSelf()) return;
    var sz = bestSize(global);
    var s = screenBox(global);
    try {
      global.resizeTo(sz.w, sz.h);
      global.moveTo(s.left + s.w - sz.w - 12, s.top + Math.round((s.h - sz.h) * 0.08));
    } catch (e) {}
  }

  /* ---------- 内容 ---------- */

  function isMobile() {
    try {
      if (global.matchMedia && global.matchMedia('(pointer:coarse)').matches) return true;
      return Math.min(screen.width || 0, screen.height || 0) <= 480 || (navigator.userAgent || '').indexOf('Mobile') >= 0;
    } catch (e) { return false; }
  }

  function boardHtml(L) {
    var map = {};
    (L.heroes || []).forEach(function (h) { map[h.x + ',' + h.z] = h; });
    var rows = '';
    for (var z = ROWS - 1; z >= 0; z--) {
      var cells = '';
      for (var x = 0; x < COLS; x++) {
        var h = map[x + ',' + z];
        if (!h) { cells += '<div class="hcell"></div>'; continue; }
        var card = heroByName(h.name);
        var q = card && card.quality ? card.quality : 0;
        cells += '<div class="hcell filled" data-hud-kind="hero" data-hud-name="' + esc(h.name) + '" title="' + esc(h.name) + (q ? ' · ' + q : '') + '">'
          + (q ? '<b class="hq">' + q + '</b>' : '')
          + '<img src="' + heroImg(h.name) + '" alt="' + esc(h.name) + '">'
          + '<span>' + esc(h.name) + '</span></div>';
      }
      rows += '<div class="hrow">' + cells + '</div>';
    }
    return '<div class="hboard"><div class="hboard-lab">上 = 前排</div>' + rows + '</div>';
  }

  function sec(title, body) {
    if (!body) return '';
    return '<section class="hsec"><h4>' + esc(title) + '</h4>' + body + '</section>';
  }

  function equipsBlock(L) {
    var rows = (L.heroes || []).filter(function (h) { return h.eqs && h.eqs.length; });
    if (!rows.length && !L.equipDesc) return '';
    var h = rows.map(function (hero) {
      var c = heroByName(hero.name);
      var items = hero.eqs.map(function (n) {
        var craft = craftOf(n);
        return '<div class="heq-i" data-hud-kind="equip" data-hud-name="' + esc(n) + '">'
          + '<img src="' + equipImg(n) + '" alt="' + esc(n) + '">'
          + '<span>' + esc(n) + (craft ? '<em>' + esc(craft) + '</em>' : '') + '</span></div>';
      }).join('');
      return '<div class="heq-row">'
        + '<img class="heq-h" src="' + heroImg(hero.name) + '" alt="' + esc(hero.name) + '" data-hud-kind="hero" data-hud-name="' + esc(hero.name) + '">'
        + '<div><div class="heq-n" data-hud-kind="hero" data-hud-name="' + esc(hero.name) + '">' + esc(hero.name)
        + (c && c.quality ? '<i class="hq-inline">' + c.quality + '</i>' : '')
        + '</div>' + items + '</div></div>';
    }).join('');
    if (L.equipDesc) h += '<p class="heq-d">' + esc(L.equipDesc) + '</p>';
    return h;
  }

  function opsBlock(L) {
    var parts = [];
    var briefShown = false;
    (L.ops || []).forEach(function (o, i) {
      if (!o) return;
      var who = (o.main || []).concat(o.sub || []);
      var lab = PHASE[i] || ('阶段' + (i + 1));
      var round = '';
      if (o.from && o.to && !(Number(o.from) === 0 && Number(o.to) === 0)) {
        round = o.from === o.to ? o.from + ' 回合' : o.from + '–' + o.to + ' 回合';
      }
      var head = '<div class="hph-h">' + esc(lab) + (round ? '<i>' + esc(round) + '</i>' : '') + '</div>';
      // 原文这一段是空的：用该套玩法原文顶上，别让浮窗缺一段
      if (!o.desc && !who.length) {
        if (L.brief && !briefShown) {
          briefShown = true;
          parts.push('<div class="hph">' + head + '<p>' + esc(L.brief) + '</p></div>');
        }
        return;
      }
      var faces = who.length
        ? '<div class="hwho">' + who.map(function (n) {
          return '<span data-hud-kind="hero" data-hud-name="' + esc(n) + '">' + esc(n) + '</span>';
        }).join('') + '</div>'
        : '';
      parts.push('<div class="hph">' + head + faces + (o.desc ? '<p>' + esc(o.desc) + '</p>' : '') + '</div>');
    });
    return parts.join('');
  }

  function playBlock(L) {
    var ns = (L.heroes || []).map(function (h) { return h.name; });
    var bits = [];
    var arch = global.WXQ_EXPLAIN && WXQ_EXPLAIN.match && WXQ_EXPLAIN.match(L);
    if (arch && typeof arch.turnOf === 'function') {
      var steps = arch.turnOf(ns);
      if (steps.length) {
        bits.push('<ol class="hol">' + steps.map(function (s) {
          return '<li>' + esc(s.text) + '</li>';
        }).join('') + '</ol>');
      }
    }
    var pulled = (global.WXQ_EXPLAIN && WXQ_EXPLAIN.tips) ? WXQ_EXPLAIN.tips(L) : [];
    if (pulled.length) {
      bits.push('<ul class="hul">' + pulled.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>');
    }
    if (L.effectDesc) bits.push('<p>' + esc(L.effectDesc) + '</p>');
    if (!bits.length && L.brief) bits.push('<p>' + esc(L.brief) + '</p>');
    return bits.join('');
  }

  function switcherHtml(cur) {
    var keys = aliveKeys();
    if (keys.length <= 1) return '';
    return '<div class="hsw">' + keys.map(function (k) {
      var L = find(k);
      if (!L) return '';
      return '<button type="button" class="hsw-b' + (String(k) === String(cur) ? ' on' : '') + '" data-hud-key="' + esc(k) + '">' + esc(L.name) + '</button>';
    }).join('') + '</div>';
  }

  function innerHtml(L) {
    var lords = (L.lords || []).join(' / ');
    var eq = equipsBlock(L);
    var op = opsBlock(L);
    var play = playBlock(L);
    var resizable = canResizeSelf();
    return '<div class="hud" data-hud-cur="' + esc(L.key) + '" data-hud-db="' + (tipsOn() ? '1' : '0') + '" data-hud-mobile="' + (isMobile() ? '1' : '0') + '" data-hud-fit="' + fitBand(screenBox().h) + '">'
      + '<div class="hbar">'
      + '<strong>对局浮窗</strong>'
      + '<span class="hsp"></span>'
      + '<button type="button" class="hbtn pri home" data-hud-home="1">回到助手</button>'
      + '<button type="button" class="hbtn' + (tipsOn() ? ' on' : '') + '" data-hud-tips="1">图鉴</button>'
      + (resizable ? '<button type="button" class="hbtn" data-hud-fitreset="1">适配</button>' : '')
      + '</div>'
      + '<div class="hcodewrap"></div>'
      + switcherHtml(L.key)
      + '<div class="hbody">'
      + '<div class="hside"><div class="hname">' + esc(L.name)
      + (lords ? '<em>' + esc(lords) + '</em>' : '') + '</div>'
      + (L.nocode
        ? '<p class="hsub">第三方数据，无可导入阵容码</p>'
        : '<p class="hsub">阵容码 <button type="button" class="hlink" data-hud-copy="' + esc(L.key) + '">复制</button></p>')
      + boardHtml(L) + '</div>'
      + '<div class="htips">' + sec('装备', eq) + sec('前 / 中 / 后期', op) + sec('出牌', play)
      + (!eq && !op && !play ? '<p class="hmuted">这套原文没写装备和运营，只看站位。</p>' : '')
      + '</div></div>'
      + '</div>';
  }

  /* ---------- 复制 ---------- */

  function fallbackCopy(text) {
    try {
      var t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;';
      document.body.appendChild(t);
      t.focus();
      t.select();
      if (t.setSelectionRange) t.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e1) { ok = false; }
      document.body.removeChild(t);
      return ok;
    } catch (e) { return false; }
  }
  // 复制失败（小窗没手势权限）才展开一个只读框，平时不占地方。
  function revealCode(btn, text) {
    var wrap = document.querySelector('.hcodewrap');
    if (!wrap) return;
    var box = wrap.querySelector('[data-hud-copybox]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-hud-copybox', '1');
      box.className = 'hcode';
      wrap.appendChild(box);
    }
    box.innerHTML = '<input data-hud-codeinput value="' + esc(text) + '" readonly>'
      + '<div class="hcode-n">点一下全选，再 Ctrl+C</div>';
    box.style.display = 'block';
    var input = box.querySelector('[data-hud-codeinput]');
    if (input) {
      try {
        input.focus();
        input.select();
        if (input.setSelectionRange) input.setSelectionRange(0, text.length);
      } catch (e2) {}
    }
  }
  function copyKey(key, btn) {
    var text = String(key || '');
    function done(ok) {
      if (ok) {
        if (btn) {
          var old = btn.textContent;
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = old; }, 1400);
        }
        return;
      }
      if (btn) btn.textContent = '手动复制';
      revealCode(btn, text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      return;
    }
    done(fallbackCopy(text));
  }

  /* ---------- 悬停卡面 ---------- */

  function tipHtml(kind, name) {
    if (kind === 'hero') {
      var h = heroByName(name);
      if (!h) return '';
      var bits = ['<div class="ht-n">' + esc(h.name) + '</div>'];
      var sub = [];
      if (h.quality) sub.push(String(h.quality));
      if (h.faction) sub.push(h.faction);
      if (h.cost && h.cost.count) sub.push('商店 ' + h.cost.count + (h.cost.type === 1 ? ' 古币' : ''));
      if (sub.length) bits.push('<div class="ht-s">' + esc(sub.join(' · ')) + '</div>');
      if (h.desc) bits.push('<div class="ht-l">卡面</div><div class="ht-d">' + para(h.desc) + '</div>');
      if (h.awakeDesc) bits.push('<div class="ht-l">觉醒</div><div class="ht-d">' + para(h.awakeDesc) + '</div>');
      (h.skills || []).forEach(function (s) {
        bits.push('<div class="ht-l">技能 · ' + esc(s.name) + '</div>');
        if (s.desc) bits.push('<div class="ht-d">' + para(s.desc) + '</div>');
        (s.enhance || []).forEach(function (p) {
          bits.push('<div class="ht-d"><b>' + esc(String(p.level)) + '</b> ' + para(p.desc) + '</div>');
        });
      });
      if (h.kwHelp && h.kwHelp.length) {
        bits.push('<div class="ht-l">词条</div><div class="ht-d">'
          + h.kwHelp.map(function (k) { return esc(k.name) + '：' + esc(plain(k.desc)); }).join('<br>')
          + '</div>');
      }
      if (h.stats) {
        var st = [];
        if (h.stats.HP != null) st.push('生命 ' + h.stats.HP);
        if (h.stats.phyAttack) st.push('物攻 ' + h.stats.phyAttack);
        if (h.stats.magAttack) st.push('法攻 ' + h.stats.magAttack);
        if (h.stats.phyDefense != null) st.push('物防 ' + h.stats.phyDefense);
        if (h.stats.attackDistance != null) st.push('攻距 ' + h.stats.attackDistance);
        if (h.stats.initEnergy != null || h.stats.energy != null) {
          st.push('能量 ' + (h.stats.initEnergy || 0) + '/' + (h.stats.energy || 0));
        }
        if (st.length) bits.push('<div class="ht-s">' + esc(st.join(' · ')) + '</div>');
      }
      return bits.join('');
    }
    if (kind === 'equip') {
      var e = equipByName(name);
      if (!e) return '<div class="ht-n">' + esc(name) + '</div>';
      var sube = [];
      if (e.quality) sube.push(String(e.quality));
      if (e.subType) sube.push(e.subType);
      var craft = craftOf(name);
      if (craft) sube.push(craft);
      return '<div class="ht-n">' + esc(e.name) + '</div>'
        + (sube.length ? '<div class="ht-s">' + esc(sube.join(' · ')) + '</div>' : '')
        + (e.desc ? '<div class="ht-d">' + para(e.desc) + '</div>' : '');
    }
    return '';
  }
  function showTip(el) {
    if (!tipsOn()) return;
    var html = tipHtml(el.getAttribute('data-hud-kind'), el.getAttribute('data-hud-name'));
    if (!html) return;
    var box = document.getElementById('hudTip');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hudTip';
      document.body.appendChild(box);
    }
    box.innerHTML = html;
    box.style.display = 'block';
    var r = el.getBoundingClientRect();
    var w = box.offsetWidth || 200;
    var h = box.offsetHeight || 80;
    var x = r.left;
    var y = r.bottom + 6;
    if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 6;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    box.style.left = Math.round(x) + 'px';
    box.style.top = Math.round(y) + 'px';
  }
  function hideTip() {
    var box = document.getElementById('hudTip');
    if (box) box.style.display = 'none';
  }

  /* ---------- 窗口切换 ---------- */

  function isHudView() {
    return document.body.classList.contains('hud-only');
  }
  // 脚本 window.open 出来的窗口：能自己关、也能自己改大小。双击打开的不行。
  function canResizeSelf() {
    try {
      var n = String(global.name || '');
      return n === MAIN_NAME || n === HUD_NAME;
    } catch (e) { return false; }
  }
  function hudHash(L) {
    return location.href.replace(/#.*$/, '') + '#hud-' + encodeURIComponent(L.key);
  }
  function baseUrl() {
    return location.href.replace(/#.*$/, '');
  }
  function hudWindowFeatures() {
    var sz = loadSize(global);
    var s = screenBox(global);
    var left = Math.max(s.left, s.left + s.w - sz.w - 12);
    var top = Math.max(s.top, s.top + Math.round((s.h - sz.h) * 0.08));
    return 'popup=yes,resizable=yes,scrollbars=yes,width=' + sz.w + ',height=' + sz.h
      + ',left=' + left + ',top=' + top;
  }
  function openHudWindow(L) {
    try { return global.open(hudHash(L), HUD_NAME, hudWindowFeatures()); } catch (e) { return null; }
  }
  // 关自己。Chrome 允许脚本关掉「自己 open 出来的」窗口，前提是窗口没压过历史记录
  // （history.length 仍是 1）。压过历史就关不掉，这时才退回占位页。
  function closeSelfOrPark(park) {
    try { global.close(); } catch (e) {}
    setTimeout(function () {
      if (global.closed) return;
      park();
    }, 380);
  }
  // 主窗口被顶掉时先藏起来，别和浮窗抢注意力；「回到助手」会把它放回来。
  function parkHome() {
    if (isHudView()) return;
    document.body.classList.add('wxq-parked');
    var el = document.getElementById('wxqParked');
    if (el) return;
    el = document.createElement('div');
    el.id = 'wxqParked';
    el.innerHTML = '<div class="park-box"><p>对局浮窗已打开。</p>'
      + '<button type="button" class="jbtn pri loud" data-wxq-unpark>回到助手</button></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-wxq-unpark]')) unparkHome();
    });
  }
  function unparkHome() {
    document.body.classList.remove('wxq-parked');
    try { global.focus(); } catch (e) {}
  }

  // 本窗口就地切成浮窗（深链直接打开、或另一个窗口打不开时的兜底）。
  // 用 replaceState 而不是 pushState：一旦压过历史记录，这个窗口就关不掉自己了。
  function enterHudInto(L) {
    try { history.replaceState(null, '', hudHash(L)); } catch (e) { try { location.hash = 'hud-' + encodeURIComponent(L.key); } catch (e2) {} }
    enterPage('#hud-' + encodeURIComponent(L.key));
  }
  // 本窗口就地切回完整助手。
  function exitHudInto() {
    try { history.replaceState(null, '', baseUrl() + '#j'); } catch (e) { try { location.hash = '#j'; } catch (e2) {} }
    document.body.classList.remove('hud-only');
    if (global.WXQ_JOBS_UI && WXQ_JOBS_UI.closeDetail) WXQ_JOBS_UI.closeDetail(true);
    if (global.WXQ_JOBS_UI) {
      var grid = document.getElementById('grid');
      var st = (global.__wxqUI && global.__wxqUI.state) || { q: '', type: 'jobs' };
      if (grid) WXQ_JOBS_UI.render(grid, st);
    }
  }

  // 点「对局浮窗」：开一个真正的小窗口，再关掉当前这个助手窗口。
  // Chrome 允许脚本关掉自己开的窗口，也允许关掉「用户直接打开、且没压过历史记录」的
  // 窗口；但一旦这个窗口 pushState 过（比如点开过阵容详情），就关不掉了。所以先真关
  // 一次，关不掉才收成占位页 —— 至少不会把整套内容继续摆在那儿。
  function startHud(L) {
    if (!L || isHudView()) return;
    var pop = openHudWindow(L);
    if (!pop) { enterHudInto(L); return; }
    try { pop.focus(); } catch (e0) {}
    parkHome();                 // 先藏起来：关失败也不会和浮窗抢注意力
    closeSelfOrPark(function () {});
  }
  // 浮窗点「回到助手」：优先唤醒原来那个助手窗口，其次开一个大的，最后才就地切回。
  function goHome() {
    if (!isHudView()) return;
    try {
      if (global.opener && !global.opener.closed) {
        global.opener.postMessage({ type: 'wxq-unpark' }, '*');
        try { global.opener.focus(); } catch (e0) {}
        try { global.close(); } catch (e1) {}
        return;
      }
    } catch (e) {}
    var s = screenBox(global);
    try {
      var main = global.open(baseUrl() + '#j', MAIN_NAME,
        'resizable=yes,scrollbars=yes,width=' + Math.max(1100, s.w - 48) + ',height=' + Math.max(760, s.h - 80)
        + ',left=' + s.left + ',top=' + s.top);
      if (main) {
        try { main.focus(); } catch (e2) {}
        closeSelfOrPark(function () { exitHudInto(); });
        return;
      }
    } catch (e3) {}
    exitHudInto();
  }

  /* ---------- 绑定 ---------- */

  function bindMain() {
    if (mainBound) return;
    mainBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var sw = t.closest('[data-hud-key]');
      if (sw) {
        var L = find(sw.getAttribute('data-hud-key'));
        if (!L) return;
        setLast(L.key);
        if (isHudView()) enterHudInto(L);
        return;
      }
      if (t.closest('[data-hud-home]')) { goHome(); return; }
      if (t.closest('[data-hud-fitreset]')) { resetFit(); return; }
      if (t.closest('[data-hud-tips]')) { setTips(!tipsOn()); return; }
      var code = t.closest('[data-hud-codeinput]');
      if (code) {
        try { code.focus(); code.select(); if (code.setSelectionRange) code.setSelectionRange(0, code.value.length); } catch (e1) {}
        return;
      }
      var cp = t.closest('[data-hud-copy]');
      if (cp) copyKey(cp.getAttribute('data-hud-copy'), cp);
    });
    document.addEventListener('mouseover', function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-hud-kind]');
      if (el) showTip(el);
    });
    document.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      if (to && to.closest && (to.closest('#hudTip') || to.closest('[data-hud-kind]'))) return;
      hideTip();
    });
  }

  function open(key) {
    var want = String(key || '');
    if (want && !has(want) && find(want)) toggle(want);
    var L = lineupOf(want);
    if (!L) {
      toast('先点阵容卡片右上角星标，收藏成在用');
      return;
    }
    setLast(L.key);
    startHud(L);
  }

  function enterPage(hash) {
    document.body.classList.add('hud-only');
    document.body.classList.remove('wxq-parked');
    var key = '';
    if (hash && hash.indexOf('#hud-') === 0) key = decodeURIComponent(hash.slice(5));
    var grid = document.getElementById('grid');
    if (!grid) return;
    var L = lineupOf(key);
    if (!L) {
      grid.className = 'jobs-root';
      grid.innerHTML = '<div class="hud"><p class="hmuted">还没有在用阵容。点「回到助手」给卡片点星标。</p>'
        + '<p><button type="button" class="hbtn pri home" data-hud-home="1">回到助手</button></p></div>';
      bindMain();
      return;
    }
    setLast(L.key);
    grid.className = 'jobs-root';
    grid.innerHTML = innerHtml(L);
    bindMain();
    if (canResizeSelf()) rememberSize(global);
  }

  function paintDock() {
    if (isHudView()) return;
    var n = aliveKeys().length;
    var d = document.getElementById('wxqHudDock');
    if (!n) {
      if (d) d.classList.remove('on');
      return;
    }
    if (!d) {
      d = document.createElement('button');
      d.id = 'wxqHudDock';
      d.type = 'button';
      d.addEventListener('click', function () { open(''); });
      document.body.appendChild(d);
    }
    d.textContent = '在用 ' + n + ' · 对局浮窗';
    d.classList.add('on');
  }

  global.addEventListener('storage', function (e) {
    if (e.key === STORE) paintDock();
  });
  global.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'wxq-unpark') unparkHome();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintDock);
  } else {
    paintDock();
  }

  global.WXQ_HUD = {
    has: has,
    keys: aliveKeys,
    toggle: toggle,
    open: open,
    enterPage: enterPage,
    hydrate: function () {
      paintDock();
      var grid = document.getElementById('grid');
      if (grid && global.WXQ_JOBS_UI && WXQ_JOBS_UI.render && global.__wxqUI) {
        WXQ_JOBS_UI.render(grid, global.__wxqUI.state || { q: '', type: 'jobs' });
      }
    },
    html: function (key) {
      var L = lineupOf(key);
      return L ? innerHtml(L) : '';
    },
    tip: tipHtml,
    bestSize: bestSize,
    count: function () { return aliveKeys().length; }
  };
})(window);
