from __future__ import annotations

import argparse
import json

from .chemical_db import ChemicalDB
from .infer import analyze_image, load_model


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--image", required=True)
    p.add_argument("--db", default="data/chemicals.db")
    p.add_argument("--household-id", required=True)
    p.add_argument("--model", default="Qwen/Qwen3-VL-4B-Instruct")
    p.add_argument("--adapter")
    args = p.parse_args()
    model, processor = load_model(args.model, args.adapter)
    analysis = analyze_image(model, processor, args.image)
    db = ChemicalDB(args.db)
    product = db.match(analysis)
    item_id = db.add_to_household(args.household_id, args.image, analysis, product["id"] if product else None)
    print(json.dumps({"analysis": analysis.model_dump(), "database_match": product, "household_item_id": item_id}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

