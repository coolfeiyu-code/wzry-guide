# 王者荣耀 S44 攻略总集 · 王者万象棋板块 — 工作交接文档（task.md）

> 最后更新：2026-09-18
> 用途：本文件记录项目从 0 到当前的全部工作脉络、架构、铁律、已踩的坑与下一步。任何 AI 接手前先通读本文件，可避免重复踩坑与重复提问。
> 当前版本状态：站点 `heroes-data.js` **v2.6.5**（提交作业页时 pre-commit 会再升 patch）；万象棋数据快照 `WXQ_META` **v1.0.0**（capturedAt 2026-09-14）；官方阵容作业库 `WXQ_JOBS` **v1.0.0**。
> 线上地址：`https://coolfeiyu-code.github.io/wzry-guide/`

---

## 0. 一句话定位

这是一个**零构建、纯静态、数据驱动**的王者荣耀攻略站，包含三大块：① 132 英雄详细攻略（S44）② 121 装备库 ③ **王者万象棋图鉴+攻略板块（近期工作重点）**。所有内容由本地的 `*.js` 数据文件驱动，HTML 只做渲染。改内容 = 改数据文件，几乎不动 HTML。

---

## 1. 仓库与部署架构（必读）

| 项 | 值 |
|---|---|
| 本地路径 | `C:\Users\Zhuqi\Desktop\wzry-guide` |
| GitHub | `coolfeiyu-code/wzry-guide`（SSH remote，**需 VPN** 才能 push） |
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
├── index.html              英雄攻略渲染器（月色/暗色主题、移动端、分享深链、出装自动图标注入）
├── heroes-data.js          英雄单一数据源：GUIDE_META(version/updateLog) + HEROES(132)
├── items.html              装备库渲染器
├── items-data.js           装备数据源(121) + items-icon/(108 图) — 由 scripts/sync-items.py 生成（勿手工编辑）
├── scripts/
│   ├── sync-items.py       装备官方数据同步脚本
│   ├── sync-wxq-lineups.js 万象棋官方阵容推荐库同步（推荐/热门/新手）
│   └── item-changes.json   手工维护的赛季装备改动档（仅用户说"S45 装备改动"时更新）
├── wanxiangqi.html         万象棋页。默认「阵容」通栏详情；tab：阵容/棋手/英雄/效果/装备/天赋/连锁。攻略 tab 已下线。连锁无旧预设，从阵容「查看连锁」载入。版本只升 WXQ_META
├── wanxiangqi-data.js      万象棋官方快照只读数据源（WXQ_META + WXQ_PLAYERS(18)/HEROES(85)/EFFECTS(98)/EQUIPS(73)/TALENTS(255)/FACTIONS(7)）。**严禁手改**
├── wanxiangqi-guide.js     万象棋攻略数据（WXQ_GUIDE，手工维护，改文案改这里）
├── wanxiangqi-lineups.js   官方阵容推荐库（WXQ_JOBS，scripts/sync-wxq-lineups.js 生成，**勿手改**）
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
  ② 主快照 `game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_{1,2,4,8,16}.js`（_1 heroCards85/_2 effectCards98/_4 equipCards73/_8 talentCards255/_16 lords18），每卡含 `thumb`(网格)/`cardImage`(弹窗)/`icon`/`portrait` + `relationName`(阵营) + `desc`(`<color=...>` 富文本)。
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

### 5.2 连锁 tab 四层架构（v2.6.0，新增卡只改 B 层）

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

- `wanxiangqi.html` 自动链接英雄/装备/效果/天赋/棋手/流派/词条，Puppeteer 测过 **1382 词**、移动端 OK。

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

---

## 10. 给其他 AI 的接手指引（下一步可做什么）

1. **待手补 opaque 卡**（英雄 49 张含整张全 opaque 45、效果牌 50 张全部）：这些卡当前只显原文不计数字，是下一版活。加卡只在 `wanxiangqi-rules.js` 的 `MANUAL` 加条目，勿动引擎 if-else；改完跑 `wxq_engine_test.cjs`(13/13)+`wxq_chain_test.cjs`(50/50)。
2. **赛季更新**：重跑英雄技能脚本（GBK）+ 万象棋快照 pulls + `scripts/sync-items.py`（装备）+ `node scripts/sync-wxq-lineups.js`（官方作业库）。重跑前先确认 VPN/网络。作业库英雄名须 0 未知；棋手「阿离」当前不在 18 人快照里，允许保留并在 unknown.players 列出。
3. **新增阵容/联动规范**：机制从官方 `desc` 提炼 → 写进 `lineups[]`/`combos.list[]` → 同步 `factions[x].lineups[]` → 跑第 8 节 1–3 步校验 → 提交（commit 后单独 push） → 轮询 Pages。
4. **攻略可信度**：专有名词/技能名必须脚本比对官方数据集，0 处不符才算过。

---

## 11. 常用命令速查

```bash
# 校验英雄 detailed 无重复 id / 语法
python -c "import re;s=open(r'C:/Users/Zhuqi/Desktop/wzry-guide/heroes-data.js',encoding='utf-8').read();b=re.findall(r'detailed:\s*`(.*?)`',s,re.S);print('块数',len(b),'最短',min(len(x) for x in b))"

# 同步装备官方数据（赛季更新时）
cd "C:/Users/Zhuqi/Desktop/wzry-guide" && /c/Users/Zhuqi/.workbuddy/binaries/python/versions/3.13.12/python.exe scripts/sync-items.py

# 同步万象棋官方阵容推荐库（作业 tab）
C:/Users/Zhuqi/.workbuddy/binaries/node/versions/22.22.2-3/node.exe C:/Users/Zhuqi/Desktop/wzry-guide/scripts/sync-wxq-lineups.js

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
