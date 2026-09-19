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
  var pipWin = null;
  var popWin = null;
  var panel = null;
  var mainBound = false;

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function abs(p) {
    try { return new URL(p, location.href).href; } catch (e) { return p; }
  }
  function heroImg(name) { return abs('wxq-icon/heroes/' + encodeURIComponent(name) + '.png'); }
  function equipImg(name) { return abs('wxq-icon/equips/' + encodeURIComponent(name) + '.png'); }

  function equipByName(name) {
    var E = global.WXQ_EQUIPS || [];
    for (var i = 0; i < E.length; i++) if (E[i].name === name) return E[i];
    return null;
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
        cells += '<div class="hcell filled" title="' + esc(h.name) + '">'
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
        return '<div class="heq-i">'
          + '<img src="' + equipImg(n) + '" alt="' + esc(n) + '">'
          + '<span>' + esc(n)
          + (craft ? '<em>' + esc(craft) + '</em>' : '')
          + '</span></div>';
      }).join('');
      return '<div class="heq-row">'
        + '<img class="heq-h" src="' + heroImg(hero.name) + '" alt="' + esc(hero.name) + '">'
        + '<div><div class="heq-n">' + esc(hero.name) + '</div>' + items + '</div></div>';
    }).join('');
    if (L.equipDesc) h += '<p class="heq-d">' + esc(L.equipDesc) + '</p>';
    return h;
  }

  function opsBlock(L) {
    var ops = L.ops || [];
    var parts = [];
    ops.forEach(function (o, i) {
      if (!o) return;
      var who = (o.main || []).concat(o.sub || []);
      if (!o.desc && !who.length) return;
      var lab = PHASE[i] || ('阶段' + (i + 1));
      var round = '';
      if (o.from && o.to && !(Number(o.from) === 0 && Number(o.to) === 0)) {
        round = o.from === o.to ? o.from + ' 回合' : o.from + '–' + o.to + ' 回合';
      }
      var faces = who.length
        ? '<div class="hwho">' + who.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>'
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
    return bits.join('');
  }

  function switcherHtml(cur) {
    var keys = aliveKeys();
    if (!keys.length) return '';
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
    var body = boardHtml(L) + sec('装备', eq) + sec('前 / 中 / 后期', op) + sec('出牌', play);
    if (!eq && !op && !play) body += '<p class="hmuted">这套原文没写装备和运营，只看站位。</p>';
    return '<div class="hud" data-hud-cur="' + esc(L.key) + '">'
      + '<div class="hbar" data-hud-drag="1">'
      + '<strong>对局浮窗</strong>'
      + '<span class="hsp"></span>'
      + (global.documentPictureInPicture ? '<button type="button" class="hbtn" data-hud-pip="1">贴在最前</button>' : '')
      + '<button type="button" class="hbtn" data-hud-pop="1">弹出小窗</button>'
      + '<button type="button" class="hbtn" data-hud-close="1">关闭</button>'
      + '</div>'
      + switcherHtml(L.key)
      + '<div class="hname">' + esc(L.name)
      + (lords ? '<em>' + esc(lords) + '</em>' : '') + '</div>'
      + '<div class="htips">' + body + '</div>'
      + '<div class="hacts">'
      + (L.nocode ? '<span class="hmuted">无导入阵容码</span>'
        : '<button type="button" class="hbtn pri" data-hud-copy="' + esc(L.key) + '">复制阵容码</button>')
      + '</div>'
      + '<p class="hnote">贴不到游戏画面里。Chrome / Edge 用「贴在最前」；全屏独占时改窗口化。</p>'
      + '</div>';
  }

  function hudCss() {
    return 'html,body{margin:0;padding:0;background:#17141F;color:#F3F1F6;font-family:"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;}'
      + '.hud{display:flex;flex-direction:column;gap:8px;padding:8px 10px 10px;min-height:100vh;box-sizing:border-box;}'
      + '.hbar{display:flex;align-items:center;gap:6px;cursor:move;user-select:none;}'
      + '.hbar strong{font-size:13px;letter-spacing:.04em;}'
      + '.hsp{flex:1;}'
      + '.hbtn{border:1px solid #4A4456;background:#2A2633;color:#F3F1F6;border-radius:8px;padding:5px 9px;font-size:12px;font-family:inherit;cursor:pointer;}'
      + '.hbtn.pri{background:#B4230E;border-color:transparent;}'
      + '.hsw{display:flex;flex-wrap:wrap;gap:5px;}'
      + '.hsw-b{border:1px solid #4A4456;background:#2A2633;color:#C8C2D2;border-radius:999px;padding:4px 9px;font-size:11.5px;font-family:inherit;cursor:pointer;}'
      + '.hsw-b.on{background:#F3F1F6;color:#17141F;border-color:#F3F1F6;font-weight:600;}'
      + '.hname{font-size:16px;font-weight:700;}'
      + '.hname em{display:block;font-style:normal;font-size:12px;font-weight:400;color:#C8C2D2;margin-top:2px;}'
      + '.hboard{display:flex;flex-direction:column;gap:3px;}'
      + '.hboard-lab{font-size:10px;color:#9A93A6;margin-bottom:2px;}'
      + '.hrow{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}'
      + '.hcell{aspect-ratio:1;border-radius:8px;background:#2A2633;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1px;}'
      + '.hcell.filled{background:transparent;}'
      + '.hcell img{width:78%;aspect-ratio:1;object-fit:cover;border-radius:50%;display:block;background:#2A2633;}'
      + '.hcell span{font-size:9px;line-height:1.1;color:#C8C2D2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.htips{flex:1;overflow:auto;}'
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
      + '.hacts{display:flex;gap:8px;margin-top:8px;}'
      + '.hmuted{font-size:12px;color:#9A93A6;}'
      + '.hnote{margin:4px 0 0;font-size:11px;line-height:1.55;color:#9A93A6;}';
  }

  function fillDoc(doc, L) {
    var theme = 'dark';
    try { theme = document.documentElement.getAttribute('data-theme') || 'dark'; } catch (e) {}
    doc.open();
    doc.write('<!DOCTYPE html><html data-theme="' + theme + '"><head><meta charset="utf-8">'
      + '<title>对局浮窗 · ' + esc(L.name) + '</title>'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>' + hudCss() + '</style></head><body>' + innerHtml(L) + '</body></html>');
    doc.close();
    bind(doc);
  }

  function copyKey(key, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? '已复制' : '复制失败';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(key)).then(function () { done(true); }, function () { done(false); });
    } else done(false);
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
        paintWherever(L);
        return;
      }
      var pip = t.closest('[data-hud-pip]');
      if (pip) { openPip(currentOf(doc)); return; }
      var pop = t.closest('[data-hud-pop]');
      if (pop) { openPopup(currentOf(doc)); return; }
      var cl = t.closest('[data-hud-close]');
      if (cl) { closeAll(doc); return; }
      var cp = t.closest('[data-hud-copy]');
      if (cp) { copyKey(cp.getAttribute('data-hud-copy'), cp); }
    });
  }

  function currentOf(doc) {
    var el = doc.querySelector && doc.querySelector('[data-hud-cur]');
    return el ? find(el.getAttribute('data-hud-cur')) : null;
  }

  function paintWherever(L) {
    if (!L) return;
    if (pipWin && !pipWin.closed) fillDoc(pipWin.document, L);
    if (popWin && !popWin.closed) fillDoc(popWin.document, L);
    if (panel && panel.parentNode) panel.innerHTML = innerHtml(L);
  }

  function closeAll(fromDoc) {
    if (pipWin && !pipWin.closed && (!fromDoc || fromDoc.defaultView === pipWin)) {
      try { pipWin.close(); } catch (e) {}
      pipWin = null;
    }
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

  function openPip(L) {
    if (!L) return Promise.resolve(false);
    if (!global.documentPictureInPicture) return Promise.resolve(false);
    if (pipWin && !pipWin.closed) {
      fillDoc(pipWin.document, L);
      try { pipWin.focus(); } catch (e) {}
      return Promise.resolve(true);
    }
    return global.documentPictureInPicture.requestWindow({ width: 420, height: 720 }).then(function (w) {
      pipWin = w;
      fillDoc(w.document, L);
      w.addEventListener('pagehide', function () { if (pipWin === w) pipWin = null; });
      hidePanel();
      if (popWin && !popWin.closed) {
        try { popWin.close(); } catch (e2) {}
        popWin = null;
      }
      return true;
    }).catch(function () { return false; });
  }

  function openPopup(L) {
    if (!L) return false;
    try {
      popWin = global.open('', 'wxqHud', 'popup=yes,width=440,height=760,resizable=yes,scrollbars=yes');
    } catch (e) { popWin = null; }
    if (!popWin) return false;
    fillDoc(popWin.document, L);
    try { popWin.focus(); } catch (e) {}
    hidePanel();
    return true;
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'wxqHudPanel';
    document.body.appendChild(panel);
    bindMain();
    enableDrag(panel);
    return panel;
  }

  function showPanel(L) {
    var el = ensurePanel();
    el.innerHTML = innerHtml(L);
    el.classList.add('on');
    var pos;
    try { pos = JSON.parse(localStorage.getItem('wxq-hud-pos') || ''); } catch (e) { pos = null; }
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
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
    openPip(L).then(function (ok) {
      if (ok) return;
      if (openPopup(L)) return;
      showPanel(L);
    });
  }

  function enterPage(hash) {
    document.body.classList.add('hud-only');
    var key = '';
    if (hash && hash.indexOf('#hud-') === 0) key = decodeURIComponent(hash.slice(5));
    var L = lineupOf(key);
    var grid = document.getElementById('grid');
    if (!grid) return;
    if (!L) {
      grid.innerHTML = '<div class="hud"><p class="hmuted">还没有在用阵容。回图鉴给卡片点星标。</p></div>';
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
    html: function (key) {
      var L = lineupOf(key);
      return L ? innerHtml(L) : '';
    },
    count: function () { return aliveKeys().length; }
  };
})(window);
