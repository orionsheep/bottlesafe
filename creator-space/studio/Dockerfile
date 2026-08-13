# =============================================================================
# 魔搭创空间 Docker 镜像 —— 家庭化学品安全识别（Qwen3-VL-4B + LoRA）
# 单容器三进程：nginx(7860 对外) → /api,/uploads → uvicorn(8000)；其余 → 前端(3000)
# =============================================================================
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    MODELSCOPE_CACHE=/app/models

# ---------- 系统依赖：nginx + Node 22 ----------
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx curl ca-certificates git \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Python 依赖（含魔搭 SDK，用于容器内拉模型） ----------
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt \
        fastapi "uvicorn[standard]" python-multipart modelscope \
    && pip cache purge

# ---------- 前端构建 ----------
COPY frontend/package.json frontend/package-lock.json /app/frontend/
RUN cd /app/frontend && npm ci --no-audit --no-fund
COPY frontend /app/frontend
RUN cd /app/frontend && npm run build && npm cache clean --force

# ---------- 后端代码 + 启动文件 ----------
COPY backend /app/backend
COPY adapter /app/adapter
COPY studio/nginx.studio.conf /etc/nginx/nginx.conf
COPY studio/start.sh /app/start.sh
RUN rm -f /etc/nginx/sites-enabled/default && chmod +x /app/start.sh

# 上传与数据库目录（创空间重启后数据可能重置，属正常）
RUN mkdir -p /app/backend/data/uploads /app/models

EXPOSE 7860

# 模型与适配器地址（创空间“环境变量”里可覆盖）；A10 24GB 默认跑 bf16 全精度
ENV CHEM_MODEL_REPO=Qwen/Qwen3-VL-4B-Instruct \
    CHEM_ADAPTER_REPO=your-modelscope-name/home-hazard-lora \
    CHEM_HOUSEHOLD=home-001 \
    CHEM_QUANT=none

CMD ["/app/start.sh"]
