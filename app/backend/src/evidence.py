"""证据服务：条款级溯源 + 时效感知。

每条证据带 standard_no / effective_from / effective_to / source_level / url；
命中即将换代条款时（next_effective_from 临近）主动提示。
纯标准库实现。
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

_EVIDENCE: list[dict] | None = None
_PATH = Path(__file__).resolve().parent / "rules" / "evidence.json"


def _load() -> list[dict]:
    global _EVIDENCE
    if _EVIDENCE is None:
        _EVIDENCE = json.loads(_PATH.read_text(encoding="utf-8"))
    return _EVIDENCE


def all_evidence() -> list[dict]:
    return _load()


def get(eid: str) -> dict | None:
    for e in _load():
        if e.get("id") == eid:
            return e
    return None


def for_ingredients(ingredient_labels: list[str], as_of: str | None = None) -> list[dict]:
    """按成分标签匹配证据；as_of 过滤已失效（effective_to < as_of）。"""
    labels = set(ingredient_labels)
    out = []
    for e in _load():
        if labels & set(e.get("applies_to") or []):
            if _active(e, as_of):
                out.append(e)
    return out


def expiring_soon(within_days: int = 400, as_of: str | None = None) -> list[dict]:
    """返回即将换代（有 next_effective_from 且距今 within_days 内）的证据。"""
    ref = _parse(as_of) or date.today()
    out = []
    for e in _load():
        nxt = _parse(e.get("next_effective_from"))
        if nxt and 0 <= (nxt - ref).days <= within_days:
            out.append(e)
    return out


def _active(e: dict, as_of: str | None) -> bool:
    if not as_of:
        return True
    ref = _parse(as_of)
    if ref is None:
        return True
    eff_to = _parse(e.get("effective_to"))
    if eff_to and ref > eff_to:
        return False
    return True


def _parse(s: str | None) -> date | None:
    if not s:
        return None
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def to_view(e: dict) -> dict:
    """前端展示用精简视图。"""
    return {
        "id": e.get("id"),
        "title": e.get("title"),
        "standard_no": e.get("standard_no"),
        "source_level": e.get("source_level"),
        "source_level_label": e.get("source_level_label"),
        "clause": e.get("clause"),
        "effective_from": e.get("effective_from"),
        "effective_to": e.get("effective_to"),
        "next_effective_from": e.get("next_effective_from"),
        "url": e.get("url"),
        "summary": e.get("summary"),
        "note": e.get("note"),
    }
