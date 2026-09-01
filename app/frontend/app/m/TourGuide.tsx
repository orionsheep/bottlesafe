"use client";

import { useEffect, useState } from "react";
import { useLang } from "../i18n";

type Step = {
  id: string;
  href: string;
  target: string;
  ms: number;
  zh: string;
  en: string;
};

const STEPS: Step[] = [
  { id: "guide", href: "/", target: "[data-tour=guide]", ms: 12000, zh: "家宅危害图鉴：先记住最常见的几瓶。含氯漂白剂绝不能碰上酸性洁厕剂。", en: "Hazard guide: bleach must never meet acid toilet cleaner." },
  { id: "tip", href: "/", target: "[data-tour=tip]", ms: 10000, zh: "今日小知识会跟家庭画像走。家里有猫，会优先讲菊酯和酚。", en: "Daily tip follows your household profile — cats get pyrethroid / phenol notes first." },
  { id: "scan", href: "/scan", target: "[data-tour=samples]", ms: 12000, zh: "没有现成照片？点示例一键试用。识别走视觉模型，关键安全判定由规则引擎兜底。", en: "No photo? Tap a sample. Vision reads the label; the rule engine makes the safety call." },
  { id: "mix", href: "/mix", target: "[data-tour=mix-demo]", ms: 14000, zh: "混用页：选出两瓶再点。84 × 洁厕灵会主动预警氯气——本组合判定基于规则库，不是大模型猜的。", en: "Mix two bottles. Bleach × toilet cleaner warns of chlorine gas — ruled by the library, not the model." },
  { id: "archive", href: "/archive", target: "[data-tour=archive]", ms: 11000, zh: "档案留下每一次排查。家庭画像存在本机，不用注册。", en: "The archive keeps each scan. Household profile stays on-device. No account." },
  { id: "ask", href: "/scan", target: "[data-tour=assistant]", ms: 12000, zh: "语音问答：不识字也能开口问「能不能一起倒」。小安记得你扫过的瓶子。", en: "Voice Q&A: ask if two bottles can go together. The assistant remembers what you scanned." },
  { id: "lang", href: "/", target: "[data-tour=lang]", ms: 8000, zh: "右上角可切中英。路演用中文即可。", en: "Switch language at the top. Chinese is fine for the pitch." },
  { id: "end", href: "/", target: "[data-tour=cta]", ms: 11000, zh: "瓶安不做医疗诊断、不下致癌结论、不替代实验室。拍一下，让瓶瓶罐罐安放妥当。", en: "No medical diagnosis, no cancer claims, not a lab. Snap it. Keep every bottle safe." },
];

const KEY = "bottlesafe-tour";
const TOTAL = STEPS.reduce((s, x) => s + x.ms, 0);

type TourState = { i: number; started: number; stepAt: number };

function read(): TourState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TourState) : null;
  } catch {
    return null;
  }
}
function write(s: TourState) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function startTour() {
  const now = Date.now();
  write({ i: 0, started: now, stepAt: now });
  if (location.pathname !== "/" && location.pathname !== "/m") location.href = "/";
  else window.dispatchEvent(new Event("bottlesafe-tour"));
}

export function stopTour() {
  sessionStorage.removeItem(KEY);
  document.querySelectorAll("[data-tour-hl]").forEach((el) => el.removeAttribute("data-tour-hl"));
  window.dispatchEvent(new Event("bottlesafe-tour"));
}

export default function TourGuide() {
  const { lang } = useLang();
  const [state, setState] = useState<TourState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener("bottlesafe-tour", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener("bottlesafe-tour", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const step = STEPS[state.i];
    if (!step) {
      stopTour();
      return;
    }
    const here = location.pathname.replace(/\/$/, "") || "/";
    const want = step.href.replace(/\/$/, "") || "/";
    const onPage = here === want || here === `/m${want === "/" ? "" : want}` || (want === "/" && (here === "" || here === "/m"));
    if (!onPage) {
      location.href = step.href;
      return;
    }
    const hl = () => {
      document.querySelectorAll("[data-tour-hl]").forEach((el) => el.removeAttribute("data-tour-hl"));
      const el = document.querySelector(step.target);
      if (el) {
        el.setAttribute("data-tour-hl", "1");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    const t = window.setTimeout(hl, 80);
    const tick = window.setInterval(() => setNow(Date.now()), 200);
    const due = state.stepAt + step.ms;
    const wait = Math.max(200, due - Date.now());
    const adv = window.setTimeout(() => {
      if (state.i >= STEPS.length - 1) {
        stopTour();
        return;
      }
      const nextI = state.i + 1;
      const next = { i: nextI, started: state.started, stepAt: Date.now() };
      write(next);
      const nx = STEPS[nextI];
      if (nx.href !== step.href) location.href = nx.href;
      else window.dispatchEvent(new Event("bottlesafe-tour"));
    }, wait);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(adv);
      window.clearInterval(tick);
    };
  }, [state]);

  if (!state) return null;
  const step = STEPS[state.i];
  if (!step) return null;
  const elapsed = Math.min(TOTAL, now - state.started);
  const pct = Math.round((elapsed / TOTAL) * 100);
  const remain = Math.max(0, Math.ceil((TOTAL - elapsed) / 1000));

  return (
    <div className="tour-overlay" role="dialog" aria-label={lang === "zh" ? "自动导览" : "Guided tour"}>
      <div className="tour-progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <div className="tour-card">
        <div className="tour-meta">
          <span>{lang === "zh" ? `自动演示 ${state.i + 1}/${STEPS.length}` : `Demo ${state.i + 1}/${STEPS.length}`}</span>
          <span>{remain}s</span>
        </div>
        <p>{lang === "zh" ? step.zh : step.en}</p>
        <div className="tour-actions">
          <button type="button" onClick={stopTour}>{lang === "zh" ? "跳过" : "Skip"}</button>
        </div>
      </div>
    </div>
  );
}
