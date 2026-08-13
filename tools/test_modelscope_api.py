"""魔搭免费推理 API 探测脚本：逐个测试候选视觉模型，找出免费可用的那个。

用法（把 <你的令牌> 换成 https://modelscope.cn/my/myaccesstoken 的 SDK 令牌）：
    CHEM_API_KEY=<你的令牌> python3 test_modelscope_api.py [图片路径]
"""
import base64, json, os, sys, time, urllib.request, urllib.error

KEY = os.environ.get("CHEM_API_KEY", "")
if not KEY:
    sys.exit("请先设置 CHEM_API_KEY 环境变量（魔搭 SDK 令牌）")

img = sys.argv[1] if len(sys.argv) > 1 else \
    "/Users/mychanging/Desktop/家庭化学药品识别模型/新建文件夹/家庭化学品安全模型/01_项目代码/data/public_300/images/prod_10020_v0.jpg"
with open(img, "rb") as f:
    data_url = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()

sys.path.insert(0, "/Users/mychanging/Desktop/家庭化学药品识别模型/拼接完成项目/backend")
from src.schema import SYSTEM_PROMPT, USER_PROMPT

CANDIDATES = [
    "Qwen/Qwen3-VL-4B-Instruct",
    "Qwen/Qwen3-VL-8B-Instruct",
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "Qwen/Qwen2.5-VL-72B-Instruct",
]

for model in CANDIDATES:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": USER_PROMPT},
            ]},
        ],
        "max_tokens": 1000, "temperature": 0,
    }
    req = urllib.request.Request(
        "https://api-inference.modelscope.cn/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = json.loads(r.read())
        text = body["choices"][0]["message"]["content"]
        print(f"✅ {model}  可用！耗时 {time.time()-t0:.1f}s")
        print(f"   输出前 200 字: {text[:200]}")
        print(f"\n部署时密文变量设置: CHEM_API_MODEL={model}")
        break
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="ignore")[:200]
        print(f"❌ {model}  HTTP {e.code}: {msg}")
    except Exception as e:
        print(f"❌ {model}  {type(e).__name__}: {e}")
else:
    print("\n⚠️ 候选模型全部不可用，请把上面的报错发给我")
