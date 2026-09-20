#!/usr/bin/env node
/**
 * 王者万象棋 · 官方阵容推荐库同步
 * --------------------------------
 * 拉官网 amside 阵容 JSON（推荐 / 热门 / 新手），压成 wanxiangqi-lineups.js。
 *
 * 入库门槛（2026-09-20 放宽，原来是「使用量>=2000 且 评分>=4」的且关系）：
 * 原规则有两个问题 —— 官方发布的 5 套新手教学套因为使用量为 0 被整批丢掉；
 * 而 score=0 其实是「还没人评分」（392 套里 392 套评分数也是 0），不是差评，
 * 拿它当硬门槛等于按人气把新套和官方套一起挡在门外。
 * 现在改成「满足任一即收」，并把入选理由记进 pick：
 *   官方出品(1) / 热门榜(2) / 官方新手(3) / 好评(4) / 高使用(5) / 有热度(6) / 攻略完整(7)
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

// 放宽后的门槛（任一满足即收录）
const MIN_USE_MAIN = 1000;   // 使用量够高就算没人评也收
const MIN_USE_HEAT = 300;    // 中等使用量 + 有人点赞
const MIN_LIKE_HEAT = 20;
const MIN_SCORE = 4.0;       // 好评门槛
const MIN_SCORE_NUM = 3;     // 至少这么多个评分才算「好评」，避免 1 人打分就满分
const MIN_USE_GUIDE = 500;   // 攻略完整的小众套（至少这么高使用量）
const MIN_OPS_GUIDE = 3;

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

  // 收录判定：满足任一即收，并记下理由（pick 数组，数字=理由编号）
  const reasons = { official: 0, hot: 0, beginner: 0, rating: 0, use: 0, heat: 0, guide: 0 };
  function pickOf(L) {
    const use = Number(L.useNum) || 0;
    const score = parseFloat(L.score) || 0;
    const scoreNum = Number(L.scoreNum) || 0;
    const like = Number(L.likeNum) || 0;
    const ops = (L.ops || []).filter((o) => String(o.desc || '').trim()).length;
    const isOfficial = /官方/.test(String(L.author || '')) || /官方/.test(String(L.badge || ''));
    const picks = [];
    if (isOfficial) picks.push(1);                                    // 官方出品
    if (L.hot) picks.push(2);                                         // 热门榜
    if (L.beg) picks.push(3);                                         // 官方新手
    if (score >= MIN_SCORE && scoreNum >= MIN_SCORE_NUM) picks.push(4); // 好评（多人评过）
    if (use >= MIN_USE_MAIN) picks.push(5);                           // 高使用量
    if (use >= MIN_USE_HEAT && like >= MIN_LIKE_HEAT) picks.push(6);   // 有热度
    if (use >= MIN_USE_GUIDE && ops >= MIN_OPS_GUIDE) picks.push(7);   // 攻略完整
    return picks;
  }

  const list = [];
  rawList.forEach((L) => {
    // 必须是一套能摆出来的阵容：至少 4 个英雄，名字不能空
    if (!L.name) return;
    if ((L.heroes || []).length < 4) return;
    const picks = pickOf(L);
    if (!picks.length) return;
    L.pick = picks;
    L.official = /官方/.test(String(L.author || '')) || /官方/.test(String(L.badge || ''));
    list.push(L);
    if (L.official) reasons.official += 1;
    if (L.hot) reasons.hot += 1;
    if (L.beg) reasons.beginner += 1;
    if (picks.indexOf(4) >= 0) reasons.rating += 1;
    if (picks.indexOf(5) >= 0) reasons.use += 1;
    if (picks.indexOf(6) >= 0) reasons.heat += 1;
    if (picks.indexOf(7) >= 0) reasons.guide += 1;
  });

  // 排序：官方/热门/新手置顶，然后按是否好评、使用量
  list.sort((a, b) => {
    if (!!b.official !== !!a.official) return b.official ? 1 : -1;
    if (!!b.beg !== !!a.beg) return b.beg ? 1 : -1;
    if (!!b.hot !== !!a.hot) return b.hot ? 1 : -1;
    if (a.hot && b.hot) return (a.hotRank || 99) - (b.hotRank || 99);
    const ar = parseFloat(a.score) >= MIN_SCORE ? 1 : 0;
    const br = parseFloat(b.score) >= MIN_SCORE ? 1 : 0;
    if (ar !== br) return br - ar;
    return (b.useNum || 0) - (a.useNum || 0);
  });

  const pools = loadPools();
  const unknown = collectUnknown(list, pools);
  const capturedAt = new Date().toISOString().slice(0, 10);
  const meta = {
    version: '1.3.0',
    capturedAt: capturedAt,
    source: '王者万象棋官网阵容推荐库（oslineupbyrecommend / oslineupbyhot / oslineupbybeginner）',
    note: '主播投稿 + 官方推荐。入库门槛（2026-09-20 放宽）：官方出品 / 热门榜 / 官方新手 / 好评(≥4 分且≥3 人评) / 使用量≥' + MIN_USE_MAIN
      + ' / 热度(≥' + MIN_USE_HEAT + ' 且点赞≥' + MIN_LIKE_HEAT + ') / 攻略完整(≥' + MIN_USE_GUIDE + ' 且 3 段运营)，满足任一即收；并要求至少 4 个英雄。'
      + '注意 score=0 表示没人评分，不是差评。理由见每条的 pick。阵容码 = key，可在游戏「阵容 → 我的阵容 → 导入」使用。本页只展示官方库原文，不模拟打架。',
    counts: {
      total: list.length,
      raw: rawList.length,
      dropped: rawList.length - list.length,
      droppedThin: rawList.filter((L) => L.name && (L.heroes || []).length < 4).length,
      droppedNoPick: rawList.filter((L) => L.name && (L.heroes || []).length >= 4 && !pickOf(L).length).length,
      reasons: reasons,
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
  console.log('合计', list.length, '套（原始', rawList.length, '，丢', meta.counts.dropped,
    '：英雄不足4个', meta.counts.droppedThin, '/ 无任何入选理由', meta.counts.droppedNoPick, '）');
  console.log('入选理由统计:', JSON.stringify(reasons));
  console.log('推荐', rec.length, '| 热门', hot.length, '| 新手', beg.length);
  console.log('官方出品', reasons.official, '套 | 作者', meta.counts.uniqueAuthors);
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
