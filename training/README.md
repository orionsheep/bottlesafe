# Qwen3-VL 家庭化学品安全助手

基于 `Qwen/Qwen3-VL-4B-Instruct` 的 QLoRA 微调项目，目标是从家庭化学品照片中提取产品信息、识别风险，并输出可供数据库匹配和家庭档案管理使用的结构化 JSON。

当前机器的实际安装、下载与冒烟训练结果见 [TRAINING_STATUS.md](TRAINING_STATUS.md)。

> 安全边界：模型输出仅用于风险筛查与安全教育，不能替代产品标签、SDS（安全数据表）、医生或中毒控制中心的意见。发生误食、吸入、眼睛/皮肤暴露时，应立即联系当地急救或中毒咨询机构。

## 功能边界

系统分为两层：

1. **Qwen3-VL 模型层**：看图、OCR、识别包装/警示图标、提取成分线索、评估可见风险，生成结构化 JSON。
2. **业务层**：用条码/名称/厂家匹配化学品数据库，保存家庭档案，并结合儿童、宠物、过敏史等家庭信息生成规则化提醒。

数据库事实不要硬塞进模型权重。成分、召回、法规和急救信息会变化，应由可更新数据库提供；模型只负责识别和基于已提供资料解释。

## 目录

```text
configs/train.yaml              训练参数
data/examples/                  示例标注
src/schema.py                   输出结构定义与校验
src/prepare_dataset.py          校验、拆分 JSONL 数据
src/train_qlora.py              QLoRA 微调
src/infer.py                    单图推理
src/chemical_db.py              SQLite 产品库与家庭档案
src/pipeline.py                 识别 + 数据库匹配 + 档案保存
tests/test_schema_and_db.py     无模型单元测试
tools/import_images.py          导入待标注图片并按 SKU 分组
tools/annotate.py               本地人工标注界面（Tkinter）
tools/quality_report.py         标注质量报告与重复图片检查
scripts/setup_wsl.sh            WSL2 环境安装
scripts/train_wsl.sh            一键校验并训练
```

## 数据格式

每行一个样本，图片路径相对于 JSONL 文件：

```json
{"image":"images/cleaner_001.jpg","answer":{"product":{"name":"含氯漂白剂","brand":null,"category":"漂白剂","barcode":null,"manufacturer":null},"visual_evidence":["瓶身可见漂白剂字样"],"hazards":[{"type":"corrosive","severity":"high","evidence":"标签提示腐蚀/刺激","confidence":0.9}],"ingredients":[{"name":"次氯酸钠","source":"label","confidence":0.85}],"signal_words":["危险"],"safe_storage":["上锁并远离儿童和宠物","与酸性清洁剂分开存放"],"do_not_mix_with":["酸性清洁剂","含氨清洁剂"],"first_aid":{"ingestion":"不要催吐，立即联系中毒咨询机构或急救","inhalation":"转移至空气新鲜处，如不适立即就医","eye_contact":"持续用流动清水冲洗至少15分钟并就医","skin_contact":"脱去污染衣物并用大量清水冲洗"},"uncertainties":["无法仅凭正面照片确认完整浓度"],"needs_more_images":["背面成分和警示标签","条码"],"risk_level":"high","summary":"疑似含氯漂白剂，严禁与酸或氨类产品混合。"}}
```

高质量数据至少应覆盖：正反面、不同角度、反光/模糊、遮挡、相似包装、非化学品负样本、标签不可读样本，以及同一产品不同批次。切分时必须按“产品 SKU”分组，避免同一产品泄漏到训练集和验证集。

## 安装

建议 Linux/WSL2、Python 3.10–3.12、CUDA 12.x。当前机器约 8GB 显存，必须使用 4-bit QLoRA、batch size 1、梯度累积和较小图片像素；Windows 原生环境中的 bitsandbytes 兼容性不稳定，优先 WSL2。

```bash
cd qwen3_vl_chemical_safety
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## 准备数据与训练

先把照片放到任意目录。推荐目录结构为 `产品SKU/照片.jpg`，同一产品的多个角度放在同一个子目录：

```text
待导入照片/
  sku_001/
    front.jpg
    back.jpg
    barcode.jpg
  sku_002/
    front.jpg
```

在 Windows PowerShell 中导入并启动标注：

```powershell
python tools/import_images.py --source "D:\待导入照片"
python tools/annotate.py
python tools/quality_report.py --input data/raw/all.jsonl
```

标注界面会把结果增量保存到 `data/raw/all.jsonl`，可中途关闭后继续。完成一批人工复核数据后，在 WSL2 中执行：

```bash
bash scripts/setup_wsl.sh
bash scripts/train_wsl.sh
```

8GB 显存仍可能不足。出现 OOM 时依次降低 `max_pixels`、`max_length`，保持 batch size 为 1，并启用 CPU offload；若训练仍不稳定，使用 16GB 以上显存云 GPU。

## 推理

```bash
python -m src.infer \
  --model Qwen/Qwen3-VL-4B-Instruct \
  --adapter outputs/chemical-safety-qwen3vl4b/final \
  --image path/to/product.jpg
```

执行完整业务流水线：

```bash
python -m src.pipeline --image path/to/product.jpg --db data/chemicals.db --household-id home-001
```

## 推荐数据规模与评测

- 原型：2,000–5,000 个经过人工复核的多角度样本。
- 可用版本：20,000+ 样本，覆盖至少 2,000 个 SKU，并补充困难负样本。
- 评测：OCR 字段准确率、条码准确率、产品 Top-1/Top-5、风险召回率（优先）、JSON 合法率、拒答/不确定性准确率。
- 危险建议必须由化学安全专业人员抽检；尤其要测试“漂白剂 + 酸”“漂白剂 + 氨”等高风险组合。

## 当前机器注意事项

- GPU：RTX 5070 Laptop，显存约 8GB。
- C 盘当前剩余空间约 30GB，下载基础模型、创建 WSL Python 环境和保存 checkpoint 后会比较紧张。建议把 Hugging Face 缓存和训练输出放到至少有 50GB 空间的非系统盘。
- 提供的 WSL 脚本默认把环境、模型缓存和 checkpoint 放在 WSL 的 `~/chemical-safety-training`；当前 WSL Linux 磁盘剩余约 900GB，不会占满 C 盘项目目录。
- 不建议在现有 Python 3.14 环境直接训练；脚本会在 WSL2 中创建 Python 3.12 虚拟环境。
