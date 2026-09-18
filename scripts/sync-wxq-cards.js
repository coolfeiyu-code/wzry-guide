#!/usr/bin/env node
/**
 * 王者万象棋 · 官方英雄/装备卡面补全
 * --------------------------------
 * 拉 amside 589094_oscard_new_1 / _4，把技能、10/40/100 质变、觉醒、
 * 属性、词条释义、费用、装备类型、合成来源写回 wanxiangqi-data.js。
 * 专名按 id 对齐，名称必须与现快照 0-mismatch。
 *
 *   node scripts/sync-wxq-cards.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'wanxiangqi-data.js');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; wzry-guide card sync)' };
const HERO_URL = 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_1.js';
const EQUIP_URL = 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_4.js';

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

function parsePack(body) {
  const s = String(body || '').trim().replace(/^\uFEFF/, '');
  try { return JSON.parse(s); } catch (e) {
    throw new Error('oscard JSON 解析失败: ' + e.message);
  }
}

function T(s) {
  return String(s == null ? '' : s).replace(/\r/g, '').trim();
}

function slimSkills(list) {
  return (list || []).map((s) => {
    const out = { name: T(s.name), desc: T(s.desc) };
    const params = s.enhanceSkill && s.enhanceSkill.isOpenEnhance ? s.enhanceSkill.params : null;
    if (params && params.length) {
      out.enhance = params.map((p) => ({ level: Number(p.level) || 0, desc: T(p.desc) }));
    }
    return out;
  }).filter((s) => s.name || s.desc);
}

function slimStats(p) {
  if (!p || typeof p !== 'object') return null;
  const keys = [
    'HP', 'phyAttack', 'magAttack', 'phyDefense', 'magDefense',
    'moveSpeed', 'attackSpeed', 'criticalRate', 'criticalEffect',
    'attackDistance', 'initEnergy', 'energy', 'initLevel',
  ];
  const out = {};
  let n = 0;
  keys.forEach((k) => {
    if (p[k] == null) return;
    out[k] = Number(p[k]);
    n += 1;
  });
  return n ? out : null;
}

function slimKw(list) {
  return (list || []).map((k) => ({ name: T(k.name), desc: T(k.desc) })).filter((k) => k.name);
}

function slimCost(c) {
  if (!c || typeof c !== 'object') return null;
  const type = Number(c.Type);
  const count = Number(c.Count);
  if (!count) return null;
  return { type: type || 1, count: count };
}

function slimSources(list) {
  return (list || []).map((s) => ({ id: Number(s.id), name: T(s.name) })).filter((s) => s.id && s.name);
}

function replaceAssign(src, name, value) {
  const re = new RegExp('^window\\.' + name + ' = .*', 'm');
  if (!re.test(src)) throw new Error('找不到 window.' + name + ' 赋值行');
  return src.replace(re, 'window.' + name + ' = ' + JSON.stringify(value) + ';');
}

(async () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATA, 'utf8'), ctx, { filename: 'wanxiangqi-data.js' });
  const W = ctx.window;
  const localHeroes = W.WXQ_HEROES;
  const localEquips = W.WXQ_EQUIPS;
  const meta = W.WXQ_META;
  if (!Array.isArray(localHeroes) || !Array.isArray(localEquips) || !meta) {
    throw new Error('wanxiangqi-data.js 未导出 WXQ_HEROES / WXQ_EQUIPS / WXQ_META');
  }

  const heroRes = await get(HERO_URL);
  const eqRes = await get(EQUIP_URL);
  if (heroRes.status !== 200 || eqRes.status !== 200) {
    throw new Error('oscard HTTP ' + heroRes.status + '/' + eqRes.status);
  }
  const officialHeroes = parsePack(heroRes.body).heroCards || [];
  const officialEquips = parsePack(eqRes.body).equipCards || [];
  const byHeroId = new Map(officialHeroes.map((h) => [Number(h.id), h]));
  const byEquipId = new Map(officialEquips.map((e) => [Number(e.id), e]));

  let nameMismatch = 0;
  let heroMiss = 0;
  const nextHeroes = localHeroes.map((h) => {
    const o = byHeroId.get(Number(h.id));
    if (!o) { heroMiss += 1; return h; }
    if (T(o.name) !== T(h.name)) {
      console.error('英雄专名不一致', h.id, h.name, 'vs', o.name);
      nameMismatch += 1;
    }
    const hc = o.heroCard || {};
    const next = {
      id: h.id,
      name: h.name,
      type: h.type,
      typeLabel: h.typeLabel,
      quality: h.quality,
      faction: h.faction,
      desc: h.desc,
      img: h.img,
    };
    const skills = slimSkills(hc.skillList);
    if (skills.length) next.skills = skills;
    const awake = hc.awakeingCard && T(hc.awakeingCard.desc);
    if (awake) next.awakeDesc = awake;
    const stats = slimStats(hc.properties);
    if (stats) next.stats = stats;
    const kw = slimKw(hc.keywordDescription);
    if (kw.length) next.kwHelp = kw;
    const cost = slimCost(o.shopBuyCost);
    if (cost) next.cost = cost;
    const getDesc = T(o.cardGetDesc);
    if (getDesc) next.getDesc = getDesc;
    return next;
  });

  let equipMiss = 0;
  const nextEquips = localEquips.map((e) => {
    const o = byEquipId.get(Number(e.id));
    if (!o) { equipMiss += 1; return e; }
    if (T(o.name) !== T(e.name)) {
      console.error('装备专名不一致', e.id, e.name, 'vs', o.name);
      nameMismatch += 1;
    }
    const ec = o.equipCard || {};
    const next = {
      id: e.id,
      name: e.name,
      type: e.type,
      typeLabel: e.typeLabel,
      quality: e.quality,
      faction: e.faction,
      desc: e.desc,
      img: e.img,
    };
    if (T(ec.atlasSubTypeName)) next.subType = T(ec.atlasSubTypeName);
    if (T(ec.equipTypeName)) next.equipType = T(ec.equipTypeName);
    const from = slimSources(o.sourceCards);
    if (from.length) next.craftFrom = from;
    const into = (o.previewCardIDs || []).map(Number).filter(Boolean);
    if (into.length) next.craftInto = into;
    const cost = slimCost(o.shopBuyCost);
    if (cost) next.cost = cost;
    const getDesc = T(o.cardGetDesc);
    if (getDesc) next.getDesc = getDesc;
    return next;
  });

  if (nameMismatch) {
    throw new Error('专名 0-mismatch 失败：' + nameMismatch + ' 条');
  }

  const withSkill = nextHeroes.filter((h) => h.skills && h.skills.length).length;
  const withAwake = nextHeroes.filter((h) => h.awakeDesc).length;
  const withStats = nextHeroes.filter((h) => h.stats).length;
  const withFrom = nextEquips.filter((e) => e.craftFrom && e.craftFrom.length).length;
  const withInto = nextEquips.filter((e) => e.craftInto && e.craftInto.length).length;

  const nextMeta = Object.assign({}, meta, {
    version: '1.5.0',
    note: '卡面与数值均取自官方公开数据快照；棋手阿离于 2026-09-18 按官方 lords 快照补录。「流派」对应游戏内阵营体系。v1.5.0 并入官方英雄技能/质变/觉醒/属性与装备类型/合成来源。',
  });

  let src = fs.readFileSync(DATA, 'utf8');
  src = replaceAssign(src, 'WXQ_META', nextMeta);
  src = replaceAssign(src, 'WXQ_HEROES', nextHeroes);
  src = replaceAssign(src, 'WXQ_EQUIPS', nextEquips);
  fs.writeFileSync(DATA, src);

  console.log('heroes', nextHeroes.length, 'official', officialHeroes.length, 'miss', heroMiss, 'skill', withSkill, 'awake', withAwake, 'stats', withStats);
  console.log('equips', nextEquips.length, 'official', officialEquips.length, 'miss', equipMiss, 'craftFrom', withFrom, 'craftInto', withInto);
  console.log('WXQ_META', meta.version, '->', nextMeta.version);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
