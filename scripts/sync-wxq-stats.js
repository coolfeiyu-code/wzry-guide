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

// 禁用所有系统代理（agent 环境会注入 ICUBE_PROXY_HOST 等，劫持 HTTPS 请求）
['http_proxy','https_proxy','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','all_proxy','ICUBE_PROXY_HOST'].forEach(k => { delete process.env[k]; });
process.env.NO_PROXY = '*'; process.env.no_proxy = '*';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'wanxiangqi-stats.js');
const DATA = path.join(ROOT, 'wanxiangqi-data.js');
const JOBS = path.join(ROOT, 'wanxiangqi-lineups.js');
const API = 'https://api.datatft.com';
// datawxq 的接口现在不带 version 才能拿到当前数据：传旧版本号（如 v260917）会返回
// code 42000「该版本数据暂无」。所以默认不传版本，让服务端用最新一期；
// 想锁定某期仍可用环境变量 WXQ_STATS_VERSION 覆盖。
const VERSION = process.env.WXQ_STATS_VERSION || '';
const TIME = 7;
const MIN_COUNT = 80;
const MIN_TOP3 = 0.40;
const PAGE_SIZE = 12;
const EXTRA_HEROES = ['大司命', '项羽', '蒙恬', '米莱狄', '雅典娜', '刘邦', '韩信', '姬小满', '墨子', '百里玄策', '莱西奥', '杨玉环', '诸葛亮', '司空震'];

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

// coreHeroes 只带 {id}，名字要靠同一条记录的 heroes[] 兜底
function idToName(list) {
  const m = Object.create(null);
  (list || []).forEach((h) => {
    if (!h) return;
    const n = typeof h === 'string' ? h : T(h.name || h.heroName || h.hero_name);
    const id = typeof h === 'object' ? String(h.id || '') : '';
    if (n && id) m[id] = n;
  });
  return m;
}

