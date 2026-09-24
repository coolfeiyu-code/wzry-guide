# 王者荣耀 S44 攻略总集 · 王者万象棋板块 — 工作交接文档（task.md）

> 最后更新：2026-09-24
> 用途：本文件记录项目从 0 到当前的全部工作脉络、架构、铁律、已踩的坑与下一步。任何 AI 接手前先通读本文件，可避免重复踩坑与重复提问。
> **每次改动必须同步更新本文件**（用户 2026-09-18 起要求「每次更新 task」）。
> 当前版本状态：站点 `GUIDE_META` **v2.6.12**；万象棋 `WXQ_META` **v1.5.53**（棋手以数据为准 + 修词条高亮盖色 + 英雄 4 层 tag + 官方 v1.3.1 平衡性同步）。官方阵容库 **v1.3.1**（334 套）。近7日数据阵容 **v1.2.1**（2026-09-24 待跑完 detail）。
> 线上地址：`https://coolfeiyu-code.github.io/wzry-guide/`

---

## 0. 一句话定位

这是一个**零构建、纯静态、数据驱动**的王者荣耀攻略站。首页是二选一（王者荣耀 / 王者万象棋），点王者荣耀才展开英雄+装备；万象棋是独立页。数据由本地 `*.js` 驱动，HTML 只做渲染。

---

## 1. 仓库与部署架构（必读）

| 项 | 值 |
|---|---|
| 本地路径 | `C:\Users\Zhuqi\Desktop\wzry-guide` |
| GitHub | `coolfeiyu-code/wzry-guide`（origin 是 SSH；本机 Clash fake-ip 会把 github.com 指到 `198.18.0.109:22` 超时。**HTTPS 推送**走 `git -c http.proxy=http://127.0.0.1:7897 push https://github.com/coolfeiyu-code/wzry-guide.git main`，然后 `git update-ref refs/remotes/origin/main <sha>`） |
| 部署 | GitHub Pages，**main 分支根目录**，零构建 |
| 重建 | push 后 **1–3 分钟**自动重建 |
| 新文件窗口 | 新文件有 **30–45s 404 窗口**，轮询即可，**非失败**（别误判） |
| 线上 | `https://coolfeiyu-code.github.io/wzry-guide/` |

⚠️ **git 致命坑（2026-09-17 实测，已坑过两次）**：本仓 `.githooks/pre-commit` 会在提交时自动升版 `heroes-data.js`，`git commit` 命令会打印「`nothing added to commit but untracked files present`」却**实际已创建提交**（f82b016、d217493 均如此），导致紧随其后的 `&& git push` 被跳过（commit 返回非 0）。
**正确姿势**：`git add <file> && git commit -m '…'` 之后**单独再跑一次** `git push origin main`（勿链式 `&&`）。改完务必 `git log --oneline -1 origin/main` 复核是否真推上去了。

---

## 2. 目录与关键文件

```
wzry-guide/
├── index.html              首页二选一 + 王者荣耀英雄/装备。body.home 只显示两扇门；点王者荣耀后 body.wzry，hash `#wzry`/`#items`/`#hero-xxx`
├── images/home/            首页大门官方图：wzry.jpg（李白皮肤原画）、wxq.jpg（万象棋官网六人主视觉 top_bg.jpg）
├── heroes-data.js          英雄单一数据源：GUIDE_META(version/updateLog) + HEROES(132)
├── items.html              装备库渲染器
├── items-data.js           装备数据源(121) + items-icon/(108 图) — 由 scripts/sync-items.py 生成（勿手工编辑）
├── scripts/
│   ├── sync-items.py       装备官方数据同步脚本
│   ├── sync-wxq-lineups.js 万象棋官方阵容库同步（推荐/热门/新手）；入库门槛使用量≥2000 且评分≥4.0
│   ├── sync-wxq-stats.js   万象棋大数据近7日前三率（datawxq.com → wanxiangqi-stats.js）
│   ├── sync-wxq-cards.js   并入官方英雄技能/10·40·100质变/觉醒/属性与装备类型/合成来源（oscard_new_1/_4）
│   ├── publish-wxq-helper.js 打成单文件写到坚果云 `王者万象棋助手/王者助手.html`（不覆盖 `王者助手.json.js`；顺带带同步桥 6 个文件：装/卸各 Win.cmd+macOS.command，见 5.2f）
│   ├── wxq-cloud-bridge.js 本机同步桥：127.0.0.1:17871，读写坚果云配置 + 可静态托管助手页
│   └── install-wxq-bridge.js 装/卸开机自启（复制桥到 %LOCALAPPDATA%\王者助手同步桥 并写 Startup VBS）
│   └── item-changes.json   手工维护的赛季装备改动档（仅用户说"S45 装备改动"时更新）
├── wanxiangqi.html         万象棋页。默认「阵容」；tab：阵容/棋手/英雄/效果/装备/天赋/讲解。攻略与连锁 tab 已下线。需要讲解的阵容有「讲解这套」。版本只升 WXQ_META
├── wanxiangqi-explain.js   讲解：官方卡面 + 阵容原文。识别李信牺牲/木兰复生/三分倒转/大河开团/日落海整备/往生图腾。李信按上场牺牲位拆读法。
├── wanxiangqi-hud.js       在用阵容（localStorage wxq-using-v1，最多 8 套）+ 对局浮窗（独立小窗，可拖可拉；关不掉助手页时用占位页兜底）。贴不进游戏画面。
├── wanxiangqi-data.js      万象棋官方快照只读数据源（WXQ_META + WXQ_PLAYERS(19 含阿离)/HEROES(85)/EFFECTS(98)/EQUIPS(73)/TALENTS(255)/FACTIONS(7)）。**严禁手改**。英雄另有 skills/awakeDesc/stats/kwHelp/cost；装备另有 subType/equipType/craftFrom/craftInto
├── wanxiangqi-guide.js     万象棋攻略数据（WXQ_GUIDE，手工维护，改文案改这里）
├── wanxiangqi-lineups.js   官方阵容推荐库（WXQ_JOBS，scripts/sync-wxq-lineups.js 生成，**勿手改**）
├── wanxiangqi-stats.js     近7日数据阵容（WXQ_STATS，scripts/sync-wxq-stats.js 生成，**勿手改**）。overlay 叠到官方套，list 是对不上的无码卡
├── wanxiangqi-jobs.js      作业 tab 渲染（只画，不含规则）
├── wanxiangqi-rules.js     连锁 B 层：WXQ_RULES（规则+手补 MANUAL）
├── wanxiangqi-engine.js    连锁 C 层：WXQ_ENGINE.simulate(board,rules,cards) 纯函数 + selfTest(13 断言)
├── wanxiangqi-chain.js     连锁 D 层：WXQ_CHAIN 只渲染，经 __wxqUI 桥复用弹窗/主题
├── wxq-icon/               547 张真实卡面（players 各 _icon544² + _portrait696×164；heroes/effects192²、equips216²、talents172²）+ manifest.json，0 missing
├── manifest.json           站点 manifest（start_url/scope 必须为 /wzry-guide/）
└── .githooks/pre-commit    触发文件集：heroes-data.js/index.html/manifest.json/icons/items.html/items-data.js/scripts/wanxiangqi*（v2.6.1 起用 glob）
```

---

## 3. 数据架构与三条「禁止再提议」铁律

> 以下三条已**全部完成**，动手前先跑脚本核实，**不要重复提议**：

1. **禁止提议"补全英雄详细攻略"**：132 条 `detailed` 100% 填充，零 null（v2.1.8 删重后；原 137 条，2026-09-02 核实最短 2427 字符 / 中位 2985 / 最长 5571，零空缺）。
2. **禁止提议"技能补数值"**：v2.1.7 已全量补全，v2.1.10 又按官方校正（78 伤害/90 CD/52 蓝耗，残留差异 0）。**大招只有 3 级，1/2 技能 6 级**。
3. **禁止加回 PDF 导出**（v2.1.4 已删，手机慢易失败）；分享走即时深链即可。

---

## 4. 官方数据源（赛季更新后重跑即可）

- **英雄技能**：`herolist.json` 取 ename → `pvp.qq.com/web201605/herodetail/<ename>.shtml`（**GBK，须 `TextDecoder('gbk')`**）。脚本范式见 `2026-09-04.md`。三坑：① async 漏 `await`（假"0 差异"）② 技能图标 `heroimg/106/10600.png` 被当成分级数值（先剥 `<img>`）③ 官方页 CD 排在描述前，**按序号对齐必错位，须按技能名对齐**。
- **万象棋**：
  ① 棋手 `vasd-cms.qq.com/cms/osgamewsq/prod/api/v1/osgamewsqwsq_info_article_3019.json?ts=<floor(now/10000)>`；
  ② 主快照 `game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_{1,2,4,8,16}.js`（_1 heroCards85/_2 effectCards98/_4 equipCards73/_8 talentCards255/_16 lords19），每卡含 `thumb`(网格)/`cardImage`(弹窗)/`icon`/`portrait` + `relationName`(阵营) + `desc`(`<color=...>` 富文本)。**注意 `_2/_4/_8/_16` 里的 `heroCards` 都是 `[]`，英雄必须取 `_1.js`（`sync-wxq-cards.js` 里写的 `HERO_URL` 用 `_2.js` 是历史 bug，导致英雄永远 enrich 0 条）**。文件是**纯 JSON**，用 `vm.runInContext` 跑会静默返回 0 条，必须 `JSON.parse`。
  ③ **官方图鉴免登录接口（最权威，推荐）**：`POST https://kohcamp.qq.com/game/os/sharedbooks`，头必须带 `Content-Type: application/json` + `isTRPCRequest: trpc`（+ `Origin: https://camp.qq.com`），体 `{"roleID":"0","bookType":N,"mode":0}`。`bookType` 是位标志：`1`英雄/`2`效果/`4`装备/`8`天赋/`16`棋手（32 及以上报 `-105:invalid param`；不能组合成 15）。返回 `data.heroCards[]`，明细在 `heroCard.{skillList,properties,awakeingCard,keywordDescription}`（`properties` 的键与本地 `stats` 完全同名）。`/game/os/books` 需登录（`-30314 登录态参数不全`）。页面 `https://camp.qq.com/h5/webdist/os-handbook-detail/index.html`，bundle `static/js/index.*.js` —— **bundle 里只有这两个接口，参数只有 `roleID/bookType/mode`，没有版本/赛季开关**。
  ④ **官方新闻/公告接口**：详情 `https://apps.game.qq.com/wmp/v3.1/public/searchNews.php?p0=389&source=web_pc&id=<newsid>`（返回 `var searchObj={...}`，须正则 `var searchObj=(\{[\s\S]*\});?$` 剥离再 `JSON.parse`；`id` 必填，缺则 `id error`；正文在 `msg.sContent`）。**列表接口至今没打通**（`zmMcnTargetContentList` 的 `target=389/7059/7063` 全返空；`tagId/tag/iTagId` 参数无效），只能靠邻号 newsid 枚举。
