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
 *   POST /api/capture  → 截屏 + Windows OCR，返回 {ok, rank, text}（战绩本识别名次）
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
      const a = Number(src.at || 0);
      // ⚠️ 必须取「最大」而不是「先扫到的那个」。at 是整组级别的编辑时间：
      // 如果先扫到的是那份旧副本（at 早于删除时刻），而它恰好还残留着这个 key，
      // 就会判定 del>=addAt 生效、把用户刚重新收藏的那套又删掉 —— 表现就是
      // 删过一套再点星标收藏它，怎么点都存不进去。
      if (!addAt[key] || a > addAt[key]) addAt[key] = a;
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

  const out = { keys: kept.slice(0, 1000), last: last, at: atOut, rev: rev };
  if (Object.keys(delMap).length) out.del = delMap;
  return out;
}

// 阵容编辑按套合并。rev 大的那份赢；rev 相同才用 at 兜底。
// cleared 墓碑也留着，这样「恢复官方」能穿透到别的电脑。
function mergeEdits(disk, incoming) {
  if (!disk && !incoming) return null;
  const dItems = (disk && disk.items) || {};
  const iItems = (incoming && incoming.items) || {};
  const seen = {};
  const items = {};
  function take(k) {
    if (!k || seen[k]) return;
    seen[k] = 1;
    const a = dItems[k];
    const b = iItems[k];
    let pick = a || b;
    if (a && b) {
      const ar = Number(a.rev || 0);
      const br = Number(b.rev || 0);
      if (br > ar) pick = b;
      else if (ar > br) pick = a;
      else pick = Number(b.at || 0) >= Number(a.at || 0) ? b : a;
    }
    if (pick) items[k] = pick;
  }
  Object.keys(dItems).forEach(take);
  Object.keys(iItems).forEach(take);
  return { items: items };
}

function mergeCfg(disk, incoming) {
  const out = Object.assign({}, disk || {}, incoming || {});
  out.v = 1;
  out.updatedAt = new Date().toISOString();
  const merged = mergeUsing((disk && disk.using) || null, (incoming && incoming.using) || null);
  if (merged) out.using = merged;
  const edits = mergeEdits(disk && disk.edits, incoming && incoming.edits);
  if (edits) out.edits = edits;
  const recs = mergeRecords(disk && disk.records, incoming && incoming.records);
  if (recs) out.records = recs;
  if (disk && disk.hudSize && incoming && incoming.hudSize) {
    out.hudSize = Object.assign({}, disk.hudSize, incoming.hudSize);
  }
  return out;
}

