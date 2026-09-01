"""家庭化学品安全知识图谱（GraphRAG-lite）。

设计原则：不引入重型图数据库。节点/边用 Python 内置的种子图谱表达
（领域知识稳定、规模小），再与家庭档案动态合并：

    节点类型  ingredient(成分) / symptom(症状) / scene(场景) / population(人群)
    边类型    mix_danger(A×B→危险) / irritant(成分→症状) / found_in(成分→场景)
              / risk_to(危害→人群) / category_of(品类→成分)

三个查询入口（对应路演"多维解读"叙事）：
    symptom     "我皮肤发红"       → 哪些成分/家中物品可能相关
    scene       "厨房有什么危险"   → 场景内典型风险 + 家中该场景物品
    population  "家有宝宝"         → 该人群需重点防范的危害 + 家中相关物品
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field


@dataclass
class KGNode:
    id: str
    type: str                      # ingredient / symptom / scene / population
    name: str
    aliases: list[str] = field(default_factory=list)


# ---------------- 种子图谱（可随数据积累持续扩充） ----------------

NODES: list[KGNode] = [
    # 成分
    KGNode("ing.hypochlorite", "ingredient", "含氯漂白成分（次氯酸钠）", ["84", "消毒液", "漂白水", "漂白剂", "次氯酸", "clorox", "bleach"]),
    KGNode("ing.acid", "ingredient", "酸性清洁成分（盐酸/磷酸）", ["洁厕", "除垢", "马桶清洁", "盐酸", "除锈"]),
    KGNode("ing.lye", "ingredient", "强碱疏通成分（氢氧化钠）", ["管道疏通", "疏通剂", "火碱", "烧碱", "苛性钠"]),
    KGNode("ing.ammonia", "ingredient", "氨水（玻璃/亮洁清洁剂）", ["氨", "玻璃水", "glass cleaner"]),
    KGNode("in.ingperoxide", "ingredient", "过氧化氢（双氧水）", ["双氧水", "过氧化氢", "氧净"]),
    KGNode("ing.alcohol", "ingredient", "醇类（乙醇/异丙醇）", ["酒精", "乙醇", "异丙醇", "消毒喷雾"]),
    KGNode("ing.pyrethroid", "ingredient", "拟除虫菊酯（杀虫剂）", ["杀虫剂", "蚊香", "杀蟑", "灭蚁", "radar", "雷达"]),
    KGNode("ing.naphthalene", "ingredient", "萘/对二氯苯（防蛀防霉）", ["樟脑丸", "卫生球", "防蛀", "防霉片", "moths"]),
    KGNode("ing.desinfectant", "ingredient", "酚类/季铵盐消毒剂", ["滴露", "dettol", "来苏水", "苯扎氯铵", "对氯间二甲苯酚"]),

    # 症状
    KGNode("sym.skin_red", "symptom", "皮肤发红 / 刺痛 / 皮疹", ["皮肤", "发红", "皮疹", "痒", "刺痛", "脱皮"]),
    KGNode("sym.eye", "symptom", "眼睛刺痛 / 流泪 / 发红", ["眼睛", "眼", "流泪", "刺眼", "视力模糊"]),
    KGNode("sym.cough", "symptom", "咳嗽 / 呼吸困难 / 胸闷", ["咳嗽", "呼吸", "气短", "胸闷", "哮喘", "嗓子"]),
    KGNode("sym.dizzy", "symptom", "头晕 / 恶心 / 头痛", ["头晕", "恶心", "头痛", "呕吐", "乏力"]),

    # 场景
    KGNode("sc.kitchen", "scene", "厨房", ["厨房", "灶台", "油烟机", "洗碗", "kitchen"]),
    KGNode("sc.bathroom", "scene", "卫生间", ["卫生间", "浴室", "马桶", "淋浴", "bathroom"]),
    KGNode("sc.balcony", "scene", "阳台 / 储物间", ["阳台", "储物", "杂物间", "balcony"]),
    KGNode("sc.living", "scene", "客厅 / 卧室", ["客厅", "卧室", "衣柜", "living", "bedroom"]),

    # 人群
    KGNode("pop.baby", "population", "婴幼儿", ["宝宝", "婴儿", "幼儿", "小孩", "儿童", "baby", "child", "kid"]),
    KGNode("pop.elderly", "population", "老人", ["老人", "长辈", "爷爷", "奶奶", "elderly"]),
    KGNode("pop.pregnant", "population", "孕妇", ["孕妇", "怀孕", "pregnant"]),
    KGNode("pop.pet", "population", "宠物", ["猫", "狗", "宠物", "pet", "cat", "dog"]),
    KGNode("pop.asthma", "population", "呼吸道敏感 / 哮喘人群", ["哮喘", "过敏", "鼻炎", "敏感", "asthma"]),
]

# 边：(src, rel, dst, note)
EDGES: list[tuple[str, str, str, str]] = [
    # 禁忌混用（高危交叉）
    ("ing.hypochlorite", "mix_danger", "ing.acid", "产生氯气——即使少量也会强烈刺激呼吸道，通风并立即离开"),
    ("ing.hypochlorite", "mix_danger", "ing.ammonia", "产生氯胺气体——刺激眼睛与肺部，严重时呼吸困难"),
    ("ing.hypochlorite", "mix_danger", "ing.alcohol", "可能生成有害氯化物——切勿同用或混存"),
    ("ing.hypochlorite", "mix_danger", "in.ingperoxide", "剧烈氧化反应——放热、产气，可能喷溅"),
    ("in.ingperoxide", "mix_danger", "ing.acid", "生成腐蚀性过氧乙酸——刺激皮肤与呼吸道"),
    ("ing.lye", "mix_danger", "ing.acid", "强酸强碱中和会剧烈放热溅射——两者务必分开放置"),
    # 成分 → 症状
    ("ing.hypochlorite", "irritant", "sym.cough", ""),
    ("ing.hypochlorite", "irritant", "sym.skin_red", ""),
    ("ing.hypochlorite", "irritant", "sym.eye", ""),
    ("ing.acid", "irritant", "sym.cough", ""),
    ("ing.acid", "irritant", "sym.eye", ""),
    ("ing.acid", "irritant", "sym.skin_red", ""),
    ("ing.lye", "irritant", "sym.skin_red", "强碱灼伤初期往往不痛，更容易被忽视"),
    ("ing.lye", "irritant", "sym.eye", ""),
    ("ing.ammonia", "irritant", "sym.eye", ""),
    ("ing.ammonia", "irritant", "sym.cough", ""),
    ("ing.pyrethroid", "irritant", "sym.dizzy", ""),
    ("ing.pyrethroid", "irritant", "sym.skin_red", ""),
    ("ing.naphthalene", "irritant", "sym.dizzy", ""),
    ("ing.desinfectant", "irritant", "sym.skin_red", ""),
    ("in.ingperoxide", "irritant", "sym.skin_red", ""),
    # 成分 → 场景
    ("ing.hypochlorite", "found_in", "sc.bathroom", ""),
    ("ing.hypochlorite", "found_in", "sc.kitchen", ""),
    ("ing.acid", "found_in", "sc.bathroom", ""),
    ("ing.lye", "found_in", "sc.bathroom", ""),
    ("ing.ammonia", "found_in", "sc.kitchen", ""),
    ("in.ingperoxide", "found_in", "sc.bathroom", ""),
    ("ing.pyrethroid", "found_in", "sc.kitchen", ""),
    ("ing.pyrethroid", "found_in", "sc.balcony", ""),
    ("ing.naphthalene", "found_in", "sc.living", ""),
    ("ing.naphthalene", "found_in", "sc.balcony", ""),
    ("ing.alcohol", "found_in", "sc.living", ""),
    ("ing.desinfectant", "found_in", "sc.bathroom", ""),
    # 危害 → 高危人群
    ("ing.pyrethroid", "risk_to", "pop.baby", "婴幼儿体重小、代谢弱，接触杀虫剂风险成倍放大"),
    ("ing.pyrethroid", "risk_to", "pop.pet", "猫对菊酯极其敏感，蚊香/喷雾可致中毒"),
    ("ing.naphthalene", "risk_to", "pop.baby", "萘丸误当零食误食案例高发；婴幼儿衣物建议改用雪松/密封收纳"),
    ("ing.naphthalene", "risk_to", "pop.pregnant", "孕期避免长期接触萘蒸气"),
    ("ing.lye", "risk_to", "pop.baby", "疏通剂外观似饮料，是儿童误食的高发品类——上锁存放"),
    ("ing.acid", "risk_to", "pop.baby", "同上，酸性洁厕剂务必放在孩子够不到的地方"),
    ("ing.alcohol", "risk_to", "pop.baby", "酒精喷雾易燃且可误饮——远离儿童与明火"),
    ("ing.hypochlorite", "risk_to", "pop.asthma", "含氯挥发物可诱发哮喘发作，使用时开窗+离场"),
    ("ing.ammonia", "risk_to", "pop.asthma", ""),
    ("ing.desinfectant", "risk_to", "pop.asthma", ""),
    ("in.ingperoxide", "risk_to", "pop.elderly", "氧化剂对老年皮肤刺激更强，注意稀释浓度"),
]

_BY_ID = {n.id: n for n in NODES}


def _match_nodes(text: str) -> list[KGNode]:
    """按名称与别名做关键词匹配（大小写不敏感）。"""
    t = text.lower()
    out = []
    for n in NODES:
        keys = [n.name] + n.aliases
        for k in keys:
            if k.lower() in t:
                out.append(n)
                break
    return out


def matched_ingredients(item: dict) -> list[KGNode]:
    """识别结果对上的成分节点；空列表表示这瓶对不上图谱。"""
    return [n for n in _match_nodes(_item_text(item)) if n.type == "ingredient"]


def _item_text(item: dict) -> str:
    a = item.get("analysis") or {}
    p = a.get("product") or {}
    parts = [str(p.get("name") or ""), str(p.get("brand") or ""), str(p.get("category") or "") or ""]
    parts += [i.get("name", "") for i in a.get("ingredients") or []]
    return " ".join(parts).lower()


def _items_matching(items: list[dict], nodes: list[KGNode]) -> list[dict]:
    """找出分析文本命中任一节点的家庭物品。"""
    hits = []
    for it in items:
        text = _item_text(it)
        matched = [n.name for n in nodes if any(k.lower() in text for k in ([n.name] + n.aliases))]
        if matched:
            d = dict(it)
            d["matched_kg"] = matched[:4]
            hits.append(d)
    return hits


def query(mode: str, q: str, items: list[dict]) -> dict:
    """结构化查询：mode ∈ symptom|scene|population|auto。返回子图事实 + 家中相关物品 + 建议。"""
    mode = mode if mode in {"symptom", "scene", "population"} else "auto"
    seeds = [n for n in _match_nodes(q) if n.type == mode] or _match_nodes(q)

    related: set[str] = set()
    facts: list[str] = []
    advice: list[str] = []

    for n in seeds:
        related.add(n.id)
        for s, rel, d, note in EDGES:
            if s == n.id or d == n.id:
                other = d if s == n.id else s
                related.add(other)
                onode = _BY_ID[other]
                if rel == "mix_danger":
                    a, b = (_BY_ID[s].name, _BY_ID[d].name)
                    pair_note = f"「{a}」×「{b}」：{note}"
                    if pair_note not in facts:
                        facts.append(pair_note)
                        advice.append(f"⚠ 混用警示：{pair_note}——分开存放，绝不混用")
                elif rel == "irritant":
                    if s == n.id:
                        line = f"{n.name} 可能关联「{onode.name}」"
                    else:
                        line = f"「{onode.name}」可能引起或加重 {n.name}"
                    if note:
                        line += f"（{note}）"
                    if line not in facts:
                        facts.append(line)
                elif rel == "found_in" and d == n.id:
                    line = f"「{onode.name}」常见于{n.name}"
                    if line not in facts:
                        facts.append(line)
                elif rel == "risk_to":
                    if s == n.id:
                        line = f"「{n.name}」对{_BY_ID[d].name}尤其需要防范"
                    else:
                        line = f"对{n.name}需重点防范：「{_BY_ID[s].name}」"
                    if note:
                        line += f"——{note}"
                    if line not in facts:
                        facts.append(line)
                        advice.append(f"👶 {line}")

    # 家中物品匹配：种子节点 + 一跳邻居
    pool = [_BY_ID[i] for i in related if i in _BY_ID]
    hit_items = _items_matching(items, pool)

    # 物品两两交叉混用检查（基于成分节点）
    cross_pairs: list[dict] = []
    item_nodes: dict[int, list[KGNode]] = {}
    for it in items:
        ns = _match_nodes(_item_text(it))
        ing = [n for n in ns if n.type == "ingredient"]
        if ing:
            item_nodes[it["id"]] = ing
    for (ia, ib) in itertools.combinations(list(item_nodes.keys()), 2):
        for na, nb in itertools.product(item_nodes[ia], item_nodes[ib]):
            for s, rel, d, note in EDGES:
                if rel != "mix_danger":
                    continue
                if {s, d} == {na.id, nb.id}:
                    cross_pairs.append({
                        "a": f"#{ia} {next(x['observed_name'] or '' for x in items if x['id'] == ia)}",
                        "b": f"#{ib} {next(x['observed_name'] or '' for x in items if x['id'] == ib)}",
                        "reason": f"{_BY_ID[s].name} × {_BY_ID[d].name}：{note}",
                        "severity": "critical",
                    })
    # 同一物品自身含两种禁忌成分也提示
    for iid, ing in item_nodes.items():
        for s, rel, d, note in EDGES:
            if rel != "mix_danger":
                continue
            names = {n.id: n.name for n in ing}
            if s in names and d in names:
                cross_pairs.append({
                    "a": f"#{iid} {next((x['observed_name'] or '') for x in items if x['id'] == iid)}",
                    "b": "（同一瓶内成分组合）",
                    "reason": f"{names[s]} × {names[d]}：{note}",
                    "severity": "high",
                })

    # 去重
    seen = set()
    uniq_pairs = []
    for p in cross_pairs:
        key = (p["a"], p["reason"])
        if key not in seen:
            seen.add(key)
            uniq_pairs.append(p)

    return {
        "mode": mode,
        "query": q,
        "matched_nodes": [{"id": n.id, "type": n.type, "name": n.name} for n in seeds],
        "facts": facts,
        "advice": advice,
        "cross_risks": uniq_pairs,
        "related_items": [
            {"id": it["id"], "name": it.get("observed_name") or "", "matched": it.get("matched_kg", []),
             "risk_level": (it.get("analysis") or {}).get("risk_level", "unknown")}
            for it in hit_items
        ],
    }
