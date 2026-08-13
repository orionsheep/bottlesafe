from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from .schema import ChemicalAnalysis


def load_and_validate(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            image = (path.parent / row["image"]).resolve()
            if not image.is_file():
                raise FileNotFoundError(f"第 {line_no} 行图片不存在: {image}")
            row["answer"] = ChemicalAnalysis.model_validate(row["answer"]).model_dump()
            row["image"] = str(image)
            row.setdefault("group_id", row["answer"]["product"].get("barcode") or str(image.parent))
            rows.append(row)
    return rows


def grouped_split(rows: list[dict], val_ratio: float, seed: int) -> tuple[list[dict], list[dict]]:
    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(str(row["group_id"]), []).append(row)
    keys = list(groups)
    random.Random(seed).shuffle(keys)
    val_count = max(1, round(len(keys) * val_ratio)) if len(keys) > 1 else 0
    val_keys = set(keys[:val_count])
    train = [r for k, items in groups.items() if k not in val_keys for r in items]
    val = [r for k, items in groups.items() if k in val_keys for r in items]
    return train, val


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--validation-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    rows = load_and_validate(args.input.resolve())
    train, val = grouped_split(rows, args.validation_ratio, args.seed)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output_dir / "train.jsonl", train)
    write_jsonl(args.output_dir / "validation.jsonl", val)
    print(f"有效样本 {len(rows)}；训练 {len(train)}；验证 {len(val)}")


if __name__ == "__main__":
    main()

