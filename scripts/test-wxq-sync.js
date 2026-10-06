#!/usr/bin/env node
/**
 * 万象棋 · 多机同步回归测试
 * ----------------------------------------------------------------------------
 * 跑法：node scripts/test-wxq-sync.js
 *
 * 起因（2026-09-26）：用户反馈「好几台电脑的在用阵容总是一会存一会不存」。
 * 根因是合并策略用「时间戳后写者胜」——多台电脑时钟必然有偏差，慢的那台
 * 一改就被判成旧数据丢弃；加上桥的读-改-写没有跨进程互斥，并发时后写覆盖先写。
 *
 * 这个测试起一个真桥（临时目录 + 独立端口），模拟多台电脑并发 POST，
 * 覆盖：旧数据升级、慢时钟、并发写、删除穿透、重加不误删、8 套上限、
 * 空 using 不清云端、落盘格式兼容、无 tmp/lock 残骸。
 *
 * ⚠️ 改合并逻辑后必须重跑。它测的是「不丢数据」这个不变量，
 *    只测「能写进去」会漏掉覆盖类 bug。
 *    端口被占就换：$env:WXQ_TEST_PORT=19872; node scripts/test-wxq-sync.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BRIDGE = path.join(__dirname, 'wxq-cloud-bridge.js');
const PORT = Number(process.env.WXQ_TEST_PORT || 19871);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wxq-sync-'));
const CFG_DIR = path.join(TMP, '王者万象棋助手');
const CFG_FILE = path.join(CFG_DIR, '王者助手.json.js');
fs.mkdirSync(CFG_DIR, { recursive: true });
// 桥的 pageDir 找不到页面会退回仓库目录；给个占位页即可
fs.writeFileSync(path.join(CFG_DIR, '王者助手.html'), '<!doctype html><title>t</title>', 'utf8');

function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const r = http.request({
      hostname: '127.0.0.1', port: PORT, path: pathname, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { reject(e); } });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}
const post = (cfg) => req('POST', '/api/cloud', cfg);
const get = () => req('GET', '/api/cloud');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 桥读的是 incoming.using，所以必须包一层
const S = (keys, at, extra) => ({ using: Object.assign({ keys, last: keys[0] || '', at }, extra || {}) });

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else { console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); fail++; }
}

let bridge = null;
function cleanup() {
  try { if (bridge) bridge.kill(); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

(async function main() {
  bridge = spawn(process.execPath, [BRIDGE], {
    env: Object.assign({}, process.env, { WXQ_BRIDGE_PORT: String(PORT), WXQ_BRIDGE_ROOT: CFG_DIR }),
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  await wait(900);
  const hp = await new Promise((res) => {
    http.get({ hostname: '127.0.0.1', port: PORT, path: '/api/health' }, (x) => {
      const c = []; x.on('data', (d) => c.push(d));
      x.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { res(null); } });
    }).on('error', () => res(null));
  });
  if (!hp || hp.dir !== CFG_DIR) {
    console.error('✗ 端口 ' + PORT + ' 上不是本测试的桥（可能被占），换个端口：$env:WXQ_TEST_PORT=19872');
    cleanup(); process.exit(2);
  }
  console.log('测试目录:', CFG_DIR, '\n');

  // 0. mergeUsing 函数级单测
  // 桥的 HTTP 接口构造不出「磁盘那份副本的 at 比墓碑更早」的状态（落盘 at 总是
  // Math.max(..., Date.now())），所以这块只能用函数级用例覆盖。这个场景是真会发生的：
  // 删除那一下如果桥没开（POST 失败），磁盘上那个 key 就留着了，之后在另一台机器
  // 重新点星标收藏它，旧墓碑就可能把新收藏又杀掉 —— 表现就是「怎么点都存不进去」。
  console.log('【0】mergeUsing：删过的一套重新收藏，不能被旧墓碑误杀');
  {
    const src = fs.readFileSync(BRIDGE, 'utf8');
    const m = src.match(/function mergeUsing\([\s\S]*?\n\}/);
    const mergeUsing = new Function(m[0] + '; return mergeUsing;')();
    const T = 1790000000000;
    // 磁盘：k 早就被删过（墓碑 T+2000），但旧副本里还留着 k
    const disk = { keys: ['base', 'k'], last: 'base', at: T + 1000, rev: 3, del: { k: T + 2000 } };
    // A. 正常情况：本机 rev 已跟上云端（靠 cloud.js 的 ack 全量回写），刚点星标收藏 k
    const outA = mergeUsing(disk, { keys: ['base', 'k'], last: 'k', at: T + 5000, rev: 3 });
    check('重加的 k 没被旧墓碑误杀', outA.keys.indexOf('k') >= 0, JSON.stringify(outA));
    check('last 指向刚收藏的那套', outA.last === 'k', outA.last);
    // B. 本机 rev 还没跟上（首次 POST 前的状态）：云端 rev 更大是合理的，
    //    这里只要求「不许把刚重加的 key 删掉」
    const outB = mergeUsing(disk, { keys: ['base', 'k'], last: 'k', at: T + 5000, rev: 0 });
    check('rev 落后时也不许误删刚重加的 k', outB.keys.indexOf('k') >= 0, JSON.stringify(outB));
    // 反向：墓碑确实比「重新加回来的时间」更新 → 仍要删掉，别把删除功能改坏
    const out2 = mergeUsing(disk, { keys: ['base', 'k'], last: 'k', at: T + 1500, rev: 3 });
    check('墓碑更新的老收藏仍被删', out2.keys.indexOf('k') < 0, JSON.stringify(out2));
  }

  // 1. 旧格式数据（无 rev/del）能被读并升级
  console.log('【1】旧格式数据（无 rev/del）能被读并升级');
  fs.writeFileSync(CFG_FILE, 'window.WXQ_CLOUD_BOOT = {"v":1,"using":{"keys":["a","b"],"last":"a","at":1000}};\n', 'utf8');
  let r = await post(S(['a', 'b', 'c'], Date.now()));
  check('写入后自动补 rev', Number(r.cfg.using.rev) >= 1, 'rev=' + r.cfg.using.rev);
  check('新增的 c 保留', r.cfg.using.keys.indexOf('c') >= 0, JSON.stringify(r.cfg.using.keys));

  // 2. 时钟慢的机器不再丢数据（关键回归）
  console.log('\n【2】B 机器时钟慢 10 分钟（关键回归）');
  await post(S(['a', 'b', 'c'], Date.now()));
  r = await post(S(['a', 'b', 'c', 'SLOW'], Date.now() - 600000));
  check('慢端新增的 SLOW 没丢', r.cfg.using.keys.indexOf('SLOW') >= 0, JSON.stringify(r.cfg.using.keys));

  // 3. 并发写入不互相覆盖
  console.log('\n【3】3 台机器同时写（真并发）');
  await post(S(['base'], Date.now()));
  await Promise.all([
    post(S(['base', 'm1'], Date.now())),
    post(S(['base', 'm2'], Date.now())),
    post(S(['base', 'm3'], Date.now())),
  ]);
  r = await get();
  const keys = r.cfg.using.keys;
  check('m1 保留', keys.indexOf('m1') >= 0, JSON.stringify(keys));
  check('m2 保留', keys.indexOf('m2') >= 0, JSON.stringify(keys));
  check('m3 保留', keys.indexOf('m3') >= 0, JSON.stringify(keys));

  // 4. 删除穿透 + 重加不误删
  console.log('\n【4】删除与重加');
  const cur = (await get()).cfg.using;
  r = await post(S(cur.keys.filter((x) => x !== 'm1'), Date.now() + 1000, { del: { m1: Date.now() + 1000 } }));
  check('m1 被删掉', r.cfg.using.keys.indexOf('m1') < 0, JSON.stringify(r.cfg.using.keys));
  check('墓碑写入云端', !!(r.cfg.using.del && r.cfg.using.del.m1), JSON.stringify(r.cfg.using.del));
  r = await post(S(r.cfg.using.keys.concat(['m1']), Date.now() + 5000));
  check('重加 m1 成功（不误删）', r.cfg.using.keys.indexOf('m1') >= 0, JSON.stringify(r.cfg.using.keys));

  // 5. 不限套数（2026-09-27 用户要求：8 套上限太紧）
  console.log('\n【5】不限套数');
  const many = [];
  for (let i = 1; i <= 30; i++) many.push('k' + i);
  r = await post(S(many, Date.now() + 9000));
  // 并集语义：本机 30 套 + 云端还留着前面几组的 8 套 = 38，所以用「>=30」而不是等号
  check('30 套全部保留（并集后 ≥30）', r.cfg.using.keys.length >= 30, '实际 ' + r.cfg.using.keys.length);
  // 注意：前面几组的 a/b/c/SLOW/base/m2… 都还在（并集语义），所以不能断言下标，要断言存在性
  check('k1 在列表', r.cfg.using.keys.indexOf('k1') >= 0);
  check('k30 在列表', r.cfg.using.keys.indexOf('k30') >= 0);
  check('并集语义：旧套 a 仍在', r.cfg.using.keys.indexOf('a') >= 0, JSON.stringify(r.cfg.using.keys.slice(0, 8)));

  // 上限仍有兜底（防手滑灌爆 localStorage），但已放宽到 1000
  const huge = [];
  for (let i = 0; i < 1200; i++) huge.push('x' + i);
  r = await post(S(huge, Date.now() + 9500));
  check('超量时按 1000 兜底截断', r.cfg.using.keys.length === 1000, '实际 ' + r.cfg.using.keys.length);

  // 6. 不带 using 的 POST 不能清空云端
  console.log('\n【6】空 using 不能清掉云端数据');
  r = await post({ v: 1, theme: 'dark' });
  check('云端 using 仍在', !!(r.cfg.using && r.cfg.using.keys.length), JSON.stringify(r.cfg.using));
  check('theme 写进去了', r.cfg.theme === 'dark', r.cfg.theme);

  // 7. 落盘格式与残骸
  console.log('\n【7】落盘格式兼容');
  const txt = fs.readFileSync(CFG_FILE, 'utf8');
  const m = txt.match(/window\.WXQ_CLOUD_BOOT\s*=\s*(\{[\s\S]*\});?/);
  let parsed = null;
  try { parsed = JSON.parse(m[1]); } catch (e) {}
  check('旧正则能解析落盘文件', !!parsed, m ? 'parse 失败' : '正则未匹配');
  check('文件里有 rev 字段', !!(parsed && parsed.using && parsed.using.rev !== undefined));
  const files = fs.readdirSync(CFG_DIR);
  check('无残留 .tmp', !files.some((f) => /\.tmp$/.test(f)), files.join(','));
  check('无残留 .lock', !fs.existsSync(path.join(CFG_DIR, '王者助手.json.lock')));

  // 8. 阵容编辑按套合并，慢时钟 / 没带到的套都不能整组覆盖
  console.log('\n【8】阵容编辑');
  r = await post({ v: 1, edits: { items: {
    e1: { rev: 1, at: 100, name: '甲' },
    e2: { rev: 1, at: 100, name: '乙' }
  } } });
  check('e1 写入', r.cfg.edits && r.cfg.edits.items.e1 && r.cfg.edits.items.e1.name === '甲');
  check('e2 写入', r.cfg.edits && r.cfg.edits.items.e2 && r.cfg.edits.items.e2.name === '乙');
  r = await post({ v: 1, edits: { items: { e1: { rev: 2, at: 50, name: '甲改' } } } });
  check('高 rev 覆盖 e1，哪怕 at 更早', r.cfg.edits.items.e1.name === '甲改', r.cfg.edits.items.e1.name);
  check('这次没带到的 e2 还在', r.cfg.edits.items.e2 && r.cfg.edits.items.e2.name === '乙');
  r = await post({ v: 1, edits: { items: { e1: { rev: 1, at: 99999, name: '旧的' } } } });
  check('低 rev 不能盖掉高 rev', r.cfg.edits.items.e1.name === '甲改', r.cfg.edits.items.e1.name);
  r = await post({ v: 1, edits: { items: { e2: { rev: 2, at: 200, cleared: true } } } });
  check('恢复官方的墓碑留在云端', !!(r.cfg.edits.items.e2 && r.cfg.edits.items.e2.cleared));
  check('墓碑没有把 e1 清掉', r.cfg.edits.items.e1.name === '甲改');
  r = await post({ v: 1, theme: 'dark' });
  check('不带 edits 的写入不清编辑', r.cfg.edits && r.cfg.edits.items.e1 && r.cfg.edits.items.e1.name === '甲改');
  await Promise.all([
    post({ v: 1, edits: { items: { pA: { rev: 1, at: 1, name: 'A' } } } }),
    post({ v: 1, edits: { items: { pB: { rev: 1, at: 1, name: 'B' } } } })
  ]);
  r = await get();
  check('并发各改一套都留着', !!(r.cfg.edits.items.pA && r.cfg.edits.items.pB), JSON.stringify(Object.keys(r.cfg.edits.items)));
  check('并发没有弄丢 e1', r.cfg.edits.items.e1 && r.cfg.edits.items.e1.name === '甲改');

  // 9. 个人战绩：追加并集 + 删除墓碑穿透（mergeRecords）
  console.log('\n【9】个人战绩');
  r = await post({ v: 1, records: { list: [
    { id: 'r1', at: 100, key: 'k1', name: '甲', rank: 1 },
    { id: 'r2', at: 110, key: 'k1', name: '甲', rank: 4 }
  ], del: {} } });
  check('两笔都进云端', r.cfg.records.list.length === 2, JSON.stringify(r.cfg.records));
  // B 机只带了自己的一笔 → 并集，不能把 A 机的盖掉
  r = await post({ v: 1, records: { list: [{ id: 'r3', at: 120, key: 'k2', name: '乙', rank: 8 }], del: {} } });
  check('B 机写入后三笔都在', r.cfg.records.list.length === 3, JSON.stringify(r.cfg.records.list.map((x) => x.id)));
  // A 机删掉 r2 → 墓碑，r2 从 list 消失但 r1/r3 不动
  r = await post({ v: 1, records: { list: [], del: { r2: 999 } } });
  check('删除穿透', r.cfg.records.list.length === 2 && !r.cfg.records.list.some((x) => x.id === 'r2'), JSON.stringify(r.cfg.records.list.map((x) => x.id)));
  check('墓碑留在云端', r.cfg.records.del && r.cfg.records.del.r2 === 999, JSON.stringify(r.cfg.records.del));
  // 不带 records 的写入（只同步主题）绝不能清战绩
  r = await post({ v: 1, theme: 'dark' });
  check('不带 records 的写入不清战绩', r.cfg.records.list.length === 2, JSON.stringify(r.cfg.records));
  // 并发各记一笔
  await Promise.all([
    post({ v: 1, records: { list: [{ id: 'cA', at: 1, name: 'A', rank: 2 }], del: {} } }),
    post({ v: 1, records: { list: [{ id: 'cB', at: 1, name: 'B', rank: 3 }], del: {} } })
  ]);
  r = await get();
  check('并发各记一笔都留着', r.cfg.records.list.some((x) => x.id === 'cA') && r.cfg.records.list.some((x) => x.id === 'cB'), JSON.stringify(r.cfg.records.list.map((x) => x.id)));

  console.log('\n══ 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ══');
  cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); cleanup(); process.exit(1); });
