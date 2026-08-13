#!/bin/zsh
# 内部使用：后台拉起后端并写日志
cd /Users/mychanging/Desktop/家庭化学药品识别模型/拼接完成项目/backend || exit 1
PY=/Users/mychanging/Desktop/家庭化学药品识别模型/新建文件夹/家庭化学品安全模型/01_项目代码/.venv-mac/bin/python
nohup $PY -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000 > ../backend.log 2>&1 &
echo $! > ../backend.pid
echo backend started pid=$(cat ../backend.pid)
