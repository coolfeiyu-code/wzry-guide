#!/usr/bin/env node
/**
 * 王者万象棋 · 本机同步桥
 * ----------------------------------------------------------------------------
 * 为什么需要它：浏览器在 file:// 打开的页面上不会记住「写文件夹」的授权，
 * 所以每次打开助手都要再确认一次。这个桥在本机 127.0.0.1 上开一个小服务，
 * 页面改成用 fetch 把配置发过来，由它写进坚果云的 王者助手.json.js。
 * 这样写入不需要任何授权弹窗，全程静默。
 *
 * 它同时也能直接托管助手页面：浏览器打开 http://127.0.0.1:17871/
 * 就是一个正常 http 源，localStorage、图标、配置全部同源，最省事。
 *
 *   node scripts/wxq-cloud-bridge.js
 *   WXQ_BRIDGE_PORT=17871 WXQ_BRIDGE_ROOT=D:\坚果云\王者万象棋助手 node ...
 *
 * 接口：
 *   GET  /api/health   → {ok, dir, file}
 *   GET  /api/cloud    → {ok, cfg}
 *   POST /api/cloud    → 合并写入，返回 {ok, cfg}
 * 其它路径按静态文件返回（王者助手.html、王者助手.json.js、wxq-icon/...）。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.WXQ_BRIDGE_PORT || 17871);
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const HELPER_DIR = '王者万象棋助手';
const CONFIG_FILE = '王者助手.json.js';
const PAGE_FILE = '王者助手.html';
const MAX_BODY = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function exists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }

// 坚果云在不同系统上放配置和同步目录的位置不一样，这里两套都找。
// Windows 走 %APPDATA%\Nutstore\config\UsersMap.json（里面 cachePath 是同步根）；
// macOS 的客户端把同步目录默认放在 ~/Nutstore Files 下，配置在 Application Support。
function nutstoreRoot() {
  const cfgHits = [
    // Windows
    path.join(HOME, 'AppData', 'Roaming', 'Nutstore', 'config', 'UsersMap.json'),
    path.join(HOME, 'AppData', 'Roaming', 'Nutstore', 'config', 'UsersMap-ng.json'),
    // macOS
    path.join(HOME, 'Library', 'Application Support', 'Nutstore', 'config', 'UsersMap.json'),
    path.join(HOME, 'Library', 'Application Support', 'Nutstore', 'config', 'UsersMap-ng.json')
  ];
  for (let i = 0; i < cfgHits.length; i++) {
    try {
      if (!exists(cfgHits[i])) continue;
      const cfg = JSON.parse(fs.readFileSync(cfgHits[i], 'utf8'));
      const users = cfg.users || {};
      const base = cfg.cachePath;
      if (!base) continue;
      const ids = Object.keys(users).map(function (k) { return users[k]; });
      if (!ids.length) ids.push('');
      for (let j = 0; j < ids.length; j++) {
        const cands = [
          path.join(base, String(ids[j]), '我的坚果云'),
          path.join(base, String(ids[j])),
          path.join(base, '我的坚果云')
        ];
        for (let k = 0; k < cands.length; k++) if (exists(cands[k])) return cands[k];
      }
    } catch (e) {}
  }
  const hits = [
    // Windows
    path.join(HOME, 'Nutstore', '1', '我的坚果云'),
    path.join(HOME, '坚果云'),
    // macOS（坚果云 for Mac 默认同步盘）
    path.join(HOME, 'Nutstore Files', '我的坚果云'),
    path.join(HOME, 'Nutstore Files'),
    // 两边都可能自定义到这些地方
    path.join(HOME, 'Documents', '坚果云'),
    path.join(HOME, 'Documents', 'Nutstore')
  ];
  for (let i = 0; i < hits.length; i++) if (exists(hits[i])) return hits[i];
  return '';
}

function helperDir() {
  if (process.env.WXQ_BRIDGE_ROOT) return process.env.WXQ_BRIDGE_ROOT;
  const root = nutstoreRoot();
  return root ? path.join(root, HELPER_DIR) : '';
}

// 页面优先用它在坚果云目录旁边；找不到就退回仓库目录（本地调试用）
function pageDir(dir) {
  if (dir && exists(path.join(dir, PAGE_FILE))) return dir;
  const repo = path.resolve(__dirname, '..');
  if (exists(path.join(repo, 'wanxiangqi.html'))) return repo;
  return dir;
}

function parseCfg(text) {
  const m = String(text || '').match(/window\.WXQ_CLOUD_BOOT\s*=\s*(\{[\s\S]*\});?/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function readCfg(dir) {
  try {
    const txt = fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8');
    return parseCfg(txt) || { v: 1 };
  } catch (e) { return { v: 1 }; }
}

// 在用阵容合并：并集 + 删除墓碑 + 版本号。
//
// 为什么不再用「时间戳后写者胜」：多台电脑时钟必然有偏差（笔记本没校时、手动改过、
// 时区/夏令时），慢的那台一改就被判成「旧数据」直接丢弃 —— 表现为「一会存一会不存」。
// 这里改成 CRDT 思路，冲突不可能丢数据：
//   keys  集合并集（任一端新增都保留）
//   del   删除墓碑（谁删过就记下来；重加时若新增时间更新则穿透，不误删）
//   rev   版本号，同端连续写入递增；rev 相同视为并发，再按 at 兜底
//   at    只决定列表顺序和 last 指针，不再决定整组覆盖
// 旧数据（没有 rev/del 字段）仍能读，首次写入自动补齐。
function mergeUsing(diskUsing, incUsing) {
  const d = diskUsing || null;
  const i = incUsing || null;
  if (!i || !i.keys) return d;              // 本机没带在用阵容，保留云端
  if (!d || !d.keys) return i;              // 云端为空，直接采纳本机

  const dRev = Number(d.rev || 0);
  const iRev = Number(i.rev || 0);
  const dAt = Number(d.at || 0);
  const iAt = Number(i.at || 0);
  // rev 相同说明是并发写入，用 at 兜底决定谁是「较新」
  const dNewer = dRev > iRev || (dRev === iRev && dAt >= iAt);

  const seen = Object.create(null);
  const keys = [];
  // 先按「较新」那端的顺序铺，再补另一端独有的，列表顺序稳定不跳动
  const order = dNewer ? [d, i] : [i, d];
  for (const src of order) {
    for (const k of src.keys || []) {
      const key = String(k);
      if (!key || seen[key]) continue;
      seen[key] = 1;
      keys.push(key);
    }
  }

  // 墓碑并集
  const delMap = Object.create(null);
  const tomb = (src) => {
    const t = src && src.del;
    if (!t || typeof t !== 'object') return;
    for (const k of Object.keys(t)) {
      const at2 = Number(t[k] || 0);
      if (!delMap[k] || at2 > delMap[k]) delMap[k] = at2;
    }
  };
  tomb(d);
  tomb(i);

  // 只有「删除时间 >= 新增时间」的墓碑才生效，否则用户重新加回来的会被误删
  const addAt = Object.create(null);
  for (const src of [d, i]) {
    for (const k of src.keys || []) {
      const key = String(k);
      if (!addAt[key]) addAt[key] = Number(src.at || 0);
    }
  }
  for (const k of Object.keys(delMap)) {
    if (Number(delMap[k]) >= Number(addAt[k] || 0)) delete seen[k];
  }
  const kept = keys.filter((k) => seen[k]);

  const rev = Math.max(dRev, iRev) + 1;
  const atOut = Math.max(dAt, iAt, Date.now());
  let last = String((dNewer ? d : i).last || '');
  if (kept.length && kept.indexOf(last) < 0) last = kept[0];

  const out = { keys: kept.slice(0, 8), last: last, at: atOut, rev: rev };
  if (Object.keys(delMap).length) out.del = delMap;
  return out;
}

function mergeCfg(disk, incoming) {
  const out = Object.assign({}, disk || {}, incoming || {});
  out.v = 1;
  out.updatedAt = new Date().toISOString();
  const merged = mergeUsing((disk && disk.using) || null, (incoming && incoming.using) || null);
  if (merged) out.using = merged;
  if (disk && disk.hudSize && incoming && incoming.hudSize) {
    out.hudSize = Object.assign({}, disk.hudSize, incoming.hudSize);
  }
  return out;
}

// 跨进程文件锁：多台电脑各跑各的桥，没有互斥就会出现
// 「A 读完 → B 写完 → A 再写回」的读-改-写竞态，后写覆盖先写。
// wx 独占创建实现；等 3 秒拿不到就当锁失效继续写，绝不卡死同步。
const LOCK_FILE = '王者助手.json.lock';
const LOCK_WAIT = 3000;

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

function withLock(dir, fn) {
  const lock = path.join(dir, LOCK_FILE);
  const t0 = Date.now();
  let fd = null;
  for (;;) {
    try { fd = fs.openSync(lock, 'wx'); break; }   // wx = 独占创建，失败即已存在
    catch (e) {
      // 锁文件是上次进程崩了留下的残骸，超过 30s 就当过期，删掉重来
      if (Date.now() - t0 > LOCK_WAIT) {
        try {
          const st = fs.statSync(lock);
          if (Date.now() - st.mtimeMs > 30000) { fs.unlinkSync(lock); continue; }
        } catch (e2) {}
        break;   // 等不到锁就继续，不让同步卡死
      }
      sleepSync(40);
    }
  }
  try {
    if (fd != null) {
      try { fs.writeSync(fd, String(process.pid)); } catch (e) {}
      try { fs.closeSync(fd); } catch (e) {}
    }
    return fn();
  } finally {
    if (fd != null) { try { fs.unlinkSync(lock); } catch (e) {} }
  }
}

// 写盘统一走锁；tmp 文件名带 pid，避免多机/多进程互删对方的 tmp
function writeCfg(dir, cfg) {
  const target = path.join(dir, CONFIG_FILE);
  const tmp = target + '.' + process.pid + '.tmp';
  const text = 'window.WXQ_CLOUD_BOOT = ' + JSON.stringify(cfg) + String.fromCharCode(10);
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, target);
  return target;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // file:// 页面访问本机端口时 Chrome 会先发预检；私网访问要显式放行，
  // 否则跨源 POST 会被拦成 Failed to fetch（实测：GET 能过、POST 过不去）。
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(function (resolve) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { resolve(null); }
    });
    req.on('error', function () { resolve(null); });
  });
}

function serveStatic(res, dir, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/' + PAGE_FILE;
  const file = path.resolve(dir, '.' + rel);
  if (!file.startsWith(path.resolve(dir))) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

function main() {
  const dir = helperDir();
  if (!dir) {
    console.error('找不到坚果云目录，请设置环境变量 WXQ_BRIDGE_ROOT 指向「王者万象棋助手」文件夹');
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });

  const server = http.createServer(function (req, res) {
    const url = (req.url || '/').split('#')[0];
    const urlPath = url.split('?')[0];

    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

    if (urlPath === '/api/health') {
      json(res, 200, { ok: true, dir: dir, file: path.join(dir, CONFIG_FILE) });
      return;
    }
    if (urlPath === '/api/cloud') {
      if (req.method === 'GET') {
        json(res, 200, { ok: true, cfg: readCfg(dir) });
        return;
      }
      if (req.method === 'POST') {
        readBody(req).then(function (incoming) {
          if (!incoming) { json(res, 400, { ok: false, err: 'bad body' }); return; }
          try {
            // 整个读-改-写必须在锁内完成，否则两台机器会互相覆盖
            const merged = withLock(dir, function () {
              const m = mergeCfg(readCfg(dir), incoming);
              writeCfg(dir, m);
              return m;
            });
            json(res, 200, { ok: true, cfg: merged });
          } catch (e) {
            json(res, 500, { ok: false, err: String(e.message || e) });
          }
        });
        return;
      }
      json(res, 405, { ok: false, err: 'method' });
      return;
    }

    if (req.method !== 'GET') { json(res, 405, { ok: false, err: 'method' }); return; }
    serveStatic(res, pageDir(dir), urlPath);
  });

  server.on('error', function (e) {
    if (e && e.code === 'EADDRINUSE') {
      console.log('同步桥已在运行（端口 ' + PORT + '）');
      process.exit(0);
    }
    console.error('同步桥启动失败:', e.message);
    process.exit(1);
  });

  server.listen(PORT, '127.0.0.1', function () {
    console.log('同步桥已启动 http://127.0.0.1:' + PORT + '/');
    console.log('配置目录:', dir);
  });
}

main();
