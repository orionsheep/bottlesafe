"use client";

// 方向② 全屋评估报告 + 方向④ 长期档案时间线
// 报告 = 本地确定性分析（雷达/交叉风险）+ LLM 叙事；打印即 PDF。

import { useEffect, useState } from "react";
import { SCAN_COPY, useLang } from "../i18n";

const API = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? "http://127.0.0.1:8000" : "";

type Report = {
  overall_risk: string; overall_text: string; n_items: number;
  risk_count: Record<string, number>;
  radar: { dim: string; value: number }[];
  high_items: { id: number; name: string; risk_level: string; why: string }[];
  cross_risks: { a: string; b: string; reason: string; severity: string }[];
  overview: string; top_actions: string[]; quick_wins: string[]; reassure: string;
  prev_risk: string | null;
};
type Timeline = {
  checkins: { id: number; created_at: string; overall_risk: string; item_count: number; trend: string | null }[];
  reminders: string[];
  n_items: number;
};

const RISK_LABEL: Record<string, string> = { unknown: "?", low: "LOW", medium: "MED", high: "HIGH", critical: "CRIT" };

export default function ReportPanel({ nItems }: { nItems: number }) {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);

  const loadTimeline = () => {
    fetch(`${API}/api/household/timeline`).then((r) => r.json()).then(setTimeline).catch(() => {});
  };
  useEffect(loadTimeline, [report]);

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/api/household/report`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const riskOrder: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const trend = report && report.prev_risk != null
    ? ((riskOrder[report.overall_risk] ?? 0) - (riskOrder[report.prev_risk] ?? 0))
    : null;
  const trendLabel = trend == null ? t.firstCheck : trend < 0 ? t.improved : trend > 0 ? t.worsened : t.unchanged;

  return (
    <>
      {/* ---------- 全屋报告 ---------- */}
      <section className="report-section">
        <p className="section-no">{t.reportNo}</p>
        <h2>{t.reportTitle}</h2>
        <p className="assistant-hint">{t.reportHint}</p>

        <button className="gen-report-btn" onClick={() => void generate()} disabled={busy || nItems === 0}>
          {busy ? t.genReportBusy : nItems === 0 ? t.emptyArchiveReport : t.genReport}
        </button>
        {error && <p className="scan-error">⚠ {error}</p>}

        {report && !busy && (
          <div className={`report-card risk-border-${report.overall_risk}`}>
            <header className="report-head">
              <div>
                <span className="section-no">{t.overallRisk}</span>
                <b className={`overall-badge risk-${report.overall_risk}`}>{RISK_LABEL[report.overall_risk] ?? report.overall_risk}</b>
                <p className="overall-text">{report.overall_text}</p>
              </div>
              <button className="print-btn" onClick={() => window.print()}>🖨 {t.printReport}</button>
            </header>

            {report.prev_risk != null && (
              <p className={`trend-line ${trend != null && trend > 0 ? "bad" : "good"}`}>{trendLabel}</p>
            )}

            <p className="report-overview">{report.overview}</p>

            <div className="report-grid">
              <div className="radar-box">
                <h4>{t.radarTitle}</h4>
                <RadarChart dims={report.radar} />
              </div>
              <div className="cross-box">
                <h4>{t.crossTitle}</h4>
                {report.cross_risks.length === 0 ? <p className="cross-empty">{t.noCross}</p> : (
                  <ul>{report.cross_risks.map((c, i) => (
                    <li key={i} className={`cross-pair sev-${c.severity}`}>
                      <b>{c.a} × {c.b}</b><span>{c.reason}</span>
                    </li>
                  ))}</ul>
                )}
              </div>
            </div>

            {report.high_items.length > 0 && (
              <ul className="high-list">{report.high_items.map((h) => (
                <li key={h.id}><b className={`risk-dot risk-${h.risk_level}`}>●</b> #{h.id} {h.name}<small>{h.why}</small></li>
              ))}</ul>
            )}

            <div className="report-actions">
              <div><h4>{t.actionsTitle}</h4><ol>{report.top_actions.map((a, i) => <li key={i}>{a}</li>)}</ol></div>
              {report.quick_wins.length > 0 && (
                <div><h4>{t.winsTitle}</h4><ul>{report.quick_wins.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
              )}
            </div>
            {report.reassure && <p className="reassure">💛 {t.reassureLabel}：{report.reassure}</p>}
            <footer className="report-footer">{report.disclaimer || t.disclaimer}</footer>
          </div>
        )}
      </section>

      {/* ---------- 长期档案时间线 ---------- */}
      <section className="timeline-section">
        <p className="section-no">{t.tlNo}</p>
        <h2>{t.tlTitle}</h2>
        {timeline && timeline.reminders.length > 0 && (
          <ul className="reminder-banner">
            {timeline.reminders.map((r, i) => <li key={i}>🔔 {r}</li>)}
          </ul>
        )}
        {!timeline || timeline.checkins.length === 0 ? (
          <p className="archive-empty">{t.tlEmpty}</p>
        ) : (
          <ul className="timeline">
            {timeline.checkins.map((c) => (
              <li key={c.id}>
                <span className={`tl-dot risk-bg-${c.overall_risk}`} />
                <b className={`risk-${c.overall_risk}`}>{RISK_LABEL[c.overall_risk] ?? c.overall_risk}</b>
                <span className="tl-date">{c.created_at.slice(0, 10)}</span>
                <span className="tl-count">{c.item_count} {t.tlItems}</span>
                {c.trend && c.trend !== "flat" && (
                  <i className={c.trend === "down" ? "tl-trend good" : "tl-trend bad"}>
                    {c.trend === "down" ? "↓ ✓" : "↑ ⚠"}
                  </i>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* 五维雷达图：纯 SVG，无第三方依赖 */
function RadarChart({ dims }: { dims: { dim: string; value: number }[] }) {
  const n = dims.length || 1;
  const max = Math.max(...dims.map((d) => d.value), 3);
  const cx = 130, cy = 120, r = 88;
  const pt = (i: number, ratio: number): [number, number] => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * ratio * Math.cos(ang), cy + r * ratio * Math.sin(ang)];
  };
  const poly = dims.map((d, i) => pt(i, Math.min(d.value / max, 1)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 260 240" className="radar-svg" role="img">
      {[0.33, 0.66, 1].map((ratio) => (
        <polygon key={ratio} points={dims.map((_, i) => pt(i, ratio).join(",")).join(" ")}
                 fill="none" stroke="rgba(16,37,29,.25)" strokeWidth="1" />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(16,37,29,.18)" />;
      })}
      <polygon points={poly} fill="rgba(240,125,99,.45)" stroke="#f07d63" strokeWidth="2" />
      {dims.map((d, i) => {
        const [x, y] = pt(i, 1.22);
        return <text key={d.dim} x={x} y={y} textAnchor="middle" fontSize="11" fill="#10251d">{d.dim}{d.value > 0 ? ` ${d.value}` : ""}</text>;
      })}
    </svg>
  );
}
