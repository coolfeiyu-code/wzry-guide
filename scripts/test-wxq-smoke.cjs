#!/usr/bin/env node
/* 万象棋 · 页面冒烟：凑卡匹配 / 个人战绩 / 版本调整标记（puppeteer-core） */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = 'D:\\AI 云同步\\王者万象棋助手';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PX = process.env.PX || path.join(require('os').tmpdir(), 'wxq-smoke', 'node_modules', 'puppeteer-core');

(async function main() {
  const puppeteer = require(PX);
  let pass = 0, fail = 0;
  const check = (label, cond, detail) => {
    if (cond) { console.log('  ✓ ' + label); pass++; }
    else { console.log('  ✗ ' + label + (detail !== undefined ? '  → ' + detail : '')); fail++; }
  };
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--window-size=1400,900', '--lang=zh-CN']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const target = pathToFileURL(path.join(ROOT, 'wanxiangqi.html')).href;
  await page.goto(target, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.jcard', { timeout: 15000 });

  // —— 版本调整标记（数据 wanxiangqi-patch.js 已含韩信/曜等）——
  const hasPatchChip = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('.jcard'));
    return list.some((c) => c.querySelector('.jtag.patch'));
  });
  check('卡片上有「调整」标记', hasPatchChip);
  // 点开带标记的卡 → 详情有「版本调整」板块
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.jcard')).find((c) => c.querySelector('.jtag.patch'));
    card.click();
  });
  await page.waitForSelector('.patchbox', { timeout: 8000 });
  check('详情页有「版本调整」板块', true);
  const patchItems = await page.$$eval('.patchbox .pc-item', (n) => n.length);
  check('版本调整条目 >0', patchItems > 0, patchItems);
  // 返回列表
  await page.click('[data-job-back]');
  await page.waitForSelector('.jcard', { timeout: 8000 });

  // —— 凑卡匹配 ——
  await page.click('[data-job-match]');
  await page.waitForSelector('[data-mt-root]', { timeout: 8000 });
  const heroCount = await page.$$eval('.mt-hero', (n) => n.length);
  check('凑卡池 85 英雄', heroCount === 85, heroCount);
  const emptyHint = await page.$('[data-mt-results] .mt-empty');
  check('未勾选时空态提示', !!emptyHint);
  // 勾 5 个英雄（点前 5 个）
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.mt-hero')).slice(0, 5);
    btns.forEach((b) => b.click());
  });
  await new Promise((r) => setTimeout(r, 300));
  const rows = await page.$$eval('.mt-row', (n) => n.length);
  check('勾 5 个英雄后出结果', rows > 0, rows);
  const cnt = await page.$eval('[data-mt-count]', (n) => n.textContent);
  check('计数 = 5', cnt === '5', cnt);
  // 点第一名进详情
  await page.click('.mt-row');
  await page.waitForSelector('.jdoc', { timeout: 8000 });
  check('从匹配结果进详情', true);
  // 返回 → 回到凑卡视图（fromView 机制）
  await page.click('[data-job-back]');
  await page.waitForSelector('[data-mt-root]', { timeout: 8000 });
  const picksKept = await page.$eval('[data-mt-count]', (n) => n.textContent);
  check('返回后勾选还在（5）', picksKept === '5', picksKept);
  // 清空
  await page.click('[data-mt-clear]');
  await new Promise((r) => setTimeout(r, 200));
  const cnt2 = await page.$eval('[data-mt-count]', (n) => n.textContent);
  check('清空后计数 = 0', cnt2 === '0', cnt2);
  // 匹配视图的返回键能回列表
  await page.click('[data-mt-back]');
  await page.waitForSelector('.jcard', { timeout: 8000 });
  check('匹配视图返回键回列表', true);

  // —— 个人战绩 ——
  await page.click('[data-job-records]');
  await page.waitForSelector('[data-rec-root]', { timeout: 8000 });
  // 手动输入模式
  await page.select('[data-rec-key]', '__other__');
  await page.type('[data-rec-name]', '冒烟测试套');
  await page.evaluate(() => {
    document.querySelector('[data-rec-rank="2"]').click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const saveDisabled = await page.$eval('[data-rec-save]', (n) => n.disabled);
  check('记一笔按钮已解锁', !saveDisabled);
  await page.click('[data-rec-save]');
  await new Promise((r) => setTimeout(r, 400));
  const recItems = await page.$$eval('.rc-item', (n) => n.length);
  check('战绩列表 1 条', recItems === 1, recItems);
  const statRows = await page.$$eval('.rc-row', (n) => n.length);
  check('统计表 1 行', statRows === 1, statRows);
  const ls = await page.evaluate(() => localStorage.getItem('wxq-records-v1'));
  check('localStorage 已写', !!ls && ls.indexOf('冒烟测试套') >= 0);
  // 删除（两步）
  await page.click('[data-rec-del]');
  await new Promise((r) => setTimeout(r, 100));
  const armed = await page.$eval('[data-rec-del]', (n) => n.getAttribute('data-armed'));
  check('删除需二次确认', armed === '1', armed);
  await page.click('[data-rec-del]');
  await new Promise((r) => setTimeout(r, 300));
  const recAfter = await page.$$eval('.rc-item', (n) => n.length);
  check('删除后列表 0 条', recAfter === 0, recAfter);
  const ls2 = await page.evaluate(() => localStorage.getItem('wxq-records-v1'));
  check('删除进了墓碑', !!ls2 && /"del":\{"r/.test(ls2), ls2 && ls2.slice(0, 80));

  // —— 深链 ——
  await page.goto(target + '#match', { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-mt-root]', { timeout: 8000 });
  check('深链 #match 打开凑卡', true);

  // file:// 环境噪音：manifest 拉取、云桥探活（127.0.0.1:17871 没开桥时必然拒连）
  const realErrors = errors.filter((e) => !/favicon|share|sw\.|manifest|ERR_FAILED|ERR_CONNECTION_REFUSED/i.test(e));
  check('零 JS 报错', realErrors.length === 0, realErrors.join(' | ').slice(0, 300));

  console.log('\n══ 冒烟结果: ' + pass + ' 通过 / ' + fail + ' 失败 ══');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
