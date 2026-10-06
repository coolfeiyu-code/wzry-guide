#!/usr/bin/env node
/**
 * 阵容编辑：覆盖层不改官方对象，保存 / 恢复官方 / 编辑页能画出棋手下拉和站位。
 *   node scripts/test-wxq-edit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = {};
const g = {
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  WXQ_HEROES: [{ name: '小乔', quality: 2 }, { name: '蔡文姬', quality: 1 }, { name: '吕布', quality: 3 }],
  WXQ_PLAYERS: [{ name: '白歌' }, { name: '常小娥' }, { name: '马可' }],
  WXQ_EQUIPS: [{ name: '破晓' }, { name: '名刀·司命' }],
  WXQ_TALENTS: [{ name: '复印机' }],
  WXQ_EFFECTS: [{ name: '传承' }],
  WXQ_JOBS: { _wxqView: { stale: true } },
  document: {
    getElementById: function () { return null; },
    createElement: function () { return {}; },
    body: { appendChild: function () {} }
  },
  scrollY: 0,
  scrollTo: function () {}
};
g.window = g;
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'wanxiangqi-edit.js'), 'utf8'), g);

const E = g.WXQ_EDIT;
let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else { console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); fail++; }
}

const official = {
  key: '1',
  name: '三分登场流',
  brief: '官方介绍',
  positionDesc: '',
  equipDesc: '',
  talentDesc: '',
  effectDesc: '',
  lords: ['白歌'],
  heroes: [{ name: '小乔', x: 1, z: 0, evo: false, eqs: [], spot: 0 }],
  ops: [{ from: 1, to: 3, desc: '前期买核心', main: ['小乔'], sub: [] }],
  talents: [],
  effects: ['传承'],
  bestLords: [{ name: '常小娥', app: 0.4 }]
};

check('没改过时原样返回', E.apply(official) === official);
E.begin(official);
const d = E._draft();
check('没改过时编辑页先填页面上看到的棋手', d.lordsFromStats && d.lords[0] === '常小娥', JSON.stringify(d.lords));
d.name = '我的三分';
d.lords = ['马可', '白歌'];
d.lordsFromStats = false;
d.heroes[0].eqs = ['破晓', '', ''];
d.heroes.push({ name: '蔡文姬', x: 3, z: 2, evo: true, spot: 3, eqs: ['', '', ''] });
d.brief = '自己的打法';
d.ops[1].desc = '中期升人口';
d.ops[1].main = ['蔡文姬'];
d.talents = ['复印机'];
check('保存成功', E.save() === true);
check('保存后清掉视图缓存', !g.WXQ_JOBS._wxqView);
const edited = E.apply(official);
check('不改官方对象', official.name === '三分登场流' && official.heroes.length === 1);
check('名字盖上去', edited.name === '我的三分');
check('棋手标记为已修改', edited._editLords && edited.lords.join(',') === '马可,白歌');
check('装备写上', edited.heroes[0].eqs[0] === '破晓');
check('新英雄带品质', edited.heroes[1].name === '蔡文姬' && edited.heroes[1].quality === 1);
check('中期运营还在', edited.ops[1].desc === '中期升人口' && edited.ops[1].main[0] === '蔡文姬');
check('天赋写上', edited.talents[0] === '复印机');
const html = E.pageHtml(edited);
check('编辑页有棋手下拉', html.indexOf('data-ed-lord="0"') >= 0 && html.indexOf('马可') >= 0);
check('编辑页有站位格', html.indexOf('data-ed-cell="3,2"') >= 0);
check('编辑页有装备下拉', html.indexOf('名刀·司命') >= 0 && html.indexOf('data-ed-eq="0,0"') >= 0);
check('编辑页有前中后期', html.indexOf('前期') >= 0 && html.indexOf('中期升人口') >= 0 && html.indexOf('后期') >= 0);
check('保存和恢复按钮都在', html.indexOf('data-ed="save"') >= 0 && html.indexOf('data-ed="reset"') >= 0);

E.begin(edited);
check('恢复官方', E.reset() === true);
const back = E.apply(official);
check('恢复后回到官方名字', back === official);

console.log('\n══ 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ══');
process.exit(fail ? 1 : 0);
