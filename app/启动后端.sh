#!/bin/zsh
# 启动后端（API 模式，无需本地 GPU）
# 读取 backend/.env 中的 CHEM_* 配置（key 已配置，勿提交）
# set -a：source 进来的变量自动 export 给 python 子进程（.env 里可不写 export）
cd "$(dirname "$0")/backend" || exit 1
set -a
[ -f .env ] && source .env
set +a
exec "./.venv-ui/bin/python" -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000
