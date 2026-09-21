#!/usr/bin/env node
/**
 * 把万象棋页打成单文件，写到坚果云「王者万象棋助手」文件夹：王者助手.html
 * 图片优先用同目录 wxq-icon（离线也有图），缺的再走 GitHub Pages。配置在旁边的
 * 王者助手.json.js，发布时不覆盖。
 *
 *   node scripts/publish-wxq-helper.js
 *   NUTSTORE_ROOT=D:\坚果云 node scripts/publish-wxq-helper.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const HELPER_DIR = '王者万象棋助手';
const HELPER_FILE = '王者助手.html';
const BOOT_FILE = '王者助手.json.js';
const SCRIPTS = [
  'wanxiangqi-data.js',
  'wanxiangqi-lineups.js',
  'wanxiangqi-stats.js',
  'wanxiangqi-jobs.js',
  'wanxiangqi-rules.js',
  'wanxiangqi-explain.js',
  'wanxiangqi-cloud.js',
  'wanxiangqi-hud.js'
];

function exists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }

function nutstoreRoot() {
  if (process.env.NUTSTORE_ROOT) return process.env.NUTSTORE_ROOT;
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
    // 两边都可能自定义
    path.join(HOME, 'Documents', '坚果云'),
    path.join(HOME, 'Documents', 'Nutstore')
  ];
  for (let i = 0; i < hits.length; i++) if (exists(hits[i])) return hits[i];
  return '';
}

function inlineJs(name) {
  const raw = fs.readFileSync(path.join(ROOT, name), 'utf8');
  return raw.replace(/<\/script/gi, '<\\/script');
}

/*
 * 注意：不能加 <base href="...">。页面里所有资源（wxq-icon 图标、王者助手.json.js
 * 配置）都是相对路径，用 file:// 打开时要解析到坚果云这份文件旁边。加了 <base>
 * 会把配置脚本指到网上去，本机配置永远读不到，还会把云端配置覆盖掉。
 */
