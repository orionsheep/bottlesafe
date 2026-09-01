"""识别准确率自测评测（把「待补充」变成可复现的真实指标）。

对一份人工标注的评测集逐张识别，与期望值比对，输出关键字段命中率：

    - category_hit      品类是否命中（子串双向匹配，宽松）
    - risk_hit          风险等级是否落在期望等级 ±0 或期望的集合内
    - risk_conservative 风险是否≥期望（安全领域宁高勿低，单独统计）
    - mix_recall        期望的禁忌混用项是否被召回（任一命中即算）
    - hazard_recall     期望的危害关键词是否出现在 hazards 里

用法（API 模式，需配置 CHEM_API_KEY，脚本本身不读取/不打印任何 Key）：

    cd app/backend
    export CHEM_BACKEND=api
    export CHEM_API_KEY=***          # 你的推理 API 令牌
    python -m tools.eval_accuracy --set tools/eval_set.example.json

标注集格式见 tools/eval_set.example.json。所有期望值以人工核对的产品背标为准；
本脚本只做机器辅助统计，不替代人工判读。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _contains_any(text: str, needles: list[str]) -> bool:
    t = (text or "").lower()
    return any(n.lower() in t for n in needles if n)


def _analyze(image_path: str):
    """按 CHEM_BACKEND 选择推理后端；返回 dict 形式的分析结果。"""
    backend = os.environ.get("CHEM_BACKEND", "api")
    if backend == "api":
        from src.api_infer import analyze_image_api
        return analyze_image_api(image_path).model_dump()
    from src.infer import analyze_image, load_model
    model_path = os.environ.get("CHEM_MODEL_PATH", "Qwen/Qwen3-VL-4B-Instruct")
    adapter = os.environ.get("CHEM_ADAPTER") or None
    model, processor = load_model(model_path, adapter)
    return analyze_image(model, processor, image_path).model_dump()


_RISK_ORDER = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def evaluate_one(expected: dict, got: dict) -> dict:
    product = got.get("product") or {}
    got_cat = str(product.get("category") or "")
    got_name = str(product.get("name") or "")
    got_risk = str(got.get("risk_level") or "unknown")

    # 品类命中：期望词任一出现在识别的品类或名称中
    exp_cat = expected.get("category_keywords") or []
    category_hit = _contains_any(got_cat + " " + got_name, exp_cat) if exp_cat else None

    # 风险等级
    exp_risk = expected.get("risk_level")
    risk_hit = (got_risk == exp_risk) if exp_risk else None
    risk_conservative = (
        _RISK_ORDER.get(got_risk, 0) >= _RISK_ORDER.get(exp_risk, 0)
        if exp_risk else None
    )

    # 禁忌混用召回：期望的每一项，只要在 do_not_mix_with 任一条目里命中即算
    exp_mix = expected.get("do_not_mix_keywords") or []
    mix_blob = " ".join(got.get("do_not_mix_with") or [])
    mix_recall = (
        sum(1 for m in exp_mix if m.lower() in mix_blob.lower()) / len(exp_mix)
        if exp_mix else None
    )

    # 危害召回
    exp_haz = expected.get("hazard_keywords") or []
    haz_blob = " ".join(
        (h.get("type", "") + " " + h.get("evidence", "")) for h in got.get("hazards") or []
    )
    hazard_recall = (
        sum(1 for h in exp_haz if h.lower() in haz_blob.lower()) / len(exp_haz)
        if exp_haz else None
    )

    return {
        "category_hit": category_hit,
        "risk_hit": risk_hit,
        "risk_conservative": risk_conservative,
        "mix_recall": mix_recall,
        "hazard_recall": hazard_recall,
        "got_category": got_cat or got_name,
        "got_risk": got_risk,
    }


def _rate(vals: list) -> str:
    xs = [v for v in vals if v is not None]
    if not xs:
        return "—（无标注）"
    return f"{sum(xs) / len(xs) * 100:.1f}%  (n={len(xs)})"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--set", type=Path, required=True, help="评测集 JSON 路径")
    p.add_argument("--out", type=Path, help="可选：把逐条明细写入 JSON")
    args = p.parse_args()

    data = json.loads(args.set.read_text(encoding="utf-8"))
    cases = data.get("cases") or []
    base = args.set.parent

    results = []
    agg = {"category_hit": [], "risk_hit": [], "risk_conservative": [], "mix_recall": [], "hazard_recall": []}
    print(f"评测集：{args.set}（{len(cases)} 条）\n后端：{os.environ.get('CHEM_BACKEND', 'api')}\n")

    for i, case in enumerate(cases, 1):
        img = case.get("image")
        img_path = str((base / img).resolve()) if img and not Path(img).is_absolute() else img
        try:
            got = _analyze(img_path)
        except Exception as exc:  # noqa: BLE001
            print(f"[{i}] {img} — 识别失败：{exc}")
            results.append({"image": img, "error": str(exc)})
            continue
        m = evaluate_one(case.get("expected") or {}, got)
        for k in agg:
            agg[k].append(m[k])
        print(f"[{i}] {img} → 品类「{m['got_category']}」/ 风险 {m['got_risk']}  "
              f"cat={m['category_hit']} risk={m['risk_hit']} mix={m['mix_recall']}")
        results.append({"image": img, **m})

    print("\n================ 汇总 ================")
    print(f"品类命中率        : {_rate(agg['category_hit'])}")
    print(f"风险等级精确命中率: {_rate(agg['risk_hit'])}")
    print(f"风险保守率(≥期望) : {_rate(agg['risk_conservative'])}")
    print(f"禁忌混用召回率    : {_rate(agg['mix_recall'])}")
    print(f"危害召回率        : {_rate(agg['hazard_recall'])}")
    print("=====================================")
    print("注：以上为机器辅助统计，最终指标需人工复核；样本量小时仅作趋势参考。")

    if args.out:
        args.out.write_text(json.dumps({"results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"逐条明细已写入 {args.out}")


if __name__ == "__main__":
    main()
