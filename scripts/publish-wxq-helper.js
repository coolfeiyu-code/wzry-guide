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
const BASE = 'https://coolfeiyu-code.github.io/wzry-guide/';
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

function inlineJs(name) {
  const raw = fs.readFileSync(path.join(ROOT, name), 'utf8');
  return raw.replace(/<\/script/gi, '<\\/script');
}

function build(ver, today) {
  let html = fs.readFileSync(path.join(ROOT, 'wanxiangqi.html'), 'utf8');
  html = html.replace(/<title>[^<]*<\/title>/, '<title>王者助手</title>');
  html = html.replace('<link rel="manifest" href="manifest.json">', '');
  html = html.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8">\n<base href="' + BASE + '">'
  );
  html = html.replace(
    /<script src="wanxiangqi-[^"]+"><\/script>\s*/g,
    ''
  );
  const boot = '<script src="王者助手.json.js"></script>\n';
  const blobs = SCRIPTS.map(function (name) {
    return '<script>\n' + inlineJs(name) + '\n</script>';
  }).join('\n');
  html = html.replace(/<script>\r?\n  \(function\(\)\{/, boot + blobs + '\n<script>\n  (function(){');
  html = html.replace('卡面与数值均来自官方公开数据；阵容码可导入游戏。',
    '卡面与数值均来自官方公开数据；阵容码可导入游戏。助手版本 <b>v' + ver + '</b> · 发布 <b>' + today + '</b>。');
  return html;
}

function collectUsedNames() {
  const vm = require('vm');
  function loadWindow(file) {
    const src = fs.readFileSync(file, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.window;
  }
  const names = Object.create(null);
  function add(name, dir) {
    if (name) names[name + '|' + dir] = 1;
  }
  const W = loadWindow(path.join(ROOT, 'wanxiangqi-data.js'));
  const J = loadWindow(path.join(ROOT, 'wanxiangqi-lineups.js'));
  (J.WXQ_JOBS.list || []).forEach(function (L) {
    (L.heroes || []).forEach(function (h) {
      add(h.name, 'heroes');
      (h.eqs || []).forEach(function (e) { add(e, 'equips'); });
    });
    (L.lords || []).forEach(function (n) { add(n, 'players'); });
  });
  let S = null;
  try { S = loadWindow(path.join(ROOT, 'wanxiangqi-stats.js')); } catch (e) {}
  ((S && S.WXQ_STATS && S.WXQ_STATS.list) || []).forEach(function (L) {
    (L.heroes || []).forEach(function (h) {
      add(h.name, 'heroes');
      (h.eqs || []).forEach(function (e) { add(e, 'equips'); });
    });
    (L.lords || []).forEach(function (n) { add(n, 'players'); });
  });
  return names;
}

function copyIcons(destDir) {
  const used = collectUsedNames();
  const iconRoot = path.join(ROOT, 'wxq-icon');
  const destRoot = path.join(destDir, 'wxq-icon');
  let files = 0;
  let bytes = 0;
  const jobs = [
    { dir: 'heroes', suffix: '.png' },
    { dir: 'equips', suffix: '.png' },
    { dir: 'players', suffix: '_icon.png' }
  ];
  jobs.forEach(function (job) {
    const srcDir = path.join(iconRoot, job.dir);
    if (!exists(srcDir)) return;
    fs.readdirSync(srcDir).forEach(function (f) {
      let key = f;
      if (job.dir === 'players' && /_icon\.png$/.test(f)) key = f.replace(/_icon\.png$/, '');
      else if (/\.png$/.test(f)) key = f.replace(/\.png$/, '');
      else return;
      if (!used[key + '|' + job.dir] && !(job.dir === 'players' && used[key + '|players'])) return;
      const src = path.join(srcDir, f);
      const dst = path.join(destRoot, job.dir, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const buf = fs.readFileSync(src);
      fs.writeFileSync(dst, buf);
      files++;
      bytes += buf.length;
    });
  });
  return { files, bytes };
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
  const htmlPath = path.join(destDir, '王者助手.html');
  const jsPath = path.join(destDir, '王者助手.json.js');
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
}

main();
