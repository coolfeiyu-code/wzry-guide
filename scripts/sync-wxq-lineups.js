#!/usr/bin/env node
/**
 * 王者万象棋 · 官方阵容推荐库同步
 * --------------------------------
 * 拉官网 amside 阵容 JSON（推荐 / 热门 / 新手），压成 wanxiangqi-lineups.js。
 * 入库门槛：使用量 >= 2000 且评分 >= 4.0，其余视为噪声丢掉。
 * 英雄 / 棋手 / 装备 / 效果 / 天赋名对照 wanxiangqi-data.js 官方池。
 *
 *   node scripts/sync-wxq-lineups.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'wanxiangqi-lineups.js');
const DATA = path.join(ROOT, 'wanxiangqi-data.js');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; wzry-guide lineup sync)' };
const MIN_USE = 2000;
const MIN_SCORE = 4.0;

const URLS = {
  rec: (p) => 'https://game.gtimg.cn/images/amside/ide_timer/598252_oslineupbyrecommend_pro_' + p + '.js',
  hot: (p) => 'https://game.gtimg.cn/images/amside/ide_timer/600264_oslineupbyhot_pro_' + p + '.js',
  beg: (p) => 'https://game.gtimg.cn/images/amside/ide_timer/600269_oslineupbybeginner_pro_' + p + '.js',
};

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: UA }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    }).on('error', reject);
  });
}

function parseJson(body) {
  const s = String(body || '').trim();
  if (!s || s.length < 8) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

async function fetchPages(kind) {
  const out = [];
  for (let p = 1; p <= 80; p++) {
    const r = await get(URLS[kind](p));
    if (r.status !== 200) break;
    const data = parseJson(r.body);
    if (!Array.isArray(data) || !data.length) break;
    console.log('  ' + kind + ' p' + p + '  ' + data.length + '  (' + r.body.length + ' B)');
    out.push.apply(out, data);
  }
  return out;
}

function T(s) {
  return String(s == null ? '' : s).replace(/\r/g, '').trim();
}

function namesOf(list) {
  return (list || []).map((x) => {
    if (!x) return '';
    if (typeof x === 'string') return T(x);
    return T(x.name);
  }).filter(Boolean);
}

function slimHero(h) {
  if (!h) return null;
  const eqs = (h.equipList || []).map((e) => (typeof e === 'string' ? T(e) : T(e.name))).filter(Boolean);
  return {
    name: T(h.name),
    x: Number(h.positionX) || 0,
    z: Number(h.positionZ) || 0,
    evo: !!h.isEvo,
    eqs: eqs,
  };
}

function slimOp(op) {
  return {
    from: Number(op.beginRound) || 0,
    to: Number(op.endRound) || 0,
    desc: T(op.desc),
    main: namesOf(op.mainHeroList),
    sub: namesOf(op.subHeroList),
  };
}

function slim(raw, flags) {
  const author = raw.author || {};
  const inter = raw.interactiveData || {};
  const tags = [];
  const tg = T(raw.tag);
  if (tg) tags.push(tg);
  (raw.tags || []).forEach((t) => { const x = T(t); if (x && tags.indexOf(x) < 0) tags.push(x); });
  if (flags.hot) tags.push('热门榜');
  if (flags.beg) tags.push('官方新手');
  const badge = T(author.typeLabel);
  return {
    key: String(raw.key),
    name: T(raw.name),
    tags: tags,
    author: T(author.name),
    badge: badge,
    useNum: Number(raw.useNum) || 0,
    score: T(inter.score) || '0',
    scoreNum: Number(inter.scoreNum) || 0,
    likeNum: Number(inter.likeNum) || 0,
    commentNum: Number(inter.commentNum) || 0,
    brief: T(raw.brief),
    positionDesc: T(raw.positionDesc),
    equipDesc: T(raw.equipDesc),
    talentDesc: T(raw.talentCardDesc),
    effectDesc: T(raw.effectCardDesc),
    lords: namesOf(raw.lordList),
    recLords: namesOf(raw.recommendLords),
    heroes: (raw.heroList || []).map(slimHero).filter((h) => h && h.name),
    talents: namesOf(raw.talentCardList),
    effects: namesOf(raw.effectCardList),
    ops: (raw.operationDetails || []).map(slimOp),
    ts: Number(raw.createTimestamp) || 0,
    hot: !!flags.hot,
    beg: !!flags.beg,
  };
}

function loadPools() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx);
  const w = ctx.window;
  function setOf(arr) {
    const o = Object.create(null);
    (arr || []).forEach((x) => { o[x.name] = true; });
    return o;
  }
  return {
    heroes: setOf(w.WXQ_HEROES),
    players: setOf(w.WXQ_PLAYERS),
    equips: setOf(w.WXQ_EQUIPS),
    effects: setOf(w.WXQ_EFFECTS),
    talents: setOf(w.WXQ_TALENTS),
  };
}

function collectUnknown(list, pools) {
  const u = { heroes: {}, players: {}, equips: {}, effects: {}, talents: {} };
  function add(bucket, name) {
    if (!name) return;
    if (!pools[bucket][name]) u[bucket][name] = (u[bucket][name] || 0) + 1;
  }
  list.forEach((L) => {
    L.lords.forEach((n) => add('players', n));
    L.recLords.forEach((n) => add('players', n));
    L.heroes.forEach((h) => {
      add('heroes', h.name);
      (h.eqs || []).forEach((e) => add('equips', e));
    });
    L.talents.forEach((n) => add('talents', n));
    L.effects.forEach((n) => add('effects', n));
    L.ops.forEach((op) => {
      op.main.forEach((n) => add('heroes', n));
      op.sub.forEach((n) => add('heroes', n));
    });
  });
  const out = {};
  Object.keys(u).forEach((k) => {
    const names = Object.keys(u[k]).sort((a, b) => u[k][b] - u[k][a]);
    if (names.length) out[k] = names.map((n) => n + '×' + u[k][n]);
  });
  return out;
}

(async () => {
  console.log('== 拉官方阵容库 ==');
  const rec = await fetchPages('rec');
  const hot = await fetchPages('hot');
  const beg = await fetchPages('beg');
  const hotKeys = {};
  hot.forEach((x, i) => { hotKeys[String(x.key)] = i + 1; });
  const begKeys = {};
  beg.forEach((x) => { begKeys[String(x.key)] = true; });

  const byKey = Object.create(null);
  function ingest(arr, kind) {
    arr.forEach((raw) => {
      const key = String(raw.key);
      const flags = { hot: !!hotKeys[key], beg: !!begKeys[key] };
      if (!byKey[key]) byKey[key] = slim(raw, flags);
      else {
        if (flags.hot) byKey[key].hot = true;
        if (flags.beg) byKey[key].beg = true;
        (byKey[key].tags || []);
        if (flags.hot && byKey[key].tags.indexOf('热门榜') < 0) byKey[key].tags.push('热门榜');
        if (flags.beg && byKey[key].tags.indexOf('官方新手') < 0) byKey[key].tags.push('官方新手');
      }
      if (kind === 'hot') byKey[key].hotRank = hotKeys[key];
    });
  }
  ingest(rec, 'rec');
  ingest(hot, 'hot');
  ingest(beg, 'beg');

  const rawList = Object.keys(byKey).map((k) => byKey[k]);
  const dropped = { use: 0, score: 0, both: 0 };
  const list = rawList.filter((L) => {
    const use = Number(L.useNum) || 0;
    const score = parseFloat(L.score);
    const sc = (score === score) ? score : 0;
    const badUse = use < MIN_USE;
    const badScore = sc < MIN_SCORE;
    if (badUse && badScore) dropped.both += 1;
    else if (badUse) dropped.use += 1;
    else if (badScore) dropped.score += 1;
    return !badUse && !badScore;
  });
  list.sort((a, b) => {
    if (!!b.hot !== !!a.hot) return b.hot ? 1 : -1;
    if (a.hot && b.hot) return (a.hotRank || 99) - (b.hotRank || 99);
    return (b.useNum || 0) - (a.useNum || 0);
  });

  const pools = loadPools();
  const unknown = collectUnknown(list, pools);
  const capturedAt = new Date().toISOString().slice(0, 10);
  const meta = {
    version: '1.2.0',
    capturedAt: capturedAt,
    source: '王者万象棋官网阵容推荐库（oslineupbyrecommend / oslineupbyhot / oslineupbybeginner）',
    note: '主播投稿 + 官方推荐。入库门槛：使用量≥2000 且评分≥4.0，低于此为噪声不收录。阵容码 = key，可在游戏「阵容 → 我的阵容 → 导入」使用。本页只展示官方库原文，不模拟打架。',
    counts: {
      total: list.length,
      raw: rawList.length,
      dropped: dropped.use + dropped.score + dropped.both,
      droppedUse: dropped.use,
      droppedScore: dropped.score,
      droppedBoth: dropped.both,
      recommend: rec.length,
      hot: hot.length,
      beginner: beg.length,
      uniqueAuthors: new Set(list.map((x) => x.author).filter(Boolean)).size,
    },
    unknown: unknown,
  };

  const payload = { meta: meta, list: list };
  const body = '/* 王者万象棋 · 官方阵容推荐库（自动生成，勿手工编辑） */\n'
    + '/* 同步：node scripts/sync-wxq-lineups.js */\n'
    + 'window.WXQ_JOBS = ' + JSON.stringify(payload) + ';\n';
  fs.writeFileSync(OUT, body);
  console.log('\n写出', path.relative(ROOT, OUT), (Buffer.byteLength(body) / 1024).toFixed(1) + ' KB');
  console.log('合计', list.length, '套（原始', rawList.length, '，丢噪声', meta.counts.dropped, '：用量低', dropped.use, '/ 分低', dropped.score, '/ 双低', dropped.both, ')');
  console.log('推荐', rec.length, '| 热门', hot.length, '| 新手', beg.length);
  console.log('作者', meta.counts.uniqueAuthors);
  if (Object.keys(unknown).length) {
    console.log('对照官方池未知名：');
    Object.keys(unknown).forEach((k) => console.log('  ' + k + '  ' + unknown[k].join('、')));
  } else {
    console.log('命名对照官方池：0 未知');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
