#!/usr/bin/env node
/**
 * 把万象棋页打成单文件，写到坚果云根目录：王者助手.html
 * 图片仍走 GitHub Pages（需要能上网）。配置在旁边的 王者助手.json.js，发布时不覆盖。
 *
 *   node scripts/publish-wxq-helper.js
 *   NUTSTORE_ROOT=D:\坚果云 node scripts/publish-wxq-helper.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME = process.env.USERPROFILE || process.env.HOME || '';
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

function build() {
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
  return html;
}

function main() {
  const destDir = nutstoreRoot();
  if (!destDir) {
    console.error('找不到坚果云根目录。请设置环境变量 NUTSTORE_ROOT');
    process.exit(1);
  }
  const htmlPath = path.join(destDir, '王者助手.html');
  const jsPath = path.join(destDir, '王者助手.json.js');
  fs.writeFileSync(htmlPath, build(), 'utf8');
  if (!exists(jsPath)) {
    fs.writeFileSync(jsPath, 'window.WXQ_CLOUD_BOOT = {"v":1,"using":{"keys":[],"last":""}};\n', 'utf8');
    console.log('新建', jsPath);
  } else {
    console.log('保留已有配置', jsPath);
  }
  const kb = Math.round(fs.statSync(htmlPath).size / 1024);
  console.log('已写入', htmlPath, kb + 'KB');
}

main();
