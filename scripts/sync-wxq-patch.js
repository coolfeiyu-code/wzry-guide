#!/usr/bin/env node
/**
 * 王者万象棋 · 平衡补丁同步（wanxiangqi-patch.js 生成器，勿手改产物）
 * ----------------------------------------------------------------------------
 * 为什么有它：官方可编程数据源在版本更新当天是滞后的（2026-09-24 实测，见
 * task.md §5.11），更新公告才是第一手「调整前/调整后」。公告里改了谁的文案，
 * 应该直接反馈到阵容库卡片上 —— 这套阵容的核心被削了，用户扫一眼就该知道。
 *
 * 输入两种（官方公告列表接口至今没打通，newsid 只能人工给）：
 *   node scripts/sync-wxq-patch.js --id <newsid>        # 走 searchNews.php 详情接口
 *   node scripts/sync-wxq-patch.js --file <txt/md路径>  # 贴进本地的公告原文/转录稿
 *
 * 识别公告格式：按空行分块，每块第一行「英雄 名字 / 装备 名字 / 天赋 名字 / 棋手 名字」，
 * 第二行可选「技能 X / 项目 X」，正文行「调整前：…」「调整后：…」；
 * 只有摘要时用「变化：…」一行（转录稿模式）。强弱方向按数值对比推断，只做提示。
 *
 * 输出：wanxiangqi-patch.js（window.WXQ_PATCH = {meta, changes[]}）。
 * 只用 Node 内置模块。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'wanxiangqi-patch.js');

function args() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--id') out.id = a[++i];
    else if (a[i] === '--file') out.file = a[++i];
  }
  return out;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function fetchAnnouncement(id) {
  const url = 'https://apps.game.qq.com/wmp/v3.1/public/searchNews.php?p0=389&source=web_pc&id=' + encodeURIComponent(id);
  const raw = await fetchText(url);
  const m = raw.match(/var searchObj=(\{[\s\S]*\});?\s*$/);
  if (!m) throw new Error('searchNews 返回里没有 var searchObj（id 是否有效？）');
  let obj;
  try { obj = JSON.parse(m[1]); } catch (e) { throw new Error('searchObj 解析失败: ' + e.message); }
  const sContent = obj && obj.msg && obj.msg.sContent;
  if (!sContent) throw new Error('公告正文（msg.sContent）为空');
  return {
    text: sContent,
    title: String(obj.msg && obj.msg.title || '').trim(),
    source: '官方公告 searchNews.php id=' + id + (obj.msg && obj.msg.title ? '《' + obj.msg.title + '》' : '')
  };
}

/* ---------- 官方富文本清洗（sContent 带 <color>/<b>/<br> 等） ---------- */
function cleanRich(s) {
  return String(s || '')
    .replace(/<color=[^>]*>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '');
}

/* ---------- 解析 ---------- */
// 数据池校验在页面端也要做一遍，这里同步时先按名字写 kind，页面端再对卡面。
const KINDS = ['英雄', '装备', '天赋', '棋手'];

function parseNotes(text) {
  const lines = cleanRich(text).split('\n');
  // 摘要块（# 开头标题、> 开头来源）只取头部，其余行参与分块
  const blocks = [];
  let cur = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (cur.length) { blocks.push(cur); cur = []; } continue; }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  const changes = [];
  for (const b of blocks) {
    const head = b[0];
    const km = head.match(/^(英雄|装备|天赋|棋手)\s+(.+)$/);
    if (!km) continue;   // 标题、来源、与卡无关的段落直接跳过
    const kind = km[1];
    const name = km[2].trim();
    if (!name) continue;
    const ch = { name, kind, item: '', before: '', after: '', note: '', dirForce: '' };
    for (let i = 1; i < b.length; i++) {
      const l = b[i];
      const im = l.match(/^(?:技能|项目)\s+(.+)$/);
      if (im && !ch.item) { ch.item = im[1].trim(); continue; }
      // 转录稿里数值对比会给错方向（负数、上下限）时，允许显式指定：方向：削/强/新/无
      const dm = l.match(/^方向[:：]\s*(削|强|新|无)$/);
      if (dm) { ch.dirForce = dm[1]; continue; }
      const bm = l.match(/^调整前[:：]\s*(.*)$/);
      if (bm) {
        const rest = collectUntil(b, i + 1, /^调整后[:：]/);
        ch.before = (bm[1].trim() + (rest.text ? ' / ' + rest.text : '')).trim();
        continue;
      }
      const am = l.match(/^调整后[:：]\s*(.*)$/);
      if (am) {
        const rest = collectUntil(b, i + 1, /^(调整前[:：]|变化[:：]|方向[:：])/);
        ch.after = (am[1].trim() + (rest.text ? ' / ' + rest.text : '')).trim();
        continue;
      }
      const nm = l.match(/^变化[:：]\s*(.*)$/);
      if (nm) { ch.note = nm[1].trim(); }
    }
    changes.push(ch);
  }
  return changes;
}

