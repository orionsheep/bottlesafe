"""提示性多维评分：由规则引擎结果纯确定性派生（无 LLM、无第三方依赖）。

铁律对齐 rule_engine：
- dimension_scores 只是「提示性评分」，帮助用户快速浏览，**不是安全判定**；
  真正的安全结论仍以 rule_engine.evaluate 的 risk_level/findings 为准。
- 未知一律 unknown 的精神不破：没有任何证据的维度落在中性分 BASE（约 50），
  表示「信息不足、无法评估」，而不是「安全」。
- 全部分数 = 基线分 + 按证据加减，clamp 到 [5, 98]；
  每条加减都能在下方注释追溯到具体证据（成分标签 / hazard / 文本线索）。
"""

from __future__ import annotations

from .rule_engine import _hazard_tags, _load, _text_of  # 复用同一套标签/文本提取，保证口径一致

BASE = 50        # 中性偏 unknown：无证据维度的落点（见模块 docstring）
CLAMP_LO = 5     # 不落到 0/100：永远留「不确定」的余地，呼应 unknown 铁律
CLAMP_HI = 98

_SEV_RANK = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

# 重点成分警示文案（label id → {tag, text}）。
# 大白话风格（对齐「成分说清楚」）；ingredients.json 若以后补 note 字段则优先用 note。
# fragrance/preservative 暂未进 ingredients.json，先备着，加入后即自动生效。
_WARNING_TEXT: dict[str, dict[str, str]] = {
    "hypochlorite": {
        "tag": "强氧化性",
        "text": "强碱性强氧化剂，可腐蚀皮肤黏膜和眼睛，溅到皮肤或眼睛需立即大量清水冲洗；绝不能与洁厕灵等酸性清洁剂混用，会产生有毒氯气。",
    },
    "acid": {
        "tag": "强酸性",
        "text": "强酸成分，直接接触会灼伤皮肤和眼睛，使用时戴手套并保持通风；切勿与 84 等含氯消毒剂混用，会释放氯气。",
    },
    "lye": {
        "tag": "强碱性",
        "text": "氢氧化钠腐蚀性极强，沾到皮肤会造成化学灼伤，溶解时剧烈放热；务必戴手套操作，远离儿童，误服非常危险。",
    },
    "ammonia": {
        "tag": "刺激性气体",
        "text": "氨水挥发出的气体强烈刺激眼睛和呼吸道，使用时开窗通风；不能与含氯漂白剂混用，会生成有毒氯胺。",
    },
    "peroxide": {
        "tag": "氧化性",
        "text": "过氧化氢有氧化漂白作用，浓度较高时会刺激皮肤和眼睛；避光保存，不要与强酸或还原性物质混放。",
    },
    "pyrethroid": {
        "tag": "神经毒性",
        "text": "拟除虫菊酯对人和宠物（尤其是猫）有神经毒性，喷洒后人和宠物先离开房间，充分通风后再进入；对鱼类和水生生物高毒，勿倒入下水道。",
    },
    "phenol": {
        "tag": "酚类毒性",
        "text": "酚类消毒剂对皮肤有刺激性，对猫有特异性高毒；家有猫咪建议选择其他消毒方式，使用时避免接触皮肤。",
    },
    "alcohol": {
        "tag": "易燃",
        "text": "醇类易挥发、易燃，使用时远离明火和高温表面；大量吸入蒸气会刺激呼吸道，密闭空间使用注意通风。",
    },
    "fragrance": {
        "tag": "致敏原",
        "text": "香精/香料是常见接触性致敏原，皮肤敏感或有湿疹的人群使用后若发红发痒应停用；婴幼儿用品建议选无香型。",
    },
    "preservative": {
        "tag": "致敏原",
        "text": "MIT/CMIT、尼泊金酯类防腐剂是常见致敏原，敏感肌人群留意皮肤反应；甲醛释放体类防腐剂长期接触有健康争议。",
    },
}

