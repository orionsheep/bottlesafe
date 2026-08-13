"""模型输出解析与容错归一化（轻依赖，仅标准库 + pydantic 场景可用）。

从 infer.py 抽出的公共逻辑，供本地 GPU 推理与 API 推理两种模式共用：
小规模 QLoRA / API 基础模型输出偶发偏离 schema（如 confidence 写成 high
这类描述词），在 pydantic 校验前统一修正，避免 422。
"""

from __future__ import annotations

import json
import re


def extract_json(text: str) -> dict:
    text = text.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group())


_SEVERITIES = {"low", "medium", "high", "critical"}
_SEV_ALIAS = {"mid": "medium", "moderate": "medium", "medium-high": "high",
              "severe": "critical", "extreme": "critical", "very high": "high",
              "very low": "low", "none": "low", "unknown": "medium"}
_SOURCES = {"label", "database", "inferred"}
_SOURCE_ALIAS = {"image": "label", "text": "label", "ocr": "label",
                 "db": "database", "guess": "inferred", "model": "inferred"}
_RISKS = {"unknown", "low", "medium", "high", "critical"}
_CONF_WORDS = {"low": 0.3, "medium": 0.6, "high": 0.8, "critical": 0.95,
               "very high": 0.9, "very low": 0.15, "unknown": 0.5}


def _to_confidence(value) -> float:
    """把 0-1 数字、百分数或 high 之类描述词统一成 [0,1] 浮点数。"""
    if isinstance(value, bool):
        return 0.5
    if isinstance(value, (int, float)):
        f = float(value)
        if f > 1:  # 模型把置信度写成百分制（如 85）
            f /= 100.0
        return min(max(f, 0.0), 1.0)
    if isinstance(value, str):
        s = value.strip().lower()
        if s.endswith("%"):
            s = s[:-1].strip()
        try:
            return _to_confidence(float(s))
        except ValueError:
            pass
        if not s:
            return 0.5
        return _CONF_WORDS.get(s, _CONF_WORDS.get(s.split()[0], 0.5))
    return 0.5


def _to_enum(value, allowed: set, alias: dict, fallback: str) -> str:
    s = str(value or "").strip().lower()
    if s in allowed:
        return s
    return alias.get(s, fallback)


def _to_text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def normalize_analysis(payload: dict) -> dict:
    """修正模型常见输出偏差，使其通过 ChemicalAnalysis 校验。"""
    if not isinstance(payload, dict):
        raise ValueError("模型输出不是 JSON 对象")
    product = payload.get("product")
    if isinstance(product, dict):
        for key in ("name", "brand", "category", "barcode", "manufacturer"):
            product[key] = _to_text(product.get(key))
    else:
        payload["product"] = {}
    for item in payload.get("hazards") or []:
        if isinstance(item, dict):
            item["confidence"] = _to_confidence(item.get("confidence", 0.5))
            item["severity"] = _to_enum(item.get("severity"), _SEVERITIES, _SEV_ALIAS, "medium")
            item["type"] = _to_text(item.get("type")) or "未命名危害"
            item["evidence"] = _to_text(item.get("evidence")) or ""
    for item in payload.get("ingredients") or []:
        if isinstance(item, dict):
            item["confidence"] = _to_confidence(item.get("confidence", 0.5))
            item["source"] = _to_enum(item.get("source"), _SOURCES, _SOURCE_ALIAS, "inferred")
            item["name"] = _to_text(item.get("name")) or "未命名成分"
    fa = payload.get("first_aid")
    if isinstance(fa, dict):
        for key in ("ingestion", "inhalation", "eye_contact", "skin_contact"):
            fa[key] = _to_text(fa.get(key))
    else:
        payload["first_aid"] = {}
    payload["risk_level"] = _to_enum(payload.get("risk_level"), _RISKS, _SEV_ALIAS, "unknown")
    payload["summary"] = _to_text(payload.get("summary")) or ""
    for key in ("visual_evidence", "signal_words", "safe_storage", "do_not_mix_with",
                "uncertainties", "needs_more_images"):
        raw = payload.get(key)
        payload[key] = [_to_text(v) for v in raw if _to_text(v)] if isinstance(raw, list) else []
    return payload
