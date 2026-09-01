"""绿色安全处置指引（方向：绿色发展赛道价值落地）。

设计原则与 kg.py 一致：不引入外部依赖，用稳定的领域种子知识表达。
把家用化学品的「废弃处置」从纯叙事变成可查询的确定性功能：

    - 能否倒入下水道 / 马桶（drain_safe）
    - 空容器如何处理（container）
    - 是否属于有害垃圾、投放去向（disposal_route）
    - 减量与环境提示（eco_tip）

对外主入口：
    disposal_for(analysis: dict) -> dict | None
        依据识别结果的品类/成分/名称，匹配一条处置指引。
    disposal_summary(items: list[dict]) -> dict
        对整个家庭档案做处置汇总（供全屋报告使用）。

所有结论仅为家庭级环保筛查参考，具体以当地环卫/危废回收规定为准。
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DisposalRule:
    key: str
    # 匹配关键词（成分/品类/品牌俗名），大小写不敏感、子串命中
    keywords: list[str]
    category: str            # 面向用户的品类名
    drain_safe: str          # "no" | "diluted" | "yes"
    disposal_route: str      # 面向用户的一句投放去向
    container: str           # 空容器处理
    eco_tip: str             # 环境/减量提示
    hazardous_waste: bool = False   # 是否属于有害垃圾
    aliases: list[str] = field(default_factory=list)


# 处置去向的中文短语（drain_safe 语义）
_DRAIN_TEXT = {
    "no": "❌ 不可倒入下水道/马桶",
    "diluted": "⚠ 大量清水稀释后少量排放，切勿与其他清洁剂同排",
    "yes": "✅ 可少量随水排放",
}

# ---------------- 处置种子规则（可随数据积累扩充） ----------------
RULES: list[DisposalRule] = [
    DisposalRule(
        key="hypochlorite",
        keywords=["84", "含氯", "次氯酸", "漂白", "消毒液", "clorox", "bleach"],
        category="含氯漂白/消毒剂",
        drain_safe="diluted",
        disposal_route="用完的余液大量清水稀释后单独排放；整瓶未用完按当地有害垃圾投放",
        container="彻底冲净后按可回收塑料投放；残留较多时归入有害垃圾",
        eco_tip="按需稀释使用，避免过量；绝不与洁厕剂/酸性清洁剂同时倒入下水道（会生成氯气）",
        hazardous_waste=True,
    ),
    DisposalRule(
        key="acid",
        keywords=["洁厕", "除垢", "盐酸", "除锈", "马桶清洁", "toilet"],
        category="酸性清洁剂（洁厕/除垢）",
        drain_safe="diluted",
        disposal_route="余液大量清水稀释后单独排放；量大或整瓶按有害垃圾投放",
        container="冲净后可回收；勿与含氯瓶混投",
        eco_tip="与含氯/漂白类分开使用与丢弃，两者相遇产生有毒气体",
        hazardous_waste=True,
    ),
    DisposalRule(
        key="lye",
        keywords=["管道疏通", "疏通剂", "火碱", "烧碱", "氢氧化钠", "苛性钠", "drain opener"],
        category="强碱管道疏通剂",
        drain_safe="no",
        disposal_route="属有害垃圾，连容器交社区有害垃圾回收点，切勿随意倾倒",
        container="不要清洗残留后随意丢；连瓶投放有害垃圾",
        eco_tip="强碱腐蚀性强、伤土壤与管网；优先用物理疏通替代，减少使用",
        hazardous_waste=True,
    ),
    DisposalRule(
        key="pyrethroid",
        keywords=["杀虫", "蚊香", "杀蟑", "灭蚁", "菊酯", "radar", "雷达", "insecticide"],
        category="杀虫剂 / 气雾剂",
        drain_safe="no",
        disposal_route="属有害垃圾；气雾罐勿挤压勿刺穿，连罐投放有害垃圾回收点",
        container="残留药剂勿冲入下水道；空罐排空压力后按有害垃圾投放",
        eco_tip="对水生生物与传粉昆虫毒性高，避免户外随意喷洒与倾倒",
        hazardous_waste=True,
    ),
    DisposalRule(
        key="naphthalene",
        keywords=["樟脑丸", "卫生球", "防蛀", "防霉片", "萘", "对二氯苯", "moth"],
        category="防蛀/防霉制剂（樟脑丸等）",
        drain_safe="no",
        disposal_route="固体制剂按有害垃圾投放，勿随生活垃圾长期堆放于居室",
        container="外包装冲净后可回收",
        eco_tip="可用雪松块、密封收纳等物理防蛀替代，减少挥发性有害物",
        hazardous_waste=True,
    ),
    DisposalRule(
        key="alcohol",
        keywords=["酒精", "乙醇", "异丙醇", "消毒喷雾", "alcohol"],
        category="醇类消毒剂",
        drain_safe="diluted",
        disposal_route="少量余液可稀释排放；远离火源，勿整瓶倾倒",
        container="挥发干净后可回收",
        eco_tip="易燃，勿近明火存放与丢弃；按需取用避免浪费",
        hazardous_waste=False,
    ),
    DisposalRule(
        key="peroxide",
        keywords=["双氧水", "过氧化氢", "氧净", "peroxide"],
        category="过氧化物类",
        drain_safe="diluted",
        disposal_route="低浓度余液大量清水稀释后排放；避光存放，勿与酸/含氯同排",
        container="冲净后可回收",
        eco_tip="强氧化性，勿与其他清洁剂混合丢弃",
        hazardous_waste=False,
    ),
    DisposalRule(
        key="disinfectant",
        keywords=["滴露", "dettol", "来苏", "苯扎氯铵", "对氯间二甲苯酚", "酚类", "季铵"],
        category="酚类/季铵盐消毒剂",
        drain_safe="diluted",
        disposal_route="按稀释后少量排放；整瓶未用完按有害垃圾投放",
        container="冲净后可回收",
        eco_tip="对水体微生物有影响，按推荐浓度使用，勿超量",
        hazardous_waste=True,
    ),
    DisposalRule(
        key="ammonia",
        keywords=["氨", "玻璃水", "glass cleaner"],
        category="含氨清洁剂",
        drain_safe="diluted",
        disposal_route="稀释后少量排放；勿与含氯漂白类同排",
        container="冲净后可回收",
        eco_tip="与含氯制剂相遇生成氯胺气体，分开使用与丢弃",
        hazardous_waste=False,
    ),
    DisposalRule(
        key="detergent",
        keywords=["洗洁精", "洗衣液", "洗衣粉", "肥皂", "洗手液", "沐浴", "detergent", "soap"],
        category="日用洗涤剂",
        drain_safe="yes",
        disposal_route="常规使用后可随生活污水排放",
        container="冲净后按可回收投放",
        eco_tip="优先选择浓缩/可降解配方，按需取用减少排放",
        hazardous_waste=False,
    ),
]

# 兜底：无法归类时的保守指引
_FALLBACK = {
    "category": "未明确品类",
    "drain_safe": "no",
    "drain_safe_text": _DRAIN_TEXT["no"],
    "disposal_route": "无法确认成分前，按保守原则不倒入下水道；保留原包装原标签，需要时咨询当地环卫/有害垃圾回收点",
    "container": "保持原包装，勿分装到饮料瓶",
    "eco_tip": "先拍清标签识别成分，再决定处置方式，避免误弃污染环境",
    "hazardous_waste": False,
    "matched": False,
}


def _text_of(analysis: dict) -> str:
    p = analysis.get("product") or {}
    parts = [str(p.get("name") or ""), str(p.get("brand") or ""), str(p.get("category") or "")]
    parts += [str(i.get("name", "")) for i in analysis.get("ingredients") or []]
    parts += [str(h.get("type", "")) for h in analysis.get("hazards") or []]
    return " ".join(parts).lower()


def _match_rule(analysis: dict) -> DisposalRule | None:
    text = _text_of(analysis)
    for rule in RULES:
        if any(k.lower() in text for k in rule.keywords + rule.aliases):
            return rule
    return None


def disposal_for(analysis: dict) -> dict:
    """依据识别结果返回一条绿色处置指引；无法匹配时返回保守兜底（matched=False）。"""
    rule = _match_rule(analysis or {})
    if not rule:
        return dict(_FALLBACK)
    return {
        "category": rule.category,
        "drain_safe": rule.drain_safe,
        "drain_safe_text": _DRAIN_TEXT.get(rule.drain_safe, rule.drain_safe),
        "disposal_route": rule.disposal_route,
        "container": rule.container,
        "eco_tip": rule.eco_tip,
        "hazardous_waste": rule.hazardous_waste,
        "matched": True,
    }


def disposal_summary(items: list[dict]) -> dict:
    """对家庭档案做处置汇总：有害垃圾清单、不可入下水道清单、通用环保提示。"""
    hazardous: list[dict] = []
    no_drain: list[dict] = []
    tips: list[str] = []
    seen_tip: set[str] = set()

    for it in items:
        a = it.get("analysis") or {}
        g = disposal_for(a)
        name = it.get("observed_name") or (a.get("product") or {}).get("name") or f"#{it.get('id')}"
        entry = {"id": it.get("id"), "name": name, "category": g["category"], "route": g["disposal_route"]}
        if g["hazardous_waste"]:
            hazardous.append(entry)
        if g["drain_safe"] == "no":
            no_drain.append({"id": it.get("id"), "name": name})
        if g["matched"] and g["eco_tip"] not in seen_tip:
            seen_tip.add(g["eco_tip"])
            tips.append(g["eco_tip"])

    return {
        "hazardous_count": len(hazardous),
        "hazardous_items": hazardous,
        "no_drain_items": no_drain,
        "eco_tips": tips[:5],
        "green_note": (
            f"家中约有 {len(hazardous)} 件需按有害垃圾单独投放，"
            f"{len(no_drain)} 件严禁倒入下水道。正确处置既保护家人，也减少对土壤与水体的污染。"
            if hazardous or no_drain else
            "暂未发现需特殊处置的高危废弃物；日用洗涤剂按常规排放即可。"
        ),
    }
