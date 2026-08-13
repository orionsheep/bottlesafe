"""API 推理模式：调用魔搭免费推理 API（OpenAI 兼容），无需本地 GPU。

魔搭为绑定阿里云的用户提供每日免费推理额度（约 2000 次/天），适合创空间
免费 CPU 资源下的演示部署。权重与 LoRA 不生效（走平台托管的基础模型）。

环境变量：
    CHEM_API_KEY    API 令牌（魔搭/智谱等任一家均可；兼容旧名 MODELSCOPE_API_KEY）
    CHEM_API_BASE   兼容 OpenAI 的 chat completions 地址
    CHEM_API_MODEL  模型 ID（默认 Qwen/Qwen3-VL-4B-Instruct）
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request
from pathlib import Path

from .output_fix import extract_json, normalize_analysis
from .schema import ChemicalAnalysis, SYSTEM_PROMPT, USER_PROMPT

API_BASE = os.environ.get(
    "CHEM_API_BASE", "https://api-inference.modelscope.cn/v1/chat/completions")
API_MODEL = os.environ.get("CHEM_API_MODEL", "Qwen/Qwen3-VL-4B-Instruct")
API_KEY = os.environ.get("CHEM_API_KEY") or os.environ.get("MODELSCOPE_API_KEY", "")

_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
         ".webp": "image/webp", ".bmp": "image/bmp"}


def analyze_image_api(image_path: str) -> ChemicalAnalysis:
    """上传图片转 base64 走 OpenAI 视觉消息格式，返回校验后的结构化结果。"""
    if not API_KEY:
        raise RuntimeError("未配置 CHEM_API_KEY（推理 API 令牌）")
    path = Path(image_path)
    b64 = base64.b64encode(path.read_bytes()).decode()
    data_url = f"data:{_MIME.get(path.suffix.lower(), 'image/jpeg')};base64,{b64}"
    payload = {
        "model": API_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": USER_PROMPT},
            ]},
        ],
        "max_tokens": 1200,
        "temperature": 0,
    }
    req = urllib.request.Request(
        API_BASE, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {API_KEY}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        body = json.loads(resp.read())
    answer = body["choices"][0]["message"]["content"]
    return ChemicalAnalysis.model_validate(normalize_analysis(extract_json(answer)))
