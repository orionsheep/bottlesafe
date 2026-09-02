"use client";

import { useEffect, useState } from "react";
import { useLang, SCAN_COPY } from "../../i18n";
import AppShell from "../../AppShell";
import ReportPanel from "../../scan/report";
import ArchiveCenter, { type ArchiveItem } from "../../archive/ArchiveCenter";
import ProfileSheet from "../ProfileSheet";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

export default function MobileArchivePage() {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [diff, setDiff] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/api/household/items`).then((r) => r.json()).then((d) => {
      const list: ArchiveItem[] = d.items ?? [];
      setItems(list);
      // 跨会话 diff：相比上次查看新增了几件
      try {
        const KEY = "bottlesafe-archive-last-count";
        const prev = Number(window.localStorage.getItem(KEY) || "NaN");
        if (Number.isFinite(prev) && list.length !== prev) {
          setDiff(list.length - prev);
        }
        window.localStorage.setItem(KEY, String(list.length));
      } catch { /* ignore */ }
    }).catch(() => {});
  }, []);

  const removeItem = async (id: number) => {
    await fetch(`${API}/api/household/items/${id}`, { method: "DELETE" });
    setItems((list) => list.filter((it) => it.id !== id));
  };

  return (
    <AppShell active="archive">
      <div className={`scan-page${lang === "zh" ? " lang-zh" : ""}`} data-tour="archive">
        <header className="page-head page-head--archive">
          <h1>{lang === "zh" ? "家庭档案" : "Household archive"}</h1>
          <p>{lang === "zh" ? "全家化学品台账 · 一眼看清风险分布" : "Your home chemical inventory at a glance."}</p>
          {diff !== null && diff !== 0 && (
            <p className="archive-diff">
              {lang === "zh"
                ? (diff > 0 ? `相比上次查看，新增 ${diff} 件` : `相比上次查看，减少 ${-diff} 件`)
                : (diff > 0 ? `${diff} new since last visit` : `${-diff} removed since last visit`)}
            </p>
          )}
        </header>
        <ProfileSheet />

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
