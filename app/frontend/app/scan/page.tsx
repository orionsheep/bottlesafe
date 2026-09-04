"use client";

import { useEffect, useRef, useState } from "react";
import { useLang, SCAN_COPY, HOME_COPY } from "../i18n";
import AssistantFab from "./AssistantFab";
import ReportPanel from "./report";
import FeedbackBar from "./FeedbackBar";
import ProfileSheet from "../m/ProfileSheet";
import { loadProfile, loadStorage, toApiContext, profileHints, RISK_BAND, riskScore, scoreNote, type RiskBand } from "../profile";
import "./result-extra.css";

// 开发环境直连本地后端；生产环境走同源反代（nginx 把 /api、/uploads 转到 8000）。
const API = "";

type Hazard = { type: string; severity: string; evidence: string; confidence: number };
type Ingredient = { name: string; source: string; confidence: number };
type Analysis = {
  product: { name?: string | null; brand?: string | null; category?: string | null; barcode?: string | null; manufacturer?: string | null };
  visual_evidence: string[];
  hazards: Hazard[];
  ingredients: Ingredient[];
  signal_words: string[];
  safe_storage: string[];
  do_not_mix_with: string[];
  first_aid: { ingestion?: string | null; inhalation?: string | null; eye_contact?: string | null; skin_contact?: string | null };
  uncertainties: string[];
  needs_more_images: string[];
  risk_level: string;
  summary: string;
};
type AnalyzeResponse = { analysis: Analysis; database_match: { id: number; [k: string]: unknown } | null; image_path: string;
  rules?: { risk_level: string; findings: { rule_id: string; severity: string; title: string; reason: string; action: string }[]; ingredient_labels: string[] };
  evidence?: Evidence[];
  expiring_standards?: Evidence[];
  cross_risks?: { a: string; b: string; reason: string; severity: string }[];
  dimension_scores?: { key: string; label: string; score: number; polarity: string }[];
  coverage?: { matched: number; total: number; note?: string };
  ingredient_warnings?: { name: string; tag?: string; text: string; severity: string }[];
};
type Evidence = { id: string; title: string; standard_no?: string | null; source_level?: string; source_level_label?: string; clause?: string; effective_from?: string | null; effective_to?: string | null; next_effective_from?: string | null; url?: string | null; summary?: string; note?: string | null };
type HouseholdItem = { id: number; [k: string]: unknown };

const riskLabel: Record<string, string> = {
  unknown: "UNKNOWN", low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL",
};
const riskLabelZh: Record<string, string> = {
  unknown: "暂无法判断", low: "低风险", medium: "需要注意", high: "高风险", critical: "严重风险",
};
const levelColor: Record<string, string> = {
  unknown: "#8d938f", low: "#2f8f70", medium: "#c8842f", high: "#c0503f", critical: "#1d211f",
};
const SEV_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
const WARN_TITLE: Record<string, { zh: string; en: string }> = {
  critical: { zh: "严重成分警示", en: "Critical ingredient warnings" },
  high: { zh: "高风险成分警示", en: "High-risk ingredient warnings" },
  medium: { zh: "成分注意提示", en: "Ingredient cautions" },
  low: { zh: "成分温和提示", en: "Ingredient notes" },
  腐蚀: { zh: "腐蚀性警示", en: "Corrosion warning" },
};

