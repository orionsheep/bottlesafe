#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
TRAIN_HOME="${CHEM_TRAIN_HOME:-$HOME/chemical-safety-training}"
VENV_DIR="$TRAIN_HOME/venv"
mkdir -p "$TRAIN_HOME/huggingface" "$TRAIN_HOME/outputs"
export HF_HOME="$TRAIN_HOME/huggingface"

sudo apt-get update
sudo apt-get install -y python3.12 python3.12-venv build-essential git-lfs
python3.12 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip wheel
python -m pip install -r requirements.txt
python - <<'PY'
import torch
print("torch:", torch.__version__)
print("cuda available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu:", torch.cuda.get_device_name(0))
PY
echo "训练环境: $VENV_DIR"
echo "模型缓存: $HF_HOME"
echo "训练输出: $TRAIN_HOME/outputs"
