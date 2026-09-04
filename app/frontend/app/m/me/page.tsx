"use client";

import { useEffect, useState } from "react";
import { useLang } from "../../i18n";
import AppShell from "../../AppShell";
import ProfileSheet from "../ProfileSheet";
import { ARRAY_DIMS, PROFILE_KEYS, emptyProfile, loadProfile, selectedLabels, type HouseholdProfile } from "../../profile";
import "../../scan/report-extra.css";

const API = "";

const FIRST_OPEN_KEY = "bottlesafe-first-open";

const ICONS = {
  history: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h8L19 8.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M13.5 3.5V9H19" /><path d="M8.5 13h7M8.5 16.5h5" /></svg>
  ),
  feedback: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" /></svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z" /><path d="m9 11.8 2.2 2.2L15.5 9.5" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" /></svg>
  ),
};

export default function MePage() {
  const { lang, setLang } = useLang();
  const [profile, setProfile] = useState<HouseholdProfile>(emptyProfile);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [firstOpen, setFirstOpen] = useState<string>("");

  useEffect(() => {
    const sync = () => setProfile(loadProfile());
    sync();
    window.addEventListener("bottlesafe-profile", sync);
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => setItemCount((d.items ?? []).length))
      .catch(() => {});
    const initFirstOpen = () => {
      try {
        let d = window.localStorage.getItem(FIRST_OPEN_KEY);
        if (!d) {
          d = new Date().toISOString().slice(0, 10);
          window.localStorage.setItem(FIRST_OPEN_KEY, d);
        }
        setFirstOpen(d);
      } catch { /* ignore */ }
    };
    initFirstOpen();
    return () => window.removeEventListener("bottlesafe-profile", sync);
  }, []);

  const labels = selectedLabels(profile, lang);
  const selectedCount = PROFILE_KEYS.filter((k) => profile[k]).length
    + ARRAY_DIMS.reduce((n, d) => n + profile[d].length, 0);

  return (
    <AppShell active="me">
      <div className={`me-page${lang === "zh" ? " lang-zh" : ""}`}>
        {/* 顶部：本地用户 */}
        <header className="me-head">
          <span className="me-avatar" aria-hidden="true">
            <img src="/mascot.png" alt="" width={60} height={60} style={{ borderRadius: 16, display: "block" }} />
          </span>
          <div className="me-head-main">
            <h1>{lang === "zh" ? "瓶安用户" : "BottleSafe user"}</h1>
            <p>{lang === "zh" ? `首次使用：${firstOpen || "—"}` : `First used: ${firstOpen || "—"}`}</p>
            <p>{lang === "zh"
              ? `家庭档案 ${itemCount ?? "…"} 件`
              : `${itemCount ?? "…"} item(s) in your archive`}</p>
          </div>
        </header>

        {/* 我的健康偏好 */}
        <section className="me-section">
          <div className="me-sec-head">
            <h2>{lang === "zh" ? "我的健康偏好" : "My health preferences"}</h2>
            <span className="me-sec-count">{lang === "zh" ? `已选 ${selectedCount} 项` : `${selectedCount} selected`}</span>
          </div>
          {labels.length > 0 && <p className="me-pref-summary">{labels.join(" · ")}</p>}
          <ProfileSheet compact />
        </section>

        {/* 列表行 */}
        <section className="me-list">
          <a className="me-row" href="/m/archive">
            <span className="me-row-ico">{ICONS.history}</span>
            <span className="me-row-text">{lang === "zh" ? "分析历史" : "History"}</span>
            <span className="me-row-arrow" aria-hidden="true">›</span>
          </a>
          <a className="me-row" href="/m/report">
            <span className="me-row-ico">{ICONS.report}</span>
            <span className="me-row-text">{lang === "zh" ? "家庭报告" : "Household report"}</span>
            <span className="me-row-arrow" aria-hidden="true">›</span>
          </a>
          <a className="me-row" href="/m/feedback">
            <span className="me-row-ico">{ICONS.feedback}</span>
            <span className="me-row-text">{lang === "zh" ? "反馈建议" : "Feedback"}</span>
            <span className="me-row-arrow" aria-hidden="true">›</span>
          </a>
          <details className="me-row me-row-fold">
            <summary>
              <span className="me-row-ico">{ICONS.privacy}</span>
              <span className="me-row-text">{lang === "zh" ? "隐私政策" : "Privacy"}</span>
              <span className="me-row-arrow" aria-hidden="true">›</span>
            </summary>
            <div className="me-row-body">
              <p>{lang === "zh"
                ? "所有画像与档案数据仅保存在本机 localStorage 与你自己的后端服务中：不注册账号、不上传任何第三方。删除浏览器数据即可彻底清除。"
                : "All profile and archive data stays in this device's localStorage and your own backend only: no accounts, no third-party uploads. Clearing browser data removes everything."}</p>
            </div>
          </details>
          <div className="me-row me-row-static" data-tour="lang">
            <span className="me-row-ico">{ICONS.settings}</span>
            <span className="me-row-text">{lang === "zh" ? "系统设置" : "Settings"}</span>
            <button className="me-lang-btn" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
              {lang === "zh" ? "语言：中文 → EN" : "Language: EN → 中文"}
            </button>
          </div>
        </section>

        <footer className="me-foot">
          <p>{lang === "zh" ? "结果仅供健康参考，不构成医疗建议" : "For health reference only — not medical advice."}</p>
        </footer>
      </div>
    </AppShell>
  );
}
