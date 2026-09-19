#!/usr/bin/env node
/**
 * 万象棋大数据（datawxq.com / api.datatft.com）近 7 日阵容统计
 * -------------------------------------------------------
 * 拉 /wzwxq/lineups/search + /detail。
 * 能对上官方阵容库的：只叠前三率/登顶率，不另开一张。
 * 对不上的：写成无导入码的数据阵容（nocode）。
 * 专名必须在官方池里；不编运营、不编阵容码。
 *
 *   node scripts/sync-wxq-stats.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'wanxiangqi-stats.js');
const DATA = path.join(ROOT, 'wanxiangqi-data.js');
const JOBS = path.join(ROOT, 'wanxiangqi-lineups.js');
const API = 'https://api.datatft.com';
const VERSION = 'v260917';
const TIME = 7;
const MIN_COUNT = 400;
const MIN_TOP3 = 0.40;
const PAGE_SIZE = 12;

function getHttps(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: body == null ? 'GET' : 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; wzry-guide wxq stats sync)',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': 'https://www.datawxq.com/',
        'Origin': 'https://www.datawxq.com',
        ...(data ? { 'Content-Length': data.length } : {}),
      },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
    req.end(data);
  });
}

function post(pathname, body) {
  return getHttps(API + pathname, body);
}

function T(s) {
  return String(s == null ? '' : s).replace(/\r/g, '').trim();
}

function pct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 10;
}

function uniq(arr) {
  const o = Object.create(null);
  const out = [];
  (arr || []).forEach((x) => {
    const s = T(x);
    if (!s || o[s]) return;
    o[s] = 1;
    out.push(s);
  });
  return out;
}

function namesOfHeroes(list) {
  return uniq((list || []).map((h) => {
    if (!h) return '';
    if (typeof h === 'string') return h;
    return T(h.name || h.heroName || h.hero_name);
  }));
}

function sig(names) {
  return names.slice().sort().join('|');
}

function inter(a, b) {
  const B = Object.create(null);
  b.forEach((n) => { B[n] = 1; });
  let n = 0;
  a.forEach((x) => { if (B[x]) n++; });
  return n;
}

function jaccard(a, b) {
  const A = Object.create(null);
  a.forEach((n) => { A[n] = 1; });
  let both = 0;
  b.forEach((n) => { if (A[n]) both++; });
  const union = a.length + b.length - both;
  return union ? both / union : 0;
}

function related(cluster, official, carry) {
  const o = inter(cluster, official);
  const jac = jaccard(cluster, official);
  if (sig(cluster) === sig(official)) return true;
  if (carry && official.indexOf(carry) < 0) return false;
  if (jac >= 0.5 && o >= 4) return true;
  if (o >= 6) return true;
  if (Math.max(cluster.length, official.length) <= 4 && o >= 3 && jac >= 0.5) return true;
  return false;
}

function carryOf(cores) {
  return cores[0] || '';
}

function loadWindow(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return ctx.window;
}

function setOf(arr) {
  const o = Object.create(null);
  (arr || []).forEach((x) => { o[x.name] = x; });
  return o;
}

function packPayload(extra) {
  return Object.assign({
    version: VERSION,
    time: TIME,
    operator: 'AND',
    advancedMode: false,
    filters: [],
    exclusions: [],
    page: 1,
    pageSize: PAGE_SIZE,
    minimumCount: 50,
    sortBy: 'top3Rate',
  }, extra || {});
}

async function searchAll() {
  const byKey = Object.create(null);
  let sampleCount = 0;
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const r = await post('/wzwxq/lineups/search', packPayload({ page }));
    if (!r.json || r.json.code !== 1) {
      throw new Error('search p' + page + ' ' + (r.json && r.json.message || r.status));
    }
    const d = r.json.data || {};
    sampleCount = d.sampleCount || sampleCount;
    total = d.total || total;
    const list = d.lineups || [];
    console.log('  search p' + page + '  ' + list.length + '  total=' + total);
    list.forEach((lu) => {
      const k = String(lu.lineupKey || '');
      if (!k) return;
      if (!byKey[k] || (lu.count || 0) > (byKey[k].count || 0)) byKey[k] = lu;
    });
    if (!list.length || page * PAGE_SIZE >= total) break;
  }
  return { sampleCount, total, list: Object.keys(byKey).map((k) => byKey[k]) };
}

async function detailOf(key) {
  const r = await post('/wzwxq/lineups/detail', packPayload({ lineupKey: key }));
  if (!r.json || r.json.code !== 1) {
    console.log('  detail fail', key, r.json && r.json.message);
    return null;
  }
  return r.json.data;
}

function statsOf(lu) {
  return {
    top3Rate: Number(lu.top3Rate) || 0,
    firstRate: Number(lu.firstRate) || 0,
    appearanceRate: Number(lu.appearanceRate) || 0,
    avgPlacement: Number(lu.avgPlacement) || 0,
    count: Number(lu.count) || 0,
    time: TIME,
    version: VERSION,
  };
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function boardHeroes(lu, pools) {
  const board = lu.referenceBoard || (Array.isArray(lu.referenceBoards) && lu.referenceBoards[0]) || null;
  const rec = {};
  (lu.recommendedUnits || []).forEach((u) => {
    rec[T(u.heroName)] = u;
  });
  let units = (board && board.units) || [];
  if (!units.length) {
    units = (lu.heroes || lu.coreHeroes || []).map((h, i) => ({
      hero_name: h.name || h.heroName,
      position_x: i % 7,
      position_z: Math.floor(i / 7),
      is_awakened: false,
      item_names: (rec[h.name || h.heroName] && rec[h.name || h.heroName].itemNames) || [],
    }));
  }
  const seenCell = Object.create(null);
  const out = [];
  units.forEach((u) => {
    const name = T(u.hero_name || u.heroName || u.name);
    if (!name || !pools.heroes[name]) return;
    let x = clamp(u.position_x != null ? u.position_x : u.x, 0, 6);
    let z = clamp(u.position_z != null ? u.position_z : u.z, 0, 3);
    let cell = x + ',' + z;
    if (seenCell[cell]) {
      for (let zz = 0; zz < 4 && seenCell[cell]; zz++) {
        for (let xx = 0; xx < 7 && seenCell[cell]; xx++) {
          x = xx; z = zz; cell = x + ',' + z;
        }
      }
    }
    if (seenCell[cell]) return;
    seenCell[cell] = 1;
    const recU = rec[name];
    let eqs = (u.item_names || u.itemNames || []).map(T).filter(Boolean);
    if (!eqs.length && recU && recU.itemNames) eqs = recU.itemNames.map(T).filter(Boolean);
    eqs = eqs.filter((e) => pools.equips[e]);
    const evo = u.is_awakened != null ? !!u.is_awakened : (recU ? (recU.awakenedRate || 0) >= 0.5 : false);
    out.push({ name, x, z, evo, eqs });
  });
  return out;
}

function talentNames(lu, pools) {
  const byId = Object.create(null);
  Object.keys(pools.talents).forEach((n) => {
    const t = pools.talents[n];
    if (t && t.id != null) byId[String(t.id)] = n;
  });
  const rows = (lu.talents || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  const names = [];
  rows.forEach((t) => {
    const n = byId[String(t.id)] || T(t.name);
    if (n && pools.talents[n] && names.indexOf(n) < 0) names.push(n);
  });
  return names.slice(0, 3);
}

function lordNames(lu, pools) {
  return (lu.commanders || [])
    .slice()
    .sort((a, b) => (b.appearanceRate || 0) - (a.appearanceRate || 0))
    .map((c) => T(c.name))
    .filter((n) => n && pools.players[n])
    .slice(0, 3);
}

function titleOf(lords, cores) {
  const head = lords[0] || '近7日';
  const body = cores.slice(0, 3).join('');
  return body ? head + ' · ' + body : head + '数据阵容';
}

function briefOf(st, cores) {
  return '近7日样本 ' + st.count + ' 场，前三率 ' + pct(st.top3Rate) + '%，登顶率 '
    + pct(st.firstRate) + '%，平均名次 ' + (Math.round(st.avgPlacement * 100) / 100)
    + '。数据来自万象棋大数据 datawxq.com，按英雄组合聚类，不是官方投稿，没有可导入阵容码。核心：'
    + cores.join('、') + '。';
}

function equipDescOf(lu, pools) {
  const bits = [];
  (lu.recommendedUnits || []).forEach((u) => {
    const name = T(u.heroName);
    const eqs = (u.itemNames || []).map(T).filter((e) => pools.equips[e]);
    if (!name || !pools.heroes[name] || !eqs.length) return;
    if (u.recommendationType === 'none') return;
    bits.push(name + '：' + eqs.join('、'));
  });
  return bits.slice(0, 6).join('。');
}

(async () => {
  console.log('== datawxq 近7日阵容 ==');
  const wData = loadWindow(DATA);
  const wJobs = loadWindow(JOBS);
  const pools = {
    heroes: setOf(wData.WXQ_HEROES),
    players: setOf(wData.WXQ_PLAYERS),
    equips: setOf(wData.WXQ_EQUIPS),
    talents: setOf(wData.WXQ_TALENTS),
  };
  const official = (wJobs.WXQ_JOBS && wJobs.WXQ_JOBS.list) || [];
  official.forEach((L) => { L._names = namesOfHeroes(L.heroes); });

  const searched = await searchAll();
  console.log('unique clusters', searched.list.length, 'sample', searched.sampleCount);

  const overlay = [];
  const unique = [];
  const skipped = [];

  for (let i = 0; i < searched.list.length; i++) {
    const raw = searched.list[i];
    const det = await detailOf(raw.lineupKey) || raw;
    const cores = namesOfHeroes(det.coreHeroes && det.coreHeroes.length ? det.coreHeroes : det.heroes);
    const board = boardHeroes(det, pools);
    const boardNames = namesOfHeroes(board);
    const names = boardNames.length ? boardNames : cores.filter((n) => pools.heroes[n]);
    const unknown = cores.filter((n) => !pools.heroes[n]);
    const st = statsOf(det);
    const carry = carryOf(cores.length ? cores : names);
    const hits = official.filter((L) => related(names, L._names, carry) || related(cores, L._names, carry));

    if (unknown.length) {
      skipped.push({ key: raw.lineupKey, reason: 'unknown ' + unknown.join(','), names });
      continue;
    }
    if (!names.length) {
      skipped.push({ key: raw.lineupKey, reason: 'no-heroes' });
      continue;
    }

    if (hits.length) {
      hits.forEach((L) => {
        overlay.push({
          officialKey: String(L.key),
          officialName: L.name,
          lineupKey: String(det.lineupKey || raw.lineupKey),
          stats: st,
          overlap: inter(names, L._names),
        });
      });
      console.log('  overlay', cores.join('+'), '→', hits.map((h) => h.name).join(' / '),
        'top3=' + pct(st.top3Rate) + '% n=' + st.count);
      continue;
    }

    if (st.count < MIN_COUNT || st.top3Rate < MIN_TOP3) {
      skipped.push({
        key: raw.lineupKey,
        reason: 'weak n=' + st.count + ' top3=' + pct(st.top3Rate),
        names,
      });
      continue;
    }

    const lords = lordNames(det, pools);
    const talents = talentNames(det, pools);
    const job = {
      key: 'd7-' + String(det.lineupKey || raw.lineupKey),
      name: titleOf(lords, cores),
      tags: ['7日数据'],
      author: '万象棋大数据',
      badge: '',
      useNum: st.count,
      score: String(pct(st.top3Rate)),
      scoreNum: st.count,
      likeNum: 0,
      commentNum: 0,
      brief: briefOf(st, cores),
      positionDesc: '棋盘取近7日一条登顶对局的参考站位（datawxq.com），不是官方投稿站位。',
      equipDesc: equipDescOf(det, pools) || '见下方推荐装备。',
      talentDesc: '',
      effectDesc: '',
      lords: lords,
      recLords: [],
      heroes: board,
      talents: talents,
      effects: [],
      ops: [],
      ts: Date.now(),
      hot: false,
      beg: false,
      nocode: true,
      source: 'datawxq',
      stats7d: st,
    };
    unique.push(job);
    console.log('  unique', job.name, 'top3=' + pct(st.top3Rate) + '% n=' + st.count, cores.join('+'));
  }

  unique.sort((a, b) => (b.stats7d.top3Rate - a.stats7d.top3Rate) || (b.stats7d.count - a.stats7d.count));

  const bestOv = Object.create(null);
  overlay.forEach((row) => {
    const k = row.officialKey;
    const prev = bestOv[k];
    if (!prev || row.overlap > prev.overlap || (row.overlap === prev.overlap && row.stats.count > prev.stats.count)) {
      bestOv[k] = row;
    }
  });
  const overlayBest = Object.keys(bestOv).map((k) => bestOv[k]);

  const capturedAt = new Date().toISOString().slice(0, 10);
  const meta = {
    version: '1.0.0',
    capturedAt,
    source: '万象棋大数据 datawxq.com（api.datatft.com /wzwxq/lineups，近7日 time=7，版本 ' + VERSION + '）',
    note: '前三率/登顶率是第三方对局聚类，不是官方胜率，也不是可导入阵容码。能对上官方库的只叠统计，不对上的才单独成卡。讲解仍只走卡面四类，不编运营。',
    sampleCount: searched.sampleCount,
    clusters: searched.list.length,
    overlay: overlayBest.length,
    overlayRaw: overlay.length,
    unique: unique.length,
    skipped: skipped.length,
    minCount: MIN_COUNT,
    minTop3: MIN_TOP3,
  };
  const payload = { meta, overlay: overlayBest, list: unique };
  const body = '/* 王者万象棋 · 近7日数据阵容（自动生成，勿手工编辑） */\n'
    + '/* 同步：node scripts/sync-wxq-stats.js */\n'
    + 'window.WXQ_STATS = ' + JSON.stringify(payload) + ';\n';
  fs.writeFileSync(OUT, body);
  console.log('wrote', OUT);
  console.log('overlay', overlayBest.length, '(raw', overlay.length + ')', 'unique', unique.length, 'skipped', skipped.length);
  skipped.forEach((s) => console.log('  skip', s.reason, (s.names || []).join('+')));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
