#!/usr/bin/env node
/**
 * 给这台电脑装「王者助手同步桥」的开机自启。
 * 装完之后：开机自动在后台跑桥，页面读写配置全静默，不会再弹授权确认。
 *
 *   node scripts/install-wxq-bridge.js            安装
 *   node scripts/install-wxq-bridge.js --remove   卸载
 *
 * 桥脚本会复制到 %LOCALAPPDATA%\王者助手同步桥\，所以仓库改名、移动都不影响自启。
 * 之后再升级桥，重新跑一次本脚本即可覆盖。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REMOVE = process.argv.indexOf('--remove') >= 0;
const NAME = '王者助手同步桥.vbs';
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'scripts', 'wxq-cloud-bridge.js');

// 自启要用长期存在的 node。agent 自带的 node 在版本目录里，升级后路径就没了，
// 所以优先选系统安装的 node，找不到才退回当前进程。
function pickNode() {
  if (process.env.WXQ_NODE) return process.env.WXQ_NODE;
  const cands = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    process.execPath
  ];
  for (let i = 0; i < cands.length; i++) {
    try { if (cands[i] && fs.existsSync(cands[i])) return cands[i]; } catch (e) {}
  }
  return process.execPath;
}
const NODE = pickNode();

// 稳定安装目录：不随仓库位置变化
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), '王者助手同步桥');
const INSTALLED = path.join(INSTALL_DIR, '同步桥.js');

function startupDir() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

// VBScript 字符串里的引号要写成两个，拼出来的命令行才是 "node" "script"
function vbsText() {
  const cmd = '"' + NODE + '" "' + INSTALLED + '"';
  const quoted = cmd.replace(/"/g, '""');
  return 'Set sh = CreateObject("WScript.Shell")\r\n'
    + 'sh.Run "' + quoted + '", 0, False\r\n';
}

function main() {
  const startup = startupDir();
  const link = path.join(startup, NAME);

  if (REMOVE) {
    let n = 0;
    if (fs.existsSync(link)) { fs.unlinkSync(link); n++; console.log('已移除开机自启:', link); }
    if (fs.existsSync(INSTALL_DIR)) { fs.rmSync(INSTALL_DIR, { recursive: true, force: true }); n++; console.log('已删除安装目录:', INSTALL_DIR); }
    if (!n) console.log('本来就没装。');
    return;
  }

  if (!fs.existsSync(SRC)) {
    console.error('找不到同步桥脚本:', SRC);
    process.exit(1);
  }
  if (!fs.existsSync(startup)) {
    console.error('找不到启动文件夹:', startup);
    process.exit(1);
  }

  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.copyFileSync(SRC, INSTALLED);
  fs.writeFileSync(link, vbsText(), 'utf8');

  console.log('已安装开机自启');
  console.log('  桥副本:', INSTALLED);
  console.log('  自启项:', link);
  console.log('  node  :', NODE);
  console.log('');
  console.log('现在立刻启动一次（不用重启）:');
  const { spawn } = require('child_process');
  const child = spawn(NODE, [INSTALLED], { detached: true, stdio: 'ignore' });
  child.unref();
  console.log('  已后台启动，稍等 2 秒可打开 http://127.0.0.1:17871/ 检查');
}

main();
