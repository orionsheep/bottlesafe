"""全屋评估报告生成（方向②）。

两层设计：
  1. 本地确定性分析（永不失败）：逐件风险统计、雷达维度、禁忌混用交叉
     （复用 kg.py 的种子图谱做成分级检查）、场景分布。
  2. LLM 叙事层（尽力而为）：把本地分析喂给文本模型，生成个性化、通俗、
     不制造恐慌的解读；未配置 key / 网络失败时回退模板文案，Demo 永不中断。

每次生成报告都会写入一条排查快照（checkin），作为长期档案时间线的一个节点。
"""

from __future__ import annotations

import re

from . import kg
from .disposal import disposal_summary
from .llm import chat_json

_PAIR_ID_RE = re.compile(r"#(\d+)")


def _pair_id(label: str) -> int | None:
    """从 cross_risk 的 "#12 洁厕灵" 形式里解析物品 id；同瓶组合等非物品标签返回 None。"""
    m = _PAIR_ID_RE.match(label or "")
    return int(m.group(1)) if m else None

_RISK_ORDER = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
_SEV_OF = _RISK_ORDER

# 雷达五维：危害类型关键词 → 维度
_RADAR_DIMS: dict[str, list[str]] = {
    "呼吸刺激": ["吸入", "呼吸道", "挥发", "氯气", "刺激气味", "蒸气"],
    "皮肤/眼睛腐蚀": ["腐蚀", "灼伤", "皮肤", "眼睛", "刺激性", "强酸", "强碱"],
    "毒性/误食": ["毒性", "有毒", "误食", "中毒", "吞咽"],
    "燃烧/反应": ["易燃", "燃烧", "氧化", "反应", "爆炸"],
    "儿童/宠物风险": ["儿童", "误食", "宠物", "幼儿"],
}

_OVERALL_TEXT = {
    "low": "整体状态良好",
    "medium": "存在需要注意的环节",
    "high": "有明确的高风险点，建议尽快处理",
    "critical": "发现危急组合，请立即处理",
    "unknown": "信息尚不完整",
}


def _local_analysis(items: list[dict]) -> dict:
    """确定性分析：不依赖任何外部服务。"""
    n_items = len(items)
    risk_count = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unknown": 0}
    radar = {k: 0 for k in _RADAR_DIMS}
    scene_items: dict[str, list[int]] = {}
    high_items: list[dict] = []
    all_text: list[str] = []

    for it in items:
        a = it.get("analysis") or {}
        rl = a.get("risk_level") or "unknown"
        risk_count[rl] = risk_count.get(rl, 0) + 1
        blob = " ".join(
            [str((a.get("product") or {}).get("name") or ""), str((a.get("product") or {}).get("category") or "")]
            + [h.get("type", "") + h.get("evidence", "") for h in a.get("hazards") or []]
            + [i.get("name", "") for i in a.get("ingredients") or []]
        )
        all_text.append(blob.lower())
        for dim, keys in _RADAR_DIMS.items():
            if any(k in blob for k in keys):
                radar[dim] += 1
        if rl in ("high", "critical"):
            high_items.append({"id": it["id"], "name": it.get("observed_name") or "",
                               "risk_level": rl,
                               "why": "；".join(h.get("type", "") for h in a.get("hazards") or [])[:80]})
        # 场景归入：按物品名/类别猜场景
        t = blob.lower()
        for scene_node in [n for n in kg.NODES if n.type == "scene"]:
            if any(k.lower() in t for k in [scene_node.name] + scene_node.aliases):
                scene_items.setdefault(scene_node.name, []).append(it["id"])

    cross = kg.query("auto", "", items)["cross_risks"]

    # 位置联动：混用禁忌组合的两件物品记在同一存放位置时标注，并排最前
    loc_of = {it["id"]: (it.get("location") or "").strip() for it in items}
    for p in cross:
        ia = _pair_id(p.get("a", ""))
        ib = _pair_id(p.get("b", ""))
        if ia is None or ib is None:
            continue
        la, lb = loc_of.get(ia, ""), loc_of.get(ib, "")
        if la and la == lb:
            p["same_location"] = True
            p["location"] = la
    cross.sort(key=lambda p: 0 if p.get("same_location") else 1)

    # 总体等级：任一 critical → critical；有 cross 高危或 ≥1 high → high；≥1 medium → medium；其余 low/unknown
    if any(it_risk == "critical" for it_risk in risk_count) or any(p["severity"] == "critical" for p in cross):
        overall = "critical"
    elif risk_count["high"] > 0:
        overall = "high"
    elif risk_count["medium"] > 0:
        overall = "medium"
    elif n_items and risk_count["unknown"] == n_items:
        overall = "unknown"
    else:
        overall = "low"

    return {"n_items": n_items, "risk_count": risk_count, "radar": radar, "overall": overall,
            "high_items": high_items, "cross_risks": cross,
            "scenes": [{"scene": s, "item_ids": ids} for s, ids in scene_items.items()]}


