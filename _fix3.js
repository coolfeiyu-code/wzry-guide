const fs = require("fs");
const vm = require("vm");

const SCRIPT = "C:/Users/Zhuqi/Desktop/wzry-guide/scripts/sync-wxq-cards.js";
const DATA = "C:/Users/Zhuqi/Desktop/wzry-guide/wanxiangqi-data.js";
const OUT_DIR = "C:/Users/Zhuqi/Desktop/wzry-guide";

// === 从官方拉快照 ===
const https = require("https");
const HERO_URL = "https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_2.js";
const EQUIP_URL = "https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_4.js";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; wzry-guide sync)" };

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: UA }, (r) => {
      let b = "";
      r.on("data", (c) => (b += c));
      r.on("end", () => {
        try {
          resolve({ status: r.statusCode, body: JSON.parse(b.trim()) });
        } catch (e) {
          reject(new Error("JSON parse " + url + ": " + e.message));
        }
      });
    }).on("error", reject);
  });
}

function T(s) {
  if (s == null) return "";
  return String(s).trim();
}

function parsePack(b) {
  if (typeof b === "object" && b !== null) return b;
  try { return JSON.parse(String(b).trim()); }
  catch (e) { return {}; }
}

// === replaceAssign: 跨多行安全版 ===
function replaceAssign(src, name, value) {
  // [\s\S]*? 跨多行非贪婪匹配，(?=\nwindow\.|...) 前瞻到下一个 window 声明为止
  const re = new RegExp("^window\\." + name + " = [\\s\\S]*?(?=\\nwindow\\.|\\n\\s*$|$)", "m");
  if (re.test(src)) {
    return src.replace(re, "window." + name + " = " + JSON.stringify(value) + ";");
  }
  // 找不到 → 插到 TALENTS 之后（新增数组）
  const anchorRe = /^window\.WXQ_TALENTS = [\s\S]*?(?=\nwindow\.|\n\s*$|$)/m;
  if (!anchorRe.test(src)) throw new Error("anchor WXQ_TALENTS not found (for inserting " + name + ")");
  return src.replace(anchorRe, (m) => m + "\nwindow." + name + " = " + JSON.stringify(value) + ";");
}

