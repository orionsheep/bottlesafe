from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
from collections import Counter
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

from build_public_dataset import HAZMAT, hazmat_answer


RULES = [
    ("清洁剂", re.compile(r"\b(cleaner|cleaning (?:liquid|spray|solution|gel|foam|powder|tablet)|stain remover|limescale remover|degreaser|descaler)\b", re.I)),
    ("洗涤剂", re.compile(r"\b(detergent|dishwash(?:ing)? liquid|dishwasher detergent|laundry liquid|fabric softener|washing liquid|washing powder)\b", re.I)),
    ("消毒剂", re.compile(r"\b(disinfectant|disinfecting|saniti[sz]er|chlorine tablet|bleach|antimicrobial foam)\b", re.I)),
    ("驱虫杀虫剂", re.compile(r"\b(insecticide|pesticide|mosquito repellent|insect repellent|bed bug killer|cockroach (?:killer|gel)|rat killer|termite)\b", re.I)),
    ("空气清新剂", re.compile(r"\b(air freshener|room freshener|car (?:air )?perfume|fragrance spray|toilet spray)\b", re.I)),
    ("抛光护理剂", re.compile(r"\b(?:car|bike|metal|brass|copper|furniture|floor|leather|dashboard|tyre|tire|headlight|body) (?:polish|wax|shiner|dressing|coat(?:ing)?)\b|\b(?:polish|wax) (?:spray|liquid|cream|paste)\b", re.I)),
    ("汽车化学品", re.compile(r"\b(car shampoo|bike shampoo|wash & wax|snow foam|windshield washer|wiper fluid|coolant|brake fluid|engine oil|chain lube|lubricant spray|rust remover)\b", re.I)),
    ("园艺化学品", re.compile(r"\b(fertilizer|plant food|plant tonic|fungicide|herbicide|weed killer|growth promoter|seaweed fertilizer|humic acid)\b", re.I)),
]

REJECT = re.compile(
    r"\b(nose cleaner|lens cleaner|steam cleaner|pressure cleaner|vacuum|dishwasher \(|dishwasher$|"
    r"washing machine|brush|cloth|mop|tool|holder|cover|case|wipes?|tissue|paper|gloves?|"
    r"sponge|scrubber|wiper blade|hose|nozzle|spray gun|dispenser|air purifier|ozone)\b",
    re.I,
)


def classify(name: str) -> str | None:
    if REJECT.search(name):
        return None
    for category, pattern in RULES:
        if pattern.search(name):
            return category
    return None


def product_answer(row: dict, category: str) -> dict:
    name = row["name"].strip()
    return {
        "product": {"name": name, "brand": None, "category": category, "barcode": None, "manufacturer": None},
        "visual_evidence": [f"公开商品数据将图片对应商品标注为：{name}"],
        "hazards": [],
        "ingredients": [],
        "signal_words": [],
        "safe_storage": ["按照产品包装标签要求保存，并远离儿童和宠物"],
        "do_not_mix_with": [],
        "first_aid": {"ingestion": None, "inhalation": None, "eye_contact": None, "skin_contact": None},
        "uncertainties": ["商品正面图和公开标题不足以确认完整成分、浓度及危险等级"],
        "needs_more_images": ["产品背面成分与警示标签", "条码近照"],
        "risk_level": "unknown",
        "summary": f"识别为 {name}，归类为{category}；需要清晰背标才能进一步判断化学风险。",
    }


def make_variant(source: Path, target: Path, variant: int) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        if variant:
            w, h = image.size
            margin = min(w, h) * (0.012 * variant)
            image = image.crop((margin, margin, w - margin, h - margin))
            image = ImageEnhance.Brightness(image).enhance(1.0 + (variant - 2) * 0.025)
            image = ImageEnhance.Contrast(image).enhance(1.0 + (2 - variant) * 0.02)
        image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        image.save(target, "JPEG", quality=92, optimize=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--amazon", type=Path, required=True)
    p.add_argument("--hazmat", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--amazon-records", type=int, default=261)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    image_dir = args.output / "images"
    image_dir.mkdir(exist_ok=True)

    csv_path = args.amazon / "Amazon-Products-Visual.csv"
    rows = list(csv.DictReader(csv_path.open(encoding="utf-8-sig", errors="replace", newline="")))
    selected = []
    for row in rows:
        category = classify(row["name"])
        source = (args.amazon / row["image"].removeprefix("./")).resolve()
        if category and source.is_file():
            try:
                with Image.open(source) as image:
                    image.verify()
            except Exception:
                continue
            selected.append((row, category, source))
    if not selected:
        raise RuntimeError("没有筛选到有效商品图片")

    rng = random.Random(args.seed)
    rng.shuffle(selected)
    base, extra = divmod(args.amazon_records, len(selected))
    records = []
    for index, (row, category, source) in enumerate(selected):
        count = base + (1 if index < extra else 0)
        source_id = Path(row["image"]).stem
        for variant in range(count):
            target = image_dir / f"{source_id}_v{variant}.jpg"
            make_variant(source, target, variant)
            records.append({
                "image": str(target.resolve()),
                "group_id": f"amazon-{source_id}",
                "source": "Amazon Products Visual (CC BY-NC-SA 4.0)",
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                "answer": product_answer(row, category),
            })

    distance_root = args.hazmat / "images" / "DifferentDistances"
    for image in sorted(distance_root.glob("*/*.jpg")):
        code = image.stem.zfill(2)
        if code in HAZMAT:
            records.append({
                "image": str(image.resolve()),
                "group_id": f"hazmat-{code}",
                "source": "HAZMAT13 (MIT)",
                "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
                "answer": hazmat_answer(code),
            })

    rng.shuffle(records)
    with (args.output / "all.jsonl").open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(json.dumps({
        "unique_amazon_images": len(selected),
        "amazon_training_views": args.amazon_records,
        "hazmat_images": len(records) - args.amazon_records,
        "total": len(records),
        "categories": Counter(category for _, category, _ in selected),
    }, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
