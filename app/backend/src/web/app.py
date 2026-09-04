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

import json
import os
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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
_RISK_ORDER = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

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
    _state.update(status="ready", detail="API 模式：云端视觉模型推理（硅基流动 / 无需本地 GPU）")
else:
    threading.Thread(target=_load_model, daemon=True).start()


def _require_model():
    if BACKEND_MODE == "api":
        return None, None  # API 模式无本地模型
    if _state["status"] != "ready":
        raise HTTPException(status_code=503, detail=_state["detail"])
    return _state["model"], _state["processor"]


# ---------------- API ----------------
# 推理串行锁：视觉模型推理占显存/内存大，任何时刻只允许一个在跑，防止并发打爆内存。
_infer_lock = threading.Lock()


@app.get("/api/status")
def status():
    return {"status": _state["status"], "detail": _state["detail"],
            "model": MODEL_PATH, "adapter": ADAPTER, "household_id": HOUSEHOLD_ID}


@app.post("/api/analyze")
def analyze(image: UploadFile = File(...), context: str | None = Form(None)):
    _require_model()  # local 模式下确认模型就绪
    ext = Path(image.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的图片格式：{ext or '未知'}")
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    dest = UPLOAD_DIR / filename
    dest.write_bytes(image.file.read())

    with _infer_lock:
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

    # ---- 规则引擎兜底判定（模型负责看懂与解释，关键安全判定由规则兜底）----
    from ..rule_engine import evaluate as rules_evaluate

    analysis_dict = analysis.model_dump()
    ctx: dict = {}
    if context:
        try:
            parsed = json.loads(context)
            if isinstance(parsed, dict):
                ctx = {str(k): bool(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            ctx = {}
    rules = rules_evaluate(analysis_dict, context=ctx)

    # ---- 提示性多维评分（纯规则派生，确定性，非安全判定；前端按可选字段处理）----
    from .. import scoring

    derived = scoring.enrich(analysis_dict, rules)

    # ---- 证据溯源：按规则引擎命中的成分标签匹配条款级证据 ----
    from .. import evidence as ev

    matched_evidence = ev.for_ingredients(rules["ingredient_labels"])
    expiring = ev.expiring_soon()

    # ---- 识别后自动混用检测：与档案中已有产品做组合（主动预警） ----
    cross_risks: list[dict] = []
    try:
        with ChemicalDB(DB_PATH) as db:
            existing = db.list_household(HOUSEHOLD_ID)
        if existing:
            from .. import kg as _kg

            candidate = {"id": -1, "observed_name": analysis.product.name or "本次识别",
                         "analysis": analysis_dict}
            cross_risks = _kg.query("auto", "", existing + [candidate])["cross_risks"]
    except Exception:
        cross_risks = []

    return {"analysis": analysis_dict, "database_match": match,
            "image_path": f"uploads/{filename}",
            "rules": rules,
            "evidence": [ev.to_view(e) for e in matched_evidence],
            "expiring_standards": [ev.to_view(e) for e in expiring],
            "cross_risks": cross_risks,
            **derived}


class SaveItem(BaseModel):
    analysis: dict
    image_path: str | None = None
    location: str | None = None          # 存放位置（可选，后端不做枚举校验）


@app.post("/api/household/items")
def save_item(item: SaveItem):
    analysis = ChemicalAnalysis.model_validate(item.analysis)
    with ChemicalDB(DB_PATH) as db:
        match = db.match(analysis)
        item_id = db.add_to_household(HOUSEHOLD_ID, item.image_path or "", analysis,
                                      match["id"] if match else None,
                                      location=(item.location or "").strip() or None)
    return {"id": item_id}


class LocationPatch(BaseModel):
    location: str | None = None          # null 表示清除


@app.patch("/api/household/items/{item_id}")
def patch_item(item_id: int, body: LocationPatch):
    loc = (body.location or "").strip() or None
    with ChemicalDB(DB_PATH) as db:
        ok = db.set_item_location(item_id, loc)
    if not ok:
        raise HTTPException(status_code=404, detail="档案不存在")
    return {"id": item_id, "location": loc}


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


# ---------------- 方向② 全屋评估报告（每次生成即一次排查快照） ----------------

@app.post("/api/household/report")
def household_report():
    from ..report_gen import generate_report

    with ChemicalDB(DB_PATH) as db:
        items = db.list_household(HOUSEHOLD_ID)
        if not items:
            raise HTTPException(status_code=400, detail="家庭档案为空，先识别并存入几件物品再生成报告")
        report, local = generate_report(items, HOUSEHOLD_ID)
        # 快照去重：同一天内「风险等级 + 物品数」未变时不重复记录，避免时间线被无效快照刷屏
        latest = db.latest_checkin(HOUSEHOLD_ID)
        same_day = False
        if latest:
            try:
                same_day = _dt.fromisoformat(latest["created_at"]).date() == _dt.now().date()
            except ValueError:
                same_day = False
        if (latest and same_day
                and latest["overall_risk"] == report["overall_risk"]
                and latest["item_count"] == len(items)):
            checkin_id = latest["id"]
        else:
            checkin_id = db.add_checkin(HOUSEHOLD_ID, report["overall_risk"], len(items), report)
        prev = db.latest_checkin(HOUSEHOLD_ID, before_id=checkin_id)
    report["checkin_id"] = checkin_id
    report["prev_risk"] = prev["overall_risk"] if prev else None

    # 高频关注项聚合 + 优化建议行动清单（对齐成分说清楚）
    from ..insights import aggregate_ingredients, build_suggestions
    report["ingredient_groups"] = aggregate_ingredients(items)
    report["suggestions"] = build_suggestions(items, report.get("cross_risks") or [])
    return report


# ---------------- 方向④ 长期档案：时间线 + 复检提醒 ----------------

_RECHECK_DAYS = 180


@app.get("/api/household/timeline")
def household_timeline():
    from datetime import datetime, timedelta

    with ChemicalDB(DB_PATH) as db:
        checkins = db.list_checkins(HOUSEHOLD_ID)
        latest = db.latest_checkin(HOUSEHOLD_ID)
        n_items = db.count_items_newer_than(HOUSEHOLD_ID, None)
        n_new = db.count_items_newer_than(HOUSEHOLD_ID, latest["created_at"]) if latest else n_items

    # 折叠连续重复快照（同一风险等级 + 同一物品数连记多次的，只保留最新一条）
    collapsed: list[dict] = []
    for c in checkins:  # 新→旧
        if collapsed and collapsed[-1]["overall_risk"] == c["overall_risk"] \
                and collapsed[-1]["item_count"] == c["item_count"]:
            continue
        collapsed.append(c)

    timeline = []
    prev_risk = None
    prev_count = None
    for c in reversed(collapsed):  # 旧→新，便于计算趋势与变化量
        trend = None
        if prev_risk is not None and c["overall_risk"] in _RISK_ORDER and prev_risk in _RISK_ORDER:
            diff = _RISK_ORDER[c["overall_risk"]] - _RISK_ORDER[prev_risk]
            trend = "up" if diff > 0 else ("down" if diff < 0 else "flat")
        # 从存档的报告里取「发现几组混用风险」，让每条快照有实质内容；report_json 体积大，取出后即丢弃
        n_pairs = None
        raw = c.pop("report_json", None)
        if raw:
            try:
                n_pairs = len(json.loads(raw).get("cross_risks") or [])
            except (TypeError, ValueError):
                n_pairs = None
        item_delta = c["item_count"] - prev_count if prev_count is not None else None
        timeline.append({**c, "trend": trend, "n_pairs": n_pairs, "item_delta": item_delta})
        prev_risk = c["overall_risk"]
        prev_count = c["item_count"]
    timeline.reverse()  # 新→旧

    reminders = []
    if latest:
        try:
            last_dt = datetime.fromisoformat(latest["created_at"])
            days = (datetime.now() - last_dt).days
        except ValueError:
            days = None
        if days is not None and days >= _RECHECK_DAYS:
            reminders.append(f"距上次全屋排查已 {days} 天，建议再做一次")
        if n_new > 0:
            reminders.append(f"上次排查后有 {n_new} 件新物品入档，尚未纳入评估")
    elif n_items == 0:
        reminders.append("还没有任何档案，先拍照识别一件家里的化学品吧")
    else:
        reminders.append("还没有生成过全屋报告，点「生成全屋报告」建立基线")

    return {"checkins": timeline, "reminders": reminders, "n_items": n_items}


# ---------------- 方向③ 知识图谱多维解读 + 方向① 问答（语音转文字后进入） ----------------

from ..kg import matched_ingredients, query as kg_query  # noqa: E402


@app.get("/api/kg/query")
def kg_endpoint(mode: str = "auto", q: str = ""):
    if not q.strip():
        raise HTTPException(status_code=400, detail="q 不能为空")
    with ChemicalDB(DB_PATH) as db:
        items = db.list_household(HOUSEHOLD_ID)
    return kg_query(mode, q, items)


class MixItemIn(BaseModel):
    analysis: dict
    name: str | None = None
    image_path: str | None = None
    location: str | None = None          # 在档物品的存放位置（用于同位置预警）


class MixBody(BaseModel):
    items: list[MixItemIn]


@app.post("/api/mix")
def mix_check(body: MixBody):
    """两瓶会话混用检测：只算图谱交叉，不写入档案 / 时间线。"""
    if len(body.items) != 2:
        raise HTTPException(status_code=400, detail="请选出两瓶再混合")
    packed = []
    for i, it in enumerate(body.items, start=1):
        try:
            analysis = ChemicalAnalysis.model_validate(it.analysis)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"第{i}瓶分析结构无效：{exc}") from exc
        name = (it.name or analysis.product.name or f"物品{i}").strip()
        packed.append({
            "id": i,
            "observed_name": name,
            "analysis": analysis.model_dump(),
            "image_path": it.image_path,
            "location": (it.location or "").strip() or None,
        })
    result = kg_query("auto", "", packed)
    cross = result["cross_risks"]
    # 规则库结论统一标注来源（kg.query 已带 source，这里兜底补标，双保险）
    for p in cross:
        p.setdefault("source", "rules")
    annotated = []
    for row in packed:
        ings = matched_ingredients(row)
        annotated.append({
            "id": row["id"],
            "name": row["observed_name"],
            "risk_level": (row.get("analysis") or {}).get("risk_level", "unknown"),
            "image_path": row.get("image_path"),
            "matched": [{"id": n.id, "name": n.name} for n in ings],
            "unknown": len(ings) == 0,
        })
    unknown_names = [x["name"] for x in annotated if x["unknown"]]
    verdict_source = "rules"
    if any(p.get("severity") in ("critical", "high") for p in cross):
        verdict = "danger"
    elif cross:
        # 只有 medium 级命中（功效抵消/配方未知的保守提示）→ caution，可展示但不报警
        verdict = "caution"
    elif unknown_names:
        verdict = "unknown"
    else:
        verdict = "no_edge"

    # ---- LLM 兜底判定：规则未命中（no_edge/unknown）且两端有可描述信息时 ----
    # 任何失败（无 key/超时/解析失败）都静默降级为原 verdict，绝不影响接口可用性。
    llm_used = False
    if verdict in ("no_edge", "unknown"):
        try:
            from .. import mix_llm

            if mix_llm.available():
                guess = mix_llm.judge_pair(packed[0], packed[1])
            else:
                guess = None
        except Exception:  # noqa: BLE001 - LLM 层整体不可信时降级
            guess = None
        if guess and guess["verdict"] in ("danger", "caution"):
            entry = {
                "a": f"#{packed[0]['id']} {packed[0]['observed_name']}",
                "b": f"#{packed[1]['id']} {packed[1]['observed_name']}",
                "reason": guess["reason"],
                "action": guess["action"],
                "severity": "high" if guess["verdict"] == "danger" else "medium",
                "source": "llm",
            }
            cross.append(entry)
            llm_used = True
            verdict_source = "llm"
            verdict = "danger" if guess["verdict"] == "danger" else "caution"

    # ---- 同位置预警：两瓶记在同一存放位置且有混用禁忌时，逐条标注 ----
    loc_a = packed[0].get("location")
    loc_b = packed[1].get("location")
    if loc_a and loc_a == loc_b:
        for p in cross:
            p["same_location"] = True
            p["location"] = loc_a

    return {
        "n_items": 2,
        "items": annotated,
        "cross_risks": cross,
        "has_critical": verdict == "danger",
        "verdict": verdict,
        "verdict_source": verdict_source,
        "llm_used": llm_used,
        "unknown_names": unknown_names,
    }


class AskBody(BaseModel):
    question: str
    mode: str = "auto"
    history: list | None = None          # 多轮：前端传 [{role, content}]
    context: dict | None = None          # 家庭画像（child/pet_cat/pregnant...）


@app.post("/api/ask")
def ask(body: AskBody):
    q = body.question.strip()
    if not q:
        raise HTTPException(status_code=400, detail="问题不能为空")
    with ChemicalDB(DB_PATH) as db:
        items = db.list_household(HOUSEHOLD_ID)
    from ..report_gen import answer_question

    return answer_question(q, body.mode, items, history=body.history, context=body.context)


# ---------------- 证据溯源（条款级） ----------------
@app.get("/api/evidence")
def list_evidence(labels: str = "", as_of: str | None = None):
    """按成分标签返回证据；labels 逗号分隔（如 hypochlorite,acid）。空则返回全部。"""
    from .. import evidence as ev

    if labels:
        ings = [s.strip() for s in labels.split(",") if s.strip()]
        data = ev.for_ingredients(ings, as_of=as_of)
    else:
        data = ev.all_evidence()
    return {"evidence": [ev.to_view(e) for e in data],
            "expiring_soon": [ev.to_view(e) for e in ev.expiring_soon(as_of=as_of)]}


@app.get("/api/evidence/{eid}")
def get_evidence(eid: str):
    from .. import evidence as ev

    e = ev.get(eid)
    if e is None:
        raise HTTPException(status_code=404, detail="证据不存在")
    return ev.to_view(e)


# ---------------- 反馈收集（真实用户反馈） ----------------
import sqlite3 as _sqlite3
from datetime import datetime as _dt

_FEEDBACK_DB = Path(DB_PATH)


def _feedback_conn():
    conn = _sqlite3.connect(str(_FEEDBACK_DB))
    conn.row_factory = _sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS feedback(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             rating TEXT NOT NULL,
             comment TEXT DEFAULT '',
             audience TEXT DEFAULT '',
             page TEXT DEFAULT '',
             created_at TEXT NOT NULL)"""
    )
    return conn


class FeedbackBody(BaseModel):
    rating: str                            # "up" | "down"
    comment: str = ""
    audience: str = ""                     # 人群标签，如"有2岁宝宝"
    page: str = ""                         # 来源页面 scan/archive/mix


@app.post("/api/feedback")
def submit_feedback(body: FeedbackBody):
    if body.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="rating 必须为 up/down")
    conn = _feedback_conn()
    conn.execute(
        "INSERT INTO feedback(rating,comment,audience,page,created_at) VALUES(?,?,?,?,?)",
        (body.rating, body.comment[:500], body.audience[:50], body.page[:50],
         _dt.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/feedback/stats")
def feedback_stats():
    conn = _feedback_conn()
    total = conn.execute("SELECT COUNT(*) c FROM feedback").fetchone()["c"]
    up = conn.execute("SELECT COUNT(*) c FROM feedback WHERE rating='up'").fetchone()["c"]
    rows = conn.execute(
        "SELECT rating,comment,audience,page,created_at FROM feedback ORDER BY id DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return {
        "total": total, "up": up, "down": total - up,
        "recent": [dict(r) for r in rows],
    }


# ---------------- 前端静态页面（放最后，避免覆盖 API 路由） ----------------
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
