"use client";

import { HOME_COPY, useLang } from "./i18n";

/** 电脑端四页共用同一组导航，避免首页和内页条目不一致。 */
export default function DeskNav({
  home,
  onExplore,
}: {
  home?: boolean;
  onExplore?: () => void;
}) {
  const { lang, setLang } = useLang();
  const t = HOME_COPY[lang];
  const links = [
    { href: home ? "#index" : "/", label: t.navIndex },
    { href: "/scan", label: t.navScan },
    { href: "/mix", label: t.navMix },
    { href: "/archive", label: t.navArchive },
  ];
  return (
    <nav className="nav" aria-label="Main navigation">
      <a className="brand" href={home ? "#top" : "/"} aria-label="Home Hazard home">
        <span className="brand-mark">H/H</span>
        <span>HOME<br />HAZARD</span>
      </a>
      <div className="nav-links">
        {links.map((item) => (
          <a key={item.label} href={item.href}>{item.label}</a>
        ))}
      </div>
      <div className="nav-right">
        <button className="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label="Switch language">
          {lang === "zh" ? "EN" : "中文"}
        </button>
        {home ? (
          <button className="menu" onClick={onExplore} aria-label="Explore household hazards">
            <span />{t.explore}
          </button>
        ) : (
          <a className="menu" href="/"><span />{lang === "zh" ? "返回" : "BACK"}</a>
        )}
      </div>
    </nav>
  );
}
