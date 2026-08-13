#!/bin/zsh
# 启动前端：vinext 开发服务器（HOME / HAZARD 网站 + /scan 识别页）
cd "$(dirname "$0")/frontend" || exit 1
exec npm run dev
