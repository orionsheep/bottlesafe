/** 家庭画像：本地存储，无需注册。传给规则引擎 / 问答的 context。 */

export const PROFILE_KEYS = [
  "infant",
  "child",
  "elderly",
  "pregnant",
  "trying_conceive",
  "pet_cat",
  "pet_dog",
  "allergy",
  "asthma",
  "hypertension",
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];

/** 数组维度（对齐「成分说清楚」的健康偏好）：自定义标签也直接进对应 string[]。 */
export type ArrayDim = "doctor_flags" | "allergens" | "diet" | "fitness";
export const ARRAY_DIMS: ArrayDim[] = ["doctor_flags", "allergens", "diet", "fitness"];

/** 每维度元信息：图标 + 名称 + 副标题 + 预设标签。 */
export const DIM_META: Record<ArrayDim, { icon: string; zh: string; en: string; sub_zh: string; sub_en: string; presets: string[] }> = {
  doctor_flags: {
    icon: "🩺", zh: "医生已提醒", en: "Doctor flagged",
    sub_zh: "仅用于生成成分提示，不构成医疗建议", sub_en: "For ingredient hints only, not medical advice",
    presets: ["高血压", "糖尿病", "高血脂", "痛风·高尿酸", "脂肪肝", "慢性肾病", "甲状腺疾病", "湿疹·特应性皮炎", "乳糖不耐受", "便秘", "蛀牙", "肠道敏感"],
  },
  allergens: {
    icon: "🤧", zh: "过敏", en: "Allergies",
    sub_zh: "已确认或怀疑的过敏原", sub_en: "Confirmed or suspected allergens",
    presets: ["牛奶·乳糖", "鸡蛋", "花生·坚果", "海鲜", "花粉", "尘螨"],
  },
  diet: {
    icon: "🥗", zh: "饮食习惯", en: "Diet",
    sub_zh: "日常饮食偏好与忌口", sub_en: "Everyday diet preferences",
    presets: ["素食", "纯素", "清真", "低糖", "低盐", "低脂", "生酮", "低碳水", "无麸质", "控卡减脂", "高蛋白", "忌辛辣"],
  },
  fitness: {
    icon: "🏃", zh: "运动健身", en: "Fitness",
    sub_zh: "当前的训练状态与目标", sub_en: "Current training status & goals",
    presets: ["增肌期", "减脂期", "日常健身", "耐力训练", "康复训练", "久坐少动", "备赛·需查兴奋剂"],
  },
};

/** 每维度自定义标签上限 / 单标签字数上限。 */
export const CUSTOM_TAG_MAX = 5;
export const CUSTOM_TAG_LEN = 12;

export type HouseholdProfile = Record<ProfileKey, boolean> & Record<ArrayDim, string[]>;

export const PROFILE_LABELS: Record<ProfileKey, { zh: string; en: string }> = {
  infant: { zh: "婴幼儿", en: "Infant" },
  child: { zh: "儿童", en: "Child" },
  elderly: { zh: "老人", en: "Elderly" },
  pregnant: { zh: "孕妇", en: "Pregnant" },
  trying_conceive: { zh: "备孕", en: "Trying to conceive" },
  pet_cat: { zh: "宠物猫", en: "Cat" },
  pet_dog: { zh: "宠物狗", en: "Dog" },
  allergy: { zh: "过敏体质", en: "Allergy" },
  asthma: { zh: "哮喘", en: "Asthma" },
  hypertension: { zh: "高血压", en: "Hypertension" },
};

const KEY = "bottlesafe-household-profile";
const STORAGE_KEY = "bottlesafe-household-storage";

/** 储存情况（这瓶化学品当前怎么放）。三态：true/false/未填(null)。 */
export type StorageContext = {
  child_accessible: boolean | null;
  near_food: boolean | null;
  original_container: boolean | null;
};

export function emptyStorage(): StorageContext {
  return { child_accessible: null, near_food: null, original_container: null };
}

