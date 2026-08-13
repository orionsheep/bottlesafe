"""打包「百炼8B训练包」：代码 + 数据集（路径重写为相对路径）+ 8B 训练配置 + 一键脚本。"""
import json
import shutil
from pathlib import Path

ROOT = Path("/Users/mychanging/Desktop/家庭化学药品识别模型")
OLD = ROOT / "新建文件夹/家庭化学品安全模型/01_项目代码"
PKG = ROOT / "百炼8B训练包"

if PKG.exists():
    shutil.rmtree(PKG)
(PKG / "src").mkdir(parents=True)
(PKG / "configs").mkdir()
(PKG / "data/processed").mkdir(parents=True)
(PKG / "data/images").mkdir(parents=True)

# 1. 代码
for f in ["__init__.py", "schema.py", "train_qlora.py", "prepare_dataset.py"]:
    shutil.copy(OLD / "src" / f, PKG / "src" / f)

# 2. 数据集：图片复制 + jsonl 路径重写为相对路径，缺失图片的行剔除
copied, dropped = set(), 0
for name in ["train.jsonl", "validation.jsonl"]:
    src = OLD / "data/public_300/processed" / name
    dst = PKG / "data/processed" / name
    kept = 0
    with src.open(encoding="utf-8") as fi, dst.open("w", encoding="utf-8") as fo:
        for line in fi:
            row = json.loads(line)
            base = Path(row["image"]).name
            img_src = OLD / "data/public_300/images" / base
            if not img_src.exists():
                dropped += 1
                continue
            if base not in copied:
                shutil.copy(img_src, PKG / "data/images" / base)
                copied.add(base)
            row["image"] = f"images/{base}"
            fo.write(json.dumps(row, ensure_ascii=False) + "\n")
            kept += 1
    print(f"{name}: 保留 {kept}")
print(f"图片 {len(copied)} 张, 剔除 {dropped} 行")

# 3. 8B 训练配置
(PKG / "configs/train_8b.yaml").write_text("""model_name_or_path: models/base8b
train_file: data/processed/train.jsonl
validation_file: data/processed/validation.jsonl
output_dir: outputs/chemical-safety-qwen3vl8b

seed: 42
max_length: 2048
min_pixels: 200704
max_pixels: 602112

num_train_epochs: 3
learning_rate: 0.0001
weight_decay: 0.01
warmup_ratio: 0.05
per_device_train_batch_size: 1
per_device_eval_batch_size: 1
gradient_accumulation_steps: 16
logging_steps: 5
eval_steps: 100
save_steps: 100
save_total_limit: 2
gradient_checkpointing: true
bf16: true
tf32: true

load_in_4bit: true
bnb_4bit_quant_type: nf4
bnb_4bit_use_double_quant: true
bnb_4bit_compute_dtype: bfloat16

lora_r: 16
lora_alpha: 32
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - k_proj
  - v_proj
  - o_proj
  - gate_proj
  - up_proj
  - down_proj
""", encoding="utf-8")

# 4. 一键训练脚本
(PKG / "run_train.sh").write_text("""#!/bin/bash
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
""", encoding="utf-8")

print("打包完成:", PKG)