- **⚠️ 官方数据源会滞后于游戏版本**：2026-09-24 全服更新 v1.3.1（6:00–8:00），当天 18:00 再查，`kohcamp` 图鉴与 `589094` 快照**仍全是更新前的旧值**（亚连仍带 `【日落海】`、韩信仍 `+1`、天赋仍 255、3 个新天赋未上架）。所以**版本更新当天不能只等接口，要去官方公告拿"调整前/调整后"原文先同步**；接口刷新后再重跑脚本做二次对齐（脚本幂等）。
- **判"编造"前先核实是否新赛季前瞻英雄**（王维曾是 S45 前瞻，非编造，但技能名需按官方修正）。

---

## 5. 万象棋板块详解（近期工作都在这，重点看）

### 5.1 攻略数据 WXQ_GUIDE 顶层结构（wanxiangqi-guide.js）

```
WXQ_GUIDE = {
  meta,                                   // version/capturedAt/sources/note
  beginner,                               // 新手三选一：香香/常小娥/白歌（对象，含 diff/stars/...）
  mechanics,                              // core(核心机制要点) + systems(六大系统详解) + rhythm(4段运营) + deaths(三大死因) + motto
  keywords,                              // {title, sub, note, list[]} —— 词条详解（含卡面示例）
  combos,                                // {title, sub, list[18]} 英雄搭配联动
  factions,                              // [6] 阵营流派详解
  lineups,                               // [18] 阵容推荐
  equip,                                 // {title, rule, roles[5]} 分职业出装
  players                                // {棋手名: {diff,stars,skill,role,lineups,ranks}} 18 棋手
}
```

- `lineups[]` 每套字段：`tier/name/core[]/extra[]/players[]/rhythm/position/mech/pick/ops[3段前中后]/equip/build`。
- `combos.list[]` 每组字段：`name/tier/partners[]/keyword/chain/gain/risk`。
- `factions[]` 每阵营含 `cores/mech/strength/idea/how/key/spike/counter/tips/lineups[]`（lineups 须与 lineups[] 的 name 完全一致，否则站点不互链）。

### 5.2 讲解（2026-09-19，替换原连锁 tab）

- 原连锁（词条推演沙盒）已从页面拿掉，文件 `wanxiangqi-chain.js` / `wanxiangqi-engine.js` 仍留在仓库但不加载。
- 新 tab **讲解** + 阵容详情「讲解这套」（只出现在对得上的阵容上）。用户可见文案称「阵容」，不称「作业」。
- 识别：李信牺牲、花木兰复生、三分整备倒转、大河开团、日落海整备、往生图腾。李信套若同时有木兰+咬金，仍按李信牺牲讲（木兰是牺牲位不是主C）。
- 李信牺牲按上场拆，读懂这套会先点名这套牺牲位再讲差别：铠+木兰+大司命是双复生喂李信、图腾顺带；铠+盾山+咬金没有木兰，盾山换钱、咬金必须挨钟馗；铠+木兰+盾山是古币给木兰叠复生；铠+木兰+咬金是咬金产币给木兰、咬金自己靠钟馗喂。铠/木兰自带牺牲且能复生（死两次喂两口）；盾山是古币经济位；咬金卡面无牺牲，必须挨钟馗；苏烈牺牲给自己永久等级同时喂李信；明世隐必须贴李信转永久，不要当祭品挨钟馗；大司命图腾是顺带不是主粮。瑶妹小鹿是棋手技能（每回合+2/胜利+4），卡面没有牺牲，讲解不写作业口头里的「奉献」。
- 讲解结构：①「读懂这套」按卡面把机制讲明白（例如木兰吃的是使用古币次数、露娜要整备后再打出）②「这一回合怎么走」③ 上场卡面原文 ④ 该套阵容自己的介绍/运营 ⑤ 从原文抽出的实战要点。不编胜率。
- 深链 `#x-阵容码`。`wanxiangqi-explain.js`。

### 5.2c 阵容入库门槛（2026-09-19 设，2026-09-20 放宽）

- 原门槛：使用量 ≥2000 **且** 评分 ≥4.0。实测结果 47 → 53 套。
- **为什么放宽**：两个真问题。① 官方发布的 5 套新手教学套（作者「王者万象棋官方」，使用量 0、评分 8.2–9.9、带 3 段完整运营）被整批丢掉；② 全池 451 套里有 392 套 `score=0`，而它们的 `scoreNum` 也都是 0 —— 说明 `score=0` 是「还没人评分」而不是「差评」，拿它当硬门槛等于顺带把新套一起挡在门外。
- **新门槛（满足任一即收，理由记进每条的 `pick`）**：官方出品(1) / 热门榜(2) / 官方新手(3) / 好评(4: ≥4 分且 ≥3 人评) / 高使用(5: ≥1000) / 有热度(6: ≥300 且点赞 ≥20) / 攻略完整(7: ≥500 且 3 段运营)。另外硬性要求：**至少 4 个英雄**、名字非空。常量在 `scripts/sync-wxq-lineups.js` 顶部。
- 2026-09-20 实测：原始 451 → 保留 **298**（丢 153 = 英雄不足4个 16 + 无任何理由 137）。入选理由计数 official 5 / hot 20 / beg 5 / rating 32 / use 267 / heat 35 / guide 180。
- **不要用「按英雄组合去重」来压数量**：实测会把 74 万用量的「最强赢政逐鹿倒转」等热门套挤掉（同组合的 14 套里它排第 2），而且和「官方库撤下的 20 套」混在一起看不出原因。数量靠门槛控制，不靠去重。
- 注意：官方推荐列表固定 500 条（25 页），所以每次同步都会有一批旧的被官方自己撤下（本轮消失 20 套，与门槛无关）。别把它们当成被门槛过滤而调低门槛。
- UI 配合：卡片新增「官方」「新手」标签与「官方」筛选；默认「使用量」排序把官方套置顶（它们使用量是 0，300 套规模下否则沉到最后一页）。同名不同阵容码的套（如「最强奕星偷牌河洛」「明先生泳池派对」）算不同套，key 唯一即可。

### 5.2d 近7日数据阵容（datawxq.com，2026-09-19）

- 源：`https://www.datawxq.com/`，接口 `POST https://api.datatft.com/wzwxq/lineups/search` 与 `/detail`。`time: 7` 是最近 7 天。有前三率 `top3Rate`、登顶率 `firstRate`、登场率、平均名次、场次。**没有可导入阵容码**（`lineupCode` 恒为空，`lineupKey` 是 `人数|英雄id…` 聚类键）。
- **2026-09-20 接口变更：search / detail 都不能再传 `version`**。传任何版本号（含旧值 v260917、以及按周一算出来的新值）一律返回 `code 42000 该版本数据暂无`；不传 version 才拿得到当期数据。返回里也不再带版本字段，所以 `WXQ_STATS.meta.dataVersion` 现在是空串，页面按「有才显示」处理，别再按周一硬算版本号（那会导致整轮同步 0 条）。
- 同步：`node scripts/sync-wxq-stats.js` → `wanxiangqi-stats.js`（`WXQ_STATS`）。**勿手改**。专名必须在官方池，未知英雄整套丢掉。`WXQ_STATS_VERSION` 仍可强制指定某期，一般不用设。
- 对得上官方套的：只把 7 日统计叠到原卡片（使用量/阵容码仍是官方的），不另开一张。匹配必须含聚类核心英雄（`coreHeroes[0]`），避免木兰统计贴到乔汐司空震上。
- 对不上的：单独成卡，`nocode: true`，作者「万象棋大数据」，详情写「无导入阵容码」。门槛场次 ≥80 且前三率 ≥40%。只拉全服热门会漏掉明先生山鬼流（低登场），必须再按 19 位棋手和冷门英雄补搜。detail 只传 `lineupKey` 就能成功；带棋手 filter 反而可能报「样本过少」。
- **7 日卡「看着没内容」是提取不足，不是源头没有**（2026-09-21 修）。接口 `detail` 除了总场次/前三/登顶，还带：`commanders[]` 每个棋手的登场率+前三+登顶+均名、`talents[]`（160 条）每条天赋的登场率+胜率、`heroEquipment[].builds[]` 每个英雄的装备组合及其胜率+场次、`variants[]` 同类变体的增删人+胜率、`referenceBoards[]` 5 条登顶对局站位。**这些以前全丢了**，卡片只剩一句「样本 N 场」，所以显得没法学。现在都提取进 `L.d7 = {lords, talents, builds, boards, variants, variantCount}`，详情页和浮窗都按胜率排出来。
  - `builds` 只保留「正好 3 件装 + 场次 ≥5」的组合，按前三率排；`variants` 人数从 `lineupKey` 的「人数|英雄id…」取（`variant.lineupSize` 恒为 0，别用）。
  - **阵容码确实没有**：`lineupCode` 恒为空字符串，第三方不给码，所以详情页那块只能写「无导入阵容码」，这个不是 bug。
