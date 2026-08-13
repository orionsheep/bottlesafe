"""家庭化学品安全档案 · 本机演示 Web 服务。

FastAPI 后端，复用 src/infer.py（模型推理）与 src/chemical_db.py（SQLite 档案）。
Demo 阶段不做用户登录，所有数据归属固定家庭 HOUSEHOLD_ID。

启动（在 01_项目代码 目录下）：
    .venv-mac/bin/python -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000

环境变量：
    CHEM_MODEL_PATH  基础模型路径（默认指向本机 04_基础模型/Qwen3-VL-4B-Instruct）
    CHEM_ADAPTER     LoRA 适配器路径（默认第二次微调 public-300-final，设空字符串可关闭）
    CHEM_DB          SQLite 路径（默认 data/chemicals.db）
    CHEM_HOUSEHOLD   家庭 ID（默认 home-001）
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ..chemical_db import ChemicalDB
from ..schema import ChemicalAnalysis

BASE_DIR = Path(__file__).resolve().parents[2]          # backend（拼接完成项目）
WORKSPACE_DIR = BASE_DIR.parent.parent                   # 家庭化学药品识别模型
WEB_DIR = BASE_DIR / "web"
UPLOAD_DIR = BASE_DIR / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 拼接后的默认路径：基础模型用第一次包里的完整权重，适配器用第二次微调的正式权重。
DEFAULT_MODEL = WORKSPACE_DIR / "新建文件夹" / "家庭化学品安全模型" / "04_基础模型" / "Qwen3-VL-4B-Instruct"
DEFAULT_ADAPTER = WORKSPACE_DIR / "第二次微调" / "微调千问模型" / "家庭化学品安全模型" / "02_微调权重" / "public-300-final"

MODEL_PATH = os.environ.get("CHEM_MODEL_PATH", str(DEFAULT_MODEL))
ADAPTER = os.environ.get("CHEM_ADAPTER", str(DEFAULT_ADAPTER)) or None
DB_PATH = os.environ.get("CHEM_DB", str(BASE_DIR / "data" / "chemicals.db"))
HOUSEHOLD_ID = os.environ.get("CHEM_HOUSEHOLD", "home-001")

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# local=本地加载模型（GPU）；api=调魔搭免费推理 API（创空间免费 CPU 演示用）
BACKEND_MODE = os.environ.get("CHEM_BACKEND", "local")

app = FastAPI(title="家庭化学品安全档案", docs_url=None, redoc_url=None)
# 允许 vinext 前端（默认 3000/5173 等本地端口）跨域调用 API。
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------------- 模型生命周期（后台加载，不阻塞服务启动） ----------------
_state = {"status": "loading", "detail": "模型加载中…", "model": None, "processor": None}


def _load_model() -> None:
    try:
        from ..infer import load_model  # 延迟导入，避免无模型环境下启动失败

        t0 = time.time()
        model, processor = load_model(MODEL_PATH, ADAPTER)
        _state.update(model=model, processor=processor,
                      status="ready", detail=f"模型就绪（加载耗时 {time.time() - t0:.0f}s）")
    except Exception as exc:  # noqa: BLE001 - 任何加载失败都通过 /api/status 暴露
        _state.update(status="error", detail=f"模型加载失败：{exc}")


if BACKEND_MODE == "api":
    _state.update(status="ready", detail="API 模式：魔搭免费推理（无本地模型）")
else:
    threading.Thread(target=_load_model, daemon=True).start()


def _require_model():
    if BACKEND_MODE == "api":
        return None, None  # API 模式无本地模型
    if _state["status"] != "ready":
        raise HTTPException(status_code=503, detail=_state["detail"])
    return _state["model"], _state["processor"]


# ---------------- API ----------------
@app.get("/api/status")
def status():
    return {"status": _state["status"], "detail": _state["detail"],
            "model": MODEL_PATH, "adapter": ADAPTER, "household_id": HOUSEHOLD_ID}


@app.post("/api/analyze")
def analyze(image: UploadFile = File(...)):
    _require_model()  # local 模式下确认模型就绪
    ext = Path(image.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的图片格式：{ext or '未知'}")
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    dest = UPLOAD_DIR / filename
    dest.write_bytes(image.file.read())

    try:
        if BACKEND_MODE == "api":
            from ..api_infer import analyze_image_api

            analysis = analyze_image_api(str(dest))
        else:
            from ..infer import analyze_image

            analysis = analyze_image(_state["model"], _state["processor"], str(dest))
    except Exception as exc:  # noqa: BLE001 - 模型输出不合法时返回 422 并附原文线索
        raise HTTPException(status_code=422, detail=f"识别结果未通过结构校验：{exc}") from exc

    with ChemicalDB(DB_PATH) as db:
        match = db.match(analysis)
    return {"analysis": analysis.model_dump(), "database_match": match,
            "image_path": f"uploads/{filename}"}


class SaveItem(BaseModel):
    analysis: dict
    image_path: str | None = None


@app.post("/api/household/items")
def save_item(item: SaveItem):
    analysis = ChemicalAnalysis.model_validate(item.analysis)
    with ChemicalDB(DB_PATH) as db:
        match = db.match(analysis)
        item_id = db.add_to_household(HOUSEHOLD_ID, item.image_path or "", analysis,
                                      match["id"] if match else None)
    return {"id": item_id}


@app.get("/api/household/items")
def list_items():
    with ChemicalDB(DB_PATH) as db:
        return {"items": db.list_household(HOUSEHOLD_ID)}


@app.get("/api/household/items/{item_id}")
def get_item(item_id: int):
    with ChemicalDB(DB_PATH) as db:
        row = db.get_household_item(item_id)
    if not row:
        raise HTTPException(status_code=404, detail="档案不存在")
    return row


@app.delete("/api/household/items/{item_id}")
def delete_item(item_id: int):
    with ChemicalDB(DB_PATH) as db:
        ok = db.delete_household_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="档案不存在")
    return {"deleted": item_id}


@app.get("/uploads/{filename}")
def uploaded_file(filename: str):
    path = UPLOAD_DIR / Path(filename).name  # 防止路径穿越
    if not path.is_file():
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(path)


# ---------------- 前端静态页面（放最后，避免覆盖 API 路由） ----------------
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
