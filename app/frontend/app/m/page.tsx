"use client";

import { useEffect, useState } from "react";
import { useLang, HOME_COPY, HAZARDS } from "../i18n";
import AppShell from "../AppShell";
import { KNOWLEDGE, pickDaily, type KnowledgeItem } from "../knowledge";
import { emptyProfile, loadProfile, type HouseholdProfile } from "../profile";
import { startTour } from "./TourGuide";

export default function MobileHome() {
  const { lang } = useLang();
  const t = HOME_COPY[lang];
  const [active, setActive] = useState<string | null>("01");
  const [profile, setProfile] = useState<HouseholdProfile>(emptyProfile);
  const [tip, setTip] = useState<KnowledgeItem>(KNOWLEDGE[0]);
  useEffect(() => {
    const sync = () => {
      const p = loadProfile();
      setProfile(p);
      setTip(pickDaily(p));
    };
    sync();
    window.addEventListener("bottlesafe-profile", sync);
    return () => window.removeEventListener("bottlesafe-profile", sync);
  }, []);
  const tipCopy = tip[lang];

  return (
    <AppShell active="home">
      <section className="home-hero">
        <div className="hero-media">
          <img src="/img/hero-home.jpg" alt={lang === "zh" ? "明亮家中错落摆放的清洁用品" : "Household cleaning products in a bright home"} />
          <span className="hero-badge">{lang === "zh" ? "家庭化学品安全 AI" : "Household chemical safety AI"}</span>
        </div>
        <div className="hero-copy">
          <img className="hero-mascot" src="/mascot.png" alt={lang === "zh" ? "瓶安吉祥物" : "BottleSafe mascot"} />
          <h1>{lang === "zh" ? "拍一下，让瓶瓶罐罐安放妥当" : "Snap it. Keep every bottle safe."}</h1>
          <p>{lang === "zh" ? "读标签、辨风险、查禁忌混用，把一次排查变成长期家庭安全档案。" : "Read labels, judge risks, flag dangerous mixes — one scan becomes a lasting home safety archive."}</p>
          <div className="hero-cta-row">
            <a className="hero-cta" data-tour="cta" href="/scan">{lang === "zh" ? "开始识别 →" : "Start scan →"}</a>
            <button type="button" className="hero-tour" onClick={startTour}>{lang === "zh" ? "90 秒自动演示" : "90s auto demo"}</button>
          </div>
        </div>
      </section>

      <section className="daily-tip" data-tour="tip">
        <div className="daily-tip-k">{lang === "zh" ? "今日小知识" : "Today's tip"}</div>
        <b>{tipCopy.title}</b>
        <p>{tipCopy.body}</p>
        <span className="daily-tip-note">{lang === "zh" ? "按家庭画像加权轮换 · 不是医疗建议" : "Weighted by household profile · not medical advice"}</span>
      </section>

      <div className="cap-strip" aria-label={lang === "zh" ? "关键能力" : "capabilities"}>
        {(lang === "zh"
          ? ["拍照识别", "语音问答", "全屋报告", "知识图谱", "绿色处置"]
          : ["Photo scan", "Voice Q&A", "Whole-home report", "Knowledge graph", "Green disposal"]
        ).map((c) => <span key={c} className="cap-chip">{c}</span>)}
      </div>

      <section className="home-section" data-tour="guide">
        <div className="sec-head">
          <h2>{lang === "zh" ? "家宅危害图鉴" : "Home hazard guide"}</h2>
          <span>{lang === "zh" ? "轻点查看" : "tap to view"}</span>
        </div>
        <ul className="guide-list">
          {HAZARDS.map((item) => {
            const open = active === item.id;
            return (
              <li key={item.id}>
                <button className={`guide-card${open ? " is-open" : ""}`} onClick={() => setActive(open ? null : item.id)} aria-expanded={open}>
                  <span className="guide-thumb"><img src={item.image} alt={lang === "zh" ? item.cn : item.name} /></span>
                  <span className="guide-main">
                    <span className="guide-top"><i>{item.id}</i><i>{lang === "zh" ? item.roomZh : item.room}</i></span>
                    <b>{lang === "zh" ? item.cn : item.name}</b>
                    <span className={`guide-risk risk-${item.risk === "Low" ? "low" : "high"}`}>{lang === "zh" ? item.riskZh : item.risk}</span>
                    {open && <span className="guide-note">{lang === "zh" ? item.noteZh : item.note}</span>}
                  </span>
                  <span className="guide-arrow" aria-hidden="true">{open ? "−" : "+"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="home-section">
        <div className="sec-head"><h2>{lang === "zh" ? "日光三法则" : "Three rules"}</h2></div>
        <ul className="rule-list">
          {t.actions.map((item, i) => (
            <li key={item.h} className="rule-card">
              <span className="rule-no">0{i + 1}</span>
              <div><b>{item.h}</b><p>{item.s}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <a className="scan-cta-card" href="/scan">
        <div>
          <b>{lang === "zh" ? "进入识别台" : "Go to scanner"}</b>
          <p>{lang === "zh" ? "上传照片，得到产品、风险、禁忌混用、急救与绿色处置建议。" : "Upload a photo for product, risk, do-not-mix, first aid and green disposal advice."}</p>
        </div>
        <span aria-hidden="true">→</span>
      </a>
    </AppShell>
  );
}