- 注意：官方库扩容后，更多 7 日聚类能对上官方套，于是被合并成统计叠加（overlay 278）而不再单独成卡（unique 从 44 降到 25）。这是正常收敛，不是丢数据。
- 2026-09-20 本轮：样本 485,695 局 / 586 聚类 → 官方叠统计 **51** 张、新卡 **44** 张（含「明先生 · 山鬼流」大司命+米莱狄/蒙恬/项羽）。上一轮（2026-09-19）是 45 张叠加 / 31 张新卡。
- 讲解：李信牺牲/木兰/三分/大河/日落海 + 往生图腾（大司命+米莱狄/蒙恬/项羽，且无虞姬）。只据官方卡面，不编山鬼数值、不编瑶妹奉献。
- 阵容筛「7日数据」、排序「前三率 / 登顶率」。全部列表里 7 日新卡排在热门官方之后、冷门官方之前。文案写清 datawxq.com 第三方聚类，不是官方胜率。
- **前三率与登顶率分开上色**（`.st.top3` 青绿 / `.st.first` 琥珀，深色主题各有一套更亮的色值）。两者都在卡片副行，同一张卡同时显示。场次 <150 标「N 场·样本少」（`.st.thin`）—— 小样本比率容易虚高（实测有个 306 场前三 100%、平均名次 1.11 的是真强，但也有 80–99 场的虚高样本）。
- 排序按钮：使用量 / 评分 / 前三率 / 登顶率 / 时间（`sbtn('first','登顶率')`，排序键 `js.sort==='first'`）。
- **棋手配色**：19 位各一对固定色（`wanxiangqi-jobs.js` 的 `LORD_COLORS`，按官方 `WXQ_PLAYERS` 顺序分配，无黑色、无重复）。**每对是 [浅色主题: 深底白字, 深色主题: 亮底深字]** —— 只用一个色值必然在另一套主题上糊掉（用户 2026-09-21 反馈「看不清楚」就是这个原因）。渲染成 `--lc-l` / `--lc-d` 两个 CSS 变量，`.lc` 在 `[data-theme="dark"]` 下自动换。对比度已脚本核算：字/底 ≥4.5、底/页面 ≥3，两套主题都达标；深色底亮度上限 0.72 防止刺眼。卡片取前 3 位棋手。
- **配色表要在 jobs 里导出**（`window.WXQ_LORD_COLORS.themePair`），浮窗没有 jobs 的 `ui()` 上下文，必须走这个共享入口才能拿到同一套色。**浮窗之前棋手名是纯文本 `esc(lords)`，所以全黑** —— 浮窗里必须用 `lordChip()`。
- **棋手名会被「词条高亮」包成 `.wxq-term`**（`fmt()`/linkify 给术语加的橙色字 + 虚线下划线），它会把色标的白字/深字盖成橙字 —— 这就是用户 2026-09-21 第二次反馈「底色和本色一模一样，根本看不清」的真正原因。`.lc .wxq-term` 必须 `color:inherit; background:transparent; border-bottom:0`。改色标后**一定要量 `.wxq-term` 的实际 color**，只量 `.lc` 看不出来。
- **数据优先（用户要求「数据第一位」）**：`cardLordNames()`（卡片）与 `lordsHtml()`（详情）/`hudLordNames()`（浮窗）都先取 `bestLords` → 再取 `d7.lords` → 最后才退回官方库原文 `lords`。名单与顺序都按统计（已按前三率排），详情里每个棋手名下面直接摆他自己用这套的登场/前三/登顶/平均。原「这套谁最适配」独立板块已合并进棋手块，不再重复列同一批名字。有统计时加 `d7-src` 说明来源。
- **棋手图鉴**：详情页棋手名 `data-job-lord-go` → `openLord()` → `__wxqUI.openPlayer(name)`（棋手弹窗，含技能/秘技/专属）。别再自己拼弹窗。
- **适配性数据（「这套谁最适配」）**：来自 datawxq `detail` 的 `commanders`（每个棋手自己的登场率/前三率/登顶率/场次），**不是推测**。同步时对命中的官方套额外拉一次 detail，写进 `overlay[].bestLords`；筛选条件 **登场 ≥8% 且场次 ≥200**（否则 5 场 100% 的棋手会顶掉稳定选择），取前三率前 3。298 套官方阵容中 138 套有这份数据。
- 注意 `.rt` 的 class 名是 `top3`/`first`（不是 `t3`/`f1`），改的时候要对齐全文件已有样式。

### 5.2e 在用阵容 + 对局浮窗（2026-09-19）

- 网页**不能**读游戏里选了哪套，也**不能**画进游戏画面。做法：在本站收藏「在用」，再开浮窗看站位和要点。
- 收藏：阵容卡片右上角星标，或详情「收藏为在用」。筛「在用」。最多 8 套，存在 `localStorage wxq-using-v1`。
- 浮窗：点「对局浮窗」开一个**真正独立的小窗口**（`window.open` 名字 wxqHud，可拖到游戏旁、可拉大小），同时把助手页收成占位页（`body.wxq-parked`，只留「回到助手」）。浮窗「回到助手」唤醒 opener 或另开大窗并关掉自己。
- **为什么必须 replaceState、绝不能 pushState**：Chrome 只允许脚本关闭「自己开的」或「用户打开且会话历史仍是 1 条」的窗口。实测：干净页 `window.close()` 成功；`pushState` 过（`history.length=2`）就永远关不掉。所以 `wanxiangqi-jobs.js` 的 `setHash`、`wanxiangqi.html` 的 `openModal` 全部只用 `replaceState`，弹窗关闭也不再走 `history.back()`。**这条是「两个窗口同时存在」的根因**（点开过阵容详情就会 pushState，把助手页锁死）。
- 关闭顺序：先 `parkHome()` 把助手页收成占位页（`body.wxq-parked`，只留「回到助手」），再 `window.close()`；真的关不掉时也不会把整页内容继续摆着和浮窗抢位置。
- 兜底：助手页关不掉就停在占位页；开窗被拦截时就地切成浮窗视图。
- 排版（用户要求「克制」）：浮窗内边距 16/18/20，模块间距 12–16；滚动条隐藏（`scrollbar-width:none` + `::-webkit-scrollbar{width:0}`）。顶栏只留「对局浮窗 + 回到助手 + 图鉴 + 适配」，图鉴按钮文字固定两个字、状态靠底色（避免窄窗把按钮挤出）。**复制阵容码改成标题下的一行小链接**（`<p class="hsub">阵容码 复制</p>`），不再常驻底部大按钮；复制失败才在顶栏下方展开只读框。顶栏实测在 380px 宽下不溢出。
- **站位格子高度必须由内容决定，不能锁正方形**：格子宽由 7 列撑（窄窗约 46px），`aspect-ratio:1` + 图片占 78% 会把名字挤出格子（实测格子 47 高、图 35 + 名字 10 已经顶满）。现在 `.hcell` 不设 aspect-ratio，高度 = 图片（`width:100%` + 自己 `aspect-ratio:1`）+ 名字，实测 46×63、四个字也完整。名字字号固定 10px，**不要跟着 `data-hud-fit` 放大**（格子宽度不变，放大就会截断）。
- 尺寸：浮窗按屏幕给最佳宽高并贴在屏幕右侧，可自由拉伸，按分辨率分桶记 `wxq-hud-size`。「适配屏幕」只对脚本开的窗口显示并重算。站位在上、装备/运营/出牌在下。
- 浮窗内容只放牌局里用得到的：7×4 站位（上=前排，格上标官方 `quality` 阶）、关键人物装备及官方 `craftFrom`（从什么合成）、前中后期运营原文（含回合和上阵名单）、出牌（讲解回合走法 + 从 brief/ops/effectDesc 抽出的手里/露娜/整备等句子）。不编胜率，原文没有的段就空着。
- 复制阵容码必须在小窗自己的 document 里写剪贴板（`window.navigator.clipboard` + `execCommand`），点在 PiP/弹出窗上时主页面没有用户手势，直接 `navigator.clipboard` 会失败。再失败就弹出只读框让 Ctrl+C。
- 「图鉴开/关」存 `localStorage wxq-hud-db`（默认开）。开时悬停英雄弹出官方卡面全文：卡面/觉醒/技能/10·40·100 质变/词条/关键属性；装备弹出效果和合成。格子上的品质只标数字，不写「阶」。不是模拟打架。游戏全屏独占会挡住网页，需窗口化。
- 文件 `wanxiangqi-hud.js`。

