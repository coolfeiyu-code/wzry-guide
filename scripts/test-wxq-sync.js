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

  // 5. 上限 8 套
  console.log('\n【5】上限 8 套');
  r = await post(S(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], Date.now() + 9000));
  check('截断到 8 套', r.cfg.using.keys.length === 8, '实际 ' + r.cfg.using.keys.length);

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

  console.log('\n══ 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ══');
  cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); cleanup(); process.exit(1); });