export function loadStorage(): StorageContext {
  const base = emptyStorage();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<StorageContext>;
    for (const k of ["child_accessible", "near_food", "original_container"] as const) {
      const v = parsed[k];
      base[k] = v === true ? true : v === false ? false : null;
    }
  } catch { /* ignore */ }
  return base;
}

export function saveStorage(s: StorageContext) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("bottlesafe-profile"));
}

/* ---------------- 五档色标 + 0-100 评分（对齐「成分说清楚」） ---------------- */

export type RiskBand = "critical" | "high" | "medium" | "low" | "unknown";

export const RISK_BAND: Record<RiskBand, { zh: string; en: string; color: string; bg: string }> = {
  critical: { zh: "建议优先处理", en: "Act now", color: "#fff", bg: "#1d211f" },
  high: { zh: "建议重点关注", en: "High attention", color: "#fff", bg: "#c0503f" },
  medium: { zh: "建议留意", en: "Worth noting", color: "#1d211f", bg: "#e8d27a" },
  low: { zh: "暂无明显关注", en: "No major concern", color: "#fff", bg: "#2f8f70" },
  unknown: { zh: "暂无法判断", en: "Cannot judge", color: "#1d211f", bg: "#e3ded2" },
};

/** 把 risk_level 转成 0-100 分（越高越安全；unknown 给中间偏下）。 */
export function riskScore(riskLevel: string | undefined): number {
  switch ((riskLevel || "unknown").toLowerCase()) {
    case "low": return 88;
    case "medium": return 68;
    case "high": return 40;
    case "critical": return 15;
    default: return 50; // unknown
  }
}

/** 评分旁注（诚实声明，对齐成分说清楚）。 */
export function scoreNote(lang: "zh" | "en"): string {
  return lang === "zh"
    ? "评分为参考均值，非统一标准；末档「暂无法判断」不是「安全」。"
    : "Score is a heuristic, not a standard; 'cannot judge' ≠ safe.";
}

export function emptyProfile(): HouseholdProfile {
  return {
    infant: false,
    child: false,
    elderly: false,
    pregnant: false,
    trying_conceive: false,
    pet_cat: false,
    pet_dog: false,
    allergy: false,
    asthma: false,
    hypertension: false,
    doctor_flags: [],
    allergens: [],
    diet: [],
    fitness: [],
  };
}