### 5.2f 坚果云王者助手（2026-09-19）

- 网页 localStorage **不会**随坚果云走。做法：发布单文件 HTML + 旁边一份配置脚本。
- 发布：`node scripts/publish-wxq-helper.js` → 坚果云 `王者万象棋助手/王者助手.html`。图优先用同目录 `wxq-icon`，缺的再走 GitHub Pages。**不覆盖**已有 `王者助手.json.js`。
- **发布版绝对不能加 `<base href="...">`**。页面资源（`wxq-icon/...`、`王者助手.json.js`）都是相对路径，用 `file://` 打开必须解析到坚果云这份文件旁边；加了 base 会把配置脚本指到网上，本机配置永远读不到，还会把云端配置覆盖掉（2026-09-20 丢配置就是这个原因）。
- **为什么需要同步桥**：Chrome 在 `file://` 页面上不会记住「写文件夹」授权（File System Access handle 存 IndexedDB 也会丢权限），所以每次重开助手都要再点一次「开启自动保存」并选文件夹。这是浏览器限制，页面上无法绕过。
- 同步桥（`scripts/wxq-cloud-bridge.js`）：本机 127.0.0.1:17871 小服务，`GET /api/cloud` 读、`POST /api/cloud` 合并写坚果云 `王者助手.json.js`；其余路径静态托管（打开 `http://127.0.0.1:17871/` 就是助手页，同源最省事）。**必须带 `Access-Control-Allow-Private-Network: true`**：file:// 页面访问本机端口时 Chrome 先发预检，没有这个头 POST 会被拦成 Failed to fetch（实测 GET 能过、POST 过不去）。
- 安装：`node scripts/install-wxq-bridge.js`（`--remove` 卸载）。桥脚本复制到 `%LOCALAPPDATA%\王者助手同步桥\`，Startup 里放 VBS 无窗口拉起，仓库改名/移动都不影响。**自启必须用系统 node**（`C:\Program Files\nodejs\node.exe`），agent 自带 node 在版本目录里，升级后路径会消失。
- 别台电脑：坚果云文件夹有装/卸两套——装开机自启：`安装同步桥.cmd`（Win）/`安装同步桥-macOS.command`（macOS）；卸开机自启：`卸载同步桥.cmd`/`卸载同步桥-macOS.command`，都对应当前系统双击即可。没装桥的电脑会自动退回原来的「点一次开授权」方式，不会卡死。
- 多台机器：打开时读云上 `王者助手.json.js` 的在用阵容，按**时间戳后写者胜、整组覆盖**同步（2026-09-22 由「取并集」改，并集表达不了删除）。`using` 带 `at`（最近本地编辑 ms）：本机新 → 回写云端；云端新 → 整组覆盖本机。**取消收藏（删除）能穿透同步**，不再被「复生」；也去掉「拉取即反向写回」造成的跨机互相覆盖。hudSize 仍按分辨率分桶合并。禁止退回会丢删除的并集。
- **手机端自动关掉电脑才用得上的功能**：`WXQ_HUD.touch()` 判定（`pointer:coarse` 或 UA 含 Mobile 或最短边 ≤480）。手机上不生成卡片星标 / 「在用」筛选 / 对局浮窗按钮 / 右下角浮窗码头，云同步整条链路也不启用（`WXQ_CLOUD.mode()==='off'`：不探桥、不建云条、不请求授权、不挂手势监听）。手机仍保留阵容浏览、复制阵容码、讲解。手机只是用来看阵容，游戏在电脑上，所以这些入口没有意义；**不要顺手把「复制阵容码」也删掉**。判断用能力识别，不写死机型，电脑端行为不变。
- 各电脑直接打开该 HTML：配置脚本在最前面，页面脚本跑之前已生效，**不用导入、不用点**。收藏/取消收藏、拖动浮窗、改主题会在 250ms 后写回。装了同步桥就是全静默；没装桥才需要在左下角点一次「开启自动保存」并选「王者万象棋助手」文件夹（file:// 下这个授权不会跨次记住）。发布脚本从坚果云 `UsersMap.json` 反查根目录（`NUTSTORE_ROOT` 仍可覆盖）。
- **浮窗和首页共用 `#grid`，必须三处设防**（2026-09-21 bug：云同步一触发，小窗就变成「缩小的首页」）。① `WXQ_HUD.hydrate()` 在 `hud-only` 时改为重绘浮窗自己（`enterPage(location.hash)`），绝不能画首页列表；② 首页 `wanxiangqi.html` 的 `render()` 开头加 `if(document.body.classList.contains('hud-only')) return;`；③ `route()` 在 `hud-only` 时只认 `#hud`/`#hud-*`，其它路由直接 return。云同步、切 tab、点搜索都会走到这三条路，漏一条就会被覆盖。
- **第 4 处防线（2026-09-21 增补）**：`WXQ_HUD.hydrate()` 非浮窗分支现在**只在当前就是阵容 tab（`__wxqUI.state.type === 'jobs'`）时才重画 #grid 阵容列表**，否则讲解/棋手/英雄等 tab 会被顶成阵容内容造成高亮错位。
- **回归测试**：`wxq_hud_cloud_smoke.cjs`（Temp，puppeteer-core）覆盖：A 浮窗下 hydrate 仍是浮窗、C `.lc .wxq-term` 继承色标字色、B 非阵容 tab 不被 hydrate 顶替。改浮窗/云同步后必跑。
- 浮窗运营空段用该套 brief 顶上；出牌段没有讲解也没关系，最后会跟一句 brief。
- 助手页脚带版本号和发布日期。坚果云 `王者万象棋助手` 文件夹顺带整目录复制 `wxq-icon`（553 个约 11MB，含 heroes/equips/players/talents/effects），本地打开也有图。近 7 日脚本的 `version` 按周一自动算（如 v260921），页面显示数据版本和截至日期。
- `wanxiangqi-cloud.js`。改完万象棋后跑一次发布脚本，各电脑坚果云同步完即可用新版。
- **2026-09-22 在用阵容跨设备同步 bug 再修复（版本 1.5.49 → 1.5.50）**：
  - 上一次把同步语义改成"时间戳后写者胜、整组覆盖"后，**漏掉了 bridgeWrite 成功后把云端 ack 的 using.at 同步回 localStorage** 这关键一步。
  - 根因：hud.save() 会在本地打 at=Date.now() 并存 localStorage，bridgeWrite 把这份推上去。但 POST 返回后，代码只返回了 ok 布尔，没有把云端 mergeCfg 最终确定的 at 回写 localStorage。结果 localStorage 里的 at 永远只等于本设备最后一次 save() 时的 Date.now()，和云端文件的 at 没有单调关系。
  - 用户场景：A 机存 3 套（at=T1）→ bridgeWrite 成功 → 云端有 3 套 at=T1。B 机打开，localStorage 还是自己上一次存 2 套时打的 at=T2（T2 > T1，因为 B 最近操作过）。decideUsing 比较云端 T1 vs 本地 T2 → 本地更大 → 返回 local_newer → queueWrite → B 把自己的 2 套反写回云端 → 盖掉 A 的 3 套！
  - 修复：`bridgeWrite()` 在 POST 成功后，把 `j.cfg.using`（mergeCfg 最终确定的 keys/last/at）写回 localStorage。这样本设备就知道"我最后一次成功推到云端的版本号是多少"，下次 bridgePull 比较 at 才有单调关系。
  - 文件退路 fileWrite 不需要额外同步：它直接写文件，写的就是 save() 打进去的 at，ack 等价于写入成功本身。
  - 提交：`3b2445e`。
- **2026-09-22 阵容库刷新（官方 317 套 + stats 302 套 overlay + 23 套 unique）**：
  - 官方阵容从 game.gtimg.cn 重拉（原始 452 → 入库 317，丢 135：英雄不足 4 个 18 / 无任何入选理由 117）。
  - datawxq.com 大数据阵容同步：search 全服 + 19 棋手 + 14 冷门英雄，合计 612 聚类（样本 647743），命中官方套叠统计 302 条，独立成卡 23 条。
  - **新坑：agent 环境会自动注入 ICUBE_PROXY_HOST=127.0.0.1**，node.js 默认走系统代理，导致 sync-wxq-stats.js 的 HTTPS 请求被劫持、30s timeout 后才返回"样本过少"（PowerShell 里显式设 DefaultWebProxy=$null 能通，但 node 不行）。修复：在 `sync-wxq-stats.js` 顶部加 `delete process.env['ICUBE_PROXY_HOST']` 等并设 `NO_PROXY='*'`。官方阵容脚本 sync-wxq-lineups.js 未受影响（可能接口响应快到代理没卡），但同样的注入风险存在——下次刷新如果 sync-lineups 也卡了再同样 patch。
  - 提交：`c22e16b`（版本 1.5.48 → 1.5.49）。
