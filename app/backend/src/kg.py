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
    KGNode("ing.hypochlorite", "ingredient", "含氯漂白成分（次氯酸钠）", ["84", "漂白水", "漂白剂", "次氯酸", "clorox", "bleach"]),
    KGNode("ing.acid", "ingredient", "酸性清洁成分（盐酸/磷酸）", ["洁厕", "除垢", "马桶清洁", "盐酸", "除锈"]),
    KGNode("ing.lye", "ingredient", "强碱疏通成分（氢氧化钠）", ["管道疏通", "疏通剂", "火碱", "烧碱", "苛性钠"]),
    KGNode("ing.ammonia", "ingredient", "氨水（玻璃/亮洁清洁剂）", ["氨水", "玻璃水", "glass cleaner"]),
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


# ---------------- 扩充混用规则库（成分标签对 → 判定） ----------------
# 标签即 src/rules/ingredients.json 的 id，匹配复用 rule_engine 的别名归一化，
# 覆盖图谱节点之外的常见家用化学品（醋、碘伏、红药水、高锰酸钾、草酸、生石灰…）。
# pair 两端相同表示「同类两瓶（不同品牌/配方未知）混用」的保守提示。
# reason 用大白话讲机理 + 点破最容易相遇的场景；action 给可执行做法。
# 铁律：只收录有明确化学依据的组合；没收录的一律交 unknown，绝不猜安全。
MIX_RULES: list[dict] = [
    # --- 含氯体系（84/漂白水是混用事故的「万恶之源」，卫生间高发） ---
    {"id": "MIX_CHLORINE_VINEGAR", "pair": ("hypochlorite", "vinegar"), "severity": "critical",
     "reason": "含氯漂白成分 × 醋酸：酸会把次氯酸根瞬间变成氯气，和盐酸洁厕灵一样毒。很多人用白醋「天然除垢」，顺手又倒了 84，厨房水槽和马桶是最常出事的地方。",
     "action": "84 和醋（含白醋、醋精）绝不同时使用；用过一种后充分冲水通风，再考虑另一种。"},
    {"id": "MIX_CHLORINE_OXALIC", "pair": ("hypochlorite", "oxalic"), "severity": "critical",
     "reason": "含氯漂白成分 × 草酸：草酸是强有机酸，遇次氯酸钠立刻放出氯气，还伴随剧烈放热。草酸清洁剂常用来除瓷砖缝黑垢，和漂白水都在卫生间手边。",
     "action": "两者分开存放；同一区域清洁只用一种，冲净通风后再换。"},
    {"id": "MIX_CHLORINE_LAUNDRY", "pair": ("hypochlorite", "laundry"), "severity": "high",
     "reason": "含氯漂白成分 × 洗衣液/粉：洗涤剂里的氨类、表面活性剂会和氯反应生成氯胺气体，还会把两边的有效成分都「消耗掉」——衣服没洗干净，人先被呛到。",
     "action": "想漂白就用漂白程序单加漂白剂，别和洗衣液倒进同一个格子；手洗时更不要混。"},
    {"id": "MIX_CHLORINE_PHENOL", "pair": ("hypochlorite", "phenol"), "severity": "high",
     "reason": "含氯消毒剂 × 酚类/季铵盐消毒剂（滴露类）：两种消毒体系混在一起可能释放含氯刺激性气体，并且相互分解、双双失效。「消两遍毒更安心」在这里是反效果。",
     "action": "消毒选一种就够，不要叠加；先后使用要间隔并通风。"},
    {"id": "MIX_CHLORINE_QUICKLIME", "pair": ("hypochlorite", "quicklime"), "severity": "high",
     "reason": "生石灰 × 含氯漂白水：生石灰遇水剧烈放热，漂白水的主要成分就是水——局部沸腾会把腐蚀性碱液和含氯液体一起溅出来。",
     "action": "生石灰干燥剂远离一切液体存放；受潮结块后按有害垃圾处理，不要倒进下水道或漂白水里。"},
    {"id": "MIX_CHLORINE_SULFURIC", "pair": ("hypochlorite", "sulfuric"), "severity": "critical",
     "reason": "含氯漂白成分 × 硫酸：只要是强酸，碰上次氯酸钠都是同一个结局——氯气。硫酸类清洁剂比洁厕灵更猛，反应更快。",
     "action": "分开放置、绝不混用；闻到刺鼻气味立刻离开并通风。"},

    # --- 双氧水/过氧化物体系 ---
    {"id": "MIX_PEROXIDE_VINEGAR", "pair": ("peroxide", "vinegar"), "severity": "high",
     "reason": "双氧水 × 醋：两者混合会生成过氧乙酸——一种腐蚀性更强的氧化剂，网上流传的「自制消毒水」配方就是它，对皮肤和呼吸道刺激明显。",
     "action": "别自配「双氧水+醋」消毒液；两瓶分开放，用完一种洗净手再碰另一种。"},
    {"id": "MIX_PEROXIDE_ALCOHOL", "pair": ("peroxide", "alcohol"), "severity": "high",
     "reason": "双氧水 × 酒精：强氧化剂遇上易燃物，等于给火苗提前备好「助燃剂」，受热或遇火星时燃烧会猛烈得多。",
     "action": "消毒时二选一；存放远离灶台和热源。"},
    {"id": "MIX_PEROXIDE_IODINE", "pair": ("peroxide", "iodine"), "severity": "medium",
     "reason": "双氧水 × 碘伏：涂在同一个伤口上会相互反应、双双失效，还可能加重刺激。家里的药箱里这两瓶通常躺在一起。",
     "action": "伤口消毒二选一，不要叠涂；间隔使用需先冲洗干净。"},

    # --- 强碱（管道疏通剂）体系 ---
    {"id": "MIX_LYE_ALUMINUM", "pair": ("lye", "aluminum"), "severity": "high",
     "reason": "强碱疏通剂 × 铝制品：氢氧化钠会溶解铝并放出氢气——易燃气体，遇到明火或静电就可能「砰」。用铝锅盛疏通剂、或疏通剂倒进铝下水管件都可能触发。",
     "action": "疏通剂只用原包装和塑料/陶瓷容器接触；铝锅铝箔远离强碱。"},
    {"id": "MIX_LYE_VINEGAR", "pair": ("lye", "vinegar"), "severity": "high",
     "reason": "强碱疏通剂 × 醋：酸碱中和会剧烈放热，管道里瞬间升温可能把腐蚀性液体顶出来溅到脸上。「小苏打+醋通下水道」的偏方用在真疏通剂上就是另一回事了。",
     "action": "用过化学疏通剂就别再倒醋或洁厕灵；至少间隔大量冲水。"},
    {"id": "MIX_LYE_QUICKLIME", "pair": ("lye", "quicklime"), "severity": "high",
     "reason": "强碱 × 生石灰：生石灰遇水放热，强碱遇水也放热，叠在一起就是双倍沸腾，溅出的是高温强腐蚀碱液。",
     "action": "两类都远离水源存放，更不要混在同一容器里。"},

    # --- 生石灰（食品/衣柜干燥剂） ---
    {"id": "MIX_QUICKLIME_VINEGAR", "pair": ("quicklime", "vinegar"), "severity": "high",
     "reason": "生石灰 × 醋：酸碱反应剧烈放热，密闭容器里可能胀裂喷溅。孩子把干燥剂泡进饮料瓶「做实验」是急诊室的常客。",
     "action": "干燥剂拆包即丢（按有害垃圾），放到孩子拿不到的地方，绝不泡水。"},

    # --- 氧化剂（高锰酸钾）体系 ---
    {"id": "MIX_PERMANGANATE_GLYCERIN", "pair": ("permanganate", "glycerin"), "severity": "critical",
     "reason": "高锰酸钾 × 甘油：这是化学课的经典自燃实验——两者接触会自发剧烈燃烧，不需要明火。家里开塞露（主要成分甘油）和高锰酸钾片若放同一个抽屉就有风险。",
     "action": "两瓶必须分开存放；高锰酸钾单独密封，远离一切有机物液体。"},
    {"id": "MIX_PERMANGANATE_SULFURIC", "pair": ("permanganate", "sulfuric"), "severity": "critical",
     "reason": "高锰酸钾 × 硫酸：会生成七氧化二锰，一种极不稳定的强氧化物，可能自燃甚至爆炸性分解。",
     "action": "绝不混合；两者都应按原包装单独存放。"},
    {"id": "MIX_PERMANGANATE_ALCOHOL", "pair": ("permanganate", "alcohol"), "severity": "high",
     "reason": "高锰酸钾 × 酒精：强氧化剂遇到易燃有机物，摩擦或受热即可引发快速氧化燃烧。",
     "action": "分开存放；高锰酸钾溶液现配现用，不要和消毒酒精放同一层。"},
    {"id": "MIX_PERMANGANATE_PEROXIDE", "pair": ("permanganate", "peroxide"), "severity": "high",
     "reason": "高锰酸钾 × 双氧水：两个强氧化剂相遇会剧烈反应、大量放氧放热，容器内压力骤升。",
     "action": "绝不混合使用或存放。"},
    {"id": "MIX_PERMANGANATE_OXALIC", "pair": ("permanganate", "oxalic"), "severity": "high",
     "reason": "高锰酸钾 × 草酸：氧化还原反应剧烈放热产气，实验室里都要在通风橱小心做的反应，别在家里复现。",
     "action": "分开存放，绝不混用。"},

    # --- 药箱里的经典禁忌 ---
    {"id": "MIX_IODINE_MERBROMIN", "pair": ("iodine", "merbromin"), "severity": "high",
     "reason": "碘伏/碘酒 × 红药水：碘和汞溴红会生成碘化汞——对伤口有腐蚀毒性的物质。这是老辈药箱里最经典的混用禁忌，现在红药水虽已少见，但老房子药箱里还翻得出来。",
     "action": "同一伤口只用一种；建议直接淘汰红药水，保留碘伏即可。"},

    # --- 易燃叠加 ---
    {"id": "MIX_PYRETHROID_ALCOHOL", "pair": ("pyrethroid", "alcohol"), "severity": "high",
     "reason": "杀虫气雾剂 × 酒精类：杀虫喷雾的推进剂本身就是易燃的，再加上酒精，等于在房间里同时放了两个「移动火源」——喷完点蚊香、开燃气灶都可能轰燃。",
     "action": "喷洒后至少通风 15 分钟再动火；两瓶都远离灶台、取暖器和明火存放。"},
    {"id": "MIX_METHANOL_ALCOHOL", "pair": ("methanol", "alcohol"), "severity": "high",
     "reason": "含甲醇产品 × 酒精：两者外观气味相似，放一起极易拿错——甲醇误服 10ml 就可能致盲。玻璃水、工业酒精绝不能进厨房和餐桌区域。",
     "action": "含甲醇液体单独存放并醒目标注「有毒不可饮用」；绝不装进饮料瓶。"},

    # --- 功效抵消/配方未知类（保守提示，非急性危险） ---
    {"id": "MIX_LAUNDRY_ACID", "pair": ("laundry", "acid"), "severity": "medium",
     "reason": "洗衣液 × 酸性清洁剂：酸碱一中和，两边都白搭——去污力双双跳水，还可能析出沉淀堵管道。",
     "action": "各司其职：洗衣用洗衣液，除垢用酸性清洁剂，别倒进同一个容器。"},
    {"id": "MIX_ACID_ACID", "pair": ("acid", "acid"), "severity": "medium",
     "reason": "两种酸性清洁剂混用：不同品牌洁厕剂配方不公开，可能混有含氯或氧化性成分，「都是洁厕灵」不代表能混。马桶是这两瓶最容易先后相遇的地方——上一瓶没冲净，下一瓶就倒进去了。",
     "action": "一次只用一种，用完充分冲水；不同品牌不要倒进同一瓶里存放。"},
    {"id": "MIX_CHLORINE_CHLORINE", "pair": ("hypochlorite", "hypochlorite"), "severity": "medium",
     "reason": "两种含氯消毒剂混用：同为含氯但浓度、稳定剂配方不同，混用可能加速分解、放氯气并失效，「都是 84」也不是一个配方。",
     "action": "不要混装混用，用完一瓶再开一瓶。"},
    {"id": "MIX_PYRETHROID_PYRETHROID", "pair": ("pyrethroid", "pyrethroid"), "severity": "medium",
     "reason": "多种杀虫产品叠加：蚊香+气雾剂+电蚊液一起上，菊酯暴露量成倍叠加，对婴幼儿、猫和呼吸道敏感者是真负担。",
     "action": "同一时间只选一种驱蚊/杀虫方式，使用后通风。"},
    {"id": "MIX_AMMONIA_VINEGAR", "pair": ("ammonia", "vinegar"), "severity": "medium",
     "reason": "含氨清洁剂 × 醋：酸碱中和，直接双双失效——玻璃越擦越花，白忙一场。虽无剧毒，但「叠 buff 式清洁」在这里是纯浪费。",
     "action": "擦玻璃选一种；想换另一种先把表面冲净擦干。"},
]


