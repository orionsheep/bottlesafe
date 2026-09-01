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
    navIndex: "Hazard index", navMethod: "The method", navAction: "Safer home", navScan: "AI scan", navMix: "Do not mix", explore: "EXPLORE",
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
    navIndex: "危害图鉴", navMethod: "安全之道", navAction: "安家之策", navScan: "AI 识别", navMix: "禁忌混用", explore: "探索",
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
    // ---- 方向① 语音问答 ----
    voiceNo: "/ 06 — ASK BY VOICE", voiceTitle: "Ask by voice",
    voiceHint: "Tap the mic and speak — e.g. “My skin turned red”, “What's risky in the kitchen?”, “We have a baby at home”.",
    micStart: "Hold to speak", micListening: "Listening…", micUnsupported: "Voice input needs Chrome/Edge",
    askBtn: "Ask →", asking: "Thinking…",
    chipSymptom: "Symptom", chipScene: "Room", chipPeople: "Family",
    chips: ["Skin red & itchy", "Coughing at home", "Kitchen risks", "Bathroom risks", "We have a baby", "Safe for pets?"],
    relatedItems: "Related items in your archive", noRelated: "No matching item in your archive yet.",
    speak: "Read aloud", stopSpeak: "Stop", graphFacts: "Knowledge-graph clues",
    // ---- 方向② 全屋报告 ----
    reportNo: "/ 07 — WHOLE-HOME REPORT", reportTitle: "Whole-home safety report",
    reportHint: "One tap scans every archived item, flags dangerous combinations and drafts a plain-language action plan.",
    genReport: "Generate report →", genReportBusy: "Analyzing your home…",
    overallRisk: "Overall risk", improved: "improved since last check", worsened: "worsened since last check", unchanged: "unchanged since last check", firstCheck: "baseline established",
    radarTitle: "Hazard profile", crossTitle: "Dangerous combinations found", noCross: "No dangerous pairs detected in your archive. Keep incompatible products apart anyway.",
    actionsTitle: "Do these first", winsTitle: "Quick wins today", reassureLabel: "Good news",
    printReport: "Print / Save PDF", disclaimer: "Screening reference only — not a substitute for product labels, SDS or professional advice.",
    emptyArchiveReport: "Your archive is empty — scan & save a few products first.",
    // ---- 方向④ 时间线 ----
    tlNo: "/ 08 — OVER TIME", tlTitle: "Your safety timeline",
    tlEmpty: "No check-ins yet. Generate your first whole-home report to start the timeline.",
    tlItems: "items", remindTitle: "Reminders",
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
    // ---- 方向① 语音问答 ----
    voiceNo: "/ 06 — 开口即问", voiceTitle: "语音问答，问完就懂",
    voiceHint: "点麦克风直接说：“皮肤发红还痒”、“厨房有什么危险”、“家有宝宝要注意什么”。",
    micStart: "点我说话", micListening: "在听…请讲", micUnsupported: "语音识别需要 Chrome / Edge 浏览器",
    askBtn: "提问 →", asking: "思考中…",
    chipSymptom: "按症状", chipScene: "按空间", chipPeople: "按家人",
    chips: ["皮肤发红还痒", "总在家咳嗉", "厨房有什么危险", "卫生间有什么危险", "家有宝宝", "养猫要注意什么"],
    relatedItems: "家中相关物品", noRelated: "档案里还没有匹配的物品。",
    speak: "朗读回答", stopSpeak: "停止朗读", graphFacts: "知识图谱线索",
    // ---- 方向② 全屋报告 ----
    reportNo: "/ 07 — 全屋体检", reportTitle: "全屋安全报告",
    reportHint: "一键汇总全部已存档物品，标出危险组合与重点隐患，生成通俗的行动清单。",
    genReport: "生成全屋报告 →", genReportBusy: "正在分析你的家…",
    overallRisk: "总体风险", improved: "较上次排查改善 ✓", worsened: "较上次排查上升 ⚠", unchanged: "与上次排查持平", firstCheck: "基线已建立 ✓",
    radarTitle: "风险画像", crossTitle: "发现的危险组合", noCross: "未发现同框禁忌组合；仍建议把不相容的产品分开存放。",
    actionsTitle: "先做这几件事", winsTitle: "今天就能做的小改动", reassureLabel: "安心一句话",
    printReport: "打印 / 存 PDF", disclaimer: "本报告仅供家庭风险筛查参考，不能替代产品标签、SDS 或专业医疗意见。",
    emptyArchiveReport: "档案还是空的——先去上方识别并存入几件物品吧。",
    // ---- 方向④ 时间线 ----
    tlNo: "/ 08 — 长期陪伴", tlTitle: "安全时间线",
    tlEmpty: "还没有排查记录。生成第一份全屋报告，开始记录家的安全变化。",
    tlItems: "件物品", remindTitle: "复检提醒",
  },
};

export const MIX_COPY = {
  en: {
    no: "/ 05 — DO NOT MIX",
    h1a: "What happens",
    h1b: "if they meet?",
    hint: "Pick two bottles. Mix only on this page — never in the sink.",
    slot: "Choose a bottle",
    slotClear: "Clear",
    mix: "Mix →",
    mixNeed: "Pick two bottles first",
    mixing: "Checking ingredients…",
    empty: "Scan two bottles first, then come back to mix.",
    goScan: "Go to AI scan →",
    tray: "Bottles you can pick",
    outcomeGas: "chlorine gas",
    action1: "Put the two bottles in different cabinets now",
    action2: "Open a window and leave the room",
    action3: "Do not pour them down the same drain",
    missTitle: "No known forbidden pair",
    missBody: "The graph has no reaction edge for these two. Still do not mix them. Store them apart.",
    error: "Could not check this pair. Try again.",
    unnamed: "Unnamed",
  },
  zh: {
    no: "/ 05 — DO NOT MIX",
    h1a: "合在一起，",
    h1b: "会怎样？",
    hint: "选出两瓶，只在这一页「混合」。不要真的倒在一起。",
    slot: "点选一瓶",
    slotClear: "换掉",
    mix: "混合 →",
    mixNeed: "先选出两瓶",
    mixing: "正在比对成分…",
    empty: "先去识别拍两瓶，再回来混合",
    goScan: "去 AI 识别 →",
    tray: "候选瓶子",
    outcomeGas: "氯气",
    action1: "立刻把两瓶分开放进不同柜子",
    action2: "开窗，离开这个房间",
    action3: "不要倒进同一下水道",
    missTitle: "未发现已知禁忌组合",
    missBody: "图谱里没有这两瓶的反应边。仍不要混合使用，分开放置。",
    error: "比对失败，请再点一次混合。",
    unnamed: "未命名",
  },
};
