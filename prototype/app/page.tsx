"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

const hazards = [
  { id: "01", name: "Bleach", cn: "含氯漂白剂", room: "LAUNDRY", risk: "Corrosive", note: "Never mix with acids or ammonia.", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Kitchen_bleach.JPG/960px-Kitchen_bleach.JPG" },
  { id: "02", name: "Pods", cn: "洗衣凝珠", room: "UTILITY", risk: "Ingestion", note: "Keep locked, high, and out of sight.", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Ariel_pods.jpg/960px-Ariel_pods.jpg" },
  { id: "03", name: "Solvent", cn: "油漆稀释剂", room: "GARAGE", risk: "Flammable", note: "Seal tightly and ventilate the room.", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Thinner_premium%2C_in_bottle.jpg/960px-Thinner_premium%2C_in_bottle.jpg" },
  { id: "04", name: "Spray", cn: "清洁喷雾", room: "GARDEN", risk: "Inhalation", note: "Use sparingly; keep away from food.", image: "https://upload.wikimedia.org/wikipedia/commons/7/73/Sprayer.png" },
  { id: "05", name: "Drain", cn: "管道疏通剂", room: "BATHROOM", risk: "Chemical burn", note: "Wear protection and never combine cleaners.", image: "https://upload.wikimedia.org/wikipedia/commons/5/58/Enzymatic_drain_cleaner.jpg" },
];

export default function Home() {
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
  const next = () => setActive((value) => (value + 1) % hazards.length);

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
    <main>
      <section className={`hero ${mode}`} id="top" onMouseMove={moveHouse} onMouseLeave={() => setTilt({ x: 0, y: 0 })} style={heroStyle}>
        <nav className="nav" aria-label="Main navigation">
          <a className="brand" href="#top" aria-label="Home Hazard home"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
          <div className="nav-links"><a href="#index">Hazard index</a><a href="#method">The method</a><a href="#action">Safer home</a></div>
          <button className="menu" onClick={scrollToIndex} aria-label="Explore household hazards"><span />EXPLORE</button>
        </nav>

        <div className="hero-copy">
          <p className="eyebrow"><span>HOME / HAZARD</span> The house is familiar. What lives inside it?</p>
          <h1><span>0 hidden hazards</span><br />for the next <b>7 years</b></h1>
        </div>

        <div className={`hero-image hero-night ${mode === "night" ? "visible" : ""}`} role="img" aria-label="Modern family house at night framed by household chemical bottles" />
        <div className={`hero-image hero-day ${mode === "morning" ? "visible" : ""}`} role="img" aria-label="Modern family house in morning light framed by household chemical bottles" />
        <div className="scan scan-a"><span>01</span><b>LAUNDRY</b></div>
        <div className="scan scan-b"><span>02</span><b>GARAGE</b></div>
        <div className="solar-orbit orbit-one" /><div className="solar-orbit orbit-two" />

        <div className="mode-panel">
          <div className="mode-switch" role="group" aria-label="House lighting"><button className={mode === "morning" ? "active" : ""} onClick={()=>setMode("morning")}>Morning</button><button className={mode === "night" ? "active" : ""} onClick={()=>setMode("night")}>Night</button></div>
          <p>Forget the clean surface. Many household chemicals stay active long after use.<br />Switch the house from morning to night and bring what is hidden into view.</p>
        </div>

        <div className="hero-meta">
          <div><b>01 HOME</b><span>many rooms<br />many exposures</span></div>
          <div><b>READ</b><span>label · air · distance<br />three safety signals</span></div>
          <div className="edition"><span>FIELD NOTES</span><b>№ 001</b></div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true"><div>NOT ALL CLEAN IS SAFE ✦ KNOW THE LABEL ✦ SEPARATE THE REACTIVE ✦ VENTILATE THE INVISIBLE ✦ &nbsp;</div></div>

      <section className="intro" id="method">
        <p className="section-no">/ 01 — WHY IT MATTERS</p>
        <div>
          <h2>ORDINARY<br /><i>objects.</i><br />EXTRAORDINARY<br />CAUTION.</h2>
        </div>
        <div className="intro-note"><p>Luxury packaging taught us to admire a bottle. This catalogue asks us to read it.</p><p>Scroll through the common categories below. Tap each object to reveal the one habit that reduces risk.</p></div>
      </section>

      <section className="catalogue" id="index">
        <header className="catalogue-head"><p>/ 02 — THE HOUSEHOLD EDIT</p><h2>A toxic<br /><i>collection.</i></h2><span>05 OBJECTS<br />01 SAFER HOME</span></header>
        <div className="carousel-controls"><p><b>∞</b> CONTINUOUS OBJECT LOOP</p><div><button onClick={()=>setPaused(value=>!value)} aria-label={paused ? "Resume carousel" : "Pause carousel"}>{paused ? "PLAY" : "PAUSE"}</button></div></div>
        <div className="carousel-window" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className={`product-grid ${paused ? "paused" : ""}`}>
          {[...hazards,...hazards].map((item, loopIndex) => { const index=loopIndex%hazards.length; return (
            <button key={`${item.id}-${loopIndex}`} className={`product-card ${active === index ? "active" : ""}`} onClick={() => setActive(index)} aria-pressed={active === index}>
              <span className="product-top"><i>{item.id}</i><i>{item.room}</i></span>
              <span className="photo-stage"><img src={item.image} alt={`${item.cn} — ${item.name}`} loading={loopIndex < 4 ? "eager" : "lazy"} /></span>
              <span className="product-name"><small>{item.cn}</small>{item.name}</span>
              <span className="risk"><i>Risk / {item.risk}</i><b>{active === index ? item.note : "View safety note ↗"}</b></span>
            </button>
          )})}
        </div>
        </div>
      </section>

      <section className="action" id="action">
        <div className="action-label">/ 03 — THE SUNLIGHT RULE</div>
        <div className="action-copy"><p>01</p><h2>READ</h2><span>Keep every product in its original container. The label is part of the safety system.</span></div>
        <div className="action-copy"><p>02</p><h2>SEPARATE</h2><span>Store incompatible chemicals apart. Never improvise mixtures—especially bleach.</span></div>
        <div className="action-copy"><p>03</p><h2>AIR</h2><span>Use volatile products with ventilation, away from heat, children, and pets.</span></div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a><p>A design-led awareness project.<br />Product photography: Mk2010, Kjetil Ree, Trecex materiales, Chuck Marean &amp; Cjp24 via Wikimedia Commons.</p><a href="#top" className="back">BACK TO LIGHT ↑</a></footer>
    </main>
  );
}
