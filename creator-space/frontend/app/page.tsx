"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useLang, HOME_COPY, HAZARDS } from "./i18n";

export default function Home() {
  const { lang, setLang } = useLang();
  const t = HOME_COPY[lang];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"morning" | "night">("night");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const scrollToIndex = () => document.getElementById("index")?.scrollIntoView({ behavior: "smooth" });
  const moveHouse = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setTilt({ x: (event.clientX - box.left) / box.width - 0.5, y: (event.clientY - box.top) / box.height - 0.5 });
  };
  const heroStyle = { "--mx": `${tilt.x * 18}px`, "--my": `${tilt.y * 12}px` } as CSSProperties;
  const next = () => setActive((value) => (value + 1) % HAZARDS.length);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(next, 3600);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const timer = window.setInterval(() => setMode((value) => value === "night" ? "morning" : "night"), 4300);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={lang === "zh" ? "lang-zh" : ""}>
      <section className={`hero ${mode}`} id="top" onMouseMove={moveHouse} onMouseLeave={() => setTilt({ x: 0, y: 0 })} style={heroStyle}>
        <nav className="nav" aria-label="Main navigation">
          <a className="brand" href="#top" aria-label="Home Hazard home"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
          <div className="nav-links"><a href="#index">{t.navIndex}</a><a href="#method">{t.navMethod}</a><a href="#action">{t.navAction}</a><a href="/scan">{t.navScan}</a></div>
          <div className="nav-right">
            <button className="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label="Switch language">{lang === "zh" ? "EN" : "中文"}</button>
            <button className="menu" onClick={scrollToIndex} aria-label="Explore household hazards"><span />{t.explore}</button>
          </div>
        </nav>

        <div className="hero-copy">
          <p className="eyebrow"><span>HOME / HAZARD</span> {t.eyebrow}</p>
          <h1><span>{t.h1a}</span><br />{t.h1b} <b>{t.h1c}</b></h1>
        </div>

        <div className={`hero-image hero-night ${mode === "night" ? "visible" : ""}`} role="img" aria-label="Modern family house at night framed by household chemical bottles" />
        <div className={`hero-image hero-day ${mode === "morning" ? "visible" : ""}`} role="img" aria-label="Modern family house in morning light framed by household chemical bottles" />
        <div className="scan scan-a"><span>01</span><b>{lang === "zh" ? HAZARDS[0].roomZh : HAZARDS[0].room}</b></div>
        <div className="scan scan-b"><span>02</span><b>{lang === "zh" ? HAZARDS[2].roomZh : HAZARDS[2].room}</b></div>
        <div className="solar-orbit orbit-one" /><div className="solar-orbit orbit-two" />

        <div className="mode-panel">
          <div className="mode-switch" role="group" aria-label="House lighting"><button className={mode === "morning" ? "active" : ""} onClick={() => setMode("morning")}>{t.modeMorning}</button><button className={mode === "night" ? "active" : ""} onClick={() => setMode("night")}>{t.modeNight}</button></div>
          <p>{t.modeText[0]}<br />{t.modeText[1]}</p>
        </div>

        <div className="hero-meta">
          <div><b>{t.metaHome}</b><span>{t.metaHomeSub[0]}<br />{t.metaHomeSub[1]}</span></div>
          <div><b>{t.metaRead}</b><span>{t.metaReadSub[0]}<br />{t.metaReadSub[1]}</span></div>
          <div className="edition"><span>{t.metaEdition}</span><b>№ 001</b></div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true"><div>{t.ticker}{t.ticker}</div></div>

      <section className="intro" id="method">
        <p className="section-no">{t.introNo}</p>
        <div>
          <h2>{t.introH2[0]}<br /><i>{t.introH2[1]}</i><br />{t.introH2[2]}<br />{t.introH2[3]}</h2>
        </div>
        <div className="intro-note"><p>{t.introNote[0]}</p><p>{t.introNote[1]}</p></div>
      </section>

      <section className="catalogue" id="index">
        <header className="catalogue-head"><p>{t.catNo}</p><h2>{t.catH2a}<br /><i>{t.catH2b}</i></h2><span>{t.catMeta[0]}<br />{t.catMeta[1]}</span></header>
        <div className="carousel-controls"><p><b>∞</b> {t.loop}</p><div><button onClick={() => setPaused(value => !value)} aria-label={paused ? "Resume carousel" : "Pause carousel"}>{paused ? t.play : t.pause}</button></div></div>
        <div className="carousel-window" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className={`product-grid ${paused ? "paused" : ""}`}>
          {[...HAZARDS, ...HAZARDS].map((item, loopIndex) => { const index = loopIndex % HAZARDS.length; return (
            <button key={`${item.id}-${loopIndex}`} className={`product-card ${active === index ? "active" : ""}`} onClick={() => setActive(index)} aria-pressed={active === index}>
              <span className="product-top"><i>{item.id}</i><i>{lang === "zh" ? item.roomZh : item.room}</i></span>
              <span className="photo-stage"><img src={item.image} alt={`${item.cn} — ${item.name}`} loading={loopIndex < 4 ? "eager" : "lazy"} /></span>
              <span className="product-name"><small>{lang === "zh" ? item.name : item.cn}</small>{lang === "zh" ? item.cn : item.name}</span>
              <span className="risk"><i>{t.riskPrefix} / {lang === "zh" ? item.riskZh : item.risk}</i><b>{active === index ? (lang === "zh" ? item.noteZh : item.note) : t.viewNote}</b></span>
            </button>
          )})}
        </div>
        </div>
      </section>

      <section className="action" id="action">
        <div className="action-label">{t.actionNo}</div>
        {t.actions.map((item, i) => (
          <div className="action-copy" key={item.h}><p>0{i + 1}</p><h2>{item.h}</h2><span>{item.s}</span></div>
        ))}
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a><p>{t.footer[0]}<br />{t.footer[1]}</p><a href="#top" className="back">{t.back}</a></footer>
    </main>
  );
}
