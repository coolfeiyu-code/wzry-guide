#!/usr/bin/env node
/**
 * 给这台电脑装「王者助手同步桥」的开机自启（Windows / macOS 通用）。
 * 装完之后：开机自动在后台跑桥，页面读写配置全静默，不会再弹授权确认。
 *
 *   node scripts/install-wxq-bridge.js            安装（并立刻启动）
 *   node scripts/install-wxq-bridge.js --remove   卸载
 *
 * 桥脚本会复制到用户目录下的稳定位置，所以仓库改名、移动都不影响自启：
 *   Windows  %LOCALAPPDATA%\王者助手同步桥\同步桥.js  + 启动文件夹里的 VBS
 *   macOS    ~/Library/Application Support/王者助手同步桥/同步桥.js + LaunchAgent plist
 *
 * 之后再升级桥，重新跑一次本脚本即可覆盖。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REMOVE = process.argv.indexOf('--remove') >= 0;
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'scripts', 'wxq-cloud-bridge.js');
const HOME = os.homedir();

const APP_NAME = '王者助手同步桥';
const LABEL = 'com.wangzhe.helper.bridge';
// node 要在开机后长期可用：优先系统安装的，agent 自带 node 在版本目录里，升级后路径会消失
function pickNode() {
  if (process.env.WXQ_NODE) return process.env.WXQ_NODE;
  const cands = IS_WIN
    ? [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')
    ]
    : [
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
      '/usr/bin/node'
    ];
  for (let i = 0; i < cands.length; i++) {
    try { if (cands[i] && fs.existsSync(cands[i])) return cands[i]; } catch (e) {}
  }
  return process.execPath;
}
const NODE = pickNode();

function paths() {
  if (IS_WIN) {
    const dir = path.join(process.env.LOCALAPPDATA || HOME, APP_NAME);
    return {
      dir: dir,
      script: path.join(dir, '同步桥.js'),
      entry: path.join(HOME, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', APP_NAME + '.vbs')
    };
  }
  if (IS_MAC) {
    const dir = path.join(HOME, 'Library', 'Application Support', APP_NAME);
    return {
      dir: dir,
      script: path.join(dir, '同步桥.js'),
      entry: path.join(HOME, 'Library', 'LaunchAgents', LABEL + '.plist')
    };
  }
  // 其它 unix：只复制脚本，自启让用户自己接（不猜 init 系统）
  return {
    dir: path.join(HOME, '.' + APP_NAME),
    script: path.join(HOME, '.' + APP_NAME, 'sync-bridge.js'),
    entry: ''
  };
}

// VBScript 字符串里的引号要写成两个，拼出来的命令行才是 "node" "script"
function vbsText() {
  const P = paths();
  const cmd = '"' + NODE + '" "' + P.script + '"';
  return 'Set sh = CreateObject("WScript.Shell")\r\n'
    + 'sh.Run "' + cmd.replace(/"/g, '""') + '", 0, False\r\n';
}

function plistText() {
  const P = paths();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><dict>\n'
    + '  <key>Label</key><string>' + LABEL + '</string>\n'
    + '  <key>ProgramArguments</key><array>\n'
    + '    <string>' + esc(NODE) + '</string>\n'
    + '    <string>' + esc(P.script) + '</string>\n'
    + '  </array>\n'
    + '  <key>RunAtLoad</key><true/>\n'
    + '  <key>KeepAlive</key><false/>\n'
    + '  <key>StandardOutPath</key><string>' + esc(path.join(P.dir, 'bridge.log')) + '</string>\n'
    + '  <key>StandardErrorPath</key><string>' + esc(path.join(P.dir, 'bridge.err.log')) + '</string>\n'
    + '</dict></plist>\n';
}

function unloadMac() {
  if (!IS_MAC) return;
  try {
    spawn('launchctl', ['unload', paths().entry], { stdio: 'ignore', detached: true }).unref();
  } catch (e) {}
}

function loadMac() {
  if (!IS_MAC) return;
  try {
    spawn('launchctl', ['load', '-w', paths().entry], { stdio: 'ignore', detached: true }).unref();
  } catch (e) {}
}

function main() {
  const P = paths();

  if (REMOVE) {
    let n = 0;
    if (IS_MAC) unloadMac();
    if (P.entry && fs.existsSync(P.entry)) { fs.unlinkSync(P.entry); n++; console.log('已移除自启项:', P.entry); }
    if (fs.existsSync(P.dir)) { fs.rmSync(P.dir, { recursive: true, force: true }); n++; console.log('已删除安装目录:', P.dir); }
    if (!n) console.log('本来就没装。');
    return;
  }

  if (!fs.existsSync(SRC)) {
    console.error('找不到同步桥脚本:', SRC);
    process.exit(1);
  }

  fs.mkdirSync(P.dir, { recursive: true });
  fs.copyFileSync(SRC, P.script);

  if (IS_WIN) {
    const startup = path.dirname(P.entry);
    if (!fs.existsSync(startup)) {
      console.error('找不到启动文件夹:', startup);
      process.exit(1);
    }
    fs.writeFileSync(P.entry, vbsText(), 'utf8');
  } else if (IS_MAC) {
    fs.mkdirSync(path.dirname(P.entry), { recursive: true });
    unloadMac();
    fs.writeFileSync(P.entry, plistText(), 'utf8');
    loadMac();
  }

  console.log('已安装开机自启');
  console.log('  桥副本:', P.script);
  console.log('  自启项:', P.entry || '(这台系统请自行配置自启)');
  console.log('  node  :', NODE);
  console.log('  系统  :', process.platform);

  // 立刻启动一次，不用重启
  try {
    const child = spawn(NODE, [P.script], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('\n已后台启动，稍等 2 秒可打开 http://127.0.0.1:17871/ 检查');
  } catch (e) {
    console.log('\n手动启动：' + NODE + ' "' + P.script + '"');
  }
}

main();