_REPORT_SYSTEM = """你是家庭化学品安全顾问。基于给定的家庭化学品档案与本地风险分析，输出一个符合下列结构的 JSON 对象：
{"overview":"2-3句总体评价，通俗、不制造恐慌","top_actions":["3-5条最重要的行动建议，每条一句话，先说最重要的事"],"quick_wins":["1-3条今天就能完成的小改动"],"reassure":"一句安抚的话：说明哪些做得不错、不必焦虑"}
规则：1. 只依据给定事实，不要编造家中不存在的物品。2. 语言面向普通家庭成员，避免专业术语。3. 不提供任何危险配制步骤。4. 输出必须是合法 JSON，不要 Markdown 代码块。"""


def _fallback_narrative(local: dict) -> dict:
    """无 LLM 时的模板叙事。"""
    acts = []
    if local["cross_risks"]:
        p = local["cross_risks"][0]
        acts.append(f"立即把「{p['a'].split(' ', 1)[-1]}」和「{p['b']}」分开存放：{p['reason']}")
    for hi in local["high_items"][:3]:
        acts.append(f"优先处理 #{hi['id']} {hi['name']}（{hi['risk_level']} 风险）：核对存放位置并远离儿童")
    if not acts:
        acts.append("把所有化学品保持原包装、原标签，避免用饮料瓶分装")
        acts.append("清洁剂使用时开窗通风，用完盖紧")
    return {"overview": f"共登记 {local['n_items']} 件家庭化学品。{_OVERALL_TEXT.get(local['overall'], '')}。",
            "top_actions": acts[:5],
            "quick_wins": ["给储物柜加一把儿童锁", "把漂白类与酸性清洁剂分放在两个不同柜子"],
            "reassure": "愿意逐一了解家里的瓶瓶罐罐，本身就是最好的安全习惯。"}


def generate_report(items: list[dict], household_id: str) -> tuple[dict, dict]:
    """返回 (report, local)。report 含 local 分析 + LLM 叙事（或兜底）。"""
    local = _local_analysis(items)

    compact = {
        "n_items": local["n_items"], "overall": local["overall"],
        "risk_count": local["risk_count"], "radar": local["radar"],
        "high_items": local["high_items"],
        "cross_risks": [f"{p['a']} × {p['b']}：{p['reason']}" for p in local["cross_risks"][:6]],
        "items_brief": [
            {"id": it["id"], "name": it.get("observed_name") or (it.get("analysis") or {}).get("product", {}).get("name"),
             "risk": (it.get("analysis") or {}).get("risk_level")}
            for it in items[:40]],
    }
    narrative = chat_json(_REPORT_SYSTEM, __import__("json").dumps(compact, ensure_ascii=False), max_tokens=900)
    if not isinstance(narrative, dict) or "overview" not in narrative:
        narrative = _fallback_narrative(local)

    report = {
        "household_id": household_id,
        "overall_risk": local["overall"],
        "overall_text": _OVERALL_TEXT.get(local["overall"], ""),
        "n_items": local["n_items"],
        "risk_count": local["risk_count"],
        "radar": [{"dim": k, "value": v} for k, v in local["radar"].items()],
        "high_items": local["high_items"],
        "cross_risks": local["cross_risks"],
        "scenes": local["scenes"],
        "overview": str(narrative.get("overview") or ""),
        "top_actions": [str(x) for x in narrative.get("top_actions") or []][:5],
        "quick_wins": [str(x) for x in narrative.get("quick_wins") or []][:3],
        "reassure": str(narrative.get("reassure") or ""),
        "disposal": disposal_summary(items),
        "disclaimer": "本报告仅供家庭风险筛查参考，不能替代产品标签、SDS 或专业建议。",
    }
    return report, local


