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
export type HouseholdProfile = Record<ProfileKey, boolean>;

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

/** 规则引擎 + /api/ask 用的 context。婴幼儿也算 child。 */
export function toApiContext(p: HouseholdProfile): Record<string, boolean> {
  return {
    child: p.infant || p.child,
    infant: p.infant,
    elderly: p.elderly,
    pregnant: p.pregnant || p.trying_conceive,
    trying_conceive: p.trying_conceive,
    pet_cat: p.pet_cat,
    pet_dog: p.pet_dog,
    allergy: p.allergy,
    asthma: p.asthma,
    hypertension: p.hypertension,
  };
}

export function selectedLabels(p: HouseholdProfile, lang: "zh" | "en"): string[] {
  return PROFILE_KEYS.filter((k) => p[k]).map((k) => PROFILE_LABELS[k][lang]);
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
  if (p.elderly && (high || corrosive)) {
    out.push(lang === "zh"
      ? "家有老人：原瓶原标、不要倒进饮料瓶；误食立即打 120，并带上包装。"
      : "Elderly at home: keep original packaging; if ingested call emergency and bring the bottle.");
  }
  return out;
}
