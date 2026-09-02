#!/bin/sh
# bump-version.sh：独立递增 patch 版本号（供每周自动校准等外部流程调用）
# 用法：bash scripts/bump-version.sh
# 仅递增第三位 patch 号（x.y.Z -> x.y.(Z+1)），不改 major/minor
set -e

FILE="heroes-data.js"
[ -f "$FILE" ] || { echo "bump-version: 未找到 $FILE"; exit 1; }

cur=$(grep -oE 'version: "[0-9]+\.[0-9]+\.[0-9]+"' "$FILE" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
[ -z "$cur" ] && { echo "bump-version: 未找到 version 字段"; exit 1; }

maj=$(echo "$cur" | cut -d. -f1)
min=$(echo "$cur" | cut -d. -f2)
pat=$(echo "$cur" | cut -d. -f3)
pat=$((pat + 1))
new="$maj.$min.$pat"

sed -i "0,/version: \"[0-9][0-9.]*\"/s//version: \"$new\"/" "$FILE"
echo "bump-version: 版本号已递增 $cur -> $new"
