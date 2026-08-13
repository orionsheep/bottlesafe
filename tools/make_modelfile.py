import sys

sys.path.insert(0, "/Users/mychanging/Desktop/家庭化学药品识别模型/拼接完成项目/backend")
from src.schema import SYSTEM_PROMPT

base = "/Users/mychanging/Desktop/家庭化学药品识别模型/gguf模型"
modelfile = f"""FROM {base}/Qwen3VL-4B-Instruct-Q4_K_M.gguf
PARAMETER mmproj {base}/mmproj-Qwen3VL-4B-Instruct-F16.gguf
PARAMETER temperature 0
PARAMETER num_ctx 8192
SYSTEM \"\"\"{SYSTEM_PROMPT}\"\"\"
"""
with open("/Users/mychanging/Desktop/家庭化学药品识别模型/Modelfile", "w") as f:
    f.write(modelfile)
print("Modelfile written, SYSTEM_PROMPT length:", len(SYSTEM_PROMPT))
