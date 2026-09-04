"""家庭高频关注项聚合 + 优化建议行动清单（对齐「成分说清楚」）。

在确定性分析基础上：
1. 成分维度跨产品聚合（香精 X 件 / 含氯 X 件…），带涉及产品与个性化判断钩子；
2. 优化建议：冗余 / 缺口 / 替换 / 减量，每条带可勾选采纳的 action。
纯标准库，规则库驱动，不依赖 LLM。
"""

from __future__ import annotations

from . import kg

# 成分维度分组（与 kg 成分节点对齐，覆盖常见家庭化学品）
_ING_GROUPS: list[dict] = [
    {"key": "fragrance", "label": "香精 / 香料", "match": ["香精", "香料", "芳樟醇", "柠檬烯", "limonene", "linalool", "parfum", "fragrance"],
     "hook": "是否需要回避取决于个人是否对香料成分敏感；家有过敏体质/婴幼儿建议优先选无香型。"},
    {"key": "chlorine", "label": "含氯消毒成分", "match": ["次氯酸", "84", "漂白", "含氯", "bleach", "clorox"],
     "hook": "含氯成分与酸性产品混用会产生氯气；家有哮喘/婴幼儿注意通风与隔离。"},
    {"key": "preservative", "label": "防腐体系", "match": ["异噻唑啉", "MIT", "CMIT", "苯扎", "DMDM", "防腐"],
     "hook": "防腐剂长期接触需关注；MIT 类 2028-01-01 起限值收紧。"},
    {"key": "surfactant", "label": "表面活性剂", "match": ["表面活性", "月桂醇", "SLES", "SLS", "AES"],
     "hook": "常见清洁成分；皮肤敏感者接触后建议冲洗。"},
    {"key": "lye_acid", "label": "强酸 / 强碱", "match": ["盐酸", "磷酸", "氢氧化钠", "火碱", "烧碱", "强酸", "强碱"],
     "hook": "强酸强碱中和剧烈放热；务必分开存放，远离儿童。"},
    {"key": "pyrethroid", "label": "拟除虫菊酯", "match": ["菊酯", "氯菊酯", "pyrethroid", "permethrin"],
     "hook": "对猫特异性高毒；家有猫优先选宠物专用配方。"},
    {"key": "phenol", "label": "酚类消毒剂", "match": ["酚", "来苏", "滴露", "对氯间二甲苯酚"],
     "hook": "酚类对猫高毒；中国标签不强制标注猫警示。"},
    {"key": "alcohol", "label": "醇类（酒精）", "match": ["酒精", "乙醇", "异丙醇"],
     "hook": "易燃且可误饮；远离儿童与明火。"},
]


def _item_text(item: dict) -> str:
    a = item.get("analysis") or {}
    p = a.get("product") or {}
    parts = [str(p.get("name") or ""), str(p.get("brand") or ""), str(p.get("category") or "")]
    parts += [str(i.get("name") or "") for i in (a.get("ingredients") or [])]
    parts += [str(h.get("type") or "") for h in (a.get("hazards") or [])]
    return " ".join(parts).lower()


def aggregate_ingredients(items: list[dict]) -> list[dict]:
    """成分维度跨产品聚合：每个成分组命中几件 + 涉及产品 + 个性化钩子。"""
    out = []
    for g in _ING_GROUPS:
        hits = []
        for it in items:
            text = _item_text(it)
            if any(m.lower() in text for m in g["match"]):
                hits.append({"id": it.get("id"), "name": it.get("observed_name") or "未命名"})
        if hits:
            out.append({
                "key": g["key"],
                "label": g["label"],
                "count": len(hits),
                "items": hits,
                "hook": g["hook"],
            })
    out.sort(key=lambda x: -x["count"])
    return out


def build_suggestions(items: list[dict], cross_risks: list[dict]) -> list[dict]:
    """优化建议行动清单：冗余/缺口/替换/减量，每条可勾选采纳。"""
    suggestions: list[dict] = []

    # 1. 混用禁忌 → 立即行动（最高优先）
    for c in cross_risks[:3]:
        suggestions.append({
            "kind": "critical",
            "title": f"立即分开存放：{c.get('a')} 与 {c.get('b')}",
            "detail": c.get("reason", ""),
            "action": "分柜存放、绝不同时或先后紧邻使用；使用后开窗通风 20 分钟以上。",
        })

    # 2. 品类冗余：同一场景多件同类清洁剂
    scene_count: dict[str, list[str]] = {}
    for it in items:
        a = it.get("analysis") or {}
        cat = str((a.get("product") or {}).get("category") or "")
        name = it.get("observed_name") or "未命名"
        text = _item_text(it)
        for scene_node in [n for n in kg.NODES if n.type == "scene"]:
            if any(k.lower() in text for k in [scene_node.name] + scene_node.aliases):
                scene_count.setdefault(scene_node.name, []).append(name)
    for scene, names in scene_count.items():
        if len(names) >= 3:
            suggestions.append({
                "kind": "reduce",
                "title": f"{scene}有 {len(names)} 件清洁/护理产品，存在冗余",
                "detail": "、".join(names[:5]),
                "action": "盘点功能重叠项，保留 1-2 件主力；其余用完不再补货（见素抱朴：少买一瓶比换一瓶更接近与自然共生）。",
            })

    # 3. 高危品 → 替换/上锁
    for it in items:
        a = it.get("analysis") or {}
        if (a.get("risk_level") or "").lower() in ("high", "critical"):
            name = it.get("observed_name") or "未命名"
            suggestions.append({
                "kind": "replace",
                "title": f"考虑替换：{name}",
                "detail": f"当前判定为 {a.get('risk_level')} 风险",
                "action": "寻找更低风险的替代品（如无氯消毒、中性配方）；过渡期务必上锁、原包装存放。",
            })

    # 4. 高危品未填存放位置 → 补充位置（位置驱动同位置混用预警）
    for it in items:
        a = it.get("analysis") or {}
        rl = (a.get("risk_level") or "").lower()
        if rl in ("high", "critical") and not (it.get("location") or "").strip():
            name = it.get("observed_name") or "未命名"
            suggestions.append({
                "kind": "locate",
                "title": f"补充存放位置：{name}",
                "detail": f"这件 {rl} 风险物品还没记录放在家里哪里。",
                "action": "在档案卡片里标记存放位置；同一位置的混用禁忌组合会被优先预警。",
            })

    # 5. 减量（通用）
    if len(items) >= 8:
        suggestions.append({
            "kind": "reduce",
            "title": f"家庭在册化学品已有 {len(items)} 件",
            "detail": "数量越多，混用与误食风险面越大。",
            "action": "下次购物前先查档案，避免重复购买同类；优先用完现有再补。",
        })

    # 去重（按 title）
    seen = set()
    uniq = []
    for s in suggestions:
        if s["title"] not in seen:
            seen.add(s["title"])
            uniq.append(s)
    return uniq
