"use client";

import type { ReactNode } from "react";
import { useLang } from "./i18n";
import TourGuide from "./m/TourGuide";
import "./scan/report-extra.css";

type Tab = "home" | "scan" | "assistant" | "archive" | "me";

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
    key: "assistant", href: "/m/assistant", zh: "AI 助手", en: "AI",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5Z" /><circle cx="8.5" cy="11.5" r=".9" fill="currentColor" stroke="none" /><circle cx="12" cy="11.5" r=".9" fill="currentColor" stroke="none" /><circle cx="15.5" cy="11.5" r=".9" fill="currentColor" stroke="none" /></svg>
    ),
  },
  {
    key: "archive", href: "/archive", zh: "档案", en: "Archive",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="4" rx="1.2" /><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" /><path d="M10 12.5h4" /></svg>
    ),
  },
  {
    key: "me", href: "/m/me", zh: "我的", en: "Me",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.4 3.9-5.2 7-5.2s5.8 1.8 7 5.2" /></svg>
    ),
  },
];

/** 手机客户端外壳。只用于 /m/* ，导航不离开手机前端。 */
export default function AppShell({ active, children }: { active: Tab; children: ReactNode }) {
  const { lang } = useLang();
  return (
    <div className={`app-shell${lang === "zh" ? " lang-zh" : ""}`}>
      <div className="grain" aria-hidden="true" />

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