export function loadProfile(): HouseholdProfile {
  const base = emptyProfile();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<HouseholdProfile>;
    for (const k of PROFILE_KEYS) base[k] = Boolean(parsed[k]);
    // 旧数据没有数组维度：缺省给 []；非字符串项丢弃
    for (const k of ARRAY_DIMS) {
      const v = parsed[k];
      base[k] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function saveProfile(p: HouseholdProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("bottlesafe-profile"));
}

/** 规则引擎 + /api/ask 用的 context。婴幼儿也算 child；并入储存情况。 */
export function toApiContext(p: HouseholdProfile, s?: StorageContext): Record<string, unknown> {
  const base: Record<string, unknown> = {
    child: p.infant || p.child,
    infant: p.infant,
    elderly: p.elderly,
    pregnant: p.pregnant || p.trying_conceive,
    trying_conceive: p.trying_conceive,
    pet_cat: p.pet_cat,
    pet_dog: p.pet_dog,
    // 旧布尔 allergy 与新过敏原列表合并成一个布尔键——规则引擎只认布尔键，数组不传进来
    allergy: p.allergy || p.allergens.length > 0,
    asthma: p.asthma,
    hypertension: p.hypertension,
  };
  // 新维度（doctor_flags/allergens/diet/fitness）不进 context：
  // 仅用于提示文案与问答画像，不参与安全判定。
  if (s) {
    // 三态：仅当用户明确填了才传（null 不传，避免被规则当成 false）
    if (s.child_accessible !== null) base.child_accessible = s.child_accessible;
    if (s.near_food !== null) base.near_food = s.near_food;
    if (s.original_container !== null) base.original_container = s.original_container;
  }
  return base;
}

/** 问答管家用的 context：规则布尔 + 储存三态 + 健康/过敏原等标签（数组仅 ask 使用）。 */
export function toAskContext(p: HouseholdProfile, s?: StorageContext): Record<string, unknown> {
  return {
    ...toApiContext(p, s),
    doctor_flags: p.doctor_flags,
    allergens: p.allergens,
    diet: p.diet,
    fitness: p.fitness,
  };
}

export function selectedLabels(p: HouseholdProfile, lang: "zh" | "en"): string[] {
  const bools = PROFILE_KEYS.filter((k) => p[k]).map((k) => PROFILE_LABELS[k][lang]);
  // 新维度的选中项（预设/自定义原文）也纳入画像摘要
  return bools.concat(ARRAY_DIMS.flatMap((d) => p[d]));
}

type Hintable = {
  risk_level?: string;
  hazards?: { type?: string; severity?: string }[];
  ingredients?: { name?: string }[];
  first_aid?: { ingestion?: string | null };
};

/** 画像驱动的结论文案（展示层；安全判定仍走规则引擎）。 */
export function profileHints(analysis: Hintable | null | undefined, p: HouseholdProfile, lang: "zh" | "en"): string[] {
  if (!analysis) return [];
  const names = (analysis.ingredients ?? []).map((g) => (g.name || "").toLowerCase()).join(" ");
  const hazards = (analysis.hazards ?? []).map((h) => `${h.type || ""} ${h.severity || ""}`.toLowerCase()).join(" ");
  const high = ["high", "critical"].includes(analysis.risk_level || "");
  const corrosive = /corrosive|腐蚀|toxic|毒/.test(hazards);
  const out: string[] = [];

  if ((p.infant || p.child) && (high || corrosive)) {
    out.push(lang === "zh"
      ? "家有小孩：这件外观可能被当成饮料。请上锁或放到够不到的高处，保持原瓶原标。"
      : "Kids at home: this can look like a drink. Lock it up or put it out of reach, keep the original label.");
  }
  if (p.pet_cat && /(菊酯|pyrethroid|氯菊酯|酚|phenol|来苏)/.test(names + hazards)) {
    out.push(lang === "zh"
      ? "家有猫：酚类 / 拟除虫菊酯对猫特异性高毒。使用后隔离通风，优先换宠物专用配方。"
      : "Cat in the home: phenols / pyrethroids are highly toxic to cats. Ventilate and isolate; prefer pet-safe formulas.");
  }
  if (p.pregnant && (high || corrosive)) {
    out.push(lang === "zh"
      ? "家有孕妇/备孕：避免在密闭卫生间使用强挥发清洁剂，用完开窗。"
      : "Pregnancy: avoid strong volatiles in a closed bathroom; ventilate after use.");
  }
  if (p.asthma && /inhal|吸入|挥发|喷雾|aerosol/.test(names + hazards + (analysis.first_aid?.ingestion || ""))) {
    out.push(lang === "zh"
      ? "家有哮喘：喷雾/挥发物先开窗，人离开房间再使用。"
      : "Asthma: spray/volatiles — open windows and leave the room while using.");
  }
  // 过敏/湿疹 × 香精防腐剂：接触致敏有明确循证关联，才给提示。
  const eczema = p.doctor_flags.some((f) => f.includes("湿疹"));
  if ((p.allergy || p.allergens.length > 0 || eczema) && /(香精|香料|防腐剂|fragrance|parfum|perfume|preserv)/.test(names)) {
    out.push(lang === "zh"
      ? "家有过敏/湿疹：香精与防腐剂是常见致敏原，留意成分表中的香料、MIT/CMIT。"
      : "Allergy/eczema at home: fragrance & preservatives are common sensitizers — check for parfum, MIT/CMIT.");
  }
  // 其余新维度（饮食/运动/其他医生提醒）与家用化学品无直接循证关联，不硬凑提示。
  if (p.elderly && (high || corrosive)) {
    out.push(lang === "zh"
      ? "家有老人：原瓶原标、不要倒进饮料瓶；误食立即打 120，并带上包装。"
      : "Elderly at home: keep original packaging; if ingested call emergency and bring the bottle.");
  }
  return out;
}
