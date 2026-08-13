#!/bin/bash
# 魔搭 Notebook 预检脚本：装依赖 → 下模型 → 起后端 → 发测试图
set -e
cd /mnt/workspace/precheck

echo "[1/5] pip 安装依赖（约3-5分钟）..."
pip install -q -r backend/requirements.txt fastapi "uvicorn[standard]" python-multipart modelscope

echo "[2/5] 下载基础模型 Qwen3-VL-4B（约8.3GB，魔搭内网很快）..."
modelscope download --model Qwen/Qwen3-VL-4B-Instruct --local_dir /mnt/workspace/models/base

echo "[3/5] 启动后端..."
export CHEM_MODEL_PATH=/mnt/workspace/models/base
export CHEM_ADAPTER=/mnt/workspace/precheck/adapter
export CHEM_DB=/mnt/workspace/precheck/chemicals.db
cd backend
nohup python -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000 > /mnt/workspace/precheck/backend.log 2>&1 &

echo "[4/5] 等待模型加载（首次约1-3分钟）..."
for i in $(seq 1 120); do
  S=$(curl -s http://127.0.0.1:8000/api/status || true)
  echo "$S" | grep -q '"ready"' && { echo ">>> 模型就绪!"; break; }
  echo "$S" | grep -q '"error"' && { echo ">>> 加载失败，日志如下："; tail -30 /mnt/workspace/precheck/backend.log; exit 1; }
  sleep 5
done
curl -s http://127.0.0.1:8000/api/status; echo

echo "[5/5] 发送测试图片（推理约10-60秒）..."
curl -s -X POST http://127.0.0.1:8000/api/analyze -F "image=@/mnt/workspace/precheck/test.jpg" | head -c 2000
echo
echo "===== 预检完成：上面如果是 JSON 结果就说明全部跑通 ====="
