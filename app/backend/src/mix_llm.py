"""混用判定的 LLM 兜底层：静态规则未命中时，让便宜文本模型评估这对组合。

设计约束（与 rule_engine 同一套铁律）：
1. 只在「有明确化学依据」时才给 danger/caution，否则必须 unknown——绝不猜安全；
2. MIX_LLM_API_KEY 读不到 → 整层静默跳过；请求/超时/解析失败 → 返回 None，
   调用方一律降级为原 verdict，不影响接口可用性；
3. 结论必须显式标注来源（source="llm"），与规则库结论（source="rules"）绝不混淆。

仅标准库实现（与 llm.py 同款 OpenAI 兼容 chat completions 直连）。
"""

from __future__ import annotations

import json
import os
import re
import urllib.request

API_BASE = os.environ.get("MIX_LLM_API_BASE", "https://api.siliconflow.cn/v1/chat/completions")
# 便宜够用的文本模型（硅基流动免费档；实测 Qwen 系冷启动常超 15s，GLM-4-9B 稳定 2s 内返回）
# 可用 MIX_LLM_MODEL 覆盖
MODEL = os.environ.get("MIX_LLM_MODEL", "THUDM/GLM-4-9B-0414")
TIMEOUT = 20  # 秒（硬性上限 20s），超时即静默降级

_SYSTEM = """你是家庭化学品混用安全审核员。判断两种家用化学品混合/紧邻使用是否有化学危险。

铁律：
1. 只对有明确化学依据的组合给 danger 或 caution：酸碱剧烈中和、生成有毒气体（氯气/氯胺等）、强氧化剂遇易燃物/还原剂、放热溅射、易燃叠加、生成有毒物质等。
2. 没有明确化学依据，或你只是「觉得可能不太好」，verdict 必须填 unknown。宁可 unknown 也不许猜。
3. 绝不为了显得有用而编造反应机理。

只输出一行 JSON，不要任何其他文字：
{"verdict": "danger|caution|unknown", "reason": "大白话机理，一两句，点破家里最容易出事的场景", "action": "可执行的做法，一句"}
danger=可能造成急性伤害（毒气/起火/灼伤）；caution=功效抵消、刺激加重、配方未知需保守对待；unknown=无明确依据。"""

_VALID_VERDICTS = {"danger", "caution", "unknown"}


def _api_key() -> str:
    # 调用时读取，避免模块导入顺序导致 .env 晚注入时漏读
    return os.environ.get("MIX_LLM_API_KEY", "")


def available() -> bool:
    """混用 LLM 层是否可用（key 未配置则整层静默跳过）。"""
    return bool(_api_key())


def _describe(item: dict) -> str:
    """把一瓶物品压成给模型看的简短描述；无可描述信息时返回空串。"""
    a = item.get("analysis") or {}
    p = a.get("product") or {}
    parts = [f"品名：{item.get('observed_name') or p.get('name') or ''}"]
    if p.get("brand"):
        parts.append(f"品牌：{p['brand']}")
    if p.get("category"):
        parts.append(f"类别：{p['category']}")
    ings = [str(i.get("name") or "") for i in (a.get("ingredients") or []) if i.get("name")]
    if ings:
        parts.append(f"成分：{'、'.join(ings[:8])}")
    text = "；".join(parts).strip("；")
    return text if len(text) > 4 else ""


def judge_pair(item_a: dict, item_b: dict) -> dict | None:
    """评估一对物品的混用风险。

    Returns:
        {"verdict": "danger|caution|unknown", "reason": str, "action": str}
        任一步失败（无 key / 无描述信息 / 网络 / 超时 / JSON 解析 / 字段不合法）→ None。
    """
    key = _api_key()
    if not key:
        return None
    desc_a, desc_b = _describe(item_a), _describe(item_b)
    if not desc_a or not desc_b:
        return None

    user = f"物品A：{desc_a}\n物品B：{desc_b}\n这两瓶混合或紧邻使用，判定结果？"
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user},
        ],
        "max_tokens": 300,
        "temperature": 0.1,
    }
    try:
        req = urllib.request.Request(
            API_BASE, data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = json.loads(resp.read())
        text = body["choices"][0]["message"]["content"]
    except Exception:  # noqa: BLE001 - 网络/超时/限流一律静默降级
        return None

    text = (text or "").strip().removeprefix("```json").removesuffix("```").strip()
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            return None
        try:
            obj = json.loads(m.group())
        except json.JSONDecodeError:
            return None
    if not isinstance(obj, dict):
        return None

    verdict = str(obj.get("verdict") or "").lower().strip()
    if verdict not in _VALID_VERDICTS:
        return None
    reason = str(obj.get("reason") or "").strip()[:200]
    action = str(obj.get("action") or "").strip()[:120]
    if verdict != "unknown" and not reason:
        return None  # 给了结论却讲不出依据 → 不可信，按解析失败降级
    return {"verdict": verdict, "reason": reason, "action": action}