// 个人战绩合并：记完不改的追加流水，按 id 并集；删除走 del 墓碑穿透。
// 战绩没有「同 id 重加」的场景，墓碑永续，不会出现 using 那类复活问题。
function mergeRecords(disk, incoming) {
  if (!disk && !incoming) return null;
  if (!incoming) return disk || null;
  const iList = Array.isArray(incoming.list) ? incoming.list : [];
  const iDel = (incoming.del && typeof incoming.del === 'object') ? incoming.del : {};
  if (!iList.length && !Object.keys(iDel).length) return disk || null;
  const d = (disk && typeof disk === 'object') ? disk : {};
  const dList = Array.isArray(d.list) ? d.list : [];
  const dDel = (d.del && typeof d.del === 'object') ? d.del : {};
  const byId = Object.create(null);
  dList.forEach((r) => { if (r && r.id) byId[r.id] = r; });
  iList.forEach((r) => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
  const delMap = Object.create(null);
  Object.keys(dDel).forEach((k) => { delMap[k] = Number(dDel[k] || 0); });
  Object.keys(iDel).forEach((k) => {
    const t = Number(iDel[k] || 0);
    if (!delMap[k] || t > delMap[k]) delMap[k] = t;
  });
  const list = [];
  dList.concat(iList).forEach((r) => {
    if (!r || !r.id || delMap[r.id]) return;
    const cur = byId[r.id];
    if (list.indexOf(cur) < 0) list.push(cur);
  });
  return { v: 1, list: list.slice(-2000), del: delMap };
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

/* ---------- 截屏识别（战绩本用） ---------- */
// Windows 自带 OCR（Windows.Media.Ocr，WinRT），不需要任何第三方依赖。
// PowerShell 负责截屏 + OCR，把识别文本写到临时文件；Node 只负责拉起、
// 读结果、从文本里抠名次。语言包优先 zh*，没有再用 en-US（读数字够用），
// 都没有才算失败（提示用户去系统设置加语言）。
const PS_CAPTURE = `
$ErrorActionPreference = 'Stop'
function Await($WinRtTask, $ResultType) {
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]

  # 1) OCR 引擎：优先 zh*（认中文名），退 en-US（读数字够用），再退系统首个
  $eng = $null
  $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
  foreach ($l in $langs) {
    if ($l.LanguageTag.ToLower().StartsWith('zh')) {
      $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($l)
      if ($eng) { break }
    }
  }
  if (-not $eng) {
    try { $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language('en-US'))) } catch {}
  }
  if (-not $eng -and $langs.Count -gt 0) { $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($langs[0]) }
  if (-not $eng) { Write-Output 'ERR no-ocr-language'; exit }

  # 2) 截全屏（虚拟屏幕含多显示器）进内存 PNG
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $ms.Position = 0

  # 3) 解码成 SoftwareBitmap 再喂 OCR。
  #    三个实测过的坑（2026-10-06）：
  #    a) $ms.AsRandomAccessStream() 实例语法 PS 解析不了 → 必须静态调
  #       [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)；
  #    b) New-Object 出来的 InMemoryRandomAccessStream 传不进 RecognizeAsync
  #       （MethodArgumentConversionInvalidCastArgument）；
  #    c) StorageFile.OpenReadAsync 返回的是接口类型，投影成 System.__ComObject，
  #       只能匹配到 RecognizeAsync(SoftwareBitmap) 重载再炸一次 —— 所以必须
  #       走 BitmapDecoder → GetSoftwareBitmapAsync（密封类，投影正常）。
  $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $sbmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($eng.RecognizeAsync($sbmp)) ([Windows.Media.Ocr.OcrResult])

  # 4) 结果写临时文本，Node 来读
  $out = Join-Path $env:TEMP ('wxq-capture-' + $PID + '.txt')
  [System.IO.File]::WriteAllText($out, $res.Text, [System.Text.Encoding]::UTF8)
  Write-Output ('OK ' + $out)
} catch {
  Write-Output ('ERR ' + ($_.Exception.Message -replace '\\r?\\n', ' '))
}
`;

function parseRank(text) {
  // 结算页的名次无非几种写法：第2名 / 2名 / 2/8 / 2 /8 / Rank 2。
  // OCR 可能插空格或把中文认错，所以规则要松，但绝不能把「8强」「季后赛」里的
  // 数字当名次 —— 只认独立出现的 1-8。
  const t = String(text || '').replace(/\s+/g, ' ');
  const m1 = t.match(/第\s*([1-8])\s*名/);
  if (m1) return Number(m1[1]);
  const m2 = t.match(/\b([1-8])\s*名/);
  if (m2) return Number(m2[1]);
  const m3 = t.match(/\b([1-8])\s*\/\s*(8|十九|18|八)\b/);
  if (m3) return Number(m3[1]);
  const m4 = t.match(/(?:名次|排名|place|rank)[^0-9]{0,6}([1-8])\b/i);
  if (m4) return Number(m4[1]);
  // 独立一行只有一位数字 1-8（OCR 大字名次常见）
  const lines = String(text || '').split(/\r?\n/);
  for (const ln of lines) {
    const s = ln.trim();
    if (/^[1-8]$/.test(s)) return Number(s);
  }
  return 0;
}

function runCapture(cb) {
  if (process.platform !== 'win32') { cb({ ok: false, err: '截屏识别目前只支持 Windows' }); return; }
  const { spawn } = require('child_process');
  const b64 = Buffer.from(PS_CAPTURE, 'utf16le').toString('base64');
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64], { windowsHide: true });
  let out = '';
  const timer = setTimeout(function () {
    try { ps.kill(); } catch (e) {}
    cb({ ok: false, err: '截屏超时（游戏是否在前台？）' });
  }, 20000);
  ps.stdout.on('data', (d) => { out += d.toString(); });
  ps.stderr.on('data', () => {});
  ps.on('close', function () {
    clearTimeout(timer);
    const line = (out.split(/\r?\n/).find((l) => /^(OK|ERR) /i.test(l)) || '').trim();
    if (/^ERR/i.test(line)) { cb({ ok: false, err: line.replace(/^ERR\s*/i, '') || '识别失败' }); return; }
    const file = line.replace(/^OK\s*/i, '').trim();
    if (!file) { cb({ ok: false, err: '识别脚本没有返回结果' }); return; }
    let text = '';
    try { text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch (e) {}   // PS WriteAllText 带 BOM
    try { fs.unlinkSync(file); } catch (e) {}
    cb({ ok: true, rank: parseRank(text), text: String(text || '').slice(0, 600) });
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

    if (urlPath === '/api/capture') {
      if (req.method !== 'POST') { json(res, 405, { ok: false, err: 'method' }); return; }
      readBody(req).then(function () {
        runCapture(function (r) { json(res, 200, r); });
      });
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

if (require.main === module) main();
// 供回归测试直接调用（test-wxq-sync.js / parseRank 用例）
module.exports = { mergeUsing, mergeEdits, mergeRecords, parseRank };
