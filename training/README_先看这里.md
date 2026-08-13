# 家庭化学品安全模型：文件说明

## 目录结构

- `01_项目代码`：训练、推理、数据导入、标注、质检和数据库代码。
- `02_微调权重/smoke_lora`：最终 QLoRA 冒烟适配器，约 23MB，可直接推理加载。
- `02_微调权重/checkpoint-1_可断点续训`：包含 LoRA、优化器、调度器、随机状态和训练状态，可继续训练。
- `03_训练日志`：模型下载、环境安装、推理和冒烟训练日志。
- `04_基础模型`：基础模型位置说明及可直接打开 WSL 模型目录的 Windows 快捷方式。
- `99_安装残留_可删除`：安装过程中产生的空目录、缓存和空日志，单独隔离，确认无用后可删除。

## 基础模型位置

Qwen3-VL-4B 基础模型没有复制到桌面目录，因为 C 盘当前只剩约 10GB，而模型约 8.3GB，复制会导致系统盘空间不足。

基础模型实体完整保存在 WSL：

```text
/home/snjhz/chemical-safety-training/models/Qwen3-VL-4B-Instruct
```

也可以双击 `04_基础模型/打开Qwen3-VL-4B基础模型.lnk` 访问。模型权重总大小为 8,875,631,616 字节，下载文件为 14/14。

WSL 训练环境：

```text
/home/snjhz/chemical-safety-training/venv
```

WSL 冒烟 LoRA 原始位置：

```text
/home/snjhz/chemical-safety-training/outputs/smoke/final
```

## 当前完成程度

- 基础模型下载完成。
- CUDA、4-bit 量化和图片推理已验证。
- QLoRA 冒烟训练完成，loss 为 1.377，eval loss 为 1.419。
- LoRA 保存并重新加载成功。
- 冒烟模型只使用两张需求截图作为负样本，不能当作正式化学品安全模型。
- 正式训练仍需要真实家庭化学品照片和人工复核标注。

详细说明见 `01_项目代码/TRAINING_STATUS.md`。
