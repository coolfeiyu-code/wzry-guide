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

function nutstoreRoot() {
  const cfgHits = [
    path.join(HOME, 'AppData', 'Roaming', 'Nutstore', 'config', 'UsersMap.json'),
    path.join(HOME, 'AppData', 'Roaming', 'Nutstore', 'config', 'UsersMap-ng.json')
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
    path.join(HOME, 'Nutstore', '1', '我的坚果云'),
    path.join(HOME, '坚果云'),
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

function unionKeys(a, b) {
  const seen = Object.create(null);
  const out = [];
  [a, b].forEach(function (arr) {
    (arr || []).forEach(function (k) {
      k = String(k || '');
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(k);
    });
  });
  return out.slice(0, 8);
}

// 后写的那台不能把另一台的收藏冲掉：收藏取并集，屏幕尺寸按分辨率分桶合并。
function mergeCfg(disk, incoming) {
  const out = Object.assign({}, disk || {}, incoming || {});
  out.v = 1;
  out.updatedAt = new Date().toISOString();
  const disks = (disk && disk.using) || {};
  const inc = (incoming && incoming.using) || {};
  if ((disks.keys && disks.keys.length) || (inc.keys && inc.keys.length)) {
    const keys = unionKeys(disks.keys, inc.keys);
    let last = String(inc.last || '');
    if (keys.indexOf(last) < 0) last = String(disks.last || '');
    if (keys.indexOf(last) < 0) last = keys[keys.length - 1] || '';
    out.using = { keys: keys, last: last };
  }
  if (disk && disk.hudSize && incoming && incoming.hudSize) {
    out.hudSize = Object.assign({}, disk.hudSize, incoming.hudSize);
  }
  return out;
}

function writeCfg(dir, cfg) {
  const target = path.join(dir, CONFIG_FILE);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, 'window.WXQ_CLOUD_BOOT = ' + JSON.stringify(cfg) + ';\n', 'utf8');
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
    console.error('找不到坚果云目录，请设置 WXQ_BRIDGE_ROOT');
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
            const merged = mergeCfg(readCfg(dir), incoming);
            writeCfg(dir, merged);
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
