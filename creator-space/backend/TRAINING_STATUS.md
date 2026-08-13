# 训练状态（2026-08-11）

## 正式训练已完成

- 模型：`Qwen3-VL-4B-Instruct`
- 基础模型路径：`/home/snjhz/chemical-safety-training/models/Qwen3-VL-4B-Instruct`
- 正式输出：`/home/snjhz/chemical-safety-training/outputs/public-300`
- Windows 最终适配器：`../02_微调权重/public-300-final`
- Windows 可恢复检查点：`../02_微调权重/public-300-checkpoint-34`
- 数据：300 条记录，272 train / 28 validation
- 训练：1 epoch，34 optimizer steps
- `train_loss=1.382`
- `eval_loss=1.065`
- 训练时长：1874 秒

## 验证

- 4-bit 基础模型和正式 LoRA 适配器重新加载成功。
- 商品图推理生成合法 JSON，并通过 `ChemicalAnalysis` schema 校验。
- 一次 HAZMAT 推理出现 JSON 标点错误；推理服务应配置解析修复或自动重试。

## 历史冒烟测试

旧冒烟适配器和 checkpoint 已移动到 `../99_历史测试与安装残留_可删除`。它们只证明训练链路可运行，不是正式模型。
