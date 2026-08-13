#!/bin/bash
# 在魔搭 Notebook（GPU/A10）终端里执行: bash run_train.sh
set -e
cd "$(dirname "$0")"

echo "==> [1/3] 补装依赖"
pip install -q datasets pyyaml bitsandbytes accelerate peft 2>&1 | tail -1

echo "==> [2/3] 下载 Qwen3-VL-8B-Instruct（魔搭内网，约 17GB）"
if [ ! -f models/base8b/config.json ]; then
    modelscope download --model Qwen/Qwen3-VL-8B-Instruct --local_dir models/base8b
fi

echo "==> [3/3] 后台启动 QLoRA 训练（约 6-10 小时）"
nohup python -m src.train_qlora --config configs/train_8b.yaml > train8b.log 2>&1 &
echo "训练已在后台启动！查看进度: tail -f train8b.log"