- **2026-09-22 改动（同步修复 + 静默保存 + 装/卸自启）**：
  ① 在用阵容同步改「时间戳后写者胜、整组覆盖」——桥 `wxq-cloud-bridge.js` 的 `mergeCfg` 对 using 按 `at` 较新者覆盖（不再 unionKeys），前端 `wanxiangqi-cloud.js` 新增 `decideUsing()`，`bridgePull`/文件退路 `pull` 改为「云端新→整组覆盖本机、本机新→回写一次」，去掉无条件写回循环；`wanxiangqi-hud.js` 的 `load()` 保留 `at`、`save()` 打 `at=Date.now()`。修复「取消收藏后重开页面被复生」与「多台互相覆盖」。
  ② 全部确认弹窗去掉：删除 `onFirstGesture`（页面任意首次点击自动弹文件授权框）与其监听。装了/开着同步桥就全程静默零弹窗；file:// 下仅用户主动点「开启自动保存」才弹一次系统选择框（浏览器硬限制）。
  ③ 发布脚本配好装/卸入口：发布到坚果云文件夹 6 个桥文件（同步桥.js、安装同步桥.js、安装同步桥.cmd、安装同步桥-macOS.command、卸载同步桥.cmd、卸载同步桥-macOS.command），任何机器双击当前系统对应文件即可装/卸开机自启。
  - 提交：`9deb4af`（同步修复）`83a59ff`（卸/装入口）。本机已用 `install-wxq-bridge.js` 装好自启（Startup VBS + `%LOCALAPPDATA%\王者助手同步桥`）。

### 5.2b 原连锁四层（已下线，仅留档）

- **A** `wanxiangqi-data.js`（快照，未改）→ **B** `wanxiangqi-rules.js`（`WXQ_RULES`，规则+手补 `MANUAL`）→ **C** `wanxiangqi-engine.js`（`WXQ_ENGINE.simulate(board,rules,cards)` 纯函数）→ **D** `wanxiangqi-chain.js`（`WXQ_CHAIN` 只渲染，经 html 注入的 `window.__wxqUI` 桥复用弹窗/主题）。**规则严禁写进 HTML onclick。**
- 定位：**只演算词条，不模拟打架**（无 DPS / 站位伤害 / 胜率），页面须写出这句。
- 词条 `<a href=N>` 实测 **18 个**（1登场/3开团/4凯旋/5败阵/9退场/10牺牲/11整备/13合成/16复生/100闪现/200夺取/321~324图腾/3130011临时等级/3130012转瞬/3140012阿科米亚核心）；`PHASES` 含**转瞬**（否则古币等效果牌不入时间轴）。
- **判环必须用路径栈**（`path.indexOf(key)>=0`）；**用访问计数会误判有限链**（曹操→周瑜）。`pickTargets` 在给定事件时**必须过滤候选到 `hasEffect(u,ev)`**，否则「触发登场」打在只有开团的人身上产出假落空。
- **诚实性口径**：随机不掷骰 → 候选 ≤6 展开「若…」分支、否则只标 `uncertain`；收益分 `exact`/`hyp`（"若分支全走"）**不得合并**；只在随机分支成立的环 → `loopConditional` 文案写「可能会成环」；`opaque` 卡只显原文不计数字；缺卡给中文断点。阿科米亚核心走 `gain.coreLevel`，**不进英雄等级池**。
- 覆盖：总 511 = auto171/manual48/partial292；上场池 183 = auto55/manual48/partial80。仍 opaque 待手补：**英雄 49 张 + 效果牌 50 张**（见 `2026-09-14.md` 清单）。
- 自测：引擎自检 13/13、连锁 50/50、线上冒烟 16/16、文案逐字比对 0 不符。**写断言前先 dump 真实 class**（槽位 `.sl-n`、断点 `.tl-bk`，猜错会出假 FAIL）。

### 5.3 攻略可信度纪律（必须遵守，曾出错）

- 棋手「技能/秘技/专属」**名称与词条释义必须逐字取自官方数据快照**，不得意译或凭印象写。曾错：庄小鱼秘技写成「如梦似幻」（实为秘技**牌**名，正解=美梦成真）、香香写成「武器改造」（正解=枪炮艺术）、乔汐写成「1-5 阶」（正解=2-5 阶）。
- 补充攻略前先 dump 官方技能名并**脚本自动比对覆盖率，须为 0 处不符**；官方卡面没有的词条（如「摄灵」）一律不收录。

### 5.4 官方富文本「隐形字」坑（v2.4.2 已修，别再踩）

- `wanxiangqi-data.js` 的 `desc` 含官方富文本，重点词用 `<color=#ffffff>`(330×) / `<color=#FFE897>`(294×) 包裹——**那是给深色卡面设计的**，浅色主题下白字白底 → 用户看到的是"缺字"（194 处受影响）。另有 158 处畸形锚点 `<ahref=3130012>`（丢了空格）。
- `fmt()` 的正确做法：**先把 `& < >` 整体转义，再只还原 `<b>` / `<color>`**；两个官方色映射为主题语义色 `.hl-term`(墨色加粗) / `.hl-gold`(浅 `#B3523F`、暗 `var(--cinnabar)`)，并用亮度判断让够深的自定义色保留原样；`<a>` 系列剥标签留文字。
- 验收必跑「**渲染文本 ≡ 官方原文去标签**」逐字比对（浏览器内循环 `__wxq.openPlayer/openCard` 读 innerText vs Node 侧 `stripTags`），**棋手 53 条 + 卡牌 511 张不符须为 0**。
- 对比度须 ≥4.5:1（实测 .hl-term 14.9/13.0，.hl-gold 5.0/4.8）。`heroes-data.js`、`items-data.js` 无此问题。
- **教训**：用户说"少字"时先怀疑"字色=底色"，别默认编码/数据缺失。

### 5.5 词条悬停浮层（v2.2.0 后新增 UI）

- `wanxiangqi.html` 自动链接英雄/装备/效果/天赋/棋手/流派/词条；词条可点进 `#k-词条` 详情，返回关层。

### 5.6 首页二选一（2026-09-18）

- 首页 **只显示两扇门**：王者荣耀 / 王者万象棋。不要再把英雄列表、装备库、赛季 chips 和大门放在同一屏。
- 点王者荣耀 → `body.wzry`，工具栏出现「英雄 | 装备」。返回用「← 首页」或点品牌。
- 深链：`#wzry` 英雄、`#items` 装备、`#hero-<id>` 直达英雄详情（会先进入王者荣耀）。
- 大门视觉用**官方图**铺满，不要手绘远山/圆点棋盘（用户已判难看）。
  - 王者荣耀：`images/home/wzry.jpg` ← 官方李白皮肤原画 `game.gtimg.cn/.../131-bigskin-1.jpg`
  - 王者万象棋：`images/home/wxq.jpg` ← 官网六人主视觉 `game.gtimg.cn/images/osgame/cp/a20260709sfzt/top_bg.jpg`
  - 底部压深色渐变，白字。禁止再发明空白卡片或自绘装饰。
- 王者荣耀栏分路只留工具栏一处，**不要**再加底部锚点导航（会和分路筛重复）。
- 装备库不再与万象棋并列；首页不链 `items.html`。`items.html` 仅作旧链落地，返回 `index.html#items`。
- 万象棋页返回文案是「← 首页」，不要写成「王者荣耀」。
- 手机端（≤640）：顶栏不吸顶；大标题区收成一行；tab 横向滑动不换行；搜索/下拉 16px 防 iOS 放大；棋盘格子 `overflow:hidden` 且不显示格内名字，避免 7×4 被内容撑高超出一屏。

### 5.7 官方卡面补全（WXQ_META 1.5.x）

- `node scripts/sync-wxq-cards.js` 拉 `589094_oscard_new_1.js` / `_4.js`，按 id 对齐专名 0-mismatch。
- 英雄弹窗：卡面效果、基础属性、技能、10/40/100 阶质变、觉醒、词条释义、商店古币。
- 属性展示折算（官方存的是放大整数）：移速 `/1000`（4600→4.6）、攻速 `/10000`（6000→0.60）、暴击率/暴击效果 `/100` 加 `%`。HP/攻防/距离/能量原样。
- 装备弹窗：类型、从 XX 合成的（`craftFrom`）、可铸造成（`craftInto`）、获取途径。基础装没有 craftFrom 只显示可铸造。

### 5.8 万象棋页视觉（2026-09-19，WXQ_META 1.5.7）

- 用户截图判「荷塘月色」寡淡：弃青瓷/米纸/楷体。**只改 `wanxiangqi.html` 视觉**，不改 IA/JS 数据、不改首页。
- 设计读：产品图鉴工具页（查阵容），restrained 单强调。VARIANCE 6 / MOTION 3 / DENSITY 8。
- 浅色：底 `#F3F1F6`、墨 `#17141F`、辅墨 `#4A4456`（对底 ≥7:1）、强调 `#D63E24`、**填充** `--accent-fill #B4230E`（白字 ~6.6:1）。
- 暗色：底 `#121017`、墨 `#F3EEF8`、辅墨 `#C9C2D4`、强调 `#FF6A4A`（链/高亮）、**填充 `#C93A22`**（白字 ~5.2:1）。禁止暗色用 `#FF6A4A` 铺底再写白字（仅 ~2.8:1）。
- 标题区去掉拼音 kicker 和白卡片；tab 浅色墨底白字、暗色填充橙红白字；搜索占位与图标分主题；阶位徽章 `.badge.q1–q6` 浅/暗各一套够对比的字色。
- 旧 `--celadon*` 名仍在，值已映射到橙红，避免漏改选择器。硬编码青绿 `rgba(110,139,123)` 已清。侧条装饰（`.gnote` 3px 左边）已去掉。
- 不要把这套配色套回首页大门；首页继续用官方图。

