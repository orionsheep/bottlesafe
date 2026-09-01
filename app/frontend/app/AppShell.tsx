"use client";

import type { ReactNode } from "react";
import { useLang } from "./i18n";
import TourGuide from "./m/TourGuide";

type Tab = "home" | "scan" | "mix" | "archive";

const TABS: { key: Tab; href: string; zh: string; en: string; icon: ReactNode }[] = [
  {
    key: "home", href: "/", zh: "图鉴", en: "Guide",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-5h5v5" /></svg>
    ),
  },
  {
    key: "scan", href: "/scan", zh: "识别", en: "Scan",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" /><path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" /><path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" /><path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" /><circle cx="12" cy="12" r="3.2" /></svg>
    ),
  },
  {
    key: "mix", href: "/mix", zh: "混用", en: "Mix",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h3v4L8 14h8l-3-7V3h3" /><path d="M9 20h6" /></svg>
    ),
  },
  {
    key: "archive", href: "/archive", zh: "档案", en: "Archive",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="4" rx="1.2" /><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" /><path d="M10 12.5h4" /></svg>
    ),
  },
];

/** 手机客户端外壳。只用于 /m/* ，导航不离开手机前端。 */
export default function AppShell({ active, children }: { active: Tab; children: ReactNode }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`app-shell${lang === "zh" ? " lang-zh" : ""}`}>
      <div className="grain" aria-hidden="true" />
      <header className="app-topbar">
        <a className="app-brand" href="/"><span className="brand-dot" />瓶安 <i>BottleSafe</i></a>
        <div className="app-topbar-end">
          <button className="lang-chip" data-tour="lang" onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label="Switch language">
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </header>

      <main className="app-body">{children}</main>
      <TourGuide />

      <nav className="app-tabbar" aria-label="Primary">
        {TABS.map((tab) => (
          <a key={tab.key} href={tab.href} className={`tab${active === tab.key ? " is-active" : ""}`} aria-current={active === tab.key ? "page" : undefined}>
            {tab.icon}
            <span>{lang === "zh" ? tab.zh : tab.en}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
