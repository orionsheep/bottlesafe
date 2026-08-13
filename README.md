# 瓶安 BottleSafe · 家庭化学品安全识别助手

> 拍一张家用化学品的照片，AI 告诉你它是什么、有多危险、怎么存、不能和什么混用、出事了怎么办。

2026「小有可为」AI 向善创新挑战赛 · 绿色发展赛道参赛作品。

- **在线体验**：https://bottlesafe.orionsheep.com
- **微调模型（LoRA）**：https://modelscope.cn/models/OrionSheep/chemical-safety-qwen3vl-lora
- **演示视频**：见 [Releases](../../releases) 中的 `bottlesafe-demo-video-v2.mp4`

## 这是什么

家里柜子里常年躺着清洁剂、消毒液、杀虫剂、管道疏通剂……混用可能产生毒气，儿童误食可能致命。「瓶安」基于 Qwen3-VL 视觉语言模型，拍照识别家用化学品，输出结构化安全档案：

- 产品信息：名称 / 品牌 / 类别 / 条码
- 风险评估：危害类型、严重度、信号词
- 安全指引：储存建议、禁忌混用、急性暴露应对
- 家庭档案：识别结果可归档，随时复查全家化学品

## 仓库结构

| 目录 | 内容 |
|---|---|
| `training/` | QLoRA 微调代码、训练配置、300 条公开数据集、训练日志与状态说明 |
| `app/` | 线上运行版：FastAPI 后端 + Next.js 前端 + nginx 部署配置（当前部署于 bottlesafe.orionsheep.com） |
| `creator-space/` | 魔搭创空间 Docker 部署包（GPU 版 + API 版双 Dockerfile） |
| `bailian-finetune/` | 阿里云百炼 Qwen3-VL-8B SFT 训练包（数据已转百炼图文格式） |
| `prototype/` | 早期前端原型 |
| `materials/` | 参赛材料：项目说明文档 PDF、分镜脚本、小红书发布包、演示素材 |
| `tools/` | GGUF 基准测试、模型下载等辅助脚本 |

微调权重（LoRA 适配器，约 23MB）发布在 ModelScope 仓库，Releases 中也有一份存档。

## 快速开始（线上版本地跑）

```bash
# 后端（API 模式，无需本地 GPU，走兼容 OpenAI 的视觉模型 API）
cd app/backend
pip install -r requirements.txt
export CHEM_BACKEND=api
export CHEM_API_KEY=sk-xxx          # 你的 API key
export CHEM_API_BASE=https://api.siliconflow.cn/v1/chat/completions
export CHEM_API_MODEL=Qwen/Qwen3-VL-8B-Instruct
uvicorn src.web.app:app --port 8001

# 前端
cd app/frontend
npm install && npm run dev
```

本地 GPU 模式（加载 LoRA 微调权重）与训练复现步骤见 `training/README.md` 和 `training/TRAINING_STATUS.md`。

## 技术栈

- 基座模型：Qwen3-VL-4B-Instruct（QLoRA，r=8，300 条公开数据）
- 线上推理：Qwen3-VL-8B-Instruct（API 模式，结构校验 + 兜底）
- 后端：FastAPI + SQLite
- 前端：Next.js + Nginx

## 免责声明

识别结果仅用于家庭风险筛查与安全教育，不能替代产品标签、SDS（安全数据表）、医生或中毒控制中心的意见。

## License

MIT