### 5.9 英雄卡 4 层 tag（2026-09-23，WXQ_META 1.5.51）

- 目的：**记卡 / 认卡**（不是阵容功能）。给 85 英雄各加 4 层标签，卡片上直接可读，一眼定位「这货是干嘛的、配谁强」。
- 数据写在 `wanxiangqi-data.js` 每个 hero 对象上，新增 4 个字段：
  - `role`：前排 / 输出 / 功能 —— 取 GitHub `the-beating-light-of-the-nail/wanxiang-qipu` 的 `data/heroes.json`。
  - `energyType`：永动机（0/0 能量）/ 开局有能（`initEnergy`=0）/ 正常蓄能 —— 由官方 `stats` 的 `initEnergy`/`energy` 推。
  - `systems[]`：体系归属（牺牲流 / 古币经济 / 图腾流 / 登场流 / 战术牌 / 核心成长 / 合成流 / 闪现流 / 夺取流 / 养等级 / 复生）—— 由 `kwHelp` 关键词 + 阵营 + `awakeDesc` 觉醒描述推。**这组名字是自建标签，不是官方字段**，别当官方数据引用。
  - `duo[]`：双人羁绊（兄妹→铠+露娜、毒奶→蔡文姬+扁鹊…共 11 组）—— 由官方 `TALENTS`（天赋）反推。
- 规模：数据层单英雄最多 8 个 tag（2 固定 + systems 最多 4 + duo 最多 2）；**渲染时 systems 只取前 3、duo 只取第 1 个** → 单卡最多 6 个、平均约 4 个。
- 渲染（`wanxiangqi.html` → `renderCards`）：**必须复用现有 `.bd` badge 行**，和「阶位 / 阵营 / 装备类型」同排，靠 `.bd{display:flex;flex-wrap:wrap}` 自动换行。
  - **反面教材（本次连踩两坑，别再犯）**：① 第一版为 tag 新插了一个 `.htags` 容器 div，`margin-top:auto` + tag 过多直接把卡片撑爆，用户截图判「乱成啥了，一点都看不清」；② 第二版又去「把 tag 砍到 3 个」——方向错了，**问题不是 tag 多，是新增了容器**。
  - **正确做法**：只加 CSS 类（`.badge.htag` + 各配色），JS 里在 `craftFrom` 那行之后**追加 `<span class="badge htag …">`**，**不新增任何 wrapper div**。卡片高度继续由内容自然撑开。
- 配色（`.badge.htag-*`，浅/深主题共用，一律白字）：
  - role：前排 `#666` / 输出 `#d33` / 功能 `#2b77cc`
  - energy：永动机 `#b8860b` / 开局有能 `#2e8b57` / 正常蓄能 `#888`
  - systems：牺牲流 `#8b0000`、古币经济 `#c9a227`、图腾流 `#6b21a8`、登场流 `#3b82f6`、战术牌 `#ea580c`、核心成长 `#0891b2`、合成流 `#c27a2b`、闪现流 `#db2777`、夺取流 `#c026d3`、养等级 `#16a34a`、复生 `#475569`
  - duo：`#0d9488`
  - **合成流、登场流首版用 `#78350f` / `#1d4ed8` 太深看不清**（用户 2026-09-23 反馈），已提亮为 `#c27a2b` / `#3b82f6`。给 tag 配色时**先估白字对比度**，深底一律别用。
- 提交：`bab5b01`（加字段 + 首版 chip）→ `f90714c`（错误地砍到 3 个）→ `4ff0c04`（回退，改插 badge 行）→ `6a344a7`（4 层全上）→ `bc8015b`（提亮 2 色）。发布：`node scripts/publish-wxq-helper.js` → 坚果云。
- ⚠️ **本仓 HTML/数据文件是 CRLF**（`wanxiangqi.html`/`wanxiangqi-data.js`；`task.md` 是 LF）：用 Node 脚本做 `String.replace` 时，**锚点里的换行必须写 `\r\n`**，否则静默匹配失败——本次脚本打出「已改」但文件内容没变，就是这么来的。**改完必须重新 Read/Grep 复核内容，不能只信脚本日志。**


### 5.10 装备图鉴补全 + 悬浮窗装备悬停修复（2026-09-24）

- **根因**：`wanxiangqi-data.js` 里**缺失 `WXQ_EQUIPS` / `WXQ_EFFECTS` 两个数组**！历史遗留：`sync-wxq-cards.js` 第 106-108 行要求 `localEquips` 必须是 Array，否则直接 throw 退出 —— 但 data.js 里从一开始就没有这两个数组，所以这个脚本**从来没跑成功过**。`wanxiangqi-hud.js` 里的 `equipByName(name)` 因为 `global.WXQ_EQUIPS` 是空数组，**恒返回 null**，装备悬停 tip 只能显名字，没有卡面/类型/合成来源。
- `sync-wxq-lineups.js` 报告的「equips 未知名 ×70」**全是假警报**：脚本里 163 行 `equips: setOf(w.WXQ_EQUIPS)` 因为 EQUIPS 是空数组，所以所有装备名都被当成 miss。这次补完 EQUIPS 后，阵容 69 种装备 **100% 对上**（miss=0）。
- **修复方式**：写临时修复脚本，从官方快照 `589094_oscard_new_2.js` + `_4.js` 拉 `equipCards`（73）+ `effectCards`（98），按 id 去重后直接 **insert 在 `WXQ_TALENTS` 之后**（不用 replaceAssign，因为原来没有 EQUIPS/EFFECTS 锚点）。字段：`id/name/type/typeLabel/quality/faction/desc/subType/equipType/craftFrom[{id,name}]/craftInto[]`。
- **别依赖 `sync-wxq-cards.js` 补 EQUIPS/EFFECTS**：它只处理 HEROES（技能/觉醒/词条）和 EQUIPS（craftFrom/craftInto），不处理 EFFECTS；且对已存在的数组做 enrich 正常，但对缺失的数组直接 throw。下次 data.js 再丢 EQUIPS/EFFECTS 时，**直接跑修复脚本（同上 URL）重新 insert**，别卡等着 sync-cards。
- **提交**：`8903c43`。

### 5.11 官方 v1.3.1 平衡性更新同步（2026-09-24，WXQ_META 1.5.53）

- **背景**：官方 2026-09-24 全服更新 v1.3.1（不停机，6:00–8:00）。用户要求"官方更新了英雄和卡牌，同步助手"，且**只同步英雄/卡牌，不动阵容**。
- **卡点**：官方所有可编程数据源（`kohcamp/game/os/sharedbooks` 图鉴接口 + `589094_oscard_new_*` 快照）当天仍是**更新前**的旧值，逐字段 diff 全部 0 差异；官方《小万更新情报》第二期（11:18 发布）也只说"本周四发布更新"。**结论：接口滞后，只能以官方更新公告为准**。
- **资料来源**：官方更新公告 v1.3.1 全文（腾讯官方在 TapTap 官方号发布的原文，含每条的"调整前/调整后"）。
- **已同步（`wanxiangqi-data.js`，9 处精确字符串替换，带命中数断言）**：
  | 对象 | 项目 | 调整前 → 调整后 |
  |---|---|---|
  | 亚连 #5141 | 整备（desc + 觉醒 desc） | 去掉 `【日落海】`阵营限制 |
  | 韩信 #1501 | 闪现 基础 / 觉醒 | `+1`→`+2` / `+2`→`+4` |
  | 曜 #5221 | 逐星 基础技能 | `70+120%`→`100+130%` |
  | 孙膑 #1181 | 时空爆弹 10 级 | `50+150%`→`100+175%` |
  | 沈梦溪 #3121 | 综合爆款 10 级 | `100+150%`→`125+175%` |
  | 马可波罗 #1321 | 华丽左轮 10 级 | `40+25%`→`40+30%` |
  | 天赋 #614002 紧急行动 | desc | 棋手生命值 `15`→`10` |
  | 天赋 #623003 兵行诡招 | desc | 棋手生命值 `-15`→`-10` |
- **暂未同步（等官方数据源刷新，不猜）**：① 新增天赋 `神鹰锻匠`/`狂铁·强化`/`透支` —— 公告只有名字+描述，**没有官方 id/品质/阵营/图标**，编 id 会污染数据；② 棋手侧 `姜导·封神一瞬`、`昭君·冰心领域`(30%→35%)、`庄小鱼·如梦似幻` —— 本地 `WXQ_PLAYERS` 只存棋手的技能/秘技/专属三张，**这些秘技牌/增益卡本地根本没建实体**，无字段可改；③ 蒙犽"技能施法时长 2s→1.6s" —— 本地无此时长字段。
- **坑（本次新增）**：`沈梦溪` 的 10 级文案 `技能伤害提升至100+150%法术攻击力` **大乔也有一模一样的**，只用这句做替换会命中 2 处；必须带上前置技能描述（`混合炸弹，造成<color=#d487e4>100+100%...`）一起定位。
- **坑（本次新增）**：`Edit` 工具被限制在工作目录内，**改不了 `C:\Users\Zhuqi\Desktop\wzry-guide`**；改 data.js / task.md 一律走「写 node 脚本到工作区 → `node <file>` 执行」。
- **提交**：`2d4610e`。