// 「调整前」的正文可能折到后面几行，收到下一个标记行之前为止
function collectUntil(lines, from, stopRe) {
  const parts = [];
  let i = from;
  for (; i < lines.length; i++) {
    if (stopRe.test(lines[i])) break;
    parts.push(lines[i]);
  }
  return { text: parts.join(' / ').trim(), next: i };
}

// 强弱方向：显式指定优先，其次文字提示，再对比前后数值序列。只是提示（箭头），不当结论。
function inferDir(ch) {
  if (ch.dirForce === '强') return 'up';
  if (ch.dirForce === '削') return 'down';
  if (ch.dirForce === '新') return 'new';
  if (ch.dirForce === '无') return '';
  const hay = (ch.before || '') + ' ' + (ch.after || '') + ' ' + (ch.note || '');
  if (/新增|添加|实装/.test(ch.note || hay) && !ch.before) return 'new';
  let up = 0, down = 0;
  if (/提升|加强|提高|增加|延长|上调/.test(hay)) up++;
  if (/降低|削弱|减少|缩短|下调|不再|去掉|移除/.test(hay)) down++;
  const nums = (s) => (String(s || '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const a = nums(ch.before), b = nums(ch.after);
  const n = Math.min(a.length, b.length);
  let cmp = 0;
  for (let i = 0; i < n; i++) {
    if (b[i] > a[i]) { up++; cmp++; }
    else if (b[i] < a[i]) { down++; cmp--; }
  }
  if (cmp > 0) return 'up';
  if (cmp < 0) return 'down';
  if (up > down) return 'up';
  if (down > up) return 'down';
  return ch.before && ch.after ? 'mix' : '';
}

/* ---------- 输出 ---------- */
function writeOut(meta, changes) {
  const payload = { meta, changes };
  const body = '/* 王者万象棋 · 版本调整记录（自动生成，勿手工编辑） */\n'
    + '/* 同步：node scripts/sync-wxq-patch.js --id <newsid> 或 --file <公告文本> */\n'
    + 'window.WXQ_PATCH = ' + JSON.stringify(payload) + ';\n';
  fs.writeFileSync(OUT, body, 'utf8');
  console.log('写出 ' + path.relative(ROOT, OUT) + ' ' + (body.length / 1024).toFixed(1) + ' KB');
}

async function main() {
  const argv = args();
  let src;
  if (argv.id) {
    src = await fetchAnnouncement(argv.id);
  } else if (argv.file) {
    const p = path.resolve(argv.file);
    src = { text: fs.readFileSync(p, 'utf8'), title: path.basename(p), source: '本地转录 ' + path.basename(p) };
  } else {
    console.error('用法：node scripts/sync-wxq-patch.js --id <newsid> | --file <公告文本路径>');
    process.exit(1);
  }
  const changes = parseNotes(src.text);
  if (!changes.length) {
    console.error('⚠ 没解析出任何「英雄/装备/天赋/棋手 + 调整前/调整后」块，产物未写出。');
    console.error('  公告格式应形如：');
    console.error('    英雄 韩信');
    console.error('    技能 闪现');
    console.error('    调整前：…');
    console.error('    调整后：…');
    process.exit(2);
  }
  changes.forEach((c) => { c.dir = inferDir(c); });
  const meta = {
    version: '1.0.0',
    capturedAt: new Date().toISOString().slice(0, 10),
    title: src.title,
    source: src.source,
    count: changes.length,
    note: '方向（⬆/⬇）由数值对比自动推断，仅供参考；文案以官方公告原文为准。'
  };
  writeOut(meta, changes);
  const byKind = {};
  changes.forEach((c) => { byKind[c.kind] = (byKind[c.kind] || 0) + 1; });
  console.log('共 ' + changes.length + ' 条：' + JSON.stringify(byKind));
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
