from __future__ import annotations

import argparse
import inspect
import json
import math
from pathlib import Path

import torch
import yaml
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoProcessor,
    BitsAndBytesConfig,
    Qwen3VLForConditionalGeneration,
    Trainer,
    TrainingArguments,
)

from .schema import SYSTEM_PROMPT, USER_PROMPT


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, help="覆盖 YAML 输出目录，适合把 checkpoint 放到 WSL Linux 磁盘")
    return p.parse_args()


class VLDataCollator:
    def __init__(self, processor, max_length: int, min_pixels: int, max_pixels: int):
        self.processor = processor
        self.max_length = max_length
        self.min_pixels = min_pixels
        self.max_pixels = max_pixels

    def __call__(self, examples):
        texts, prompt_texts, images = [], [], []
        from PIL import Image

        for ex in examples:
            answer = json.dumps(ex["answer"], ensure_ascii=False, separators=(",", ":"))
            prompt_messages = [
                {"role": "system", "content": [{"type": "text", "text": SYSTEM_PROMPT}]},
                {"role": "user", "content": [
                    {"type": "image", "image": ex["image"], "min_pixels": self.min_pixels, "max_pixels": self.max_pixels},
                    {"type": "text", "text": USER_PROMPT},
                ]},
            ]
            messages = prompt_messages + [{"role": "assistant", "content": [{"type": "text", "text": answer}]}]
            texts.append(self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=False))
            prompt_texts.append(self.processor.apply_chat_template(prompt_messages, tokenize=False, add_generation_prompt=True))
            image = Image.open(ex["image"]).convert("RGB")
            if image.width * image.height > self.max_pixels:
                scale = math.sqrt(self.max_pixels / (image.width * image.height))
                image = image.resize((max(28, int(image.width * scale)), max(28, int(image.height * scale))))
            images.append(image)

        self.processor.tokenizer.padding_side = "right"
        batch = self.processor(
            text=texts,
            images=images,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )
        labels = batch["input_ids"].clone()
        labels[labels == self.processor.tokenizer.pad_token_id] = -100
        # 只对 assistant 的 JSON 答案计算损失，避免模型学习复述系统/用户提示词。
        for i, (prompt_text, image) in enumerate(zip(prompt_texts, images)):
            prompt_ids = self.processor(
                text=[prompt_text], images=[image], truncation=True,
                max_length=self.max_length, return_tensors="pt",
            )["input_ids"]
            labels[i, : min(prompt_ids.shape[1], labels.shape[1])] = -100
        # 视觉占位 token 不参与语言建模损失。
        for token_id in filter(lambda x: x is not None, [
            getattr(self.processor.tokenizer, "image_token_id", None),
            getattr(self.processor.tokenizer, "video_token_id", None),
        ]):
            labels[labels == token_id] = -100
        batch["labels"] = labels
        return batch


def main():
    args = parse_args()
    cfg = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    if args.output_dir:
        cfg["output_dir"] = str(args.output_dir)
    dtype = torch.bfloat16 if cfg.get("bf16", True) else torch.float16
    quant = BitsAndBytesConfig(
        load_in_4bit=cfg["load_in_4bit"],
        bnb_4bit_quant_type=cfg["bnb_4bit_quant_type"],
        bnb_4bit_use_double_quant=cfg["bnb_4bit_use_double_quant"],
        bnb_4bit_compute_dtype=dtype,
    )
    processor = AutoProcessor.from_pretrained(cfg["model_name_or_path"], trust_remote_code=True)
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        cfg["model_name_or_path"],
        quantization_config=quant,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=cfg["gradient_checkpointing"])
    model = get_peft_model(model, LoraConfig(
        r=cfg["lora_r"],
        lora_alpha=cfg["lora_alpha"],
        lora_dropout=cfg["lora_dropout"],
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=cfg["lora_target_modules"],
    ))
    model.print_trainable_parameters()

    data = load_dataset("json", data_files={"train": cfg["train_file"], "validation": cfg["validation_file"]})
    training_kwargs = dict(
        output_dir=cfg["output_dir"],
        num_train_epochs=cfg["num_train_epochs"],
        learning_rate=cfg["learning_rate"],
        weight_decay=cfg["weight_decay"],
        per_device_train_batch_size=cfg["per_device_train_batch_size"],
        per_device_eval_batch_size=cfg["per_device_eval_batch_size"],
        gradient_accumulation_steps=cfg["gradient_accumulation_steps"],
        logging_steps=cfg["logging_steps"],
        eval_strategy="steps",
        eval_steps=cfg["eval_steps"],
        save_steps=cfg["save_steps"],
        save_total_limit=cfg["save_total_limit"],
        bf16=cfg["bf16"],
        tf32=cfg["tf32"],
        gradient_checkpointing=cfg["gradient_checkpointing"],
        remove_unused_columns=False,
        report_to="none",
        do_train=True,
        do_eval=True,
    )
    # Transformers 4.x 使用 warmup_ratio；5.x 移除了该参数。
    if "warmup_ratio" in inspect.signature(TrainingArguments.__init__).parameters:
        training_kwargs["warmup_ratio"] = cfg["warmup_ratio"]
    else:
        training_kwargs["warmup_steps"] = cfg.get("warmup_steps", 0)
    train_args = TrainingArguments(**training_kwargs)
    trainer = Trainer(
        model=model,
        args=train_args,
        train_dataset=data["train"],
        eval_dataset=data["validation"],
        data_collator=VLDataCollator(processor, cfg["max_length"], cfg["min_pixels"], cfg["max_pixels"]),
    )
    trainer.train()
    final_dir = Path(cfg["output_dir"]) / "final"
    trainer.save_model(final_dir)
    processor.save_pretrained(final_dir)


if __name__ == "__main__":
    main()