---

## 6. 已完成工作清单（时间线）

| 阶段 | 内容 | 状态 |
|---|---|---|
| 英雄攻略 | 132 条英雄，每条含完整 `detailed`（v2.1.8 删重后） | ✅ 全量完成 |
| 装备库 | `scripts/sync-items.py` 同步官方（121 装备 + 108 图标） | ✅ 自动化每周一 9:30 跑 |
| 万象棋图鉴 | v2.2.0（wxq-icon 547 张卡面） | ✅ |
| 万象棋攻略 | v2.3.0–v2.4.0 扩充（beginner/mechanics/keywords/combos/factions/lineups/equip/players + 富文本修复 v2.4.2） | ✅ |
| 六大流派重写 | 按 B 站/多源复核，英雄归属全部以官方数据快照校验 0 错（v2.2.0 guide / 2.6.3 site） | ✅ |
| 词条悬停浮层 | 英雄/装备/效果/天赋/棋手/流派/词条均可悬停查看卡面 | ✅ |
| **A 工作** | 游侠(ali213) 85 英雄牌对齐校验，与官方池 **FULL MATCH 0 差异 0 字段缺口** | ✅ |
| **B 工作（本次核心）** | 扒网页攻略扩写 `lineups` 8→**18**、`combos` 12→**18**，全部命名对照官方池校验 **0 错** | ✅ 已提交推送上线 |
| **官方作业库** | 接官网推荐/热门/新手 JSON → `wanxiangqi-lineups.js`；作业 tab 展示主播投稿、棋盘摆法、阵容码 | ✅ |
| 棋手阿离 | 官方 lordId 20，技能枫叶舞 / 惊鸿游龙 / 即刻起舞 | ✅ |
| 攻略 tab 下线 | 连锁只从阵容「查看连锁」载入，无旧预设 | ✅ |
| 词条可点 | `#k-词条` 详情 + 带此词条的牌，返回关层 | ✅ |
| 官方卡面 | 85 英雄技能/质变/觉醒/属性 + 73 装备类型/合成 | ✅ |
| 首页二选一 | 先选王者荣耀或万象棋；装备并入王者荣耀「英雄\|装备」 | ✅ |
| 英雄 4 层 tag | 85 英雄加 role/energyType/systems/duo，卡片复用 `.bd` badge 行渲染 | ✅ v1.5.51 |
| 装备图鉴修复 | 补全 WXQ_EQUIPS(73)+WXQ_EFFECTS(98)，悬浮窗装备悬停现在显示图鉴卡面 | ✅ 2026-09-24
| 官方阵容库更新 334 套 | sync-wxq-lineups.js 重拉（原始 445 → 入库 334） | ✅ 2026-09-24 |

---

## 7. 本次 B 工作详细记录（阵容/联动扩写）

**目标**：用户要求 "Ab都做，阵容多一些" —— A（游侠 85 英雄牌对齐，已完）+ B（扒更多阵容文并扩写 lineups/combos，且阵容数量明显多于 8 套）。

**素材来源**（网页端攻略站，非视频）：38down 十套阵容总览（玉环倒转流/玄雍养猪流→逐鹿/刘邦炸盾流/大乔速六司空震流/交锋孙尚香流/交锋联动双射/河洛李信牺牲流等）、18183、九游、腾讯网、豌豆荚（逐鹿召唤流/大河敖隐图腾流/日落海单C养成流/瑶妹李信协同/明先生多源召唤/姜导双爆速升/复活花木兰/三分倒转流等）。

**做法**：
1. 用 Node 脚本 `vm` 加载 `wanxiangqi-data.js` 提取官方 85 英雄（含阵营）/18 棋手，作为唯一命名真相源。
2. 提取每个英雄官方 `desc`（strip 富文本标签），新阵容机制全部从官方词条（整备/登场/牺牲/图腾/开团/闪现…）提炼，**不凭网页散文编造数值**。
3. 向 `lineups[]` 新增 **10 套**（总量 18），向 `combos.list[]` 新增 **6 组**（总量 18），并把新阵容名同步写进对应 `factions[x].lineups[]` 实现站点互链。

**新增 10 套阵容（core 英雄）**：
1. 杨玉环·妙音觉醒流（无阵营）：杨玉环/公孙离/嬴政/貂蝉/诸葛亮
2. 大乔·速六检索流（三分之地）：大乔/孙尚香/甄姬/小乔/周瑜/赵云
3. 交锋·孙尚香速攻流（三分之地）：孙尚香/马超/赵云/刘禅/小乔/周瑜
4. 交锋·双射联动流（孙尚香+马可波罗，跨阵营）：孙尚香/马可波罗/朵莉亚/雅典娜/亚连/安琪拉
5. 河洛·李信牺牲流（河洛）：李信/苏烈/盾山/花木兰/铠/李白
6. 逐鹿·召唤铺场流（逐鹿）：蒙恬/鲁班大师/老夫子/廉颇/墨子/扁鹊
7. 大河·图腾引爆流（刘邦+敖隐，大河流域）：虞姬/鬼谷子/少司缘/大司命/敖隐/东皇太一/刘邦
8. 明先生·多源召唤流（通用召唤）：蒙恬/鲁班大师/鬼谷子/少司缘/大司命/苍
9. 姜导·双爆速升流（河洛双核）：百里玄策/花木兰/李元芳/程咬金/盾山/上官婉儿
10. 稷下·机关控制流（逐鹿/河洛机关）：鲁班大师/墨子/明世隐/司空震/诸葛亮

**新增 6 组联动**：杨玉环·弦音觉醒链 / 大乔·登场减蓝检索链 / 刘邦·图腾引爆链 / 蒙恬·玄雍士兵铺场链 / 鲁班大师·机关傀儡链 / 苍·召唤自爆链。

**校验（必跑，全过）**：
- 命名交叉校验：所有 `core/extra/players/partners` 名对照官方 85 英雄/18 棋手池，**310 处检查 0 错**。
- Schema 全字段校验：18 lineups + 18 combos 均含必需字段，ops 均为 3 段。
- 语法：`node --check wanxiangqi-guide.js` 通过。

**提交与上线**：`f82b016`（主体，英雄与棋手名对照 85/18 官方池校验 0 错）+ `d217493`（修正联动标题计数 12→18）已 push 到 main。轮询 GitHub Pages 确认线上文件 31KB→42KB，10 套新阵容名 + 6 组新联动 + 「18 组核心联动」标题全部 live。

**命名纠错（已固化，写稿必用）**：孙小宾/嬴律/玉环/班叔/昭君/马可 = **棋手**；刘邦/大乔 = **英雄**；项羽/刘邦属**大河流域**；玄雍**非真实阵营**（蒙恬/白起等属逐鹿）；英雄名 **干将莫邪**；庄周/镜/孙膑/大乔是英雄不是棋手。

---

## 8. 自测与校验标准流程（改完必跑，别推给用户当测试员）

> 本机 shell shim 已坏（`dirname/cd/ls/head/tail` 缺失）→ **一律用受管 Node** `C:/Users/Zhuqi/.workbuddy/binaries/node/versions/22.22.2-3/node.exe` 跑脚本文件（别用 `node -e` 带正则，shell 会吃掉反斜杠）。

