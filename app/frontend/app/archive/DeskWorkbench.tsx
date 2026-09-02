"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HOME_COPY, SCAN_COPY, useLang } from "../i18n";
import ReportPanel, { type Report } from "../scan/report";
import ArchiveCenter, { type ArchiveItem } from "./ArchiveCenter";
import CrossAlertHero, { pairIdsFromCross } from "./CrossAlertHero";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

const RISK_ZH: Record<string, string> = { unknown: "未知", low: "低危", medium: "中危", high: "高危", critical: "危急" };
const RISK_EN: Record<string, string> = { unknown: "?", low: "LOW", medium: "MED", high: "HIGH", critical: "CRIT" };

export default function DeskWorkbench() {
  const { lang, setLang } = useLang();
  const t = SCAN_COPY[lang];
  const hn = HOME_COPY[lang];
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const autoOnce = useRef(false);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/household/items`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/household/report`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);

  useEffect(() => {
    if (!loaded || autoOnce.current || items.length === 0) return;
    autoOnce.current = true;
    void generate();
  }, [loaded, items.length, generate]);

  const removeItem = async (id: number) => {
    await fetch(`${API}/api/household/items/${id}`, { method: "DELETE" });
    setItems((list) => list.filter((it) => it.id !== id));
  };

  const overall = report?.overall_risk || "unknown";
  const riskLabel = lang === "zh" ? RISK_ZH : RISK_EN;
  const pairIds = pairIdsFromCross(report?.cross_risks);

  return (
    <div className={`desk-root${lang === "zh" ? " lang-zh" : ""}`}>
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
        <div className="nav-links">
          <a href="/">{hn.navIndex}</a>
          <a href="/scan">{hn.navScan}</a>
          <a href="/archive">{lang === "zh" ? "档案工作台" : "Archive desk"}</a>
        </div>
        <div className="nav-right">
          <span className={`desk-risk-badge risk-bg-${overall}`}>{t.deskRisk} {riskLabel[overall] ?? overall}</span>
          <button className="desk-tool-btn" onClick={() => void generate()} disabled={busy || items.length === 0}>
            {busy ? t.genReportBusy : t.refreshReport}
          </button>
          <button className="desk-tool-btn ghost" onClick={() => window.print()} disabled={!report}>{t.printReport}</button>
          <button className="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>{lang === "zh" ? "EN" : "中文"}</button>
        </div>
      </nav>

      <div className="desk-bench">
        <CrossAlertHero items={items} cross={report?.cross_risks} api={API} pending={busy && !report} />
        <div className="desk-split">
          <aside className="desk-left">
            <ArchiveCenter items={items} onRemove={removeItem} api={API} variant="desk" pairIds={pairIds} />
          </aside>
          <section className="desk-right">
            <ReportPanel
              nItems={items.length}
              variant="desk"
              report={report}
              onGenerate={() => void generate()}
              busy={busy}
              error={error}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
