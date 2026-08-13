#!/bin/zsh
PY=/Users/mychanging/Desktop/家庭化学药品识别模型/新建文件夹/家庭化学品安全模型/01_项目代码/.venv-mac/bin/python
cd /Users/mychanging/Desktop/家庭化学药品识别模型
nohup "$PY" dl_gguf.py > /tmp/dl_gguf.log 2>&1 &
echo "$!" > /tmp/dl_gguf.pid
echo "LAUNCHED $(cat /tmp/dl_gguf.pid)"