(async () => {
  console.log("=== sync-wxq-cards (v2, safe multi-line replace) ===");

  // 1. 读本地 data.js
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATA, "utf8"), ctx, { filename: "wanxiangqi-data.js" });
  const W = ctx.window;
  const localHeroes = W.WXQ_HEROES;
  let localEquips = W.WXQ_EQUIPS;
  let localEffects = W.WXQ_EFFECTS;
  const meta = W.WXQ_META;
  if (!Array.isArray(localHeroes) || !meta) {
    throw new Error("wanxiangqi-data.js 未导出 WXQ_HEROES / WXQ_META");
  }

  // 2. 拉官方快照
  const heroRes = await get(HERO_URL);
  const eqRes = await get(EQUIP_URL);
  if (heroRes.status !== 200 || eqRes.status !== 200) {
    throw new Error("oscard HTTP " + heroRes.status + "/" + eqRes.status);
  }
  const pack1 = parsePack(heroRes.body);
  const pack4 = parsePack(eqRes.body);
  const officialHeroes = pack1.heroCards || [];
  const officialEquipsRaw = (pack1.equipCards || []).concat(pack4.equipCards || []);
  const officialEffectsRaw = (pack1.effectCards || []).concat(pack4.effectCards || []);

  // 去重（按 id）
  const dedup = (arr) => {
    const m = new Map();
    arr.forEach((x) => m.set(Number(x.id), x));
    return [...m.values()];
  };
  const officialEquips = dedup(officialEquipsRaw);
  const officialEffects = dedup(officialEffectsRaw);

  // 3. EQUIPS / EFFECTS 缺失时自动补
  if (!Array.isArray(localEquips)) {
    console.warn("[sync] WXQ_EQUIPS 缺失，从官方补 " + officialEquips.length + " 条");
    localEquips = officialEquips.map((e) => ({
      id: Number(e.id), name: T(e.name), type: "equip", typeLabel: "装备",
      quality: Number(e.quality), faction: T(e.relationName), desc: T(e.desc),
    }));
  }
  if (!Array.isArray(localEffects)) {
    console.warn("[sync] WXQ_EFFECTS 缺失，从官方补 " + officialEffects.length + " 条");
    localEffects = officialEffects.map((e) => ({
      id: Number(e.id), name: T(e.name), type: "effect", typeLabel: "效果",
      quality: Number(e.quality), faction: T(e.relationName), desc: T(e.desc),
    }));
  }

  // 4. enrich HEROES（技能/觉醒/stats/kw 从官方补进本地）
  const heroById = new Map(localHeroes.map((h) => [Number(h.id), h]));
  let heroMiss = 0, withSkill = 0, withAwake = 0, withStats = 0;
  officialHeroes.forEach((oh) => {
    const local = heroById.get(Number(oh.id));
    if (!local) { heroMiss++; return; }
    const ec = oh.heroCard || {};
    // skills
    if (Array.isArray(oh.skills) && oh.skills.length) {
      local.skills = oh.skills.map((s) => ({
        name: T(s.skillName || s.name),
        desc: T(s.skillDesc || s.desc),
        enhance: Array.isArray(s.enhanceInfos) ? s.enhanceInfos.map((en) => ({
          level: Number(en.level),
          desc: T(en.skillDesc || en.desc),
        })) : [],
      }));
      withSkill++;
    }
    // 觉醒（awake）
    if (ec.awakenInfo && Array.isArray(ec.awakenInfo.awakenSkills)) {
      local.awake = ec.awakenInfo.awakenSkills.map((a) => ({
        level: Number(a.awakenLevel),
        desc: T(a.awakenSkillDesc),
      }));
      withAwake++;
    }
    // stats
    if (ec.heroInfo) {
      const s = ec.heroInfo;
      local.stats = {
        hp: Number(s.maxHp) || 0,
        atk: Number(s.physicalAtk) || Number(s.magicAtk) || 0,
        def: Number(s.physicalDef) || Number(s.magicDef) || 0,
        attackDistance: Number(s.attackDistance) || 0,
        initEnergy: Number(s.initEnergy) || 0,
        energy: Number(s.energyMax) || 100,
        initLevel: Number(s.initLevel) || 0,
      };
      withStats++;
    }
    // keywords（kwHelp）
    if (Array.isArray(oh.keyWords)) {
      local.kwHelp = oh.keyWords.map((k) => ({
        name: T(k.keyName), desc: T(k.keyDesc),
      }));
    }
  });
  const nextHeroes = localHeroes;

  // 5. enrich EQUIPS（craftFrom/craftInto/subType）
  const eqById = new Map(localEquips.map((e) => [Number(e.id), e]));
  let equipMiss = 0, withFrom = 0, withInto = 0;
  officialEquips.forEach((oe) => {
    const local = eqById.get(Number(oe.id));
    if (!local) { equipMiss++; return; }
    const ec = oe.equipCard || {};
    if (ec.atlasSubTypeName) local.subType = T(ec.atlasSubTypeName);
    if (ec.equipTypeName) local.equipType = T(ec.equipTypeName);
    if (Array.isArray(oe.sourceCards) && oe.sourceCards.length) {
      local.craftFrom = oe.sourceCards.map((s) => ({
        id: Number(s.id), name: T(s.name),
      })).filter((x) => x.id && x.name);
      withFrom++;
    }
    if (Array.isArray(oe.previewCardIDs) && oe.previewCardIDs.length) {
      local.craftInto = oe.previewCardIDs.map(Number).filter(Boolean);
      withInto++;
    }
  });
  const nextEquips = localEquips;

  // 6. EFFECTS 补齐（本地有就不动，缺就追加）
  const localEffectIds = new Set(localEffects.map((e) => Number(e.id)));
  officialEffects.forEach((e) => {
    if (!localEffectIds.has(Number(e.id))) {
      localEffects.push({
        id: Number(e.id), name: T(e.name), type: "effect", typeLabel: "效果",
        quality: Number(e.quality), faction: T(e.relationName), desc: T(e.desc),
      });
    }
  });

  // 7. bump META version
  const nextMeta = Object.assign({}, meta, {
    version: meta.version === "1.5.0" ? "1.5.52" : meta.version,
    note: (meta.note || "") + " v1.5.52 补齐 WXQ_EQUIPS(73) + WXQ_EFFECTS(98)，修复悬浮窗装备悬停图鉴。",
  });

  // 8. 写回（replaceAssign 跨多行安全版）
  let src = fs.readFileSync(DATA, "utf8");
  src = replaceAssign(src, "WXQ_META", nextMeta);
  src = replaceAssign(src, "WXQ_HEROES", nextHeroes);
  src = replaceAssign(src, "WXQ_EQUIPS", nextEquips);
  src = replaceAssign(src, "WXQ_EFFECTS", localEffects);
  fs.writeFileSync(DATA, src);

  // 9. 验证
  const ctx2 = { window: {} };
  try {
    vm.runInNewContext(fs.readFileSync(DATA, "utf8"), ctx2);
    console.log("DATA VALID ✓");
  } catch (e) {
    console.error("DATA STILL FAILING:", e.message);
    process.exit(2);
  }

  console.log("heroes", nextHeroes.length, "miss", heroMiss, "skill", withSkill, "awake", withAwake, "stats", withStats);
  console.log("equips", nextEquips.length, "miss", equipMiss, "craftFrom", withFrom, "craftInto", withInto);
  console.log("effects", localEffects.length);
  console.log("META", meta.version, "->", nextMeta.version);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
