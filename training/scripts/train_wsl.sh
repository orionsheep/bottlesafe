#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
TRAIN_HOME="${CHEM_TRAIN_HOME:-$HOME/chemical-safety-training}"
source "$TRAIN_HOME/venv/bin/activate"
export HF_HOME="$TRAIN_HOME/huggingface"

python tools/quality_report.py --input data/raw/all.jsonl
python -m src.prepare_dataset --input data/raw/all.jsonl --output-dir data/processed
accelerate launch -m src.train_qlora --config configs/train.yaml --output-dir "$TRAIN_HOME/outputs/chemical-safety-qwen3vl4b"
