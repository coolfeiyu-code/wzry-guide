#!/usr/bin/env node
/**
 * 万象棋 · 凑卡匹配 / 个人战绩 回归测试
 * 跑法：node scripts/test-wxq-match.js
 *
 * 覆盖：rankLineups 打分与排序（全中/部分/缺失计算/零重合不出现）、
 *       页面 HTML 结构（85 个英雄全在卡池里）、
 *       战绩 stats 数学、删除墓碑、
 *       cloud.js decideRecords（函数级，浏览器端合并语义）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---- 极简浏览器环境 ----
const storeMap = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in storeMap ? storeMap[k] : null),
  setItem: (k, v) => { storeMap[k] = String(v); },
  removeItem: (k) => { delete storeMap[k]; }
};
global.location = { hostname: '127.0.0.1', port: '17871' };
global.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, querySelector: () => null }),
  getElementById: () => null,
  body: { appendChild() {} }
};
// Node 24 的 globalThis 自带只读 navigator，别去覆盖
try { global.screen = global.screen || { width: 1920, height: 1080 }; } catch (e) {}
global.matchMedia = global.matchMedia || (() => ({ matches: false }));

function load(f) { require(path.join(ROOT, f)); }
load('wanxiangqi-data.js');
load('wanxiangqi-lineups.js');
load('wanxiangqi-stats.js');
load('wanxiangqi-edit.js');
load('wanxiangqi-match.js');
load('wanxiangqi-record.js');
load('wanxiangqi-patch.js');
load('wanxiangqi-jobs.js');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else { console.log('  ✗ ' + label + (detail !== undefined ? '  → ' + detail : '')); fail++; }
}

(async function main() {
  const M = global.WXQ_MATCH, R = global.WXQ_RECORD;

  // 组一个与 jobs.data() 同构的列表（含 7 日无码卡）
  const stats = global.WXQ_STATS || { list: [] };
  const list = (global.WXQ_JOBS.list || []).concat((stats.list || []).slice());
  check('阵容库非空', list.length > 300, list.length);

  // 1. 全中：挑一套人数最多的，全勾上 → 第一名就是它，缺 0
  const target = list.slice().sort((a, b) => b.heroes.length - a.heroes.length)[0];
  const tNames = target.heroes.map((h) => h.name);
  let r = M.rank(tNames, list);
  check('全中排第一', r[0].lineup.key === String(target.key), r[0].lineup.name + ' vs ' + target.name);
  check('全中 matched=' + tNames.length, r[0].matched.length === tNames.length, r[0].matched.length);
  check('全中缺 0', r[0].missing.length === 0, JSON.stringify(r[0].missing));

  // 2. 部分重合：勾一半 + 一个无关英雄。排序不变量：matched 降序；同 matched
  //    时占比（matched/total）降序。并验证目标套 matched/missing 计数正确。
  const half = tNames.slice(0, Math.ceil(tNames.length / 2)).concat(['百里的无关测试英雄']);
  r = M.rank(half, list);
  let okOrder = true;
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i];
    if (b.matched.length > a.matched.length) { okOrder = false; break; }
    if (b.matched.length === a.matched.length && (b.matched.length / b.total) > (a.matched.length / a.total) + 1e-9) { okOrder = false; break; }
  }
  check('排序不变量（matched 降序 → 占比降序）', okOrder, JSON.stringify(r.slice(0, 3).map((x) => [x.lineup.name, x.matched.length, x.total])));
  check('第一名 matched=' + Math.ceil(tNames.length / 2), r[0].matched.length === Math.ceil(tNames.length / 2), r[0].matched.length);
  const tRow = r.find((x) => x.lineup.key === String(target.key));
  check('目标套在结果里', !!tRow, '未找到 ' + target.name);
  check('目标套 matched=' + Math.ceil(tNames.length / 2), tRow && tRow.matched.length === Math.ceil(tNames.length / 2), tRow && tRow.matched.length);
  check('目标套 missing=' + (tNames.length - Math.ceil(tNames.length / 2)), tRow && tRow.missing.length === tNames.length - Math.ceil(tNames.length / 2), tRow && JSON.stringify(tRow.missing));

  // 3. 零重合不出现
  r = M.rank(['百里的无关测试英雄'], list);
  check('零重合没有结果', r.length === 0, r.length);

  // 4. 页面结构：卡池 85 个英雄全在，勾选后 results 有内容
  const html = M.pageHtml();
  const pool = (html.match(/data-mt-pick=/g) || []).length;
  check('卡池英雄数 = ' + (global.WXQ_HEROES || []).length, pool === (global.WXQ_HEROES || []).length, pool);
  check('页面有结果容器', html.indexOf('data-mt-results') >= 0);

  // 5. 战绩：add → stats 数学 → remove 墓碑
  const before = R.readStore();
  R.add('k1', '测试套甲', 1);
  R.add('k1', '测试套甲', 4);
  R.add('k2', '测试套乙', 8);
  const s = R.stats();
  check('战绩 3 局', s.games === 3, s.games);
  check('平均名次 = 13/3', Math.abs(s.avg - 13 / 3) < 1e-9, s.avg);
  check('前三率 = 1/3', Math.abs(s.top3 - 1 / 3) < 1e-9, s.top3);
  const row1 = s.rows.find((x) => x.key === 'k1');
  check('甲 2 局平均 2.5', row1 && row1.games === 2 && Math.abs(row1.avg - 2.5) < 1e-9, JSON.stringify(row1));
  const id = R.readStore().list[R.readStore().list.length - 1].id;
  R.remove(id);
  const st2 = R.readStore();
  check('删除后进墓碑', !!(st2.del && st2.del[id]), JSON.stringify(st2.del));
  check('墓碑后 stats 不算它', R.stats().games === 2, R.stats().games);

  // 6. cloud.js decideRecords（浏览器端合并语义）
  console.log('  —— decideRecords 函数级 ——');
  delete storeMap['wxq-records-v1'];   // 清掉第 5 节残留，否则「本机独有」永远为真
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'wanxiangqi-cloud.js'), 'utf8');
  const m = cloudSrc.match(/function decideRecords\(cfgRecords\) \{[\s\S]*?\n  \}/);
  if (!m) { check('提取 decideRecords', false); }
  else {
    const decide = new Function('lsGet', 'lsSet', 'parseJson', 'KEYS', m[0] + '; return decideRecords;')(
      (k) => (k in storeMap ? storeMap[k] : null),
      (k, v) => { storeMap[k] = String(v); },
      (s) => { try { return JSON.parse(s); } catch (e) { return null; } },
      { records: 'wxq-records-v1' }
    );
    // 云端有一条本机没有 → adopt
    let d = decide({ list: [{ id: 'c1', name: '云', rank: 2 }], del: {} });
    check('云端新记录 → adopt', d === 'adopt', d);
    // 本机有一条云端没有 → local_newer（触发回写）
    d = decide({ list: [{ id: 'c2', name: '云2', rank: 3 }], del: {} });
    check('本机独有 → local_newer', d === 'local_newer', d);
    // 删除墓碑穿透：云端删了 c1，本机的 c1 要被清掉
    d = decide({ list: [], del: { c1: Date.now() + 5 } });
    const after = JSON.parse(storeMap['wxq-records-v1']);
    check('墓碑清掉 c1', !after.list.some((x) => x.id === 'c1'), JSON.stringify(after.list.map((x) => x.id)));
    check('墓碑留在本机', !!after.del.c1);
    // 一致时 no change
    const snap = storeMap['wxq-records-v1'];
    d = decide(JSON.parse(snap));
    check('一致 → none', d === 'none', d);
  }

  // 清理：把测试写的战绩从 localStorage 撤掉
  delete storeMap['wxq-records-v1'];

  console.log('\n══ 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ══');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