# ---------------- 问答（方向①的文本侧：语音转文字后进入这里） ----------------

_ASK_SYSTEM = """你是家庭化学品安全助手「瓶安」。用户问的是「这一户人家」的具体情况，不是抽象百科。
回答规则：
1. 必须依据【家庭档案】（含存放位置）与【家庭画像】作答；点名具体是哪一瓶、放在哪、什么成分。
2. 同一位置放了相克的两瓶，必须主动点名「现在就分开」。
3. 知识图谱只是辅助线索，档案里没有的物品不要编造。
4. 不确定就说不确定，建议补拍标签；绝不把「暂无法判断」说成安全。
5. 语气平和、通俗；给出 2-4 条立刻可做的行动。
6. 涉及急性暴露（大量接触、误食、呼吸困难）时，第一句先提醒打 120 / 当地中毒咨询。
7. 保持原瓶原标，不要建议把化学品倒进饮料瓶或其他容器。
8. 用不超过 280 字的中文短段落回答，不要用 Markdown 标题。"""

_RISK_ZH = {"unknown": "暂无法判断", "low": "低风险", "medium": "需要注意",
            "high": "高风险", "critical": "严重风险"}


def _item_name(it: dict) -> str:
    a = it.get("analysis") or {}
    prod = a.get("product") if isinstance(a.get("product"), dict) else {}
    return (it.get("observed_name") or prod.get("name") or "未命名").strip() or "未命名"


def _format_household(items: list[dict]) -> str:
    """把整份家庭档案（名称 / 风险 / 位置 / 成分 / 切忌混用）写成模型可读的台账。"""
    if not items:
        return "【家庭档案】目前还是空的。还没识别并存档任何化学品。"

    from collections import defaultdict

    by_loc: dict[str, list[str]] = defaultdict(list)
    lines: list[str] = []
    for it in items:
        a = it.get("analysis") or {}
        prod = a.get("product") if isinstance(a.get("product"), dict) else {}
        name = _item_name(it)
        loc = (it.get("location") or "").strip() or "未标记位置"
        risk = _RISK_ZH.get(str(a.get("risk_level") or "unknown"), str(a.get("risk_level") or "unknown"))
        cat = (prod.get("category") or "").strip()
        ings = [str(g.get("name")).strip() for g in (a.get("ingredients") or [])
                if isinstance(g, dict) and g.get("name")][:6]
        mix = [str(x).strip() for x in (a.get("do_not_mix_with") or []) if str(x).strip()][:4]
        bits = [f"#{it.get('id')} {name}", risk, f"放在{loc}"]
        if cat:
            bits.append(cat)
        if ings:
            bits.append("成分：" + "、".join(ings))
        if mix:
            bits.append("切忌混用：" + "、".join(mix))
        lines.append("- " + " · ".join(bits))
        by_loc[loc].append(f"#{it.get('id')} {name}")

    same = [f"{loc}：{'、'.join(names)}" for loc, names in by_loc.items()
            if loc != "未标记位置" and len(names) >= 2]
    out = [f"【家庭档案】共 {len(items)} 件：", *lines]
    if same:
        out.append("【同处存放】以下位置放了不止一瓶，回答时检查是否相克：")
        out.extend(f"- {s}" for s in same)
    return "\n".join(out)


