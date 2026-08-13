"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "zh" | "en";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "zh",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");
  useEffect(() => {
    const saved = localStorage.getItem("hh-lang");
    setLangState(
      saved === "en" || saved === "zh"
        ? saved
        : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en",
    );
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem("hh-lang", next);
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/* ---------------- 首页文案 ---------------- */
export const HOME_COPY = {
  en: {
    navIndex: "Hazard index", navMethod: "The method", navAction: "Safer home", navScan: "AI scan", explore: "EXPLORE",
    eyebrow: "The house is familiar. What lives inside it?",
    h1a: "0 hidden hazards", h1b: "for the next", h1c: "7 years",
    modeMorning: "Morning", modeNight: "Night",
    modeText: ["Forget the clean surface. Many household chemicals stay active long after use.", "Switch the house from morning to night and bring what is hidden into view."],
    metaHome: "01 HOME", metaHomeSub: ["many rooms", "many exposures"],
    metaRead: "READ", metaReadSub: ["label · air · distance", "three safety signals"],
    metaEdition: "FIELD NOTES",
    ticker: "NOT ALL CLEAN IS SAFE ✦ KNOW THE LABEL ✦ SEPARATE THE REACTIVE ✦ VENTILATE THE INVISIBLE ✦  ",
    introNo: "/ 01 — WHY IT MATTERS",
    introH2: ["ORDINARY", "objects.", "EXTRAORDINARY", "CAUTION."],
    introNote: ["Luxury packaging taught us to admire a bottle. This catalogue asks us to read it.", "Scroll through the common categories below. Tap each object to reveal the one habit that reduces risk."],
    catNo: "/ 02 — THE HOUSEHOLD EDIT", catH2a: "A toxic", catH2b: "collection.",
    catMeta: ["05 OBJECTS", "01 SAFER HOME"], loop: "CONTINUOUS OBJECT LOOP", play: "PLAY", pause: "PAUSE",
    riskPrefix: "Risk", viewNote: "View safety note ↗",
    actionNo: "/ 03 — THE SUNLIGHT RULE",
    actions: [
      { h: "READ", s: "Keep every product in its original container. The label is part of the safety system." },
      { h: "SEPARATE", s: "Store incompatible chemicals apart. Never improvise mixtures—especially bleach." },
      { h: "AIR", s: "Use volatile products with ventilation, away from heat, children, and pets." },
    ],
    footer: ["A design-led awareness project.", "Product photography: Mk2010, Kjetil Ree, Trecex materiales, Chuck Marean & Cjp24 via Wikimedia Commons."],
    back: "BACK TO LIGHT ↑",
  },
  zh: {
    navIndex: "危害图鉴", navMethod: "安全之道", navAction: "安家之策", navScan: "AI 识别", explore: "探索",
    eyebrow: "屋舍寻常，内里藏着什么？",
    h1a: "0 处隐患", h1b: "藏于未来", h1c: "7 年",
    modeMorning: "清晨", modeNight: "入夜",
    modeText: ["洁净只是表象。许多家用化学品，在用后依旧悄然活跃。", "让屋子自清晨转入入夜，使隐匿之物现形。"],
    metaHome: "01 家宅", metaHomeSub: ["诸多房间", "诸多暴露"],
    metaRead: "读标", metaReadSub: ["标签 · 空气 · 距离", "三重安全信号"],
    metaEdition: "田野手记",
    ticker: "洁净未必安全 ✦ 识其标签 ✦ 分而置之 ✦ 通风于无形 ✦  ",
    introNo: "/ 01 — 为何要紧",
    introH2: ["寻常", "之物。", "非常", "之慎。"],
    introNote: ["华美的包装教人欣赏瓶子；这份图鉴，请人阅读瓶子。", "下滑浏览常见品类；轻点每件物品，看见那个降低风险的习惯。"],
    catNo: "/ 02 — 家宅辑录", catH2a: "有毒的", catH2b: "收藏。",
    catMeta: ["05 件物事", "01 个更安全的家"], loop: "循环不止的展品", play: "播放", pause: "暂停",
    riskPrefix: "风险", viewNote: "查看安全提示 ↗",
    actionNo: "/ 03 — 日光法则",
    actions: [
      { h: "读标", s: "让每件产品留在原瓶原罐。标签，是安全系统的一部分。" },
      { h: "分置", s: "相克的化学品，分处而藏。切勿随手调配混合物——尤其是漂白剂。" },
      { h: "通风", s: "挥发之物，当于通风处使用；远热源，远孩童，远宠物。" },
    ],
    footer: ["一个以设计唤醒安全意识的项目。", "产品摄影：Mk2010, Kjetil Ree, Trecex materiales, Chuck Marean & Cjp24（Wikimedia Commons）。"],
    back: "回到光里 ↑",
  },
};

/* ---------------- 首页危险品数据（双语） ---------------- */
export const HAZARDS = [
  { id: "01", name: "Bleach", cn: "含氯漂白剂", room: "LAUNDRY", roomZh: "洗衣房", risk: "Corrosive", riskZh: "腐蚀性", note: "Never mix with acids or ammonia.", noteZh: "切勿与酸或氨水同用。", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Kitchen_bleach.JPG/960px-Kitchen_bleach.JPG" },
  { id: "02", name: "Pods", cn: "洗衣凝珠", room: "UTILITY", roomZh: "杂物间", risk: "Ingestion", riskZh: "误食", note: "Keep locked, high, and out of sight.", noteZh: "上锁、置高、藏于视线之外。", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Ariel_pods.jpg/960px-Ariel_pods.jpg" },
  { id: "03", name: "Solvent", cn: "油漆稀释剂", room: "GARAGE", roomZh: "车库", risk: "Flammable", riskZh: "易燃", note: "Seal tightly and ventilate the room.", noteZh: "密封而藏，常通风。", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Thinner_premium%2C_in_bottle.jpg/960px-Thinner_premium%2C_in_bottle.jpg" },
  { id: "04", name: "Spray", cn: "清洁喷雾", room: "GARDEN", roomZh: "花园", risk: "Inhalation", riskZh: "吸入", note: "Use sparingly; keep away from food.", noteZh: "少用为宜，远于食物。", image: "https://upload.wikimedia.org/wikipedia/commons/7/73/Sprayer.png" },
  { id: "05", name: "Drain", cn: "管道疏通剂", room: "BATHROOM", roomZh: "浴室", risk: "Chemical burn", riskZh: "化学灼伤", note: "Wear protection and never combine cleaners.", noteZh: "先作防护，切勿混用清洁剂。", image: "https://upload.wikimedia.org/wikipedia/commons/5/58/Enzymatic_drain_cleaner.jpg" },
];

/* ---------------- 识别页文案 ---------------- */
export const SCAN_COPY = {
  en: {
    back: "BACK",
    headNo: "/ 04 — MODEL IN THE LOOP",
    h1a: "SCAN AN", h1b: "object.",
    sub: "Upload a photo of a household chemical. The second fine-tuned Qwen3-VL-4B (LoRA public-300-final) reads the product, its risks, storage rules and incompatible mixtures.",
    dropHint: ["Click to choose an image", "JPG · PNG · WEBP"],
    analyze: "Start scan →", busy: "Scanning… (first run is slower)", waiting: "Waiting for model…",
    save: "Save to household archive", saved: "Saved to archive ✓",
    placeholderNo: "RESULT", placeholderTitle: "The result will appear here",
    placeholderList: ["Product name / brand / category / barcode", "Hazard types & severity, ingredients & signal words", "Safe storage, do-not-mix, acute exposure advice", "Uncertainties and suggested extra photos"],
    placeholderModel: "Model: Qwen3-VL-4B + 2nd fine-tune LoRA (public-300-final)",
    hazards: "Hazards", ingredients: "Ingredients", signalWords: "Signal words",
    safeStorage: "Safe storage", doNotMix: "Do not mix with",
    firstAidTitle: "Acute exposure advice (not a medical diagnosis; in emergencies contact poison control / emergency services)",
    faIngestion: "Ingestion", faInhalation: "Inhalation", faEye: "Eye contact", faSkin: "Skin contact",
    uncertainties: "Uncertainties", moreImages: "Suggested extra photos",
    dbMatch: "✓ Matched safety database entry",
    unnamedProduct: "Unnamed product", noLabel: "No label info",
    archiveNo: "/ 05 — HOUSEHOLD ARCHIVE", archiveTitle: "Household archive",
    archiveEmpty: "Nothing archived yet. After a scan, click “Save to household archive”.",
    remove: "Delete", unnamed: "Unnamed",
    footer: "Results are safety references only — they do not replace product labels, SDS or professional medical advice.",
    status: {
      checking: "Connecting to backend…",
      loading: "Loading model…",
      ready: "Model ready",
      error: "Model failed to load",
      offline: "Backend not running (expected at 127.0.0.1:8000)",
    } as Record<string, string>,
  },
  zh: {
    back: "返回",
    headNo: "/ 04 — MODEL IN THE LOOP",
    h1a: "识物，", h1b: "知险。",
    sub: "上传一张家用化学品照片。第二次微调的 Qwen3-VL-4B（LoRA public-300-final）将为你识产品、辨风险、明储存、知禁忌。",
    dropHint: ["轻点选图", "JPG · PNG · WEBP"],
    analyze: "开始识别 →", busy: "识别中…（首次稍慢）", waiting: "等待模型加载…",
    save: "存入家庭档案", saved: "已入档案 ✓",
    placeholderNo: "RESULT", placeholderTitle: "识别结果，将在此呈现",
    placeholderList: ["产品名 / 品牌 / 类别 / 条码", "危害与严重度、成分与信号词", "储存之要、切忌混用、急性暴露应对", "未定之处与建议补拍"],
    placeholderModel: "模型：Qwen3-VL-4B + 第二次微调 LoRA（public-300-final）",
    hazards: "危害", ingredients: "成分", signalWords: "信号词",
    safeStorage: "储存之要", doNotMix: "切忌混用",
    firstAidTitle: "急性暴露应对（非医疗诊断；紧急情况请联络急救 / 中毒咨询机构）",
    faIngestion: "误食", faInhalation: "吸入", faEye: "入眼", faSkin: "触肤",
    uncertainties: "未定之处", moreImages: "建议补拍",
    dbMatch: "✓ 命中安全数据库档案",
    unnamedProduct: "未能识得品名", noLabel: "标签信息阙如",
    archiveNo: "/ 05 — HOUSEHOLD ARCHIVE", archiveTitle: "家宅档案",
    archiveEmpty: "尚无存档。识别之后，点「存入家庭档案」即可。",
    remove: "删除", unnamed: "未命名",
    footer: "识别结果仅供安全参考，切勿替代产品背标、SDS 或专业医疗建议。",
    status: {} as Record<string, string>, // 中文直接显示后端 detail
  },
};
