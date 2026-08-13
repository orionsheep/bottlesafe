# =============================================================================
# 魔搭创空间 Docker 镜像（CPU/API 模式）—— 无需 xGPU 审批，今天即可上线
# 推理走魔搭免费推理 API（每日免费额度），本地不加载模型，CPU 2核/16G 足够。
# 构建仅需几分钟（不装 torch）。xGPU 审批通过后改用 studio/Dockerfile（GPU 版）。
# =============================================================================
FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# ---------- 系统依赖：nginx + Node 22 ----------
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx curl ca-certificates git \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Python 依赖（轻量，无 torch） ----------
RUN pip install --no-cache-dir \
        fastapi "uvicorn[standard]" python-multipart pydantic jsonschema PyYAML \
    && pip cache purge

# ---------- 前端构建 ----------
COPY frontend/package.json frontend/package-lock.json /app/frontend/
RUN cd /app/frontend && npm ci --no-audit --no-fund
COPY frontend /app/frontend
RUN cd /app/frontend && npm run build && npm cache clean --force

# ---------- 后端代码 + 启动文件 ----------
COPY backend /app/backend
COPY studio/nginx.studio.conf /etc/nginx/nginx.conf
COPY studio/start.sh /app/start.sh
RUN rm -f /etc/nginx/sites-enabled/default && chmod +x /app/start.sh \
    && mkdir -p /app/backend/data/uploads

EXPOSE 7860

# API 模式配置；MODELSCOPE_API_KEY 请在创空间「密文管理」里配置，不要写在这里
ENV CHEM_BACKEND=api \
    CHEM_API_MODEL=Qwen/Qwen3-VL-4B-Instruct \
    CHEM_HOUSEHOLD=home-001

CMD ["/app/start.sh"]
