from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration

from .output_fix import extract_json, normalize_analysis
from .schema import ChemicalAnalysis, SYSTEM_PROMPT, USER_PROMPT


def load_model(model_id: str, adapter: str | None):
    # 有 CUDA（WSL/GPU 机）时默认走 4-bit QLoRA 推理；显存充裕（如 24GB A10）可设
    # CHEM_QUANT=none 改用 bf16 全精度，识别效果与 Mac 本地一致。Apple Silicon 无
    # bitsandbytes CUDA 支持，退化为 bf16 全精度加载到 MPS/CPU。
    if torch.cuda.is_available() and os.environ.get("CHEM_QUANT", "4bit") != "none":
        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True)
        model = Qwen3VLForConditionalGeneration.from_pretrained(
            model_id, device_map="auto", torch_dtype=torch.bfloat16,
            quantization_config=quant, trust_remote_code=True,
        )
    else:
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        model = Qwen3VLForConditionalGeneration.from_pretrained(
            model_id, torch_dtype=torch.bfloat16, trust_remote_code=True,
        ).to(device)
    if adapter:
        model = PeftModel.from_pretrained(model, adapter)
    # LoRA 不修改视觉处理器；始终从基础模型读取完整 image/video processor 配置。
    return model.eval(), AutoProcessor.from_pretrained(model_id, trust_remote_code=True)


@torch.inference_mode()
def analyze_image(model, processor, image_path: str, return_raw: bool = False) -> ChemicalAnalysis | str:
    messages = [
        {"role": "system", "content": [{"type": "text", "text": SYSTEM_PROMPT}]},
        {"role": "user", "content": [
            {"type": "image", "image": str(Path(image_path).resolve())},
            {"type": "text", "text": USER_PROMPT},
        ]},
    ]
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    from PIL import Image
    inputs = processor(text=[text], images=[Image.open(image_path).convert("RGB")], return_tensors="pt")
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    output = model.generate(**inputs, max_new_tokens=1200, do_sample=False)
    generated = output[:, inputs["input_ids"].shape[1]:]
    answer = processor.batch_decode(generated, skip_special_tokens=True)[0]
    if return_raw:
        return answer
    return ChemicalAnalysis.model_validate(normalize_analysis(extract_json(answer)))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="Qwen/Qwen3-VL-4B-Instruct")
    p.add_argument("--adapter")
    p.add_argument("--image", required=True)
    p.add_argument("--raw", action="store_true", help="输出未经 schema 校验的模型原文，便于诊断")
    args = p.parse_args()
    model, processor = load_model(args.model, args.adapter)
    result = analyze_image(model, processor, args.image, return_raw=args.raw)
    print(result if isinstance(result, str) else result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