# 各维度证据 → 加减分规则，全部确定性、可溯源。polarity=risk 分越高越危险，safe 分越高越好。
# 刺激性成分标签：这些成分本身就是常见皮肤/黏膜刺激源（证据：ingredients.json 命中）
_IRRITANT_LABELS = {"hypochlorite", "acid", "lye", "ammonia", "phenol", "peroxide"}
# 腐蚀性成分标签（证据：ingredients.json 命中）
_CORROSIVE_LABELS = {"hypochlorite", "acid", "lye"}
# 挥发性刺激气体来源，影响呼吸（证据：ingredients.json 命中）
_VOLATILE_LABELS = {"hypochlorite", "ammonia"}
# 环境不友好成分：含氯 / 酚类 / 菊酯类对水体与水生生物毒性大（证据：ingredients.json 命中）
_ENV_BAD_LABELS = {"hypochlorite", "phenol", "pyrethroid"}
# 高残留 / 长期健康争议成分（证据：ingredients.json 命中）
_LONGTERM_BAD_LABELS = {"phenol", "pyrethroid"}


def _clamp(x: float) -> int:
    """限制在 [5, 98]：不给出满分或零分，永远为「未知」留余地。"""
    return max(CLAMP_LO, min(CLAMP_HI, round(x)))


def _dim(key: str, label: str, score: int, polarity: str) -> dict:
    return {"key": key, "label": label, "score": score, "polarity": polarity}


def _dimension_scores(analysis: dict, labels: set[str], hazards: set[str], text: str) -> list[dict]:
    # ---- 刺激风险（risk）----
    # 基线 50；模型识别出「刺激」类 hazard +20（证据：hazards[].type）；
    # 每命中一个刺激性成分标签 +10（证据：ingredients.json 命中），封顶 +30。
    irritation = BASE
    if "irritant" in hazards:
        irritation += 20
    irritation += min(30, 10 * len(labels & _IRRITANT_LABELS))

    # ---- 腐蚀风险（risk）----
    # 「腐蚀」类 hazard +25（证据：hazards[].type）；强酸/强碱/含氯成分每个 +15（证据：成分标签）。
    corrosion = BASE
    if "corrosive" in hazards:
        corrosion += 25
    corrosion += 15 * len(labels & _CORROSIVE_LABELS)

    # ---- 呼吸安全性（safe，扣分制）----
    # 「吸入」类 hazard -15（证据：hazards[].type 含 吸入/inhalation）；
    # 气雾/喷雾形态 -10（证据：品名/类别/summary 含 气雾/喷雾/aerosol）；
    # 挥发性刺激气体成分每个 -10（证据：成分标签，含氯/氨会挥发刺激呼吸道）。
    respiratory = BASE
    if any(k in t for h in (analysis.get("hazards") or []) for t in [str(h.get("type") or "").lower()] for k in ("吸入", "inhalation")):
        respiratory -= 15
    if any(k in text for k in ("气雾", "喷雾", "aerosol")):
        respiratory -= 10
    respiratory -= 10 * len(labels & _VOLATILE_LABELS)

    # ---- 环境友好度（safe）----
    # 含氯/酚类/菊酯类成分每个 -10（证据：成分标签，对水体与水生生物毒性大）；
    # 「磷」「有害垃圾」「危废」线索 -10（证据：标签/summary 文本）；
    # 「植物基」「可降解」「生物降解」线索 +10（证据：标签/summary 文本）。
    environment = BASE
    environment -= 10 * len(labels & _ENV_BAD_LABELS)
    if any(k in text for k in ("含磷", "磷酸盐", "有害垃圾", "危废")):
        environment -= 10
    if any(k in text for k in ("植物基", "可降解", "生物降解")):
        environment += 10

    # ---- 长期安全性（safe）----
    # 高残留/长期争议成分每个 -10（证据：成分标签）；
    # 防腐剂 / 甲醛释放体 / 香精线索 -10（证据：成分名或标签文本），
    # 这些是长期低剂量接触的主要争议来源。
    longterm = BASE
    longterm -= 10 * len(labels & _LONGTERM_BAD_LABELS)
    if any(k in text for k in ("防腐剂", "甲醛", "mit", "cmit", "尼泊金", "异噻唑啉酮")):
        longterm -= 10

    # ---- 致敏风险（risk）----
    # 香精/香料线索 +15、防腐剂线索 +10（证据：成分名或标签文本，二者是接触性致敏首因）；
    # 酚类消毒剂 +5（证据：成分标签，对皮肤黏膜有刺激性致敏报道）。
    allergen = BASE
    if any(k in text for k in ("香精", "香料", "fragrance", "parfum")):
        allergen += 15
    if any(k in text for k in ("防腐剂", "mit", "cmit", "尼泊金", "异噻唑啉酮", "paraben")):
        allergen += 10
    if "phenol" in labels:
        allergen += 5

    return [
        _dim("irritation", "刺激风险", _clamp(irritation), "risk"),
        _dim("corrosion", "腐蚀风险", _clamp(corrosion), "risk"),
        _dim("respiratory", "呼吸安全性", _clamp(respiratory), "safe"),
        _dim("environment", "环境友好度", _clamp(environment), "safe"),
        _dim("longterm", "长期安全性", _clamp(longterm), "safe"),
        _dim("allergen", "致敏风险", _clamp(allergen), "risk"),
    ]


