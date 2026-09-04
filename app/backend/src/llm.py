"""轻量 LLM 文本客户端（OpenAI 兼容 chat completions，仅标准库）。

复用推理 API 的配置；文本模型默认与视觉模型一致（VL 模型同样支持纯文本对话），
也可用 CHEM_TEXT_MODEL 单独指定。任何失败由调用方兜底，不阻塞主流程。
"""

from __future__ import annotations

import json
import os
import urllib.request

API_BASE = os.environ.get("CHEM_API_BASE", "https://api-inference.modelscope.cn/v1/chat/completions")
API_KEY = os.environ.get("CHEM_API_KEY") or os.environ.get("MODELSCOPE_API_KEY", "")
TEXT_MODEL = os.environ.get("CHEM_TEXT_MODEL") or os.environ.get("CHEM_API_MODEL", "Qwen/Qwen3-VL-8B-Instruct")
# 纯文本对话（问答管家）可单独走一套端点/密钥/模型，默认同视觉模型配置。
# 线上用硅基流动：CHEM_TEXT_API_BASE=https://api.siliconflow.cn/v1/chat/completions
TEXT_API_BASE = os.environ.get("CHEM_TEXT_API_BASE", API_BASE)
TEXT_API_KEY = os.environ.get("CHEM_TEXT_API_KEY", API_KEY)


def chat(system: str, user: str, max_tokens: int = 1200, temperature: float = 0.4,
         timeout: int = 180) -> str | None:
    """返回模型回复文本；未配置 key 或请求/解析失败时返回 None（调用方走本地兜底）。"""
    if not TEXT_API_KEY:
        return None
    payload = {
        "model": TEXT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    try:
        req = urllib.request.Request(
            TEXT_API_BASE, data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {TEXT_API_KEY}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read())
        return body["choices"][0]["message"]["content"]
    except Exception:  # noqa: BLE001 - 网络失败一律走兜底
        return None


def chat_multi(system: str, history: list | None, user: str,
               max_tokens: int = 800, temperature: float = 0.4, timeout: int = 180) -> str | None:
    """多轮对话：history 为 [{role, content}, ...]（按时间先后）。失败返回 None。"""
    if not TEXT_API_KEY:
        return None
    messages = [{"role": "system", "content": system}]
    for m in (history or [])[-12:]:  # 只保留最近 12 条，控制 token
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user})
    payload = {"model": TEXT_MODEL, "messages": messages,
               "max_tokens": max_tokens, "temperature": temperature}
    try:
        req = urllib.request.Request(
            TEXT_API_BASE, data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {TEXT_API_KEY}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read())
        return body["choices"][0]["message"]["content"]
    except Exception:  # noqa: BLE001
        return None


def chat_json(system: str, user: str, **kw) -> dict | None:
    """要求模型输出 JSON 并解析；失败返回 None。"""
    text = chat(system, user, **kw)
    if not text:
        return None
    text = text.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        import re
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                obj = json.loads(m.group())
                return obj if isinstance(obj, dict) else None
            except json.JSONDecodeError:
                return None
    return None