function build(ver, today) {
  let html = fs.readFileSync(path.join(ROOT, 'wanxiangqi.html'), 'utf8');
  html = html.replace(/<title>[^<]*<\/title>/, '<title>王者助手</title>');
  html = html.replace('<link rel="manifest" href="manifest.json">', '');
  html = html.replace(/\n<base href="[^"]*">/g, '');
  html = html.replace(
    /<script src="wanxiangqi-[^"]+"><\/script>\s*/g,
    ''
  );
  // 配置脚本放最前面：页面任何脚本跑之前，window.WXQ_CLOUD_BOOT 就已经有了。
  const boot = '<script src="./' + BOOT_FILE + '"></script>\n';
  const bootHint = '<script>window.WXQ_CLOUD_BOOT=window.WXQ_CLOUD_BOOT||{v:1,using:{keys:[],last:""}};</script>\n';
  const blobs = SCRIPTS.map(function (name) {
    return '<script>\n' + inlineJs(name) + '\n</script>';
  }).join('\n');
  html = html.replace(/<script>\r?\n  \(function\(\)\{/, boot + bootHint + blobs + '\n<script>\n  (function(){');
  html = html.replace('卡面与数值均来自官方公开数据；阵容码可导入游戏。',
    '卡面与数值均来自官方公开数据；阵容码可导入游戏。助手版本 <b>v' + ver + '</b> · 发布 <b>' + today + '</b>。');
  return html;
}

// 直接整目录复制图标：去掉 <base> 后所有 wxq-icon/... 都是本地相对路径，
// 复制全量才能保证离线、断网、各台显示一致（总计约 11MB）。
function copyIcons(destDir) {
  const iconRoot = path.join(ROOT, 'wxq-icon');
  const destRoot = path.join(destDir, 'wxq-icon');
  let files = 0;
  let bytes = 0;
  if (!exists(iconRoot)) return { files: 0, bytes: 0 };
  fs.readdirSync(iconRoot).forEach(function (dir) {
    const srcDir = path.join(iconRoot, dir);
    if (!fs.statSync(srcDir).isDirectory()) return;
    fs.readdirSync(srcDir).forEach(function (f) {
      const src = path.join(srcDir, f);
      if (!fs.statSync(src).isFile()) return;
      const dst = path.join(destRoot, dir, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const buf = fs.readFileSync(src);
      fs.writeFileSync(dst, buf);
      files++;
      bytes += buf.length;
    });
  });
  return { files, bytes };
}

// 把「本机同步桥 + 安装脚本」也放到坚果云文件夹里，Windows / macOS 各一份：
// 别的电脑拿到这个文件夹后，双击对应的安装文件就能静默同步，不用再点授权。
function copyBridge(destDir) {
  const files = [
    ['scripts/wxq-cloud-bridge.js', '同步桥.js'],
    ['scripts/install-wxq-bridge.js', '安装同步桥.js']
  ];
  let n = 0;
  files.forEach(function (pair) {
    const src = path.join(ROOT, pair[0]);
    if (!exists(src)) return;
    fs.copyFileSync(src, path.join(destDir, pair[1]));
    n++;
  });
  // Windows：双击 .cmd
  const cmd = [
    '@echo off',
    'setlocal',
    'set NODE=%NODE%',
    'if "%NODE%"=="" set NODE=node',
    '"%NODE%" "%~dp0\\安装同步桥.js"',
    'if errorlevel 1 (',
    '  echo.',
    '  echo 没找到 node。请先装 Node.js，或把下面这行里的路径改成你的 node.exe 再双击本文件：',
    '  echo   "C:\\Program Files\\nodejs\\node.exe" "%~dp0\\安装同步桥.js"',
    ')',
    'echo.',
    'pause',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(destDir, '安装同步桥.cmd'), cmd, 'utf8');
  n++;

  // macOS：双击 .command（Finder 里双击会在终端跑）
  const sh = [
    '#!/bin/bash',
    '# macOS：双击本文件即可安装同步桥自启（首次可能要在「系统设置 → 隐私与安全性」放行）',
    'cd "$(dirname "$0")" || exit 1',
    'NODE="$(command -v node || echo /usr/local/bin/node)"',
    'if [ ! -x "$NODE" ]; then',
    '  echo "没找到 node。请先安装 Node.js（https://nodejs.org 或 brew install node）"',
    '  read -n 1 -s -r -p "按任意键关闭…"',
    '  exit 1',
    'fi',
    '"$NODE" "./安装同步桥.js"',
    'echo',
    'read -n 1 -s -r -p "按任意键关闭…"',
    ''
  ].join('\n');
  const shPath = path.join(destDir, '安装同步桥-macOS.command');
  fs.writeFileSync(shPath, sh, 'utf8');
  try { fs.chmodSync(shPath, 0o755); } catch (e) {}
  n++;

  // 卸载开机自启：Windows 双击 .cmd、macOS 双击 .command，都调 安装同步桥.js --remove
  const unCmd = [
    '@echo off',
    'setlocal',
    'set NODE=%NODE%',
    'if "%NODE%"=="" set NODE=node',
    '"%NODE%" "%~dp0\安装同步桥.js" --remove',
    'if errorlevel 1 (',
    '  echo.',
    '  echo 没找到 node 或卸载失败。请先装 Node.js，或把下面这行改成你的 node.exe 再跑：',
    '  echo   "C:\Program Files\nodejs\node.exe" "%~dp0\安装同步桥.js" --remove',
    ')',
    'echo.',
    'pause',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(destDir, '卸载同步桥.cmd'), unCmd, 'utf8');
  n++;

  const unSh = [
    '#!/bin/bash',
    '# macOS：双击本文件即可卸载同步桥的开机自启（不会删共享文件夹里的其它文件）',
    'cd "$(dirname "$0")" || exit 1',
    'NODE="$(command -v node || echo /usr/local/bin/node)"',
    '"$NODE" "./安装同步桥.js" --remove',
    'echo',
    'read -n 1 -s -r -p "按任意键关闭…"',
    ''
  ].join('\n');
  const unShPath = path.join(destDir, '卸载同步桥-macOS.command');
  fs.writeFileSync(unShPath, unSh, 'utf8');
  try { fs.chmodSync(unShPath, 0o755); } catch (e) {}
  n++;
  return n;
}

function metaVersion() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'wanxiangqi-data.js'), 'utf8');
    const m = src.match(/"version"\s*:\s*"([^"]+)"/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

function main() {
  const root = nutstoreRoot();
  if (!root) {
    console.error('找不到坚果云根目录。请设置环境变量 NUTSTORE_ROOT');
    process.exit(1);
  }
  const destDir = path.join(root, HELPER_DIR);
  fs.mkdirSync(destDir, { recursive: true });
  const ver = metaVersion();
  const today = new Date().toISOString().slice(0, 10);
  const htmlPath = path.join(destDir, HELPER_FILE);
  const jsPath = path.join(destDir, BOOT_FILE);
  fs.writeFileSync(htmlPath, build(ver, today), 'utf8');
  if (!exists(jsPath)) {
    fs.writeFileSync(jsPath, 'window.WXQ_CLOUD_BOOT = {"v":1,"using":{"keys":[],"last":""}};\n', 'utf8');
    console.log('新建', jsPath);
  } else {
    console.log('保留已有配置', jsPath);
  }
  const kb = Math.round(fs.statSync(htmlPath).size / 1024);
  console.log('已写入', htmlPath, kb + 'KB');
  try {
    const pack = copyIcons(destDir);
    console.log('离线图标', pack.files + ' 个', Math.round(pack.bytes / 1024) + 'KB', '→ wxq-icon/');
  } catch (e) { console.error('图标复制失败', e.message); }
  try {
    const n = copyBridge(destDir);
    console.log('同步桥文件', n, '个 → 装：安装同步桥.cmd（Win）/ 安装同步桥-macOS.command；卸：卸载同步桥.cmd（Win）/ 卸载同步桥-macOS.command；桥本体 同步桥.js + 安装同步桥.js');
  } catch (e) { console.error('同步桥复制失败', e.message); }
}

main();