def _format_profile(context: dict | None) -> str:
    """家庭画像 + 储存三态 + 健康/过敏原等标签。"""
    if not context:
        return "【家庭画像】未设置，按普通家庭回答。"
    people = []
    flags = [
        ("infant", "有婴幼儿"), ("child", "有儿童"), ("elderly", "有老人"),
        ("pregnant", "有孕妇"), ("trying_conceive", "备孕"),
        ("pet_cat", "养猫"), ("pet_dog", "养狗"),
        ("allergy", "过敏体质"), ("asthma", "有哮喘"), ("hypertension", "有高血压"),
    ]
    for key, label in flags:
        if context.get(key):
            people.append(label)

    def _yesno(v):
        if v is True:
            return "是"
        if v is False:
            return "否"
        return None

    storage = []
    for key, label in (("child_accessible", "儿童可触及"),
                       ("near_food", "靠近食品"),
                       ("original_container", "保留原包装")):
        yn = _yesno(context.get(key)) if key in context else None
        if yn:
            storage.append(f"{label}={yn}")

    extras = []
    for key, label in (("doctor_flags", "健康关注"), ("allergens", "过敏原"),
                       ("diet", "饮食"), ("fitness", "运动")):
        raw = context.get(key) or []
        if isinstance(raw, str):
            raw = [raw]
        tags = [str(x).strip() for x in raw if str(x).strip()]
        if tags:
            extras.append(f"{label}：" + "、".join(tags))

    if not people and not storage and not extras:
        return "【家庭画像】未设置，按普通家庭回答。"
    parts = ["【家庭画像】"]
    if people:
        parts.append("人群：" + "、".join(people) + "。回答必须针对这些成员给差异化提示。")
    if storage:
        parts.append("这瓶/当前存放：" + "，".join(storage) + "。")
    if extras:
        parts.append("；".join(extras) + "。")
    return "".join(parts) if len(parts) == 1 else "\n".join(parts)


def answer_question(question: str, mode: str, items: list[dict],
                    history: list | None = None, context: dict | None = None) -> dict:
    """多轮问答：把完整家庭档案（含位置）+ 画像喂给 LLM；失败再走图谱兜底。"""
    sub = kg.query(mode, question, items)
    household = _format_household(items)
    profile = _format_profile(context)
    facts = "\n".join(
        ["- " + f for f in sub["facts"][:8]]
        + ["- 图谱相关物品：" + (", ".join(f"#{i['id']} {i['name']}" for i in sub["related_items"][:6]) or "无")]
        + ["- 交叉混用：" + p["reason"] for p in sub["cross_risks"][:5]]
    )

    system = _ASK_SYSTEM + "\n\n" + household + "\n\n" + profile
    user = f"用户问题：{question}\n\n【知识图谱线索】（仅辅助，以档案为准）\n{facts or '（无线索）'}"

    ans = None
    llm_used = False
    from .llm import chat_multi
    raw = chat_multi(system, history, user, max_tokens=700, temperature=0.3)
    if raw:
        ans = raw.strip()
        llm_used = True
    if not ans:
        lines = []
        if sub["advice"]:
            lines += sub["advice"][:3]
        if sub["related_items"]:
            names = ", ".join(f"#{i['id']} {i['name']}" for i in sub["related_items"][:4])
            lines.append(f"你家的这些物品可能相关：{names}。")
        if sub["cross_risks"]:
            lines.append(f"注意：{sub['cross_risks'][0]['reason']}。")
        same = [ln for ln in household.splitlines() if ln.startswith("- ") and "放在" in ln]
        if same:
            lines.append("家中在档：" + "；".join(same[:6]).replace("- ", ""))
        if not lines:
            lines.append("暂时没有找到直接相关的记录。建议拍一张产品标签的照片，我来帮你具体分析；如症状持续，请及时就医。")
        lines.append("以上仅为家庭安全参考，不能替代专业医疗意见。")
        ans = "\n".join(lines)
    return {"answer": ans, "llm_used": llm_used,
            "graph": {"matched_nodes": sub["matched_nodes"], "facts": sub["facts"],
                      "advice": sub["advice"], "cross_risks": sub["cross_risks"]},
            "related_items": sub["related_items"]}
