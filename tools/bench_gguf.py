import base64, json, time, urllib.request, sys

img_path = sys.argv[1] if len(sys.argv) > 1 else "/Users/mychanging/Desktop/家庭化学药品识别模型/拼接完成项目/backend/data/uploads/615f9f119e0b.jpg"
with open(img_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

sys.path.insert(0, "/Users/mychanging/Desktop/家庭化学药品识别模型/拼接完成项目/backend")
from src.schema import SYSTEM_PROMPT, USER_PROMPT

payload = {
    "model": "qwen3vl",
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            {"type": "text", "text": USER_PROMPT},
        ]},
    ],
    "max_tokens": 1000,
    "temperature": 0,
    "stream": False,
}
req = urllib.request.Request(
    "http://127.0.0.1:8080/v1/chat/completions",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
t0 = time.time()
with urllib.request.urlopen(req, timeout=600) as r:
    body = json.loads(r.read())
dt = time.time() - t0
content = body["choices"][0]["message"]["content"]
usage = body.get("usage", {})
print(f"IMG={img_path.split('/')[-1]}")
print(f"TIME={dt:.1f}s  completion_tokens={usage.get('completion_tokens')}  tok/s={usage.get('completion_tokens',0)/max(dt,0.1):.1f}")
print("--- OUTPUT (first 600 chars) ---")
print(content[:600])
