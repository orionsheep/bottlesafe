"use client";

// 方向② 全屋评估报告 + 方向④ 长期档案时间线
// 报告 = 本地确定性分析（雷达/交叉风险）+ LLM 叙事；打印即 PDF。

import { useEffect, useState } from "react";
import { SCAN_COPY, useLang } from "../i18n";
import "./report-extra.css";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

type Disposal = {
  hazardous_count: number;
  hazardous_items: { id: number; name: string; category: string; route: string }[];
  no_drain_items: { id: number; name: string }[];
  eco_tips: string[];
  green_note: string;
};
export type Report = {
  overall_risk: string; overall_text: string; n_items: number;
  risk_count: Record<string, number>;
  radar: { dim: string; value: number }[];
  high_items: { id: number; name: string; risk_level: string; why: string }[];
  cross_risks: { a: string; b: string; reason: string; severity: string; source?: string }[];
  overview: string; top_actions: string[]; quick_wins: string[]; reassure: string;
  prev_risk: string | null;
  disposal?: Disposal;
  disclaimer?: string;
  ingredient_groups?: { key: string; label: string; count: number; items: { id: number; name: string }[]; hook: string }[];
  suggestions?: { kind: string; title: string; detail: string; action: string }[];
};
type Timeline = {
  checkins: { id: number; created_at: string; overall_risk: string; item_count: number; trend: string | null; n_pairs: number | null; item_delta: number | null }[];
  reminders: string[];
  n_items: number;
};

/** 家庭档案物品（仅取对比卡需要的字段）。导出给电脑端混用页复用。 */
export type HouseItem = {
  id: number;
  observed_name?: string;
  analysis?: {
    product?: { name?: string | null; category?: string | null };
    ingredients?: { name?: string }[];
    risk_level?: string;
  };
};

const RISK_LABEL_EN: Record<string, string> = { unknown: "?", low: "LOW", medium: "MED", high: "HIGH", critical: "CRIT" };
const RISK_LABEL_ZH: Record<string, string> = { unknown: "未知", low: "低危", medium: "中危", high: "高危", critical: "危急" };

