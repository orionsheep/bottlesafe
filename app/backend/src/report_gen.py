"""全屋评估报告生成（方向②）。

两层设计：
  1. 本地确定性分析（永不失败）：逐件风险统计、雷达维度、禁忌混用交叉
     （复用 kg.py 的种子图谱做成分级检查）、场景分布。
  2. LLM 叙事层（尽力而为）：把本地分析喂给文本模型，生成个性化、通俗、
     不制造恐慌的解读；未配置 key / 网络失败时回退模板文案，Demo 永不中断。

每次生成报告都会写入一条排查快照（checkin），作为长期档案时间线的一个节点。
"""

from __future__ import annotations

from . import kg
from .disposal import disposal_summary
from .llm import chat_json

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

_ASK_SYSTEM = """你是家庭化学品安全助手「瓶安」。用户可能描述症状、询问某个场景的风险、或关心家里特定人群。
回答规则：
1. 优先依据提供的【知识图谱线索】与【家中在档物品】作答，点明具体是哪一件物品、哪个成分。
2. 不确定就说不确定，建议用户拍照识别或查看标签；绝不编造家中不存在的物品。
3. 语气平和、通俗、不制造恐慌；给出 2-4 条立刻可做的行动。
4. 涉及急性暴露（大量接触、误食、呼吸困难）时，第一句先提醒联系急救/中毒咨询机构。
5. 用不超过 200 字的中文短段落回答，不要用 Markdown 标题。"""


def answer_question(question: str, mode: str, items: list[dict],
                    history: list | None = None, context: dict | None = None) -> dict:
    """多轮语音问答：支持 history（多轮）+ 记忆开场（最近扫描）+ 画像（context）。"""
    sub = kg.query(mode, question, items)
    facts = "\n".join(["- " + f for f in sub["facts"][:10]] +
                      ["- 家中相关在档物品：" + (", ".join(f"#{i['id']}{i['name']}" for i in sub["related_items"][:6]) or "（无匹配项）")] +
                      ["- 交叉混用风险：" + p["reason"] for p in sub["cross_risks"][:5]])

    # 记忆开场：把最近扫描的产品注入 system，让 AI 能"记得"
    memory = ""
    if items:
        recent = [f"#{i['id']} {i.get('observed_name') or '未命名'}"
                  for i in items[-5:]]
        memory = "用户最近扫描并建档的物品：" + "、".join(recent) + "。"

    # 画像：把家庭成员/人群注入
    profile = ""
    if context:
        tags = []
        if context.get("infant"):
            tags.append("有婴幼儿")
        if context.get("child"):
            tags.append("有儿童")
        if context.get("pet_cat"):
            tags.append("养猫")
        if context.get("pet_dog"):
            tags.append("养狗")
        if context.get("pregnant"):
            tags.append("有孕妇")
        if context.get("trying_conceive"):
            tags.append("备孕")
        if context.get("elderly"):
            tags.append("有老人")
        if context.get("allergy"):
            tags.append("过敏体质")
        if context.get("asthma"):
            tags.append("有哮喘")
        if context.get("hypertension"):
            tags.append("有高血压")
        if tags:
            profile = "家庭画像：" + "、".join(tags) + "。回答需针对这些人群给出差异化提示。"

    system = _ASK_SYSTEM + ("\n\n" + memory if memory else "") + ("\n" + profile if profile else "")
    user = f"用户问题：{question}\n\n【知识图谱线索】\n{facts}"

    ans = None
    from .llm import chat_multi
    raw = chat_multi(system, history, user, max_tokens=500, temperature=0.4)
    if raw:
        ans = raw.strip()
    if not ans:
        lines = []
        if sub["advice"]:
            lines += sub["advice"][:3]
        if sub["related_items"]:
            names = ", ".join(f"#{i['id']} {i['name']}" for i in sub["related_items"][:4])
            lines.append(f"你家的这些物品可能相关：{names}。")
        if sub["cross_risks"]:
            lines.append(f"注意：{sub['cross_risks'][0]['reason']}。")
        if not lines:
            lines.append("暂时没有找到直接相关的记录。建议拍一张产品标签的照片，我来帮你具体分析；如症状持续，请及时就医。")
        lines.append("以上仅为家庭安全参考，不能替代专业医疗意见。")
        ans = "\n".join(lines)
    return {"answer": ans, "graph": {"matched_nodes": sub["matched_nodes"], "facts": sub["facts"],
                                     "advice": sub["advice"], "cross_risks": sub["cross_risks"]},
            "related_items": sub["related_items"]}
