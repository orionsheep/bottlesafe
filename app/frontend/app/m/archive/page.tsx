"use client";

import { useEffect, useState } from "react";
import { useLang, SCAN_COPY } from "../../i18n";
import AppShell from "../../AppShell";
import ReportPanel from "../../scan/report";
import ArchiveCenter, { type ArchiveItem } from "../../archive/ArchiveCenter";

const API =
  typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "";

export default function MobileArchivePage() {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [items, setItems] = useState<ArchiveItem[]>([]);

  useEffect(() => {
    fetch(`${API}/api/household/items`).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {});
  }, []);

  const removeItem = async (id: number) => {
    await fetch(`${API}/api/household/items/${id}`, { method: "DELETE" });
    setItems((list) => list.filter((it) => it.id !== id));
  };

  return (
    <AppShell active="archive">
      <div className={`scan-page${lang === "zh" ? " lang-zh" : ""}`}>
        <header className="page-head page-head--archive">
          <h1>{lang === "zh" ? "家庭档案" : "Household archive"}</h1>
          <p>{lang === "zh" ? "全家化学品台账 · 一眼看清风险分布" : "Your home chemical inventory at a glance."}</p>
        </header>

        <ArchiveCenter items={items} onRemove={removeItem} api={API} />

        <section className="arc-report-section">
          <details className="arc-report-fold">
            <summary>
              <span className="arc-report-title">{t.arcReportSection}</span>
              <span className="arc-report-cta">{t.arcReportOpen} ↓</span>
            </summary>
            <div className="arc-report-inner">
              <ReportPanel nItems={items.length} />
            </div>
          </details>
        </section>

        <footer className="scan-foot"><p>{t.footer}</p></footer>
      </div>
    </AppShell>
  );
}
