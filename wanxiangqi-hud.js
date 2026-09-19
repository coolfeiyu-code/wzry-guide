/* ============================================================================
 * 王者万象棋 · 对局浮窗
 * ----------------------------------------------------------------------------
 * 收藏「在用阵容」，把站位和要点贴在可拖动的小窗里。贴不到游戏画面内部：
 * Chrome / Edge 走画中画压在最前；否则弹出小窗，拖到游戏旁边。
 * 要点只取卡面讲解 + 该套阵容原文，不编胜率。
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'wxq-using-v1';
  var MAX = 8;
  var COLS = 7;
  var ROWS = 4;
  var PHASE = ['前期', '中期', '后期'];
  var popWin = null;
  var panel = null;
  var mainBound = false;

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
  function para(s) {
    return esc(plain(s)).replace(/\n/g, '<br>');
  }
  function tipsOn() {
    try { return localStorage.getItem('wxq-hud-db') !== '0'; } catch (e) { return true; }
  }
  function setTips(on) {
    try { localStorage.setItem('wxq-hud-db', on ? '1' : '0'); } catch (e) {}
    cloudTouch();
    applyTipsUi(document);
    if (popWin && !popWin.closed) applyTipsUi(popWin.document);
  }
  function applyTipsUi(doc) {
    if (!doc || !doc.querySelector) return;
    var on = tipsOn();
    var hud = doc.querySelector('.hud');
    if (hud) hud.setAttribute('data-hud-db', on ? '1' : '0');
    var btn = doc.querySelector('[data-hud-tips]');
    if (btn) {
      btn.textContent = on ? '图鉴开' : '图鉴关';
      if (btn.classList) {
        if (on) btn.classList.add('on');
        else btn.classList.remove('on');
      }
    }
    var tip = doc.getElementById('hudTip');
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
    var W = s.w;
    var H = s.h;
    var cell = 42;
    if (H >= 800) cell = 46;
    if (H >= 1000) cell = 52;
    if (H >= 1300) cell = 60;
    if (H >= 2000) cell = 72;
    var w = Math.min(W - 16, Math.max(380, 7 * cell + 36));
    var h = Math.max(480, H - 48);
    if (w > W - 8) w = W - 8;
    if (h > H - 8) h = H - 8;
    if (w < 280) w = Math.min(280, W - 8);
    if (h < 320) h = Math.min(320, H - 8);
    return { w: Math.round(w), h: Math.round(h), fit: fitBand(H), left: s.left, top: s.top, sw: W, sh: H };
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
    var map = loadSizeMap();
    var o = map[screenKey(win)];
    if (o && Number(o.w) >= 200 && Number(o.h) >= 160) {
      if (Number(o.h) < best.h * 0.55 || Number(o.w) > best.w * 1.65) return best;
      return fitToScreen({ w: Number(o.w), h: Number(o.h) }, win);
    }
    return best;
  }
  function fitToScreen(sz, win) {
    var s = screenBox(win);
    var outW = sz.w;
    var outH = sz.h;
    if (outW > s.w - 8) outW = s.w - 8;
    if (outH > s.h - 8) outH = s.h - 8;
    if (outW < 200) outW = Math.min(200, s.w - 8);
    if (outH < 160) outH = Math.min(160, s.h - 8);
    return { w: Math.round(outW), h: Math.round(outH) };
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
  function dockRight(sz, win) {
    var s = screenBox(win);
    return {
      left: Math.max(s.left, s.left + s.w - sz.w - 12),
      top: Math.max(s.top, s.top + Math.round((s.h - sz.h) * 0.08))
    };
  }
  function rememberWinSize(win) {
    if (!win) return;
    try { if (win.__wxqHudListen) return; win.__wxqHudListen = 1; } catch (e0) {}
    var t = 0;
    win.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        try { saveSize(win.innerWidth, win.innerHeight, win); } catch (e) {}
      }, 200);
    });
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
      var items = hero.eqs.map(function (n) {
        var craft = craftOf(n);
        return '<div class="heq-i" data-hud-kind="equip" data-hud-name="' + esc(n) + '">'
          + '<img src="' + equipImg(n) + '" alt="' + esc(n) + '">'
          + '<span>' + esc(n)
          + (craft ? '<em>' + esc(craft) + '</em>' : '')
          + '</span></div>';
      }).join('');
      return '<div class="heq-row">'
        + '<img class="heq-h" src="' + heroImg(hero.name) + '" alt="' + esc(hero.name) + '" data-hud-kind="hero" data-hud-name="' + esc(hero.name) + '">'
        + '<div><div class="heq-n" data-hud-kind="hero" data-hud-name="' + esc(hero.name) + '">' + esc(hero.name)
        + (function () {
          var c = heroByName(hero.name);
          return c && c.quality ? '<i class="hq-inline">' + c.quality + '</i>' : '';
        }())
        + '</div>' + items + '</div></div>';
    }).join('');
    if (L.equipDesc) h += '<p class="heq-d">' + esc(L.equipDesc) + '</p>';
    return h;
  }

  function isMobile() {
    try {
      if (global.matchMedia && global.matchMedia('(pointer:coarse)').matches) return true;
      return Math.min(screen.width || 0, screen.height || 0) <= 480 || (navigator.userAgent || '').indexOf('Mobile') >= 0;
    } catch (e) { return false; }
  }

  function opsBlock(L) {
    var ops = L.ops || [];
    var parts = [];
    var briefShown = false;
    ops.forEach(function (o, i) {
      if (!o) return;
      var who = (o.main || []).concat(o.sub || []);
      if (!o.desc && !who.length) {
        if (L.brief && !briefShown) {
          briefShown = true;
          var blab = PHASE[i] || ('阶段' + (i + 1));
          var bround = '';
          if (o.from && o.to && !(Number(o.from) === 0 && Number(o.to) === 0)) {
            bround = o.from === o.to ? o.from + ' 回合' : o.from + '–' + o.to + ' 回合';
          }
          parts.push('<div class="hph">'
            + '<div class="hph-h">' + esc(blab) + (bround ? '<i>' + esc(bround) + '</i>' : '') + '</div>'
            + '<p>' + esc(L.brief) + '</p>'
            + '</div>');
        }
        return;
      }
      var lab = PHASE[i] || ('阶段' + (i + 1));
      var round = '';
      if (o.from && o.to && !(Number(o.from) === 0 && Number(o.to) === 0)) {
        round = o.from === o.to ? o.from + ' 回合' : o.from + '–' + o.to + ' 回合';
      }
      var faces = who.length
        ? '<div class="hwho">' + who.map(function (n) {
          return '<span data-hud-kind="hero" data-hud-name="' + esc(n) + '">' + esc(n) + '</span>';
        }).join('') + '</div>'
        : '';
      parts.push('<div class="hph">'
        + '<div class="hph-h">' + esc(lab) + (round ? '<i>' + esc(round) + '</i>' : '') + '</div>'
        + faces
        + (o.desc ? '<p>' + esc(o.desc) + '</p>' : '')
        + '</div>');
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
    return '<div class="hud" data-hud-cur="' + esc(L.key) + '" data-hud-db="' + (tipsOn() ? '1' : '0') + '" data-hud-mobile="' + (isMobile() ? '1' : '0') + '" data-hud-fit="' + fitBand(screenBox().h) + '">'
      + '<div class="hbar" data-hud-drag="1">'
      + '<strong>对局浮窗</strong>'
      + '<span class="hsp"></span>'
      + '<button type="button" class="hbtn pri home" data-hud-home="1">回到助手</button>'
      + '<button type="button" class="hbtn" data-hud-fitreset="1">适配屏幕</button>'
      + '<button type="button" class="hbtn' + (tipsOn() ? ' on' : '') + '" data-hud-tips="1">' + (tipsOn() ? '图鉴开' : '图鉴关') + '</button>'
      + (isHudWin() ? '<button type="button" class="hbtn" data-hud-front="1" title="把当前小窗切到最前">贴在最前</button>' : '')
      + '<button type="button" class="hbtn" data-hud-close="1">关闭</button>'
      + '</div>'
      + switcherHtml(L.key)
      + '<div class="hbody">'
      + '<div class="hside"><div class="hname">' + esc(L.name)
      + (lords ? '<em>' + esc(lords) + '</em>' : '') + '</div>'
      + boardHtml(L) + '</div>'
      + '<div class="htips">' + sec('装备', eq) + sec('前 / 中 / 后期', op) + sec('出牌', play)
      + (!eq && !op && !play ? '<p class="hmuted">这套原文没写装备和运营，只看站位。</p>' : '')
      + '</div></div>'
      + '<div class="hacts">'
      + (L.nocode ? '<span class="hmuted">无导入阵容码</span>'
        : '<button type="button" class="hbtn pri" data-hud-copy="' + esc(L.key) + '">复制阵容码</button>')
      + '</div>'
      + '<p class="hnote">关掉原来的助手页，这个小窗还在。点「回到助手」打开完整页面，小窗可以继续留着。</p>'
      + '</div>';
  }

  function hudCss() {
    return 'html,body{margin:0;padding:0;background:#17141F;color:#F3F1F6;font-family:"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;}'
      + 'html,body,.hud{height:100%;}'
      + '.hud{display:flex;flex-direction:column;gap:8px;padding:8px 10px 10px;min-height:100%;box-sizing:border-box;container-type:inline-size;}'
      + '.hbody{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:auto;}'
      + '.hside{flex:none;}'
      + '.hbar{display:flex;align-items:center;gap:6px;cursor:move;user-select:none;}'
      + '.hbar strong{font-size:13px;letter-spacing:.04em;}'
      + '.hsp{flex:1;}'
      + '.hbtn{border:1px solid #4A4456;background:#2A2633;color:#F3F1F6;border-radius:8px;padding:5px 9px;font-size:12px;font-family:inherit;cursor:pointer;}'
      + '.hbtn.pri{background:#B4230E;border-color:transparent;}'
      + '.hbtn.pri.home{font-size:14px;font-weight:700;padding:7px 14px;}'
      + 'body[data-hud-front] .hud{outline:2px solid #B4230E;outline-offset:-2px;}'
      + '.hsw{display:flex;flex-wrap:wrap;gap:5px;}'
      + '.hsw-b{border:1px solid #4A4456;background:#2A2633;color:#C8C2D2;border-radius:999px;padding:4px 9px;font-size:11.5px;font-family:inherit;cursor:pointer;}'
      + '.hsw-b.on{background:#F3F1F6;color:#17141F;border-color:#F3F1F6;font-weight:600;}'
      + '.hname{font-size:16px;font-weight:700;}'
      + '.hname em{display:block;font-style:normal;font-size:12px;font-weight:400;color:#C8C2D2;margin-top:2px;}'
      + '.hboard{display:flex;flex-direction:column;gap:3px;}'
      + '.hboard-lab{font-size:10px;color:#9A93A6;margin-bottom:2px;}'
      + '.hrow{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}'
      + '.hcell{position:relative;aspect-ratio:1;border-radius:8px;background:#2A2633;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1px;}'
      + '.hcell.filled{background:transparent;}'
      + '.hcell img{width:78%;aspect-ratio:1;object-fit:cover;border-radius:50%;display:block;background:#2A2633;}'
      + '.hcell span{font-size:9px;line-height:1.1;color:#C8C2D2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.hq{position:absolute;top:1px;right:1px;font-size:9px;font-weight:700;font-style:normal;background:#B4230E;color:#fff;border-radius:4px;padding:0 3px;line-height:1.35;}'
      + '.hq-inline{font-style:normal;font-weight:500;font-size:11px;color:#9A93A6;margin-left:6px;}'
      + '.hud[data-hud-db="1"] [data-hud-kind]{cursor:help;}'
      + '#hudTip{position:fixed;z-index:30;display:none;max-width:280px;max-height:70vh;overflow:auto;background:#2A2633;border:1px solid #4A4456;border-radius:10px;padding:8px 10px;font-size:12px;line-height:1.6;pointer-events:auto;box-shadow:0 8px 20px rgba(0,0,0,.45);}'
      + '#hudTip .ht-n{font-weight:700;font-size:13px;}'
      + '#hudTip .ht-s{font-size:11px;color:#9A93A6;margin-top:2px;}'
      + '#hudTip .ht-l{font-size:11px;color:#FF8A73;margin:8px 0 2px;letter-spacing:.04em;}'
      + '#hudTip .ht-d{margin-top:4px;color:#E8E4EE;}'
      + '#hudTip .ht-d b{color:#FF8A73;margin-right:4px;}'
      + '.hcopy{display:none;width:100%;margin-top:6px;font-size:12px;font-family:inherit;padding:6px 8px;border-radius:8px;border:1px solid #4A4456;background:#2A2633;color:#F3F1F6;}'
      + '.hcode{display:none;margin-top:8px;border:1px solid #4A4456;border-radius:10px;padding:8px 10px;background:#2A2633;}'
      + '.hcode-t{font-size:11px;color:#9A93A6;margin-bottom:6px;}'
      + '.hcode input{display:block;width:100%;box-sizing:border-box;font-size:18px;letter-spacing:.02em;font-family:inherit;padding:8px 10px;border-radius:8px;border:1px solid #FF8A73;background:#17141F;color:#F3F1F6;}'
      + '.hcode-n{font-size:11px;color:#9A93A6;margin-top:6px;word-break:break-all;}'
      + '.hbtn.on{background:#F3F1F6;color:#17141F;border-color:#F3F1F6;}'
      + '.hud[data-hud-fit="md"] .hcell span{font-size:10px;}'
      + '.hud[data-hud-fit="md"] .heq-d,.hud[data-hud-fit="md"] .hph p,.hud[data-hud-fit="md"] .hol li,.hud[data-hud-fit="md"] .hul li{font-size:13px;}'
      + '.hud[data-hud-fit="lg"] .hname{font-size:18px;}'
      + '.hud[data-hud-fit="lg"] .hcell span{font-size:11px;}'
      + '.hud[data-hud-fit="lg"] .hsec h4{font-size:13px;}'
      + '.hud[data-hud-fit="lg"] .heq-d,.hud[data-hud-fit="lg"] .hph p,.hud[data-hud-fit="lg"] .hol li,.hud[data-hud-fit="lg"] .hul li{font-size:14px;}'
      + '.hud[data-hud-fit="xl"] .hname{font-size:22px;}'
      + '.hud[data-hud-fit="xl"] .hcell span{font-size:13px;}'
      + '.hud[data-hud-fit="xl"] .hsec h4{font-size:14px;}'
      + '.hud[data-hud-fit="xl"] .heq-d,.hud[data-hud-fit="xl"] .hph p,.hud[data-hud-fit="xl"] .hol li,.hud[data-hud-fit="xl"] .hul li{font-size:15px;}'
      + 'html[data-hud-fit="lg"] #hudTip{max-width:360px;}'
      + 'html[data-hud-fit="xl"] #hudTip{max-width:440px;font-size:14px;}'
      + '.htips{flex:1;min-width:0;overflow:auto;}'
      + '.htips .hsec:first-child{margin-top:0;}'
      + '.hsec{margin:10px 0 0;padding-top:8px;border-top:1px solid #4A4456;}'
      + '.hsec h4{margin:0 0 6px;font-size:12px;color:#FF8A73;letter-spacing:.04em;}'
      + '.heq-row{display:flex;gap:8px;margin:0 0 8px;}'
      + '.heq-h{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#2A2633;flex:none;}'
      + '.heq-n{font-size:13px;font-weight:600;margin-bottom:2px;}'
      + '.heq-i{display:flex;align-items:center;gap:6px;margin:2px 0;font-size:12px;}'
      + '.heq-i img{width:18px;height:18px;border-radius:4px;object-fit:cover;background:#2A2633;flex:none;}'
      + '.heq-i em{display:block;font-style:normal;font-size:11px;color:#9A93A6;}'
      + '.heq-d,.hph p,.hol li,.hul li,.hsec p{margin:0;font-size:12.5px;line-height:1.65;color:#E8E4EE;}'
      + '.heq-d{margin-top:4px;color:#C8C2D2;}'
      + '.hph{margin:0 0 8px;}'
      + '.hph-h{font-size:13px;font-weight:700;}'
      + '.hph-h i{font-style:normal;font-weight:400;color:#9A93A6;margin-left:6px;font-size:11px;}'
      + '.hwho{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;}'
      + '.hwho span{font-size:11px;background:#2A2633;border-radius:999px;padding:1px 7px;color:#C8C2D2;}'
      + '.hol,.hul{margin:0 0 8px;padding-left:1.15em;}'
      + '.hacts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}'
      + '.hmuted{font-size:12px;color:#9A93A6;}'
      + '.hnote{margin:4px 0 0;font-size:11px;line-height:1.55;color:#9A93A6;}';
  }

  function fillDoc(doc, L) {
    var theme = 'dark';
    try { theme = document.documentElement.getAttribute('data-theme') || 'dark'; } catch (e) {}
    doc.open();
    var fit = fitBand(screenBox().h);
    doc.write('<!DOCTYPE html><html data-theme="' + theme + '" data-hud-fit="' + fit + '"><head><meta charset="utf-8">'
      + '<title>对局浮窗 · ' + esc(L.name) + '</title>'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>' + hudCss() + '</style></head><body>' + innerHtml(L) + '</body></html>');
    doc.close();
    bind(doc);
    if (doc.defaultView) rememberWinSize(doc.defaultView);
  }

  function copyFallback(doc, text) {
    try {
      var d = doc || document;
      var win = d.defaultView || global;
      var t = d.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;';
      d.body.appendChild(t);
      t.focus();
      t.select();
      if (t.setSelectionRange) t.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = d.execCommand('copy'); } catch (e1) { ok = false; }
      if (!ok && win.document && win.document.execCommand) {
        try { ok = win.document.execCommand('copy'); } catch (e2) { ok = false; }
      }
      d.body.removeChild(t);
      return ok;
    } catch (e) { return false; }
  }

  function revealCode(doc, btn, text) {
    var box = doc.querySelector('[data-hud-copybox]');
    if (!box) {
      box = doc.createElement('div');
      box.setAttribute('data-hud-copybox', '1');
      box.className = 'hcode';
      if (btn && btn.parentNode) btn.parentNode.parentNode.insertBefore(box, btn.parentNode.nextSibling);
      else if (doc.body) doc.body.appendChild(box);
    }
    box.innerHTML = '<div class="hcode-t">阵容码（点一下全选，再 Ctrl+C）</div>'
      + '<input data-hud-codeinput value="' + esc(text) + '" readonly>'
      + '<div class="hcode-n">' + esc(text.length > 40 ? text.slice(0, 40) + '…' : text) + '</div>';
    box.style.display = 'block';
    var input = box.querySelector('[data-hud-codeinput]');
    if (box.scrollIntoView) {
      try { box.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
    if (input) {
      try {
        input.focus();
        input.select();
        if (input.setSelectionRange) input.setSelectionRange(0, text.length);
      } catch (e) {}
    }
  }

  function copyKey(key, btn, doc) {
    var text = String(key || '');
    var d = doc || document;
    var win = d.defaultView || global;
    function done(ok) {
      if (ok) {
        if (btn) {
          var old = btn.textContent;
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = old; }, 1400);
        }
        return;
      }
      if (btn) btn.textContent = '点框内 Ctrl+C';
      revealCode(d, btn, text);
    }
    var clip = win.navigator && win.navigator.clipboard;
    if (clip && clip.writeText) {
      clip.writeText(text).then(function () { done(true); }, function () { done(copyFallback(d, text)); });
      return;
    }
    done(copyFallback(d, text));
  }

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

  function showTip(doc, el) {
    if (!tipsOn()) return;
    var html = tipHtml(el.getAttribute('data-hud-kind'), el.getAttribute('data-hud-name'));
    if (!html) return;
    var box = doc.getElementById('hudTip');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'hudTip';
      doc.body.appendChild(box);
    }
    box.innerHTML = html;
    box.style.display = 'block';
    var win = doc.defaultView || global;
    var r = el.getBoundingClientRect();
    var w = box.offsetWidth || 200;
    var h = box.offsetHeight || 80;
    var x = r.left;
    var y = r.bottom + 6;
    var vw = win.innerWidth || 360;
    var vh = win.innerHeight || 600;
    if (x + w > vw - 8) x = vw - w - 8;
    if (y + h > vh - 8) y = r.top - h - 6;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    box.style.left = Math.round(x) + 'px';
    box.style.top = Math.round(y) + 'px';
  }

  function hideTip(doc) {
    var box = doc.getElementById('hudTip');
    if (box) box.style.display = 'none';
  }

  function bindMain() {
    if (mainBound) return;
    mainBound = true;
    bind(document);
  }

  function bind(doc) {
    if (!doc || !doc.addEventListener) return;
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var sw = t.closest('[data-hud-key]');
      if (sw) {
        var L = find(sw.getAttribute('data-hud-key'));
        if (!L) return;
        setLast(L.key);
        if (isHudWin()) {
          try { location.hash = 'hud-' + encodeURIComponent(L.key); } catch (e) {}
          enterPage('#hud-' + encodeURIComponent(L.key));
          return;
        }
        paintWherever(L);
        return;
      }
      var fw = t.closest('[data-hud-front]');
      if (fw) { frontWin(); return; }
      var pop = t.closest('[data-hud-pop]');
      if (pop) { openPopup(currentOf(doc)); return; }
      var homeBtn = t.closest('[data-hud-home]');
      if (homeBtn) { goHome(); return; }
      var cl = t.closest('[data-hud-close]');
      if (cl) {
        if (isHudWin()) {
          pingOpenerUnpark();
          try { global.close(); } catch (e) {}
          return;
        }
        closeAll(doc);
        return;
      }
      var fr = t.closest('[data-hud-fitreset]');
      if (fr) { resetFit(); return; }
      var tb = t.closest('[data-hud-tips]');
      if (tb) { setTips(!tipsOn()); return; }
      var code = t.closest('[data-hud-codeinput]');
      if (code) {
        try { code.focus(); code.select(); if (code.setSelectionRange) code.setSelectionRange(0, code.value.length); } catch (e) {}
        return;
      }
      var cp = t.closest('[data-hud-copy]');
      if (cp) { copyKey(cp.getAttribute('data-hud-copy'), cp, doc); }
    });
    doc.addEventListener('mouseover', function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-hud-kind]');
      if (el) showTip(doc, el);
    });
    doc.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      if (to && to.closest && (to.closest('#hudTip') || to.closest('[data-hud-kind]'))) return;
      hideTip(doc);
    });
  }

  function currentOf(doc) {
    var el = doc.querySelector && doc.querySelector('[data-hud-cur]');
    return el ? find(el.getAttribute('data-hud-cur')) : null;
  }

  function paintWherever(L) {
    if (!L) return;
    if (popWin && !popWin.closed) fillDoc(popWin.document, L);
    if (panel && panel.parentNode) panel.innerHTML = innerHtml(L);
  }

  function closeAll(fromDoc) {
    if (popWin && !popWin.closed && (!fromDoc || fromDoc.defaultView === popWin)) {
      try { popWin.close(); } catch (e) {}
      popWin = null;
    }
    if (panel && (!fromDoc || fromDoc === document)) hidePanel();
    if (fromDoc === document && document.body.classList.contains('hud-only')) {
      document.body.classList.remove('hud-only');
      try { location.hash = '#j'; } catch (e3) {}
    }
  }

  function lineupOf(key) {
    key = String(key || '');
    var L = key ? find(key) : null;
    if (L) return L;
    var st = load();
    L = find(st.last) || find(aliveKeys()[0]);
    return L || null;
  }

  function isHudWin() {
    return document.body.classList.contains('hud-only');
  }
  function frontWin() {
    try { global.focus(); } catch (e) {}
    try { if (global.document && global.document.body) global.document.body.setAttribute('data-hud-front', '1'); } catch (e2) {}
    setTimeout(function () {
      try { if (global.document && global.document.body) global.document.body.removeAttribute('data-hud-front'); } catch (e3) {}
    }, 900);
  }
  function hudUrl(L) {
    return location.href.replace(/#.*$/, '') + '#hud-' + encodeURIComponent(L.key);
  }
  function pingOpenerUnpark() {
    try {
      if (global.opener && !global.opener.closed) {
        global.opener.postMessage({ type: 'wxq-unpark' }, '*');
        global.opener.focus();
      }
    } catch (e) {}
  }
  function parkHome() {
    if (document.body.classList.contains('hud-only')) return;
    document.body.classList.add('wxq-parked');
    var el = document.getElementById('wxqParked');
    if (el) return;
    el = document.createElement('div');
    el.id = 'wxqParked';
    el.innerHTML = '<div class="park-box"><p>对局浮窗已打开。关掉本页，小窗还在。</p>'
      + '<button type="button" class="jbtn pri" data-wxq-unpark>回到助手</button></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-wxq-unpark]')) unparkHome();
    });
  }
  function unparkHome() {
    document.body.classList.remove('wxq-parked');
    try { global.focus(); } catch (e) {}
  }
  function goHome() {
    var url = location.href.replace(/#.*$/, '') + '#j';
    pingOpenerUnpark();
    try {
      if (global.opener && !global.opener.closed) {
        try { global.opener.focus(); } catch (e0) {}
        return;
      }
    } catch (e) {}
    var w = Math.max(1100, (screen.availWidth || 1280) - 48);
    var h = Math.max(760, (screen.availHeight || 800) - 80);
    var left = screen.availLeft || 0;
    var top = screen.availTop || 0;
    try {
      var home = global.open(url, 'wxqMain', 'resizable=yes,scrollbars=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
      if (home) {
        try { home.focus(); } catch (e1) {}
        return;
      }
    } catch (e2) {}
    try { location.assign(url); } catch (e3) {}
  }
  function openPopup(L) {
    if (!L) return false;
    if (document.body.classList.contains('hud-only')) return false;
    var sz = loadSize(global);
    var dock = dockRight(sz, global);
    var url = hudUrl(L);
    try {
      if (popWin && !popWin.closed) {
        try { popWin.location.hash = 'hud-' + encodeURIComponent(L.key); } catch (e0) {}
        try { popWin.focus(); } catch (e1) {}
        parkHome();
        hidePanel();
        return true;
      }
      popWin = global.open(url, 'wxqHud', 'popup=yes,resizable=yes,scrollbars=yes,width=' + sz.w + ',height=' + sz.h + ',left=' + dock.left + ',top=' + dock.top);
    } catch (e) { popWin = null; }
    if (!popWin) return false;
    try { popWin.focus(); } catch (e2) {}
    hidePanel();
    parkHome();
    return true;
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'wxqHudPanel';
    document.body.appendChild(panel);
    bindMain();
    enableDrag(panel);
    enablePanelResize(panel);
    return panel;
  }

  function applyPanelBox(el, forceBest) {
    if (isMobile()) {
      el.style.width = 'auto';
      el.style.height = 'auto';
      el.style.left = '8px';
      el.style.right = '8px';
      el.style.top = 'auto';
      el.style.bottom = 'calc(56px + env(safe-area-inset-bottom, 0px))';
      el.style.maxWidth = 'none';
      el.style.maxHeight = '62vh';
      return;
    }
    var sz = forceBest ? bestSize(global) : loadSize(global);
    if (sz.w > window.innerWidth - 8) sz.w = window.innerWidth - 8;
    if (sz.h > window.innerHeight - 8) sz.h = Math.max(320, window.innerHeight - 8);
    el.style.width = sz.w + 'px';
    el.style.height = sz.h + 'px';
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    var pos = null;
    if (!forceBest) {
      try { pos = JSON.parse(localStorage.getItem('wxq-hud-pos') || ''); } catch (e) { pos = null; }
    }
    var x = pos && Number.isFinite(pos.x) ? pos.x : Math.max(8, window.innerWidth - sz.w - 12);
    var y = pos && Number.isFinite(pos.y) ? pos.y : Math.max(8, Math.round((window.innerHeight - sz.h) * 0.08));
    if (x + 80 > window.innerWidth) x = Math.max(8, window.innerWidth - sz.w - 8);
    if (y + 40 > window.innerHeight) y = Math.max(8, window.innerHeight - sz.h - 8);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  function resetFit() {
    clearSize(global);
    var sz = bestSize(global);
    var dock = dockRight(sz, global);
    if (popWin && !popWin.closed) {
      try { popWin.resizeTo(sz.w, sz.h); popWin.moveTo(dock.left, dock.top); } catch (e2) {}
    }
    if (panel && panel.classList.contains('on')) applyPanelBox(panel, true);
  }

  function showPanel(L) {
    var el = ensurePanel();
    el.innerHTML = innerHtml(L);
    el.classList.add('on');
    applyPanelBox(el);
  }

  function enablePanelResize(el) {
    if (el.__wxqHudRO) return;
    el.__wxqHudRO = 1;
    if (typeof ResizeObserver === 'function') {
      var t = 0;
      var ro = new ResizeObserver(function () {
        if (!el.classList.contains('on')) return;
        clearTimeout(t);
        t = setTimeout(function () { saveSize(el.offsetWidth, el.offsetHeight, global); }, 200);
      });
      ro.observe(el);
    }
  }

  function hidePanel() {
    if (panel) panel.classList.remove('on');
  }

  function enableDrag(el) {
    var ox = 0, oy = 0, dragging = false;
    el.addEventListener('pointerdown', function (e) {
      var bar = e.target.closest && e.target.closest('[data-hud-drag]');
      if (!bar || e.target.closest('button')) return;
      var box = el.getBoundingClientRect();
      if (e.clientX > box.right - 22 && e.clientY > box.bottom - 22) return;
      dragging = true;
      ox = e.clientX - el.offsetLeft;
      oy = e.clientY - el.offsetTop;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var x = Math.max(8, Math.min(window.innerWidth - 80, e.clientX - ox));
      var y = Math.max(8, Math.min(window.innerHeight - 40, e.clientY - oy));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try {
        localStorage.setItem('wxq-hud-pos', JSON.stringify({ x: el.offsetLeft, y: el.offsetTop }));
        cloudTouch();
      } catch (err) {}
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
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
    if (openPopup(L)) return;
    showPanel(L);
  }

  function enterPage(hash) {
    document.body.classList.add('hud-only');
    var key = '';
    if (hash && hash.indexOf('#hud-') === 0) key = decodeURIComponent(hash.slice(5));
    var L = lineupOf(key);
    var grid = document.getElementById('grid');
    if (!grid) return;
    if (!L) {
      grid.innerHTML = '<div class="hud"><p class="hmuted">还没有在用阵容。点「回到助手」给卡片点星标。</p>'
        + '<p><button type="button" class="hbtn pri home" data-hud-home="1">回到助手</button></p></div>';
      return;
    }
    setLast(L.key);
    grid.className = 'jobs-root';
    grid.innerHTML = innerHtml(L);
    bindMain();
  }

  function paintDock() {
    if (document.body.classList.contains('hud-only')) return;
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
