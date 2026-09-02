"""规则引擎：关键安全判定的确定性兜底（模型只负责看懂与解释）。

铁律：
1. risk_level 由本引擎基于「成分标签 + 上下文」计算，不直接采用模型自评；
2. 未知一律 UNKNOWN，绝不返回 SAFE；
3. 规则只来自 src/rules/safety.json，代码中不硬编码风险逻辑。

成分标签来自 src/rules/ingredients.json 的别名匹配（模型识别出的品名/成分 → 归一化标签）。
纯标准库实现，无第三方依赖（便于在 .venv-ui 轻量环境运行）。
"""

from __future__ import annotations

import json
from pathlib import Path

_RULES: list[dict] | None = None
_INGREDIENTS: list[dict] | None = None

_HAZARD_TO_TAG = {
    "腐蚀": "corrosive", "corrosive": "corrosive",
    "毒": "acute_toxicity", "toxic": "acute_toxicity", "中毒": "acute_toxicity",
    "易燃": "flammable", "flammable": "flammable", "可燃": "flammable",
    "刺激": "irritant", "irritant": "irritant",
}

_DIR = Path(__file__).resolve().parent / "rules"


def _load() -> tuple[list[dict], list[dict]]:
    global _RULES, _INGREDIENTS
    if _RULES is None:
        _RULES = json.loads((_DIR / "safety.json").read_text(encoding="utf-8"))
    if _INGREDIENTS is None:
        _INGREDIENTS = json.loads((_DIR / "ingredients.json").read_text(encoding="utf-8"))
    return _RULES, _INGREDIENTS


def _text_of(analysis: dict) -> str:
    a = analysis or {}
    p = a.get("product") or {}
    parts = [str(p.get("name") or ""), str(p.get("brand") or ""), str(p.get("category") or "")]
    parts += [str(i.get("name") or "") for i in (a.get("ingredients") or [])]
    parts += [str(h.get("type") or "") for h in (a.get("hazards") or [])]
    parts.append(str(a.get("summary") or ""))
    return " ".join(parts).lower()


def _ingredient_labels(analysis: dict) -> set[str]:
    _, ingredients = _load()
    text = _text_of(analysis)
    out = set()
    for ing in ingredients:
        keys = [ing["label"]] + ing.get("aliases", [])
        if any(k.lower() in text for k in keys):
            out.add(ing["id"])
    return out


def _hazard_tags(analysis: dict) -> set[str]:
    tags = set()
    for h in (analysis or {}).get("hazards") or []:
        t = str(h.get("type") or "").lower()
        for k, v in _HAZARD_TO_TAG.items():
            if k in t:
                tags.add(v)
    return tags


def _missing_fields(analysis: dict) -> set[str]:
    a = analysis or {}
    p = a.get("product") or {}
    missing = set()
    if not p.get("manufacturer"):
        missing.add("manufacturer")
    if not (a.get("ingredients") or []):
        missing.add("ingredients")
    # standard_no 无独立字段，用 brand+manufacturer 皆缺近似"无执行标准可溯"
    if not p.get("brand") and not p.get("manufacturer"):
        missing.add("standard_no")
    return missing


def evaluate(analysis: dict, context: dict | None = None) -> dict:
    """对一次识别结果做规则兜底判定。

    Args:
        analysis: ChemicalAnalysis.model_dump() 的结果。
        context: 可选 {
            # 人群画像
            "child": bool, "pet_cat": bool, "pregnant": bool, "elderly": bool,
            # 储存情况（对齐 SafeNest 已验证有效的字段）
            "child_accessible": bool,   # 儿童可触及
            "near_food": bool,          # 靠近食品
            "original_container": bool, # 保留原包装
        }。

    Returns:
        {"risk_level": str, "findings": [...], "ingredient_labels": [...],
         "engine": "rules", "rule_version": str}
    """
    context = context or {}
    rules, _ = _load()
    labels = _ingredient_labels(analysis)
    hazards = _hazard_tags(analysis)
    missing = _missing_fields(analysis)

    findings: list[dict] = []
    sev_rank = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    best = "unknown"
    best_rank = 0

    for r in rules:
        w = r.get("when", {})
        # 无证据兜底规则独立处理：跳过并行评估，最后单独决定
        if w.get("no_evidence"):
            continue
        # 标识缺失规则仅在"确实识别出了一个产品"时才有意义；无名产品交给兜底规则
        if r.get("id") == "LABEL_INCOMPLETE" and not (analysis.get("product") or {}).get("name"):
            continue
        need_ing = w.get("has_ingredients")
        if need_ing and not all(i in labels for i in need_ing):
            continue
        hz = w.get("hazard_any_of")
        if hz and not (hazards & set(hz)):
            continue
        if w.get("context_child") and not context.get("child"):
            continue
        if w.get("context_pet_cat") and not context.get("pet_cat"):
            continue
        # 储存情况上下文（对齐 SafeNest 已验证有效字段）
        # 注意：用户未填（None）不等于 False——只有用户明确给出布尔值才参与判定
        if "context_child_accessible" in w:
            if context.get("child_accessible") is None or bool(context.get("child_accessible")) != bool(w["context_child_accessible"]):
                continue
        if "context_near_food" in w:
            if context.get("near_food") is None or bool(context.get("near_food")) != bool(w["context_near_food"]):
                continue
        if "context_original_container" in w:
            if context.get("original_container") is None or bool(context.get("original_container")) != bool(w["context_original_container"]):
                continue
        mf = w.get("missing_fields_any_of")
        if mf and not (missing & set(mf)):
            continue

        sev = r.get("severity", "unknown")
        findings.append({
            "rule_id": r.get("id"),
            "severity": sev,
            "title": r.get("title"),
            "reason": r.get("reason"),
            "action": r.get("action"),
        })
        if sev_rank.get(sev, 0) > best_rank:
            best_rank = sev_rank.get(sev, 0)
            best = sev

    # 规则未命中但有模型危害：沿用模型最高严重度（不降级安全结论）
    if best == "unknown":
        model_level = str((analysis or {}).get("risk_level") or "unknown").lower()
        if model_level in sev_rank and sev_rank[model_level] > 0:
            best = model_level

    # 仍无任何结论 → 触发「无证据兜底」规则（信息不足，暂无法判断）
    if best == "unknown" and not findings:
        for r in rules:
            if (r.get("when") or {}).get("no_evidence"):
                findings.append({
                    "rule_id": r.get("id"),
                    "severity": "unknown",
                    "title": r.get("title"),
                    "reason": r.get("reason"),
                    "action": r.get("action"),
                })
                break

    return {
        "risk_level": best,
        "findings": findings,
        "ingredient_labels": sorted(labels),
        "engine": "rules",
        "rule_version": "0.1.0",
    }
