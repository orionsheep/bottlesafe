"""赛题拓展默认档案：玩具 / 涂料 / 萘丸 / 米袋。幂等写入，已有同名则只补位置。"""
from __future__ import annotations

import shutil
from pathlib import Path

from .chemical_db import ChemicalDB
from .schema import ChemicalAnalysis

# 图鉴棚拍图：backend/data/uploads ← frontend/public/img
_FRONTEND_IMG = Path(__file__).resolve().parents[2] / "frontend" / "public" / "img"

EXPAND_ITEMS: list[dict] = [
    {
        "name": "儿童玩具娃娃",
        "file": "seed_toy.jpg",
        "src": "cat-toy.jpg",
        "location": "卧室",
        "analysis": {
            "product": {"name": "儿童玩具娃娃", "brand": None, "category": "玩具", "barcode": None, "manufacturer": None},
            "visual_evidence": ["素体塑料娃娃，无品牌文字"],
            "hazards": [],
            "ingredients": [],
            "signal_words": [],
            "safe_storage": ["放在儿童活动区时远离溶剂和涂料", "不是实验室检测合格"],
            "do_not_mix_with": [],
            "first_aid": {"ingestion": None, "inhalation": None, "eye_contact": None, "skin_contact": None},
            "uncertainties": ["无法从外观判断邻苯或重金属含量"],
            "needs_more_images": ["吊牌或执行标准"],
            "risk_level": "unknown",
            "summary": "这是玩具，不是实验室检测。读吊牌警示，勿与溶剂、涂料同放。",
        },
    },
    {
        "name": "内墙涂料",
        "file": "seed_paint.jpg",
        "src": "cat-paint.jpg",
        "location": "储物间",
        "analysis": {
            "product": {"name": "内墙涂料", "brand": None, "category": "装修材料", "barcode": None, "manufacturer": None},
            "visual_evidence": ["金属油漆桶，有提手"],
            "hazards": [{"type": "inhalation", "severity": "medium", "evidence": "装修涂料会挥发", "confidence": 0.7}],
            "ingredients": [],
            "signal_words": [],
            "safe_storage": ["密闭存放于储物间", "新刷房间先通风再入住", "婴儿床不要放进未干的房间"],
            "do_not_mix_with": [],
            "first_aid": {"ingestion": None, "inhalation": "开窗，人离开房间", "eye_contact": None, "skin_contact": "清水冲洗"},
            "uncertainties": ["未见成分表，不能判断 VOC 是否超标"],
            "needs_more_images": ["桶身成分与警示标签"],
            "risk_level": "unknown",
            "summary": "这是装修材料，不是检测合格结论。新房通风后再让婴幼儿长时间停留。",
        },
    },
    {
        "name": "萘丸",
        "file": "seed_mothballs.jpg",
        "src": "cat-mothballs.jpg",
        "location": "儿童可触及处",
        "analysis": {
            "product": {"name": "萘丸", "brand": None, "category": "防蛀化学品", "barcode": None, "manufacturer": None},
            "visual_evidence": ["透明袋装白色圆球，外形像糖果"],
            "hazards": [{"type": "ingestion", "severity": "high", "evidence": "萘丸外形像糖果，儿童误食高发", "confidence": 0.85}],
            "ingredients": [{"name": "萘", "source": "inferred", "confidence": 0.6}],
            "signal_words": ["危险"],
            "safe_storage": ["放到儿童够不到的地方", "不要和米面零食同柜"],
            "do_not_mix_with": [],
            "first_aid": {"ingestion": "不要催吐，立即就医或中毒咨询", "inhalation": "转移到空气新鲜处", "eye_contact": None, "skin_contact": "洗手"},
            "uncertainties": ["包装无成分表，按萘/樟脑类防蛀剂谨慎处理"],
            "needs_more_images": ["包装成分说明"],
            "risk_level": "high",
            "summary": "萘丸是防蛀化学品，不是零食。现放在儿童可触及处，应立刻挪到高处或上锁，并远离食品柜。",
        },
    },
    {
        "name": "香米",
        "file": "seed_rice.jpg",
        "src": "cat-rice.jpg",
        "location": "厨房",
        "analysis": {
            "product": {"name": "香米", "brand": None, "category": "食品", "barcode": None, "manufacturer": None},
            "visual_evidence": ["素色粮袋"],
            "hazards": [],
            "ingredients": [],
            "signal_words": [],
            "safe_storage": ["食品柜单独存放", "杀虫剂和萘丸不要和米同柜"],
            "do_not_mix_with": [],
            "first_aid": {"ingestion": None, "inhalation": None, "eye_contact": None, "skin_contact": None},
            "uncertainties": ["不做农残或食品安全裁定"],
            "needs_more_images": [],
            "risk_level": "low",
            "summary": "这是食品，不是化学品。瓶安标记位置，是为了提醒杀虫剂、萘丸不要和米放在同一层。",
        },
    },
]


def _copy_image(src_name: str, dest: Path) -> None:
    src = _FRONTEND_IMG / src_name
    if not src.exists():
        raise FileNotFoundError(f"缺少图鉴图片：{src}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists() or dest.stat().st_size == 0:
        shutil.copyfile(src, dest)


def ensure_expand_archive(db: ChemicalDB, household_id: str, upload_dir: Path) -> list[dict]:
    """把拓展四件写入档案并贴上位置。已有同名则只补位置和图片，不重复插入。"""
    existing = {((it.get("observed_name") or "").strip()): it for it in db.list_household(household_id)}
    out: list[dict] = []
    for spec in EXPAND_ITEMS:
        dest = upload_dir / spec["file"]
        _copy_image(spec["src"], dest)
        image_path = f"uploads/{spec['file']}"
        analysis = ChemicalAnalysis.model_validate(spec["analysis"])
        row = existing.get(spec["name"])
        if row:
            if (row.get("location") or "") != spec["location"]:
                db.set_item_location(int(row["id"]), spec["location"])
            out.append({"id": row["id"], "name": spec["name"], "location": spec["location"], "action": "updated"})
            continue
        item_id = db.add_to_household(
            household_id,
            image_path,
            analysis,
            product_id=None,
            location=spec["location"],
        )
        out.append({"id": item_id, "name": spec["name"], "location": spec["location"], "action": "inserted"})
    return out
