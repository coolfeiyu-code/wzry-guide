#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
王者荣耀 装备库数据同步脚本
=================================
功能：
  1. 抓取官方装备数据 pvp.qq.com/web201605/js/item.json
  2. 清洗 HTML 描述 -> 纯文本（属性 / 被动）
  3. 分类映射 + 并发下载装备图标到本地 items-icon/
  4. 合并手工维护的改动档 scripts/item-changes.json
  5. 生成 items-data.js（window.ITEMS）

用法：
  python scripts/sync-items.py              # 全量同步（抓数据 + 下图标）
  python scripts/sync-items.py --no-icon    # 只刷数据，不动图标
  python scripts/sync-items.py --local-json path/to/item.json   # 用本地 JSON 兜底

赛季更新时重跑本脚本即可自动同步装备数值。
"""
import json
import os
import re
import sys
import urllib.request
import concurrent.futures as cf
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "items-icon")
CHANGES_FILE = os.path.join(ROOT, "scripts", "item-changes.json")
OUT_FILE = os.path.join(ROOT, "items-data.js")

SRC_JSON = "https://pvp.qq.com/web201605/js/item.json"
ICON_BASE = "https://game.gtimg.cn/images/yxzj/img201606/itemimg/{}.jpg"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# item_type -> (分类 id, 中文名)
CAT_MAP = {
    1: ("atk", "攻击"),
    2: ("magic", "法术"),
    3: ("def", "防御"),
    4: ("move", "移动"),
    5: ("jungle", "打野"),
    6: ("season", "赛季神器"),
    7: ("support", "辅助"),
}
CAT_ORDER = ["atk", "magic", "def", "move", "jungle", "support", "season"]


def fetch_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def strip_html(s):
    """官方描述是 '<p>+20物理攻击</p><p>...</p>'，转成 ' + 20物理攻击' 形式的单行文本"""
    if not s:
        return ""
    s = re.sub(r"</p\s*>", "｜", s, flags=re.I)
    s = re.sub(r"<br\s*/?>", "｜", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    parts = [p.strip() for p in s.split("｜") if p.strip()]
    return "　".join(parts)


def download_icon(item_id):
    """下载单个图标，返回 (id, 是否成功)"""
    url = ICON_BASE.format(item_id)
    path = os.path.join(ICON_DIR, "%s.jpg" % item_id)
    if os.path.exists(path) and os.path.getsize(path) > 200:
        return item_id, True
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
        if len(data) < 200:
            return item_id, False
        with open(path, "wb") as f:
            f.write(data)
        return item_id, True
    except Exception:
        return item_id, False


def main():
    do_icon = "--no-icon" not in sys.argv
    local_json = None
    if "--local-json" in sys.argv:
        i = sys.argv.index("--local-json")
        if i + 1 < len(sys.argv):
            local_json = sys.argv[i + 1]

    print("=" * 56)
    print("王者荣耀 装备库数据同步")
    print("=" * 56)

    # 1. 取数据
    print("\n[1/5] 获取官方装备数据 ...")
    if local_json and os.path.exists(local_json):
        raw = json.load(open(local_json, encoding="utf-8"))
        print("      使用本地 JSON：%s" % local_json)
    else:
        raw = fetch_json(SRC_JSON)
        print("      已抓取：%s" % SRC_JSON)
    print("      装备总数：%d" % len(raw))

    # 2. 清洗 + 分类
    print("\n[2/5] 清洗数据 ...")
    items = []
    for it in raw:
        iid = int(it["item_id"])
        cat_id, cat_name = CAT_MAP.get(it.get("item_type"), ("other", "其他"))
        # 无象神器六变体在官方数据里按职业分散在各 item_type，
        # 统一归到「赛季神器」，避免 6 件被拆散到攻击/法术/防御各处
        if "无象神器" in it.get("item_name", ""):
            cat_id, cat_name = "season", "赛季神器"
        items.append({
            "id": iid,
            "name": it.get("item_name", "").strip(),
            "cat": cat_id,
            "catName": cat_name,
            "price": int(it.get("price") or 0),        # 合成价
            "total": int(it.get("total_price") or 0),  # 总价
            "attrs": strip_html(it.get("des1")),
            "passive": strip_html(it.get("des2")),
            "hasIcon": False,
        })
    items.sort(key=lambda x: (CAT_ORDER.index(x["cat"]) if x["cat"] in CAT_ORDER else 99,
                              -x["total"], x["id"]))
    print("      清洗完成：%d 件，其中带被动 %d 件"
          % (len(items), sum(1 for i in items if i["passive"])))

    # 3. 图标
    print("\n[3/5] 处理装备图标 ...")
    os.makedirs(ICON_DIR, exist_ok=True)
    if do_icon:
        ids = [i["id"] for i in items]
        ok = 0
        with cf.ThreadPoolExecutor(12) as ex:
            for n, (iid, succ) in enumerate(ex.map(download_icon, ids), 1):
                if succ:
                    ok += 1
                if n % 30 == 0 or n == len(ids):
                    print("      进度 %d/%d（命中 %d）" % (n, len(ids), ok), end="\r")
        print("")
    else:
        ok = 0
    byid = {i["id"]: i for i in items}
    if do_icon:
        for iid, succ in [(i["id"], os.path.exists(os.path.join(ICON_DIR, "%s.jpg" % i["id"]))
                           and os.path.getsize(os.path.join(ICON_DIR, "%s.jpg" % i["id"])) > 200)
                          for i in items]:
            byid[iid]["hasIcon"] = succ
        ok = sum(1 for i in items if i["hasIcon"])
    else:
        for i in items:
            i["hasIcon"] = os.path.exists(os.path.join(ICON_DIR, "%s.jpg" % i["id"]))
        ok = sum(1 for i in items if i["hasIcon"])
    print("      图标可用：%d/%d" % (ok, len(items)))
    miss = [i["name"] for i in items if not i["hasIcon"]]
    if miss:
        print("      缺失图标（用占位显示）：%s" % "、".join(miss))

    # 4. 改动档
    print("\n[4/5] 合并改动数据 ...")
    changes = []
    if os.path.exists(CHANGES_FILE):
        changes = json.load(open(CHANGES_FILE, encoding="utf-8"))
        print("      载入 %d 条改动记录" % len(changes))
    else:
        print("      未找到 scripts/item-changes.json，跳过（改动板块将为空）")

    # 5. 写出
    print("\n[5/5] 生成 items-data.js ...")
    cats = []
    for cid in CAT_ORDER:
        n = sum(1 for i in items if i["cat"] == cid)
        if n:
            name = next((i["catName"] for i in items if i["cat"] == cid), cid)
            cats.append({"id": cid, "name": name, "count": n})

    payload = {
        "meta": {
            "season": "S44",
            "updated": date.today().isoformat(),
            "source": "pvp.qq.com 官方 item.json",
            "total": len(items),
            "iconTotal": ok,
        },
        "cats": cats,
        "items": items,
        "changes": changes,
    }
    js = ("// 装备库数据源 —— 由 scripts/sync-items.py 自动生成，请勿手工编辑\n"
          "// 数据源：%s\n"
          "// 同步日期：%s\n"
          "window.ITEMS = %s;\n"
          % (SRC_JSON, date.today().isoformat(),
             json.dumps(payload, ensure_ascii=False, indent=1)))
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(js)
    print("      已写出：%s（%.1f KB）" % (OUT_FILE, os.path.getsize(OUT_FILE) / 1024))

    print("\n完成 ✓  装备 %d 件 / 图标 %d 张 / 改动 %d 条"
          % (len(items), ok, len(changes)))


if __name__ == "__main__":
    main()