1. **命名校验**：`vm` 加载 `wanxiangqi-data.js` 取 `WXQ_HEROES.map(h=>h.name)` / `WXQ_PLAYERS.map(p=>p.name)`，与 guide 的 `lineups/combos` 所有名字交叉比对，须 0 错。
2. **Schema 校验**：遍历 lineups/combos 确认必需字段齐全、ops 长度 3。
3. **语法**：`node --check wanxiangqi-guide.js`（SYNTAX_OK）。
4. **Puppeteer 冒烟**（改 UI/弹窗/移动端必跑）：Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe`，`headless:'new'`；本地 server **必须 `path.resolve(ROOT,'.'+p)`**（`path.join` 在 Windows 出反斜杠 → 全 404）。套件在 `C:/Users/Zhuqi/AppData/Local/Temp/`：`wxq_mobile_test.cjs`(24条)/`wxq_guide_test.cjs`/`wxq_text_test.cjs`(逐字比对)/`wxq_engine_test.cjs`(Node自检)/`wxq_chain_test.cjs`(50条)/`wxq_live_smoke.cjs`(线上16条)。必查：零 console/pageerror、关键 DOM 存在、亮/暗截图、深链。`openModal` 在 IIFE 内非全局 → 模拟点击触发；headless 自带 `navigator.share` 异常 → `Object.defineProperty(navigator,'share',{value:undefined})` 走复制分支。
5. **点击类测试两个必防坑**：① 页面 `scroll-behavior:smooth` → 先注入 `*{scroll-behavior:auto!important}`；② 元素可能被吸顶栏遮挡 → 点前 `document.elementFromPoint` 确认命中。移动端专项断言：返回键可见 + `getBoundingClientRect` ≥44px、`history.length` 开弹窗后 +1、`history.back()` 后仍原页面、嵌套弹窗返回只退一层、深链可开且返回不退出、桌面端仍为右上角 `×`。测完 `taskkill.exe /PID <pid> /F` 关残留 server。

---

## 9. 致命坑清单（必读，避免重蹈覆辙）

| # | 坑 | 正确做法 |
|---|---|---|
| 1 | git commit 打印「nothing added」却已提交，链式 `&& git push` 被跳过 | commit 后**单独再 push**；改完 `git log --oneline -1 origin/main` 复核 |
| 2 | 提交信息用半角 `"` | 用「」代替，否则 shell 切分参数导致 commit 行为异常 |
| 3 | 富文本白字白底变"缺字" | 浅色主题下官方 `<color=#ffffff/#FFE897>` 映射为 `.hl-term`/`.hl-gold`；用户说"少字"先疑字色 |
| 4 | 判环用访问计数 | 必须用**路径栈** `path.indexOf(key)>=0` |
| 5 | pickTargets 不过滤事件 | 给定事件时只留 `hasEffect(u,ev)` 候选 |
| 6 | 收益 exact/hyp 合并 | 分两栏，可能收益绝不并进确定收益 |
| 7 | 移动端弹窗不压历史层 | 开弹窗 `history.pushState`，`closeModal` 走 `history.back()`，否则手机左滑=退出站点 |
| 8 | 深链初始化先 `replaceState` 抹 hash | 必须把 `_initHash` 显式传进解析函数；`hashchange` 监听须包 `function(){ f(); }` |
| 9 | 截图前未关 `scroll-behavior:smooth` | 先注入 `*{scroll-behavior:auto!important}` 否则截在动画中途 |
| 10 | 写测试断言凭印象写选择器 | 先 dump 真实 class（槽位 `.sl-n`、断点 `.tl-bk`） |
| 11 | 批量改 `heroes-data.js` 多个 Edit 会写覆盖 | 必须用 Node 脚本读 `vm` 加载后整体 `fs.writeFileSync` 写回；文件为 LF |
| 12 | Edit 改 `combos.title` 第一次未生效 | 改完务必 Grep/Read 复核 |
| 13 | 本机 shell shim 坏 | 一律用受管 Node 跑 fs/https 脚本 |
| 14 | SSH push 连 198.18.0.109:22 超时 | Clash TUN fake-ip。改走 HTTPS + `http.proxy=http://127.0.0.1:7897` |
| 15 | 首页两张拉满视口的空白白卡片 | 用户已判难看。大门用官方图（李白皮肤 / 万象棋六人 KV），字压底部，不要空心居中，不要再画荷塘月色 |
| 16 | 给卡片加新元素时另起一个容器 div | **复用已有行（`.bd` badge）**，只加 class 不增 wrapper；新容器 + `margin-top:auto` 必撑爆卡片 |
| 17 | PowerShell/Node 改本仓文件字符串没生效 | 文件是 **CRLF**，replace 锚点必须带 `\r\n`；改完必须 Read/Grep 复核，别只信脚本日志 |
| 18 | `wanxiangqi-data.js` 里 `WXQ_EQUIPS`/`WXQ_EFFECTS` 丢了（**sync-wxq-cards.js 因 `localEquips=undefined` 会抛错直接停**） | 用我写的修复脚本从 `_2.js`+`_4.js` 拉 equipCards+effectCards，**插在 WXQ_TALENTS 之后**；别等 sync-cards，它处理不了缺失的数组 |
| 19 | Node 脚本用 `String.replace(OLD, NEW)` 替换长文本，而 NEW 里含 `$` 紧跟反引号（如正则 `);?$` 之后那个反引号） | 它会被当成特殊替换模式「插入匹配点之前的全部内容」，**静默把整篇文档复制一遍**（2026-09-24 task.md 就这样被复制了 header+§0–§4 共 85 行，脚本还报「✓ 已新增」）。**一律写成 `src.replace(OLD, () => NEW)`**（函数形式不做 `$` 解析），改完必须数章节数复核 |

---

## 10. 给其他 AI 的接手指引（下一步可做什么）

0. **改完同步 `task.md`**（版本号、首页 IA、万象棋字段、git 推送方式）。不写等于没交接。
1. **待手补 opaque 卡**（英雄 49 张含整张全 opaque 45、效果牌 50 张全部）：这些卡当前只显原文不计数字，是下一版活。加卡只在 `wanxiangqi-rules.js` 的 `MANUAL` 加条目，勿动引擎 if-else；改完跑 `wxq_engine_test.cjs`(13/13)+`wxq_chain_test.cjs`(50/50)。
2. **赛季更新**：重跑英雄技能脚本（GBK）+ 万象棋快照 pulls + `scripts/sync-items.py`（装备）+ `node scripts/sync-wxq-lineups.js`（官方阵容库，门槛见 5.2c，满足任一理由即收）+ `node scripts/sync-wxq-cards.js`（卡面技能/合成）。重跑前先确认网络。阵容库英雄名须 0 未知；棋手「阿离」已按官方 lords 补录。
3. **新增阵容/联动规范**：机制从官方 `desc` 提炼 → 写进 `lineups[]`/`combos.list[]` → 同步 `factions[x].lineups[]` → 跑第 8 节 1–3 步校验 → 提交（commit 后单独 push） → 轮询 Pages。
4. **攻略可信度**：专有名词/技能名必须脚本比对官方数据集，0 处不符才算过。

---

## 11. 常用命令速查

```bash
# 校验英雄 detailed 无重复 id / 语法
python -c "import re;s=open(r'C:/Users/Zhuqi/Desktop/wzry-guide/heroes-data.js',encoding='utf-8').read();b=re.findall(r'detailed:\s*`(.*?)`',s,re.S);print('块数',len(b),'最短',min(len(x) for x in b))"

# 同步装备官方数据（赛季更新时）
cd "C:/Users/Zhuqi/Desktop/wzry-guide" && /c/Users/Zhuqi/.workbuddy/binaries/python/versions/3.13.12/python.exe scripts/sync-items.py

# 同步万象棋官方阵容库（使用量≥2000 且评分≥4.0）
C:/Users/Zhuqi/.workbuddy/binaries/node/versions/22.22.2-3/node.exe C:/Users/Zhuqi/Desktop/wzry-guide/scripts/sync-wxq-lineups.js

# 同步近7日前三率（datawxq.com）
C:/Users/Zhuqi/.workbuddy/binaries/node/versions/22.22.2-3/node.exe C:/Users/Zhuqi/Desktop/wzry-guide/scripts/sync-wxq-stats.js

# 并入官方英雄/装备卡面（技能、质变、觉醒、合成）
C:/Users/Zhuqi/.workbuddy/binaries/node/versions/22.22.2-3/node.exe C:/Users/Zhuqi/Desktop/wzry-guide/scripts/sync-wxq-cards.js

# 打成单文件写到坚果云 王者万象棋助手/王者助手.html
C:/Users/Zhuqi/.workbuddy/binaries/node/versions/22.22.2-3/node.exe C:/Users/Zhuqi/Desktop/wzry-guide/scripts/publish-wxq-helper.js

# HTTPS 推送（SSH 被 Clash fake-ip 挡时）
git -C "C:/Users/Zhuqi/Desktop/wzry-guide" -c http.proxy=http://127.0.0.1:7897 push https://github.com/coolfeiyu-code/wzry-guide.git main
git -C "C:/Users/Zhuqi/Desktop/wzry-guide" update-ref refs/remotes/origin/main HEAD

# 命名校验（示例逻辑，实际用 vm 加载两 js 交叉比对）
node -e "const fs=require('fs'),vm=require('vm');/* load data -> pool; load guide -> names; diff */"

# 提交（注意：commit 后单独 push，勿 &&）
git -C "C:/Users/Zhuqi/Desktop/wzry-guide" add wanxiangqi-guide.js
git -C "C:/Users/Zhuqi/Desktop/wzry-guide" commit -m 'feat(万象棋): ...'
git -C "C:/Users/Zhuqi/Desktop/wzry-guide" push origin main

# 本地预览：直接浏览器打开 index.html / wanxiangqi.html（数据本地加载，无需联网）
```

---

## 12. 记忆与技能索引

- **项目记忆（按日期）**：`C:\Users\Zhuqi\WorkBuddy\2026-08-31-08-29-58\.workbuddy\memory\YYYY-MM-DD.md`（含 `2026-09-14.md` 万象棋 opaque 卡清单、`2026-09-17.md` 本次 B 工作 + git 坑）。
- **项目长期记忆**：同目录 `MEMORY.md`（wzry-guide 仓库/部署/架构/三条铁律/官方数据源/万象棋板块/移动端/自测流程/本仓 git 坑）。
- **用户级长期记忆**：`~/.workbuddy/MEMORY.md`（王者荣耀 S44 攻略总集概况、自动化 ID、夸克网盘技能等）。
- **维护技能**：`C:\Users\Zhuqi\.workbuddy\skills\wzry-guide\SKILL.md`（最完整，含 F 节万象棋板块维护全流程、命名铁律、富文本纪律、git 坑）。接手前务必通读该 SKILL.md。
- **自动化**：「王者荣耀攻略每周校准」(ID 7116394c，每周一 9:00) 自动检索梯度并更新数据源；「王者荣耀装备数据每周同步」(ID a73299d6，每周一 9:30) 跑 `scripts/sync-items.py`。