function namesOfHeroes(list, idMap) {
  return uniq((list || []).map((h) => {
    if (!h) return '';
    if (typeof h === 'string') return h;
    const n = T(h.name || h.heroName || h.hero_name);
    if (n) return n;
    if (idMap) return idMap[String(h.id || '')] || '';
    return '';
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
  var p = {
    time: TIME,
    operator: 'AND',
    advancedMode: false,
    filters: [],
    exclusions: [],
    page: 1,
    pageSize: PAGE_SIZE,
    minimumCount: 50,
    sortBy: 'top3Rate',
  };
  if (VERSION) p.version = VERSION;   // 留空表示用服务端最新一期
  return Object.assign(p, extra || {});
}

async function searchQuery(label, extra) {
  const byKey = Object.create(null);
  let sampleCount = 0;
  let reported = 0;
  for (let page = 1; page <= 4; page++) {
    const r = await post('/wzwxq/lineups/search', packPayload(Object.assign({
      page,
      minimumCount: 20,
      sortBy: 'top3Rate',
    }, extra || {})));
    if (!r.json || r.json.code !== 1) {
      console.log('  skip', label, 'p' + page, r.json && r.json.message || r.status);
      break;
    }
    const d = r.json.data || {};
    sampleCount = d.sampleCount || sampleCount;
    reported = d.total || reported;
    const list = d.lineups || [];
    list.forEach((lu) => {
      const k = String(lu.lineupKey || '');
      if (!k) return;
      if (!byKey[k] || (lu.count || 0) > (byKey[k].count || 0)) byKey[k] = lu;
    });
    if (!list.length || page * PAGE_SIZE >= reported) break;
  }
  const n = Object.keys(byKey).length;
  if (n) console.log('  ' + label + '  ' + n + '  total=' + reported + '  sample=' + sampleCount);
  return { sampleCount, list: Object.keys(byKey).map((k) => byKey[k]) };
}

async function searchAll(pools, players) {
  const byKey = Object.create(null);
  let sampleCount = 0;
  function ingest(pack) {
    if (pack.sampleCount > sampleCount) sampleCount = pack.sampleCount;
    (pack.list || []).forEach((lu) => {
      const k = String(lu.lineupKey || '');
      if (!k) return;
      if (!byKey[k] || (lu.count || 0) > (byKey[k].count || 0)) byKey[k] = lu;
    });
  }
  ingest(await searchQuery('全服', { filters: [], minimumCount: 50 }));
  ingest(await searchQuery('全服-登场', { filters: [], minimumCount: 50, sortBy: 'appearanceRate' }));
  for (let i = 0; i < (players || []).length; i++) {
    const p = players[i];
    ingest(await searchQuery('棋手 ' + p.name, {
      filters: [{ type: 'commander', id: String(p.id), switchVal: true }],
    }));
  }
  for (let i = 0; i < EXTRA_HEROES.length; i++) {
    const name = EXTRA_HEROES[i];
    const h = pools.heroes[name];
    if (!h) continue;
    ingest(await searchQuery('英雄 ' + name, {
      filters: [{ type: 'hero', id: String(h.id), switchVal: true }],
    }));
  }
  return { sampleCount, total: Object.keys(byKey).length, list: Object.keys(byKey).map((k) => byKey[k]) };
}

async function detailOf(key, filters) {
  const r = await post('/wzwxq/lineups/detail', packPayload({
    lineupKey: key,
    minimumCount: 1,
    filters: filters || [],
  }));
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
  const board = lu.referenceBoard || (Array.isArray(lu.referenceBoards) && lu.referenceBoards[0]) || null;  const rec = {};
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

function r2(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

// 棋手榜：详情里每个棋手都带自己的场次/前三/登顶，挑实际在用的前几个。
function lordStatsOf(lu, pools) {
  return (lu.commanders || [])
    .filter((c) => pools.players[T(c.name)])
    .slice()
    .sort((a, b) => (b.appearanceRate || 0) - (a.appearanceRate || 0))
    .slice(0, 4)
    .map((c) => ({
      name: T(c.name),
      app: r2(c.appearanceRate),
      count: Number(c.count) || 0,
      top3: r2(c.top3Rate),
      first: r2(c.firstRate),
      avg: r2(c.avgPlacement),
    }));
}

// 天赋按出现场次取前几个，带上该天赋的胜率（接口返回 160 条，全塞没必要）。
function talentStatsOf(lu, pools) {
  const byId = Object.create(null);
  Object.keys(pools.talents).forEach((n) => {
    const t = pools.talents[n];
    if (t && t.id != null) byId[String(t.id)] = n;
  });
  return (lu.talents || [])
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .map((t) => ({ name: byId[String(t.id)] || '', t: t }))
    .filter((x) => x.name && pools.talents[x.name])
    .slice(0, 6)
    .map((x) => ({
      name: x.name,
      app: r2(x.t.appearanceRate),
      count: Number(x.t.count) || 0,
      top3: r2(x.t.top3Rate),
      first: r2(x.t.firstRate),
    }));
}

// 每个英雄最常赢的装备组合：接口按 heroEquipment[].builds 给，取场次够的组合。
function buildStatsOf(lu, pools) {
  const heroName = Object.create(null);
  (lu.heroes || []).concat(lu.coreHeroes || []).forEach((h) => {
    if (h && h.id != null && h.name) heroName[String(h.id)] = T(h.name);
  });
  const board = lu.referenceBoard || (Array.isArray(lu.referenceBoards) && lu.referenceBoards[0]) || null;
  ((board && board.units) || []).forEach((u) => {
    if (u && u.hero_id != null && u.hero_name) heroName[String(u.hero_id)] = T(u.hero_name);
  });
  const out = [];
  (lu.heroEquipment || []).forEach((h) => {
    const name = heroName[String(h.heroId)];
    if (!name || !pools.heroes[name]) return;
    const builds = (h.builds || [])
      .map((b) => ({
        items: (b.itemNames || []).map(T).filter((e) => pools.equips[e]),
        count: Number(b.count) || 0,
        top3: r2(b.top3Rate),
        first: r2(b.firstRate),
      }))
      .filter((b) => b.items.length === 3 && b.count >= 5)
      .sort((a, b) => (b.top3 - a.top3) || (b.count - a.count))
      .slice(0, 2);
    if (!builds.length) return;
    out.push({
      name: name,
      level: Math.round(Number(h.avgLevel) || 0),
      mvp: r2(h.mvpRate),
      awaken: r2(h.awakenedRate),
      builds: builds,
    });
  });
  return out.sort((a, b) => (b.builds[0].top3 - a.builds[0].top3)).slice(0, 7);
}

// 多留几套参考站位（接口给 5 条），浮窗/详情可以换着看。
function boardsOf(lu, pools) {
  const list = Array.isArray(lu.referenceBoards) && lu.referenceBoards.length
    ? lu.referenceBoards
    : (lu.referenceBoard ? [lu.referenceBoard] : []);
  const out = [];
  list.forEach((b) => {
    const heroes = boardHeroes({ referenceBoard: b }, pools);
    if (heroes.length < 4) return;
    out.push({ placement: Number(b.placement) || 0, heroes: heroes });
  });
  return out.slice(0, 3);
}

function isShangui(cores) {
  return cores.indexOf('大司命') >= 0
    && (cores.indexOf('米莱狄') >= 0 || cores.indexOf('蒙恬') >= 0 || cores.indexOf('项羽') >= 0)
    && cores.indexOf('虞姬') < 0
    && cores.indexOf('敖隐') < 0;
}

function titleOf(lords, cores) {
  const head = lords[0] || '近7日';
  if (isShangui(cores)) return head + ' · 山鬼流';
  const body = cores.slice(0, 3).join('');
  return body ? head + ' · ' + body : head + '数据阵容';
}

function briefOf(st, cores) {
  let extra = '';
  if (isShangui(cores)) {
    extra = '卡面是大司命的往生图腾（对局里常叫山鬼）：牺牲给图腾升级，米莱狄/蒙恬提供召唤，项羽牺牲再给图腾加等级。';
  }
  return '近7日样本 ' + st.count + ' 场，前三率 ' + pct(st.top3Rate) + '%，登顶率 '
    + pct(st.firstRate) + '%，平均名次 ' + (Math.round(st.avgPlacement * 100) / 100)
    + '。数据来自万象棋大数据 datawxq.com，按英雄组合聚类，不是官方投稿，没有可导入阵容码。'
    + extra + '核心：' + cores.join('、') + '。';
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

  const searched = await searchAll(pools, wData.WXQ_PLAYERS || []);
  console.log('merged clusters', searched.list.length, 'sample', searched.sampleCount);

  const overlay = [];
  const unique = [];
  const skipped = [];
  const uniqueRaw = [];

  for (let i = 0; i < searched.list.length; i++) {
    const raw = searched.list[i];
    const idMap = idToName(raw.heroes);
    const srcHeroes = raw.coreHeroes && raw.coreHeroes.length ? raw.coreHeroes : raw.heroes;
    const cores = namesOfHeroes(srcHeroes, idMap).filter((n) => pools.heroes[n]);
    const unknown = namesOfHeroes(srcHeroes, idMap).filter((n) => n && !pools.heroes[n]);
    const st = statsOf(raw);
    const carry = carryOf(cores);
    const hits = official.filter((L) => related(cores, L._names, carry));

    if (unknown.length) {
      skipped.push({ key: raw.lineupKey, reason: 'unknown ' + unknown.join(','), names: cores });
      continue;
    }
    if (!cores.length) {
      skipped.push({ key: raw.lineupKey, reason: 'no-heroes' });
      continue;
    }
    if (hits.length) {
      // 命中官方套时要额外拉一次 detail：棋手适配数据（各棋手的登场/前三/登顶）
      // 只在 detail 里，search 的 commanders 只有登场率。这份数据决定详情页
      // 能不能写「谁最适配这套」，所以宁可多一次请求。
      const detO = await detailOf(raw.lineupKey, []);
      const detailLords = detO ? lordStatsOf(detO, pools) : [];
      const detailTalents = detO ? talentStatsOf(detO, pools) : [];
      hits.forEach((L) => {
        overlay.push({
          officialKey: String(L.key),
          officialName: L.name,
          lineupKey: String(raw.lineupKey),
          stats: st,
          overlap: inter(cores, L._names),
          lords: detailLords,
          talents: detailTalents,
        });
      });
      continue;
    }
    if (st.count < MIN_COUNT || st.top3Rate < MIN_TOP3) {
      skipped.push({
        key: raw.lineupKey,
        reason: 'weak n=' + st.count + ' top3=' + pct(st.top3Rate),
        names: cores,
      });
      continue;
    }
    uniqueRaw.push(raw);
  }
  console.log('overlay raw', overlay.length, 'unique candidates', uniqueRaw.length, 'skipped', skipped.length);

  for (let i = 0; i < uniqueRaw.length; i++) {
    const raw = uniqueRaw[i];
    const topCmd = (raw.commanders || []).slice().sort((a, b) => (b.appearanceRate || 0) - (a.appearanceRate || 0))[0];
    const cmdName = topCmd && T(topCmd.name);
    const cmd = cmdName && pools.players[cmdName];
    const detFilters = cmd ? [{ type: 'commander', id: String(cmd.id), switchVal: true }] : [];
    const det = await detailOf(raw.lineupKey, detFilters) || raw;
    const detIdMap = idToName(det.heroes);
    const cores = namesOfHeroes(det.coreHeroes && det.coreHeroes.length ? det.coreHeroes : det.heroes, detIdMap)
      .filter((n) => pools.heroes[n]);
    const board = boardHeroes(det, pools);
    const boardNames = namesOfHeroes(board);
    const names = boardNames.length ? boardNames : cores;
    const st = statsOf(det.count ? det : raw);
    if (st.count < MIN_COUNT || st.top3Rate < MIN_TOP3) {
      skipped.push({ key: raw.lineupKey, reason: 'weak-detail n=' + st.count + ' top3=' + pct(st.top3Rate), names: cores });
      continue;
    }
    const carry2 = carryOf(cores.length ? cores : names);
    const hits2 = official.filter((L) => related(names, L._names, carry2) || related(cores, L._names, carry2));
    if (hits2.length) {
      hits2.forEach((L) => {
        overlay.push({
          officialKey: String(L.key),
          officialName: L.name,
          lineupKey: String(det.lineupKey || raw.lineupKey),
          stats: st,
          overlap: inter(names, L._names),
        });
      });
      continue;
    }
    const lords = lordNames(det, pools);
    const talents = talentNames(det, pools);
    // 接口还带着棋手胜率、天赋胜率、装备组合、多条参考对局，全取出来，
    // 否则 7 日卡只剩一句「样本 N 场」，看着像没内容。
    const d7 = {
      lords: lordStatsOf(det, pools),
      talents: talentStatsOf(det, pools),
      builds: buildStatsOf(det, pools),
      boards: boardsOf(det, pools),
      variants: (det.variants || [])
        .slice()
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 4)
        .map((v) => ({
          add: (v.addedHeroes || []).map((x) => T(x.name)).filter((n) => pools.heroes[n]),
          remove: (v.removedHeroes || []).map((x) => T(x.name)).filter((n) => pools.heroes[n]),
          count: Number(v.count) || 0,
          top3: r2(v.top3Rate),
          // lineupSize 在变体里恒为 0，人数从 lineupKey 的「人数|英雄id…」里取
          size: Number(v.lineupSize) || Number(String(v.lineupKey || '').split('|')[0]) || 0,
        })),
      variantCount: Number(det.variantCount) || 0,
    };
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
      heroes: board.length ? board : [],
      talents: talents,
      effects: [],
      ops: [],
      ts: Date.now(),
      hot: false,
      beg: false,
      nocode: true,
      source: 'datawxq',
      stats7d: st,
      d7: d7,
      _cores: cores,
    };
    if (!job.heroes.length) {
      skipped.push({ key: raw.lineupKey, reason: 'no-board', names: cores });
      continue;
    }
    unique.push(job);
    console.log('  unique', job.name, 'top3=' + pct(st.top3Rate) + '% n=' + st.count, cores.join('+'));
  }

  unique.sort((a, b) => (b.stats7d.count - a.stats7d.count) || (b.stats7d.top3Rate - a.stats7d.top3Rate));
  const kept = [];
  unique.forEach((u) => {
    const names = u._cores || namesOfHeroes(u.heroes);
    const dup = kept.some((k) => related(names, k._cores || namesOfHeroes(k.heroes), names[0]));
    if (dup) {
      skipped.push({ key: u.key, reason: 'near-unique', names });
      return;
    }
    kept.push(u);
  });
  unique.length = 0;
  kept.sort((a, b) => (b.stats7d.top3Rate - a.stats7d.top3Rate) || (b.stats7d.count - a.stats7d.count));
  kept.forEach((u) => {
    delete u._cores;
    unique.push(u);
  });

  const bestOv = Object.create(null);
  overlay.forEach((row) => {
    const k = row.officialKey;
    const prev = bestOv[k];
    if (!prev || row.overlap > prev.overlap || (row.overlap === prev.overlap && row.stats.count > prev.stats.count)) {
      bestOv[k] = row;
    }
  });
  const overlayBest = Object.keys(bestOv).map((k) => bestOv[k]);

  // 给官方套标出「最适配棋手」：用棋手自己的前三率排，样本太小的不算，
  // 否则一个 5 场 100% 的棋手会顶掉真正稳定的选择。登场率≥8% 且场次≥200。
  overlayBest.forEach((row) => {
    const lords = (row.lords || []).filter((c) => c.app >= 0.08 && c.count >= 200 && c.top3 != null);
    row.bestLords = lords.slice().sort((a, b) => (b.top3 || 0) - (a.top3 || 0)).slice(0, 3);
    delete row.lords;
  });

  const capturedAt = new Date().toISOString().slice(0, 10);
  const meta = {
    version: '1.1.0',
    capturedAt,
    dataVersion: VERSION,
    dataTime: TIME,
    source: '万象棋大数据 datawxq.com（api.datatft.com /wzwxq/lineups，近' + TIME + '日 time=' + TIME
      + (VERSION ? '，版本 ' + VERSION : '，服务端最新一期') + '）',
    note: '前三率/登顶率是第三方对局聚类，不是官方胜率，也不是可导入阵容码。全服热门之外还会按棋手/冷门英雄补搜（否则明先生山鬼流这种低登场套进不来）。能对上官方库的只叠统计，不对上的才单独成卡。讲解按卡面，不编运营。',
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