def _labels_of(item: dict) -> set[str]:
    """家庭物品 → 成分标签集合（复用 rule_engine 的别名归一化）。

    手动输入的物品 analysis 为空时，用 observed_name 兜底匹配（品名即线索）。
    """
    from .rule_engine import _ingredient_labels

    analysis = item.get("analysis") or {}
    observed = (item.get("observed_name") or "").strip()
    if observed and not ((analysis.get("product") or {}).get("name")):
        analysis = dict(analysis)
        analysis["product"] = {**(analysis.get("product") or {}), "name": observed}
    return _ingredient_labels(analysis)


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
                        "source": "rules",
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
                    "source": "rules",
                })

    # 扩充混用规则库（成分标签对，覆盖图谱节点之外的常见化学品）
    item_labels: dict[int, set[str]] = {it["id"]: _labels_of(it) for it in items}
    name_of = {it["id"]: (it.get("observed_name") or "") for it in items}
    for (ia, ib) in itertools.combinations(list(item_labels.keys()), 2):
        la, lb = item_labels[ia], item_labels[ib]
        if not la or not lb:
            continue
        for rule in MIX_RULES:
            ra, rb = rule["pair"]
            hit = (ra in la and rb in lb) or (ra in lb and rb in la)
            if not hit:
                continue
            cross_pairs.append({
                "a": f"#{ia} {name_of[ia]}",
                "b": f"#{ib} {name_of[ib]}",
                "reason": rule["reason"],
                "action": rule["action"],
                "severity": rule["severity"],
                "source": "rules",
                "rule_id": rule["id"],
            })
    # 同一瓶里同时含某条规则两端成分（如自配「双氧水+醋」），也要提示
    for iid, labels in item_labels.items():
        for rule in MIX_RULES:
            ra, rb = rule["pair"]
            if ra == rb or not (ra in labels and rb in labels):
                continue
            cross_pairs.append({
                "a": f"#{iid} {name_of[iid]}",
                "b": "（同一瓶内成分组合）",
                "reason": rule["reason"],
                "action": rule["action"],
                "severity": rule["severity"],
                "source": "rules",
                "rule_id": rule["id"],
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
