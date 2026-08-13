# 拼接完成项目 — 家庭化学品安全识别（第二次微调模型 + HOME/HAZARD 前端）

把两个交付包完全拼接后的可运行整体：

| 组件 | 来源 | 说明 |
|---|---|---|
| `backend/` | 微调千问模型.zip（第二次微调）的 `01_项目代码` + 第一版的 `src/web/app.py` | FastAPI 推理服务 |
| 模型权重 | 基础模型 = 本机 `新建文件夹/…/04_基础模型/Qwen3-VL-4B-Instruct`（8.3GB 完整权重）；LoRA = 第二次微调 `02_微调权重/public-300-final` | bf16 加载到 Apple MPS |
| `frontend/` | home-hazard-website.zip | vinext（Next + Vite）网站，新增 `/scan` 识别页 |

## 拼接改动点

1. `backend/src/infer.py`：CUDA 机器仍走 4-bit QLoRA；Apple Silicon 无 bitsandbytes CUDA 支持，自动退化为 bf16 全精度加载到 MPS。
2. `backend/src/web/app.py`：默认模型/适配器路径指向本机两份权重；新增 CORS 中间件，允许前端跨域调用。
3. `frontend/app/scan/page.tsx`（新增）：上传照片 → 调 `http://127.0.0.1:8000/api/analyze` → 展示风险、危害、成分、储存、禁忌混用、急救建议，并可存入家庭档案（SQLite）。
4. `frontend/app/page.tsx`：导航增加 "AI scan" 入口。

## 启动

```bash
./启动后端.sh   # http://127.0.0.1:8000  （模型首次加载约 1–2 分钟）
./启动前端.sh   # vinext 开发服务器
```

前端状态条会轮询 `/api/status`：LOADING → READY 后即可在 `/scan` 上传识别。

## 注意

- 训练结果说明：300 条数据的小规模 QLoRA 验证模型（train_loss 1.382 / eval_loss 1.065）；输出偶发 JSON 格式错误，后端已做 JSON 提取容错，失败时返回 422 可重试。
- 识别结果仅供安全参考，不替代产品背标、SDS 或专业医疗建议。
