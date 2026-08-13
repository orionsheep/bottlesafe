# 训练状态（2026-08-11）

## 已完成

- WSL2 Python 3.12 训练环境：`/home/snjhz/chemical-safety-training/venv`
- CUDA 验证：RTX 5070 Laptop GPU，约 8GB 显存，`torch.cuda.is_available() == True`
- 基础模型：`/home/snjhz/chemical-safety-training/models/Qwen3-VL-4B-Instruct`
- 基础权重下载完整：14/14 文件，权重元数据总大小 8,875,631,616 字节
- 4-bit bitsandbytes 加载成功
- 单图视觉生成成功
- LoRA 注入成功：2,949,120 个可训练参数，占总参数约 0.0664%
- 最小 QLoRA 冒烟训练完成：1 step，`loss=1.377`，`eval_loss=1.419`
- 冒烟 LoRA 保存并重新加载成功：`/home/snjhz/chemical-safety-training/outputs/smoke/final`

## 冒烟模型的含义

冒烟模型只使用了用户提供的两张需求截图，并将它们标为“非家庭化学品”负样本。它只证明训练代码、GPU、量化、LoRA、checkpoint 和推理链路可运行，不是可交付的家庭化学品安全模型，也不应投入实际使用。

## 正式训练的当前阻塞项

缺少真实家庭化学品照片及经过人工复核的安全标注。正式训练至少需要：

- 同一 SKU 的正面、背面、成分、警示、条码等多角度照片；
- 产品名称、品牌、类别、条码和生产商；
- 标签明确列出的成分和信号词；
- 有证据支持的风险类别、禁忌混用、储存建议；
- 模糊、遮挡、反光、相似包装和非化学品负样本；
- 化学安全专业人员对高风险建议进行复核。

收集数据后运行 `tools/import_images.py` 和 `tools/annotate.py`，再执行 `scripts/train_wsl.sh`。