export default function ScanPage() {
  const { lang, setLang } = useLang();
  const t = SCAN_COPY[lang];
  const hn = HOME_COPY[lang];
  const [status, setStatus] = useState<{ status: string; detail: string }>({ status: "checking", detail: "连接后端…" });
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [items, setItems] = useState<HouseholdItem[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [step, setStep] = useState<number | null>(null); // 分析四步进度：当前进行中的步骤序号（4=全部完成），null=空闲
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/status`);
        const data = await res.json();
        setStatus(data);
        if (data.status === "ready") window.clearInterval(timer);
      } catch {
        setStatus({ status: "offline", detail: "后端未启动（应运行在 127.0.0.1:8000）" });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/household/items`).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {});
  }, [saved]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setSaved(false);
    setPreview(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setStep(0);
    // 纯前端 staged 进度：0s/1.2s/2.8s/5s 逐步推进，API 返回后统一收尾
    timersRef.current = [1200, 2800, 5000].map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("context", JSON.stringify(toApiContext(loadProfile(), loadStorage())));
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: form, signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `请求失败（${res.status}）`);
      setStep(4);
      setResult(data);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      abortRef.current = null;
      setStep(null);
      setBusy(false);
    }
  };

  const cancelAnalyze = () => {
    abortRef.current?.abort(); // finally 里统一清理计时器与状态，取消本身不报错
  };

  const saveToHousehold = async () => {
    if (!result) return;
    const res = await fetch(`${API}/api/household/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: result.analysis, image_path: result.image_path }),
    });
    if (res.ok) setSaved(true);
  };

  const a = result?.analysis;
  const score = riskScore(a?.risk_level);
  const ringColor = levelColor[a?.risk_level ?? "unknown"] ?? levelColor.unknown;
  const RING_C = 2 * Math.PI * 46;
  const warnings = result?.ingredient_warnings ?? [];
  const topWarnSev = warnings.reduce((top, w) => ((SEV_RANK[w.severity] ?? 0) > (SEV_RANK[top] ?? 0) ? w.severity : top), warnings[0]?.severity ?? "low");
  const warnTitle = warnings.length > 0 ? (WARN_TITLE[topWarnSev] ?? { zh: `${topWarnSev}警示`, en: `${topWarnSev} warning` }) : null;
  const ANALYZE_STEPS = lang === "zh"
    ? ["识别商品", "提取成分信息", "成分安全分析", "综合评估"]
    : ["Identify product", "Extract ingredients", "Safety analysis", "Overall assessment"];
  const stepStateText = {
    wait: lang === "zh" ? "等待中" : "Waiting",
    active: lang === "zh" ? "进行中" : "In progress",
    done: lang === "zh" ? "完成" : "Done",
  };
  const statusText = lang === "zh" ? status.detail : (t.status[status.status] ?? status.detail);
  const errorText = error
    ? (lang === "zh" ? error : error.replace("识别结果未通过结构校验：", "Recognition failed schema validation: ").replace("不支持的图片格式", "Unsupported image format"))
    : null;

  return (
    <main className={`scan-page${lang === "zh" ? " lang-zh" : ""}`}>
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/"><span className="brand-mark"><img src="/mascot.png" alt="" width={30} height={30} style={{ borderRadius: "50%", display: "block" }} /></span><span>HOME<br />HAZARD</span></a>
        <div className="nav-links"><a href="/">{hn.navIndex}</a><a href="/scan">{hn.navScan}</a><a href="/archive">{lang === "zh" ? "档案工作台" : "Archive desk"}</a></div>
        <div className="nav-right">
          <button className="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label="Switch language">{lang === "zh" ? "EN" : "中文"}</button>
          <a className="menu" href="/"><span />{t.back}</a>
        </div>
      </nav>

      <header className="scan-top">
        <div>
          <p className="section-no">{t.headNo}</p>
          <h1>{t.h1a} <i>{t.h1b}</i></h1>
        </div>
        <p className={`scan-status status-${status.status}`}>
          MODEL / {status.status.toUpperCase()} — {statusText}
        </p>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 5vw" }}>
        <ProfileSheet compact />
      </div>

      <section className="scan-workbench">
        <div className="scan-upload">
          <button className="drop-zone" onClick={() => inputRef.current?.click()} aria-label={lang === "zh" ? "选择图片" : "Choose image"}>
            {preview ? <img src={preview} alt="待识别图片预览" /> : <span>{t.dropHint[0]}<br />{t.dropHint[1]}</span>}
          </button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="sample-row">
            <span className="sample-label">{t.samplesTitle}</span>
            <div className="sample-btns">
              {["samples/bleach.jpg", "samples/toilet.jpg", "samples/goods.jpg"].map((src, i) => (
                <button
                  key={src}
                  className="sample-btn"
                  disabled={busy || status.status !== "ready"}
                  onClick={async () => {
                    try {
                      const r = await fetch(src);
                      const b = await r.blob();
                      pick(new File([b], src.split("/").pop() as string, { type: "image/jpeg" }));
                    } catch { /* sample fetch failed, ignore */ }
                  }}
                >
                  {t.samples[i]}
                </button>
              ))}
            </div>
            <span className="sample-hint">{t.samplesHint}</span>
          </div>
          <div className="sample-row">
            <span className="sample-label">{t.samplesExpandTitle}</span>
            <div className="sample-btns">
              {["samples/toy.jpg", "samples/paint.jpg", "samples/mothballs.jpg", "samples/rice.jpg"].map((src, i) => (
                <button
                  key={src}
                  className="sample-btn"
                  disabled={busy || status.status !== "ready"}
                  onClick={async () => {
                    try {
                      const r = await fetch(src);
                      const b = await r.blob();
                      pick(new File([b], src.split("/").pop() as string, { type: "image/jpeg" }));
                    } catch { /* sample fetch failed, ignore */ }
                  }}
                >
                  {t.samplesExpand[i]}
                </button>
              ))}
            </div>
          </div>
          <div className="scan-actions">
            <button className="analyze-btn" onClick={analyze} disabled={!file || busy || status.status !== "ready"}>
              {busy ? t.busy : status.status === "ready" ? t.analyze : t.waiting}
            </button>
            {result && <button className="save-btn" onClick={saveToHousehold} disabled={saved}>{saved ? t.saved : t.save}</button>}
          </div>
          {errorText && <p className="scan-error">⚠ {errorText}</p>}
        </div>

        {busy && (
          <div className="analyzing-panel">
            <div className="analyzing-top">
              {preview && <img className="analyzing-thumb" src={preview} alt={lang === "zh" ? "待识别图片缩略图" : "scan thumbnail"} />}
              <span className="analyzing-chip">{lang === "zh" ? "品类识别中" : "Identifying category"}</span>
              <button type="button" className="analyzing-cancel" onClick={cancelAnalyze}>{lang === "zh" ? "取消分析" : "Cancel"}</button>
            </div>
            <ol className="analyzing-steps">
              {ANALYZE_STEPS.map((label, i) => {
                const state = step !== null && i < step ? "done" : step === i ? "active" : "wait";
                return (
                  <li key={label} className={`ana-step ${state}`}>
                    <span className="ana-ico">{state === "done" ? "✓" : ""}</span>
                    {label}
                    <span className="ana-state">{stepStateText[state]}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {!a && !busy && (
          <div className="scan-placeholder">
            <p className="section-no">{t.placeholderNo}</p>
            <h3>{t.placeholderTitle}</h3>
            <ul>
              {t.placeholderList.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p>{t.placeholderModel}</p>
          </div>
        )}

        {a && (
          <div className="scan-result">
            <div className="score-hero">
              <div className="score-ring" role="img" aria-label={`${lang === "zh" ? "安全评分" : "Safety score"} ${score}/100`}>
                <svg viewBox="0 0 104 104">
                  <circle className="ring-bg" cx="52" cy="52" r="46" />
                  <circle className="ring-fg" cx="52" cy="52" r="46" stroke={ringColor} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - score / 100)} />
                </svg>
                <div className="score-ring-center">
                  <b style={{ color: ringColor }}>{score}</b>
                  <span>{lang === "zh" ? "/100分" : "/100"}</span>
                </div>
              </div>
              <div className="score-side">
                <span className="risk-band" style={{ background: RISK_BAND[(a.risk_level as RiskBand) ?? "unknown"]?.bg, color: RISK_BAND[(a.risk_level as RiskBand) ?? "unknown"]?.color }}>
                  {RISK_BAND[(a.risk_level as RiskBand) ?? "unknown"]?.[lang]}
                </span>
                {result?.coverage?.note && <p className="coverage-note">{result.coverage.note}</p>}
              </div>
            </div>
            {result?.dimension_scores && result.dimension_scores.length > 0 && (
              <div className="dim-block">
                <p className="dim-caption">{lang === "zh" ? "六维安全评分" : "Dimension scores"}</p>
                <ul className="dim-list">
                  {result.dimension_scores.map((d) => (
                    <li key={d.key} className="dim-row">
                      <span className="dim-label">{d.label}</span>
                      <span className="dim-track">
                        <span className={`dim-fill ${d.polarity === "risk" ? "risk" : "safe"}`} style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }} />
                      </span>
                      <span className="dim-score">{d.score}</span>
                    </li>
                  ))}
                </ul>
                <p className="dim-hint">{lang === "zh" ? "珊瑚色为风险维度（分越高越危险），绿色为安全维度（分越高越好）。" : "Coral = risk (higher is worse), green = safety (higher is better)."}</p>
              </div>
            )}
            <p className="score-note">{scoreNote(lang)}</p>
            {a.risk_level === "unknown" && (
              <p className="unknown-note">{lang === "zh" ? "信息不足 ≠ 安全。请补拍瓶身标签与成分表。" : "Not enough info — not the same as safe. Please re-photograph the label."}</p>
            )}
            <p className="confidence-note">{lang === "zh" ? "本结论基于包装识别与结构校验，非实验室成分检测。" : "Based on packaging recognition and schema validation — not a lab test."}</p>
            {profileHints(a, loadProfile(), lang).map((hint) => (
              <p key={hint} className="profile-hint"><span className="hint-badge">{lang === "zh" ? "规则命中" : "Rule-based"}</span>{hint}</p>
            ))}
            <h2>{a.product.name ?? t.unnamedProduct}</h2>
            <p className="result-meta">
              {[a.product.brand, a.product.category, a.product.barcode].filter(Boolean).join(" · ") || t.noLabel}
            </p>
            <p className="result-summary">{a.summary}</p>

            {warnings.length > 0 && warnTitle && (
              <div className={`result-block${(SEV_RANK[topWarnSev] ?? 0) >= 2 ? " block-danger" : ""}`}>
                <h3>{warnTitle[lang]}</h3>
                <ol className="warn-list">
                  {warnings.map((w, i) => (
                    <li key={i} className="warn-item">
                      <span><b>{w.name}{w.tag ? `（${w.tag}）` : ""}</b> <span className="warn-text">{w.text}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {a.hazards.length > 0 && (
              <div className="result-block">
                <h3>{t.hazards}</h3>
                {a.hazards.map((h, i) => (
                  <p key={i}><b className={`sev sev-${h.severity}`}>{h.severity.toUpperCase()}</b> {h.type} — {h.evidence} <i>({Math.round(h.confidence * 100)}%)</i></p>
                ))}
              </div>
            )}

            {a.ingredients.length > 0 && (
              <div className="result-block">
                <h3>{t.ingredients}</h3>
                <p>{a.ingredients.map((g) => `${g.name}（${g.source}）`).join("、")}</p>
              </div>
            )}

            {a.signal_words.length > 0 && (
              <div className="result-block"><h3>{t.signalWords}</h3><p>{a.signal_words.join("、")}</p></div>
            )}

            <div className="result-grid">
              {a.safe_storage.length > 0 && (
                <div className="result-block"><h3>{t.safeStorage}</h3><ul>{a.safe_storage.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              )}
              {a.do_not_mix_with.length > 0 && (
                <div className="result-block"><h3>{t.doNotMix}</h3><ul>{a.do_not_mix_with.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              )}
            </div>

            {(a.first_aid.ingestion || a.first_aid.inhalation || a.first_aid.eye_contact || a.first_aid.skin_contact) && (
              <div className="result-block">
                <h3>{t.firstAidTitle}</h3>
                <ul>
                  {a.first_aid.ingestion && <li>{t.faIngestion}：{a.first_aid.ingestion}</li>}
                  {a.first_aid.inhalation && <li>{t.faInhalation}：{a.first_aid.inhalation}</li>}
                  {a.first_aid.eye_contact && <li>{t.faEye}：{a.first_aid.eye_contact}</li>}
                  {a.first_aid.skin_contact && <li>{t.faSkin}：{a.first_aid.skin_contact}</li>}
                </ul>
              </div>
            )}

            {a.uncertainties.length > 0 && (
              <div className="result-block"><h3>{t.uncertainties}</h3><ul>{a.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            )}
            {a.needs_more_images.length > 0 && (
              <div className="result-block"><h3>{t.moreImages}</h3><ul>{a.needs_more_images.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            )}

            {result?.database_match && (
              <p className="db-match">{t.dbMatch} #{String(result.database_match.id)}</p>
            )}

            {/* 规则引擎判定 + 依据抽屉 */}
            {result?.rules && (
              <div className="rules-block">
                <h3>{lang === "zh" ? "规则引擎判定" : "Rule engine verdict"}</h3>
                <p className="rules-meta">
                  {lang === "zh"
                    ? `命中规则 ${result.rules.findings.length} 条 · 成分标签 ${result.rules.ingredient_labels.length > 0 ? result.rules.ingredient_labels.join("、") : "无"} · 风险等级由规则引擎兜底（非大模型推测）`
                    : `${result.rules.findings.length} rule(s) · labels: ${result.rules.ingredient_labels.join(", ") || "none"} · risk level ruled by engine, not LLM`}
                </p>
                {result.rules.findings.map((f) => (
                  <div key={f.rule_id} className={`rule-finding sev-${f.severity}`}>
                    <b>{f.title}</b>
                    <p>{f.reason}</p>
                    <p className="rule-action">→ {f.action}</p>
                  </div>
                ))}
                {result.evidence && result.evidence.length > 0 && (
                  <button className="evidence-btn" onClick={() => setEvidenceOpen(true)}>
                    {lang === "zh" ? `查看依据（${result.evidence.length}）` : `Evidence (${result.evidence.length})`}
                  </button>
                )}
                {result.expiring_standards && result.expiring_standards.length > 0 && (
                  <p className="expiring-note">
                    {lang === "zh"
                      ? `⏳ 注意：${result.expiring_standards.map((e) => e.standard_no || e.title).join("、")} 即将换代`
                      : `⏳ Upcoming standard changes: ${result.expiring_standards.map((e) => e.standard_no || e.title).join(", ")}`}
                  </p>
                )}
              </div>
            )}

            {/* 主动混用预警弹卡 */}
            {result?.cross_risks && result.cross_risks.length > 0 && (
              <div className="mix-alert">
                <h3>{lang === "zh" ? "⚠ 主动混用预警" : "⚠ Mixing alert"}</h3>
                <p className="mix-rule-tag">{lang === "zh" ? "基于规则库判定，非大模型推测" : "Ruled by rules, not LLM"}</p>
                {result.cross_risks.slice(0, 3).map((c, i) => (
                  <div key={i} className="mix-pair">
                    <b>{c.a}</b> ✕ <b>{c.b}</b>
                    <p>{c.reason}</p>
                    <p className="mix-action">{lang === "zh" ? "→ 分开存放、绝不混用；使用后充分通风。" : "→ Keep apart. Never mix. Ventilate after use."}</p>
                  </div>
                ))}
                {result.cross_risks.length > 3 && (
                  <a className="mix-more" href="/mix">{lang === "zh" ? `查看全部 ${result.cross_risks.length} 组 →` : `See all ${result.cross_risks.length} →`}</a>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 依据抽屉 */}
      {evidenceOpen && result?.evidence && (
        <div className="evidence-drawer" onClick={() => setEvidenceOpen(false)}>
          <div className="evidence-panel" onClick={(e) => e.stopPropagation()}>
            <div className="evidence-head">
              <h3>{lang === "zh" ? "判定依据" : "Evidence"}</h3>
              <button onClick={() => setEvidenceOpen(false)} aria-label="close">✕</button>
            </div>
            {result.evidence.map((e) => (
              <div key={e.id} className="evidence-item">
                <div className="evidence-title">
                  {e.title}
                  {e.standard_no && <span className="ev-no">{e.standard_no}</span>}
                </div>
                {e.source_level_label && <span className={`ev-level ev-${e.source_level}`}>{e.source_level_label}</span>}
                {e.clause && <p className="ev-clause">{e.clause}</p>}
                {e.summary && <p className="ev-summary">{e.summary}</p>}
                {e.note && <p className="ev-note">{e.note}</p>}
                <p className="ev-dates">
                  {e.effective_from && (lang === "zh" ? `生效 ${e.effective_from}` : `from ${e.effective_from}`)}
                  {e.effective_to && (lang === "zh" ? ` 失效 ${e.effective_to}` : ` to ${e.effective_to}`)}
                  {e.next_effective_from && (lang === "zh" ? ` 换代 ${e.next_effective_from}` : ` next ${e.next_effective_from}`)}
                </p>
                {e.url && <a className="ev-url" href={e.url} target="_blank" rel="noreferrer">{lang === "zh" ? "查看原文" : "Source"}</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="scan-sub">{t.sub}</p>

      <FeedbackBar page="scan" />

      <AssistantFab />

      <ReportPanel nItems={items.length} />

      <footer><a className="brand" href="/"><span className="brand-mark"><img src="/mascot.png" alt="" width={30} height={30} style={{ borderRadius: "50%", display: "block" }} /></span><span>HOME<br />HAZARD</span></a><p>{t.footer}</p><a href="/" className="back">{hn.back}</a></footer>
    </main>
  );
}
