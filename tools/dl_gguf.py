from modelscope import snapshot_download

p = snapshot_download(
    "Qwen/Qwen3-VL-4B-Instruct-GGUF",
    local_dir="/Users/mychanging/Desktop/家庭化学药品识别模型/gguf模型",
    allow_file_pattern=["*Q4_K_M*", "*mmproj*F16*"],
)
print("DONE", p)