export default function ReportPanel({
  nItems,
  variant = "phone",
  report: controlled,
  onGenerate,
  busy: busyProp,
  error: errorProp,
  defaultOpen = false,
}: {
  nItems: number;
  variant?: "phone" | "desk";
  report?: Report | null;
  onGenerate?: () => void;
  busy?: boolean;
  error?: string | null;
  /** 独立报告页用：详情折叠默认展开 */
  defaultOpen?: boolean;
}) {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const RISK_LABEL = lang === "zh" ? RISK_LABEL_ZH : RISK_LABEL_EN;
  const [inner, setInner] = useState<Report | null>(null);
  const [innerBusy, setInnerBusy] = useState(false);
  const [innerError, setInnerError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [houseItems, setHouseItems] = useState<HouseItem[]>([]);
  const controlledMode = controlled !== undefined;
  const report = controlledMode ? controlled ?? null : inner;
  const busy = controlledMode ? !!busyProp : innerBusy;
  const error = controlledMode ? errorProp ?? null : innerError;
  const desk = variant === "desk";

  const loadTimeline = () => {
    fetch(`${API}/api/household/timeline`).then((r) => r.json()).then(setTimeline).catch(() => {});
  };
  useEffect(loadTimeline, [report]);

  // 对比卡需要品名以外的成分线索：拉一次档案，按名字匹配 cross_risks 的 a/b
  useEffect(() => {
    fetch(`${API}/api/household/items`).then((r) => r.json()).then((d) => setHouseItems(d.items ?? [])).catch(() => {});
  }, []);

  const generate = async () => {
    if (onGenerate) { onGenerate(); return; }
    setInnerBusy(true); setInnerError(null);
    try {
      const res = await fetch(`${API}/api/household/report`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setInner(data);
    } catch (e) {
      setInnerError(e instanceof Error ? e.message : String(e));
    } finally { setInnerBusy(false); }
  };

  const riskOrder: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const trend = report && report.prev_risk != null
    ? ((riskOrder[report.overall_risk] ?? 0) - (riskOrder[report.prev_risk] ?? 0))
    : null;
  const trendLabel = trend == null ? t.firstCheck : trend < 0 ? t.improved : trend > 0 ? t.worsened : t.unchanged;

  return (
    <>
      {/* ---------- 全屋报告 ---------- */}
      <section className={`report-section${desk ? " is-desk" : ""}`}>
        {!desk && <h2>{t.reportTitle}</h2>}
        {!desk && <p className="assistant-hint">{t.reportHint}</p>}

        {!desk && (
          <button className="gen-report-btn" onClick={() => void generate()} disabled={busy || nItems === 0}>
            {busy ? t.genReportBusy : nItems === 0 ? t.emptyArchiveReport : t.genReport}
          </button>
        )}
        {error && <p className="scan-error">⚠ {error}</p>}
        {desk && !report && (
          <p className="assistant-hint">{nItems === 0 ? t.emptyArchiveReport : t.genReportBusy}</p>
        )}

        {report && (
          <div className={`report-card risk-border-${report.overall_risk}`}>
            {/* 简报头：一两行 + 点开详情 */}
            <header className="report-head">
              <div>
                <span className="section-no">{t.overallRisk}</span>
                <b className={`overall-badge risk-${report.overall_risk}`}>{RISK_LABEL[report.overall_risk] ?? report.overall_risk}</b>
                <p className="overall-text">{report.overall_text}</p>
              </div>
              {!desk && <button className="print-btn" onClick={() => window.print()}>🖨 {t.printReport}</button>}
            </header>

            {report.prev_risk != null && (
              <p className={`trend-line ${trend != null && trend > 0 ? "bad" : "good"}`}>{trendLabel}</p>
            )}

            <p className="report-overview">{report.overview}</p>

            {/* 关键数字简报条（对齐成分说清楚三指标头卡） */}
            <div className="brief-stats">
              <div className="brief-stat"><b>{report.n_items}</b><span>{lang === "zh" ? "已分析" : "Scanned"}</span></div>
              <div className="brief-stat"><b>{report.risk_count.high + report.risk_count.critical}</b><span>{lang === "zh" ? "需关注" : "Flagged"}</span></div>
              <div className="brief-stat"><b>{report.cross_risks.length}</b><span>{lang === "zh" ? "混用组合" : "Mix pairs"}</span></div>
            </div>

            {!desk && report.cross_risks.some((c) => c.severity === "critical" || c.severity === "high") && (
              <div className="cross-alert-banner">
                <span className="cross-alert-icon">☣</span>
                <div>
                  <b>{t.crossTitle}</b>
                  <p>{report.cross_risks.filter((c) => c.severity === "critical" || c.severity === "high").map((c) => `${c.a} ✕ ${c.b}`).join("；")}</p>
                </div>
              </div>
            )}

            {/* 详情折叠：点开看完整报告 */}
            <details className="report-detail-fold" open={defaultOpen || undefined}>
              <summary className="report-detail-toggle">
                {lang === "zh" ? "查看详细报告" : "View full report"}
                <span className="toggle-arrow">↓</span>
              </summary>
              <div className="report-detail-body">
            <div className="report-grid">
              <div className="report-side">
                <div className="radar-box">
                  <h4>{t.radarTitle}</h4>
                  <RadarChart dims={report.radar} />
                </div>
                {report.high_items.length > 0 && (
                  <ul className="high-list">{report.high_items.map((h) => (
                    <li key={h.id}><b className={`risk-dot risk-${h.risk_level}`}>●</b> #{h.id} {h.name}<small>{h.why}</small></li>
                  ))}</ul>
                )}

                {/* 家庭高频关注项（成分跨产品聚合） */}
                {report.ingredient_groups && report.ingredient_groups.length > 0 && (
                  <div className="ing-groups">
                    <h4>{lang === "zh" ? "家庭高频关注项" : "Top concern groups"}</h4>
                    {report.ingredient_groups.map((g) => (
                      <details key={g.key} className="ing-group">
                        <summary>
                          <b>{g.label}</b>
                          <span className="ing-count">{g.count} {lang === "zh" ? "件" : "items"}</span>
                        </summary>
                        <p className="ing-hook">{g.hook}</p>
                        <p className="ing-items">{lang === "zh" ? "涉及：" : "In: "}{g.items.map((i) => `#${i.id} ${i.name}`).join("、")}</p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
              <div className="cross-box">
                <h4>{t.crossTitle}{report.cross_risks.length > 0 ? ` · ${report.cross_risks.length}` : ""}</h4>
                {report.cross_risks.length === 0 ? <p className="cross-empty">✓ {t.noCross}</p> : (
                  <div className="xc-list">{report.cross_risks.map((c, i) => (
                    <CrossCompareCard key={i} c={c} items={houseItems} lang={lang} />
                  ))}</div>
                )}
              </div>
            </div>

            {/* 优化建议行动清单（采纳开关） */}
            {report.suggestions && report.suggestions.length > 0 && (
              <div className="suggest-block">
                <h4>{lang === "zh" ? "优化建议（勾选采纳）" : "Suggested actions (check to adopt)"}</h4>
                {report.suggestions.map((s, i) => (
                  <label key={i} className={`suggest-item kind-${s.kind}`}>
                    <input type="checkbox" className="suggest-check" />
                    <span className="suggest-body">
                      <b>{s.title}</b>
                      {s.detail && <p>{s.detail}</p>}
                      <p className="suggest-action">→ {s.action}</p>
                    </span>
                  </label>
                ))}
                <button className="suggest-cta" onClick={() => alert(lang === "zh" ? "已生成你的改进方案（采纳项已记录到本地）。下次购物前记得回来核对档案。" : "Plan adopted locally.")}>
                  {lang === "zh" ? "领取改进方案" : "Get my plan"}
                </button>
              </div>
            )}

            <div className="report-actions">
              <div><h4>{t.actionsTitle}</h4><ol>{report.top_actions.map((a, i) => <li key={i}>{a}</li>)}</ol></div>
              {report.quick_wins.length > 0 && (
                <div><h4>{t.winsTitle}</h4><ul>{report.quick_wins.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
              )}
            </div>

            {report.disposal && (
              <div className="disposal-summary">
                <h4>♻ {t.disposalSectionTitle}</h4>
                <p className="green-note">{report.disposal.green_note}</p>
                {report.disposal.hazardous_items.length > 0 && (
                  <div className="disposal-group is-hazard">
                    <b>{t.disposalHazardList}（{report.disposal.hazardous_count}）</b>
                    <ul>{report.disposal.hazardous_items.map((h) => (
                      <li key={h.id}>#{h.id} {h.name} <small>{h.category} — {h.route}</small></li>
                    ))}</ul>
                  </div>
                )}
                {report.disposal.no_drain_items.length > 0 && (
                  <div className="disposal-group is-nodrain">
                    <b>❌ {t.disposalNoDrain}</b>
                    <p>{report.disposal.no_drain_items.map((n) => `#${n.id} ${n.name}`).join("、")}</p>
                  </div>
                )}
                {report.disposal.eco_tips.length > 0 && (
                  <div className="disposal-group is-eco">
                    <b>🌱 {t.disposalEcoTips}</b>
                    <ul>{report.disposal.eco_tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
                  </div>
                )}
                {report.disposal.hazardous_count === 0 && report.disposal.no_drain_items.length === 0 && (
                  <p className="disposal-none">✓ {t.disposalNone}</p>
                )}
              </div>
            )}

            {report.reassure && <p className="reassure">💛 {t.reassureLabel}：{report.reassure}</p>}
            <footer className="report-footer">{report.disclaimer || t.disclaimer}</footer>
              </div>
            </details>
          </div>
        )}
      </section>

      {/* ---------- 长期档案时间线 ---------- */}
      <section className={`timeline-section${desk ? " is-desk" : ""}`}>
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
                <span className="tl-date">
                  {c.created_at.slice(0, 10)}
                  <em className="tl-time">{c.created_at.slice(11, 16)}</em>
                </span>
                {c.n_pairs != null && (
                  <span className="tl-pairs">{lang === "zh" ? `混用风险 ${c.n_pairs} 组` : `${c.n_pairs} mix pairs`}</span>
                )}
                <span className="tl-count">
                  {c.item_count} {t.tlItems}
                  {c.item_delta != null && c.item_delta !== 0 && (
                    <i className={`tl-delta ${c.item_delta > 0 ? "up" : "down"}`}>
                      {c.item_delta > 0 ? `+${c.item_delta}` : c.item_delta}
                    </i>
                  )}
                </span>
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

/* 双瓶对比卡（五件套文案结构，对齐「成分说清楚」）：
   两瓶并列 → 为什么被识别为组合关注 → 可能发生什么 → 两条行动卡 → 保守声明 + 依据。
   导出给电脑端混用页（app/mix/page.tsx）复用。 */
export function CrossCompareCard({
  c,
  items,
  lang,
}: {
  c: { a: string; b: string; reason: string; severity: string; source?: string };
  items: HouseItem[];
  lang: "zh" | "en";
}) {
  // 按品名在档案里找对应物品，拿到品类标签与识别到的成分；找不到就只显示名字
  const find = (name: string): HouseItem | undefined =>
    items.find((it) => {
      const n = it.observed_name || it.analysis?.product?.name || "";
      return !!n && (n.includes(name) || name.includes(n));
    });

  const bottle = (name: string) => {
    const it = find(name);
    const category = it?.analysis?.product?.category || null;
    const detected = (it?.analysis?.ingredients ?? [])
      .map((g) => g.name)
      .filter(Boolean)
      .slice(0, 2)
      .join("、");
    return (
      <div className="xc-bottle">
        <b className="xc-bottle-name">{name}</b>
        {category && <span className="xc-bottle-tag">{category}</span>}
        {detected && (
          <small className="xc-bottle-detected">
            {lang === "zh" ? `识别到：${detected}` : `Detected: ${detected}`}
          </small>
        )}
      </div>
    );
  };

  const sentences = (c.reason.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [c.reason]).map((s) => s.trim()).filter(Boolean);
  const [whyText, mechText] = sentences.length >= 2
    ? [sentences[0], sentences.slice(1).join("")]
    : [c.reason, null];
  const isAI = c.source === "llm";

  return (
    <div className={`xc-card sev-${c.severity}`}>
      <div className="xc-head">
        <span className={`cross-sev-tag sev-tag-${c.severity}`}>
          {c.severity === "critical" ? "☣ 危急" : c.severity === "high" ? "⚠ 高危" : "注意"}
        </span>
        {isAI ? (
          <span
            className="xc-rule-badge"
            style={{ background: "rgba(217,119,6,.14)", color: "#b45309", borderColor: "rgba(217,119,6,.45)" }}
          >
            {lang === "zh" ? "AI推测" : "AI guess"}
          </span>
        ) : (
          <span className="xc-rule-badge">{lang === "zh" ? "基于规则库" : "Rule-based"}</span>
        )}
      </div>

      {/* 1. 两瓶并列 */}
      <div className="xc-duo">
        {bottle(c.a)}
        <span className="xc-coexist" aria-hidden="true">
          {(lang === "zh" ? "同时存在" : "CO-FOUND").split("").map((ch, i) => <i key={i}>{ch}</i>)}
        </span>
        {bottle(c.b)}
      </div>

      {/* 2. 为什么被识别为组合关注（+ 3. 可能发生什么） */}
      <div className="xc-why">
        <h5>{lang === "zh" ? "为什么被识别为组合关注" : "Why flagged as a pair"}</h5>
        <p>{whyText}</p>
        {mechText && (
          <>
            <h5>{lang === "zh" ? "可能发生什么" : "What could happen"}</h5>
            <p>{mechText}</p>
          </>
        )}
      </div>

      {/* 4. 两条行动卡 */}
      <div className="xc-actions">
        <div className="xc-action">
          <b>{lang === "zh" ? "避免混用" : "Never mix"}</b>
          <p>{lang === "zh"
            ? "刷马桶时只用其中一种，用完充分冲水并通风后再考虑另一种。"
            : "Use only one at a time; flush and ventilate well before considering the other."}</p>
        </div>
        <div className="xc-action">
          <b>{lang === "zh" ? "分开存放" : "Store apart"}</b>
          <p>{lang === "zh"
            ? "建议分开存放，不要一起放在同一个角落。"
            : "Store them separately — not side by side in the same corner."}</p>
        </div>
      </div>

      {/* 5. 保守性诚实声明 + 依据 */}
      {isAI && (
        <p className="xc-source" style={{ color: "#b45309" }}>{lang === "zh"
          ? "此组合由 AI 推断，非规则库结论，请以产品标签为准"
          : "This pair was inferred by AI, not from the rule base — follow the product labels."}</p>
      )}
      <p className="xc-honest">{lang === "zh"
        ? "本条按产品类型作出的保守提示，具体成分以产品标签为准；若其中一款明确标注为不适用配方，可忽略此项。"
        : "A conservative, product-type–level hint; check the actual labels. If either product is explicitly labeled as an incompatible-formula-free version, you may ignore this."}</p>
      <p className="xc-source">{isAI
        ? (lang === "zh" ? "依据：AI 推断（非规则库）" : "Basis: AI inference (not rule-based)")
        : (lang === "zh"
          ? "依据：产品安全技术说明书（SDS）与规则库"
          : "Basis: product Safety Data Sheets (SDS) and the rule base")}</p>
    </div>
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
    <svg viewBox="-45 0 350 240" className="radar-svg" role="img">
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
