#!/bin/bash
# 创空间启动脚本：API 模式直接起服务；GPU 模式先拉模型再起服务
set -e

if [ "${CHEM_BACKEND}" = "api" ]; then
    echo "==> [1/3] API 模式：跳过模型下载（推理走魔搭免费推理 API）"
    export CHEM_DB=/app/backend/data/chemicals.db
else
    MODEL_DIR=/app/models/base
    ADAPTER_DIR=/app/models/adapter

    echo "==> [1/4] 下载基础模型: ${CHEM_MODEL_REPO}"
    if [ ! -f "${MODEL_DIR}/config.json" ]; then
        modelscope download --model "${CHEM_MODEL_REPO}" --local_dir "${MODEL_DIR}"
    fi

    echo "==> [2/4] 准备 LoRA 适配器"
    if [ -f /app/adapter/adapter_config.json ]; then
        ADAPTER_DIR=/app/adapter
        echo "    使用镜像内置适配器 /app/adapter"
    elif [ ! -f "${ADAPTER_DIR}/adapter_config.json" ]; then
        modelscope download --model "${CHEM_ADAPTER_REPO}" --local_dir "${ADAPTER_DIR}" \
          || echo "!! 适配器下载失败（将以无适配器模式启动）"
    fi

    export CHEM_MODEL_PATH="${MODEL_DIR}"
    if [ -f "${ADAPTER_DIR}/adapter_config.json" ]; then
        export CHEM_ADAPTER="${ADAPTER_DIR}"
    else
        export CHEM_ADAPTER=""
    fi
    export CHEM_DB=/app/backend/data/chemicals.db
fi

echo "==> 启动后端 (uvicorn :8000)"
cd /app/backend
nohup python -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000 > /app/backend.log 2>&1 &

echo "==> 启动前端 (vinext :3000)"
cd /app/frontend
nohup npm run start > /app/frontend.log 2>&1 &

# 等两个服务就绪后再放流量
for i in $(seq 1 60); do
    curl -sf http://127.0.0.1:3000 >/dev/null 2>&1 && curl -sf http://127.0.0.1:8000/api/status >/dev/null 2>&1 && break
    sleep 2
done

echo "==> 启动 nginx (:7860 对外)"
nginx -g 'daemon off;'
