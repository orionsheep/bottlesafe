from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.schema import ChemicalAnalysis  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, default=Path("data/raw/all.jsonl"))
    args = p.parse_args()
    errors, rows, hashes = [], [], collections.Counter()
    for n, line in enumerate(args.input.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            ChemicalAnalysis.model_validate(row["answer"])
            hashes[row.get("sha256", "missing")] += 1
            rows.append(row)
        except Exception as exc:
            errors.append((n, str(exc)))
    groups = collections.Counter(str(r.get("group_id", "missing")) for r in rows)
    risks = collections.Counter(r["answer"]["risk_level"] for r in rows)
    categories = collections.Counter(r["answer"]["product"].get("category") or "未分类" for r in rows)
    duplicate_count = sum(v - 1 for k, v in hashes.items() if k != "missing" and v > 1)
    print(f"合法样本: {len(rows)}")
    print(f"SKU/分组数: {len(groups)}")
    print(f"重复标注: {duplicate_count}")
    print(f"格式错误: {len(errors)}")
    print(f"风险分布: {dict(risks)}")
    print(f"主要类别: {dict(categories.most_common(15))}")
    sparse = [k for k, v in groups.items() if v < 2]
    print(f"只有一个角度的 SKU: {len(sparse)}")
    for line, error in errors[:20]:
        print(f"  第 {line} 行: {error}")
    if errors or duplicate_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
