#!/bin/sh
# bump-version.sh：独立递增版本号（供每周自动校准等外部流程调用）
# 用法：bash scripts/bump-version.sh [major|minor|patch]   缺省=patch（小更新）
#   major -> +1.0.0（大更新）   minor -> +0.1（中更新）   patch -> +0.0.1（小更新）
set -e

FILE="heroes-data.js"
[ -f "$FILE" ] || { echo "bump-version: 未找到 $FILE"; exit 1; }

LEVEL=${1:-patch}
cur=$(grep -oE 'version: "[0-9]+\.[0-9]+\.[0-9]+"' "$FILE" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
[ -z "$cur" ] && { echo "bump-version: 未找到 version 字段"; exit 1; }

maj=$(echo "$cur" | cut -d. -f1)
min=$(echo "$cur" | cut -d. -f2)
pat=$(echo "$cur" | cut -d. -f3)

case "$LEVEL" in
  major)
    maj=$((maj + 1)); min=0; pat=0
    label="大更新 +1.0.0"
    ;;
  minor)
    min=$((min + 1)); pat=0
    label="中更新 +0.1"
    ;;
  *)
    pat=$((pat + 1))
    label="小更新 +0.0.1"
    ;;
esac

new="$maj.$min.$pat"
sed -i "0,/version: \"[0-9][0-9.]*\"/s//version: \"$new\"/" "$FILE"
echo "bump-version: [$label] 版本号 $cur -> $new"
