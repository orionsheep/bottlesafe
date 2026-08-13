# 魔搭创空间部署教程 —— 家庭化学品安全识别（免费 GPU 跑 Demo）

> 目标：把本项目部署到 ModelScope 创空间，用 xGPU 免费 GPU 跑起来，拿到一个可分享的公开链接。
> 全程零费用；适合演示。不适合长期稳定服务（会自动休眠、时长有配额）。

## 第 0 步：账号与权限（约 10 分钟）

1. 注册魔搭账号：https://modelscope.cn ，并在「个人设置」里**绑定阿里云账号**（不绑定没有免费资源）。
2. 申请加入「**xGPU 乐园**」组织：在魔搭搜索组织名 → 申请加入（一般自动/快速通过）。这是创空间能用免费 GPU 的前提。
3. （可选）顺手在「我的 Notebook」领取新用户 100 小时 A10 —— 用于第 4 步的预检调试。

## 第 1 步：把 LoRA 适配器传到你的魔搭模型库（约 5 分钟）

基础模型不用传（魔搭上已有 `Qwen/Qwen3-VL-4B-Instruct`），只需传几十 MB 的适配器：

方式 A（网页，推荐）：魔搭首页 → 右上角头像 →「创建模型」→ 名字填 `home-hazard-lora`（**设为公开**，否则容器里下载要配 token）→ 进入模型页 →「文件」→ 上传以下 4 个文件（来自本机 `第二次微调/微调千问模型/家庭化学品安全模型/02_微调权重/public-300-final/`）：

```
adapter_config.json
adapter_model.safetensors
tokenizer_config.json
chat_template.jinja
```

方式 B（命令行）：`pip install modelscope` 后
```bash
modelscope login --token 你的SDK令牌
modelscope upload 你的用户名/home-hazard-lora \
  第二次微调/微调千问模型/家庭化学品安全模型/02_微调权重/public-300-final/*
```

## 第 2 步：准备创空间代码仓库（约 5 分钟）

创空间的 Docker 部署从一个文件仓库构建。仓库根目录放这三样（就是本目录 `拼接完成项目/` 的内容）：

```
仓库根/
├── backend/          # 后端代码
├── frontend/         # 前端代码（可删掉 node_modules，构建时会重装）
├── studio/
│   ├── Dockerfile    # ★ 已写好：torch+CUDA 基座、Node 22、nginx、模型自下载
│   ├── nginx.studio.conf
│   └── start.sh
└── .dockerignore
```

注意：Dockerfile 里 COPY 路径是按「仓库根目录」写的。若创空间平台要求 Dockerfile 必须在根目录，把 `studio/Dockerfile` 复制一份为根目录 `Dockerfile` 即可，内容不用改。

上传方式：创空间支持网页上传文件或 Git 推送（`git clone` 创空间给的仓库地址 → 复制文件 → commit & push）。

## 第 3 步：创建 Docker 创空间（约 5 分钟）

1. 魔搭首页 →「创空间」→「创建创空间」
2. 关键配置：
   - **部署类型：Docker**
   - Dockerfile 路径：`studio/Dockerfile`（或根目录 `Dockerfile`）
   - **空间云资源：选择 xGPU 的 GPU 卡型**——你的模型 bf16 约 8.3GB，选 **A10（24GB）** 最稳；若只有小显存卡可选，代码会自动走 4-bit（≥8GB 显存即可）
   - 环境变量添加一条：`CHEM_ADAPTER_REPO = 你的用户名/home-hazard-lora`（基础模型默认 `Qwen/Qwen3-VL-4B-Instruct`，不用改）
   - 对外端口：**7860**（start.sh 里 nginx 已监听 7860）
3. 保存并启动。首次构建镜像约 15–30 分钟（装 torch 依赖 + 前端构建），之后启动只需下载模型（容器内魔搭内网下载 8.3GB 约 1–3 分钟）。

## 第 4 步：验证与排错

- 看创空间「日志」：依次出现 `[1/4] 下载基础模型` → `[3/4] 启动后端` → `[4/4] 启动 nginx` 即正常。
- 打开创空间公开链接 → 首页能开 → 进「AI 识别」传一张洗洁精照片 → 右上角状态从"模型加载中"变绿后出结果（首次推理 20–60s，之后 5–15s）。
- 常见问题：
  | 现象 | 原因 / 解法 |
  |---|---|
  | 构建卡在 pip | 换基础镜像源或重试（Dockerfile 已配清华源） |
  | 适配器没生效 | 环境变量 `CHEM_ADAPTER_REPO` 没配对；日志里会有"适配器下载失败" |
  | 一直"模型加载中" | 显存不足。换 24GB 卡，或确认 bnb 4-bit 已装上（看 backend.log） |
  | 上传后 502 | 推理中超时——nginx 已设 600s，若仍断，看 `/app/backend.log` |
- 预检建议：先在「我的 Notebook」A10 环境里 `git clone` 你的创空间仓库，`bash studio/start.sh` 手动跑一遍，把坑趟完再发布。

## 第 5 步：了解限制（重要）

- **自动休眠**：没人访问一段时间后台会自动睡眠，访客首次打开要等 1–2 分钟冷启动（模型重载）。
- **时长配额**：xGPU 是公平共享制，免费时长有动态上限；创空间数量也有限制。
- **数据不持久**：SQLite 档案和上传图片在容器内，创空间重启/重建后清零。演示够用；要持久化需外接存储。
- **并发 1**：同时只能一个人识别。

## 之后：想长期稳定运行？

按 `deploy/README.md` 迁到 AutoDL 包月 RTX 3090（约 ¥950/月）或 Modal serverless（按秒计费，闲置免费），同一套代码不用改。
