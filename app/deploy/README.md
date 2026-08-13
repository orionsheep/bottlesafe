# 家庭化学品安全识别 — VPS 部署

## 一、配置需求

模型 = Qwen3-VL-4B-Instruct（bf16 权重约 8.3GB）+ 第二次微调 LoRA。推理是主要开销。

### 方案 A：GPU VPS（推荐）

| 项目 | 4-bit QLoRA 推理（推荐默认） | bf16 全精度 |
|---|---|---|
| GPU 显存 | ≥ 8GB（RTX 3060/4060、T4 16G、L4、A10） | ≥ 12GB（RTX 3080/4070、T4 16G、A10 24G） |
| 系统内存 | 16GB（加载权重时需要与显存相当的 RAM 缓冲） | 16–32GB |
| CPU | 4–8 vCPU | 4–8 vCPU |
| 磁盘 | 50GB SSD（模型 8.3G + Python 环境 ~6G + 系统/前端 ~5G） | 同左 |
| 系统 | Ubuntu 22.04/24.04 + NVIDIA 驱动 ≥550 + CUDA 12.x | 同左 |

常见选择：
- 国内：AutoDL / 恒源云 租 RTX 3090(24G) 按小时计费，镜像自带 CUDA；
- 海外：RunPod / Vast.ai RTX 3070+；AWS g4dn.xlarge（T4 16G）；GCP g2-standard-4（L4）。
- 代码已支持：有 CUDA 自动走 4-bit QLoRA，无 CUDA 自动 bf16（CPU 也能跑，见方案 B）。

### 方案 B：纯 CPU VPS（便宜、慢）

- 16–32GB 内存、8–16 vCPU；单张图推理约 1–3 分钟，仅适合低频自用。
- 无 GPU 时代码自动 bf16 加载到 CPU（需内存 ≥ 16GB）。

### 前端

- Node.js ≥ 22.13（构建约需 1–2GB 内存）。生产用 `npm run build && npm run start`。

## 二、目录与传输

```
/opt/hh/
├── backend/          # 拼接完成项目/backend 整个上传
├── frontend/         # 拼接完成项目/frontend 整个上传（可不传 node_modules）
├── models/Qwen3-VL-4B-Instruct/      # 8.3GB 基础模型（scp/rclone 传一次，或 VPS 上从 HF 下载）
└── adapters/public-300-final/        # 第二次微调 LoRA（几十 MB）
```

## 三、部署步骤（Ubuntu + CUDA）

```bash
# 1) 后端环境
cd /opt/hh/backend
python3.11 -m venv /opt/hh/venv
/opt/hh/venv/bin/pip install -r requirements.txt fastapi uvicorn python-multipart

# 2) 前端
cd /opt/hh/frontend && npm install && npm run build

# 3) 安装 systemd 服务（改好路径后）
sudo cp deploy/hh-backend.service deploy/hh-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now hh-backend hh-frontend

# 4) nginx 反代（同一域名下：/ 与 /scan 走前端，/api、/uploads 走后端）
sudo cp deploy/nginx.conf /etc/nginx/conf.d/hh.conf   # 改 server_name
sudo nginx -t && sudo systemctl reload nginx
```

服务起来后 `curl 127.0.0.1:8000/api/status` 应返回 `ready`（模型加载约 10–60s）。
用 `certbot --nginx -d 你的域名` 加 HTTPS。

## 四、注意

- uvicorn worker 保持 1 个（模型常驻显存/内存，多 worker 会重复加载）。
- nginx `client_max_body_size` 与 `proxy_read_timeout 600s` 必须配置，首张图推理较慢。
- 300 条数据的小模型，输出偶有格式偏差；后端已内置归一化容错。
