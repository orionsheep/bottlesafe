#!/bin/zsh
# 启动后端：FastAPI + Qwen3-VL-4B + 第二次微调 LoRA（public-300-final）
cd "$(dirname "$0")/backend" || exit 1
PY="/Users/mychanging/Desktop/家庭化学药品识别模型/新建文件夹/家庭化学品安全模型/01_项目代码/.venv-mac/bin/python"
exec "$PY" -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000