def _coverage(analysis: dict, rules: dict) -> dict:
    matched = len(rules.get("ingredient_labels") or [])
    total = len((analysis or {}).get("ingredients") or [])
    if total == 0:
        note = "未识别到成分列表，无法评估覆盖度，建议补拍成分表。"
    elif matched < total:
        note = (f"本次仅 {matched}/{total} 条成分匹配到知识库，评分基于这部分成分得出，"
                "覆盖有限，建议结合成分列表一起看。")
    else:
        note = f"全部 {total} 条成分均匹配到知识库。"
    return {"matched": matched, "total": total, "note": note}


def _display_name(entry: dict) -> str:
    """从 ingredients.json 的 label 取显示名：有括号取括号内（如「含氯漂白成分（次氯酸钠）」→ 次氯酸钠）。"""
    label = str(entry.get("label") or entry.get("id") or "")
    if "（" in label and "）" in label:
        return label.split("（", 1)[1].split("）", 1)[0]
    return label


def _ingredient_warnings(rules: dict) -> list[dict]:
    """对每个命中的成分标签生成一条大白话警示，最多 5 条，按 severity 从高到低。"""
    safety_rules, ingredients = _load()
    entries = {ing["id"]: ing for ing in ingredients}
    # 规则 id → 该规则依赖的成分标签，用于把 finding 的 severity 归到具体成分上
    rule_ings = {r.get("id"): set((r.get("when") or {}).get("has_ingredients") or []) for r in safety_rules}

    warnings: list[dict] = []
    for label_id in rules.get("ingredient_labels") or []:
        entry = entries.get(label_id)
        if entry is None:
            continue
        static = _WARNING_TEXT.get(label_id)
        # 文案优先级：ingredients.json 自带的 note 字段 > scoring 内置静态映射；两者都没有则跳过
        text = entry.get("note") or (static or {}).get("text")
        if not text:
            continue
        tag = (static or {}).get("tag", "")
        # severity 取该成分相关 rule finding 的最高值，没有相关 finding 则 "medium"
        best = "medium"
        for f in rules.get("findings") or []:
            if label_id in rule_ings.get(f.get("rule_id"), set()):
                if _SEV_RANK.get(f.get("severity"), 0) > _SEV_RANK.get(best, 0):
                    best = f["severity"]
        warnings.append({"name": _display_name(entry), "tag": tag, "text": text, "severity": best})

    warnings.sort(key=lambda w: _SEV_RANK.get(w["severity"], 0), reverse=True)
    return warnings[:5]


def enrich(analysis: dict, rules: dict) -> dict:
    """由 analysis（ChemicalAnalysis.model_dump()）+ rule_engine.evaluate 结果派生三个提示性字段。

    纯确定性：相同输入必得相同输出，无 LLM 调用、无第三方依赖。
    返回 {"dimension_scores": [...], "coverage": {...}, "ingredient_warnings": [...]}。
    """
    analysis = analysis or {}
    labels = set(rules.get("ingredient_labels") or [])
    return {
        "dimension_scores": _dimension_scores(analysis, labels, _hazard_tags(analysis), _text_of(analysis)),
        "coverage": _coverage(analysis, rules),
        "ingredient_warnings": _ingredient_warnings(rules),
    }
