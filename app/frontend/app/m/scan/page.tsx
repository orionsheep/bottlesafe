"use client";

import { useEffect, useRef, useState } from "react";
import { useLang, SCAN_COPY } from "../../i18n";
import AppShell from "../../AppShell";
import Assistant from "../../scan/assistant";
import FeedbackBar from "../../scan/FeedbackBar";
import { pushMixSession } from "../mix/session";
import ProfileSheet from "../ProfileSheet";
import { loadProfile, loadStorage, profileHints, toApiContext, RISK_BAND, riskScore, scoreNote, type RiskBand } from "../../profile";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

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
type Disposal = { category: string; drain_safe: string; drain_safe_text: string; disposal_route: string; container: string; eco_tip: string; hazardous_waste: boolean; matched: boolean };
type AnalyzeResponse = { analysis: Analysis; database_match: { id: number; [k: string]: unknown } | null; image_path: string; disposal?: Disposal;
  rules?: { risk_level: string; findings: { rule_id: string; severity: string; title: string; reason: string; action: string }[]; ingredient_labels: string[] };
  evidence?: Evidence[];
  expiring_standards?: Evidence[];
  cross_risks?: { a: string; b: string; reason: string; severity: string }[];
};
type Evidence = { id: string; title: string; standard_no?: string | null; source_level?: string; source_level_label?: string; clause?: string; effective_from?: string | null; effective_to?: string | null; next_effective_from?: string | null; url?: string | null; summary?: string; note?: string | null };

const riskLabel: Record<string, string> = {
  unknown: "UNKNOWN", low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL",
};
const riskLabelZh: Record<string, string> = {
  unknown: "暂无法判断", low: "低风险", medium: "需要注意", high: "高风险", critical: "严重风险",
};
const levelColor: Record<string, string> = {
  unknown: "#8d938f", low: "#2f8f70", medium: "#c8842f", high: "#c0503f", critical: "#1d211f",
};

export default function MobileScanPage() {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [status, setStatus] = useState<{ status: string; detail: string }>({ status: "checking", detail: "连接后端…" });
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recentItems, setRecentItems] = useState<{ id: number; observed_name?: string; analysis?: { risk_level?: string } }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API}/api/household/items`).then((r) => r.json()).then((d) => setRecentItems(d.items ?? [])).catch(() => {});
  }, [saved]);

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

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setSaved(false);
    setPreview(URL.createObjectURL(f));
    // 同步到 file input（让 analyze 能从 inputRef 取到）
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  };

  const analyze = async () => {
    // 从 state 或 input 取文件
    const currentFile = file || inputRef.current?.files?.[0];
    if (!currentFile) return;
    setBusy(true);
    setError(null);
    try {
      // 用 FileReader 读成 ArrayBuffer，再构造 Blob 发送（避免 DataTransfer 截断）
      const buf = await currentFile.arrayBuffer();
      const blob = new Blob([buf], { type: currentFile.type || "image/jpeg" });
      const form = new FormData();
      form.append("image", blob, currentFile.name);
      form.append("context", JSON.stringify(toApiContext(loadProfile(), loadStorage())));
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `请求失败（${res.status}）`);
      setResult(data);
      pushMixSession({
        name: data.analysis?.product?.name || t.unnamedProduct,
        risk_level: data.analysis?.risk_level || "unknown",
        image_path: data.image_path,
        analysis: data.analysis,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
  const statusText = status.status === "ready"
    ? (lang === "zh" ? "已就绪，可以开始识别" : "Ready to scan")
    : lang === "zh" ? status.detail : (t.status[status.status] ?? status.detail);
  const errorText = error
    ? (lang === "zh" ? error : error.replace("识别结果未通过结构校验：", "Recognition failed schema validation: ").replace("不支持的图片格式", "Unsupported image format"))
    : null;

  return (
    <AppShell active="scan">
      <div className={`scan-page${lang === "zh" ? " lang-zh" : ""}`}>
      <header className="page-head">
        <h1>{lang === "zh" ? "拍照识别" : "Scan & identify"}</h1>
        <p>{lang === "zh" ? "拍一张瓶身或标签，识别成分、风险与安全处置建议。" : "Snap a bottle or label to detect ingredients, risks and safe disposal."}</p>
      </header>
      <ProfileSheet compact />
      <div className="scan-status-bar">
        <span className={`scan-status status-${status.status}`}>{statusText}</span>
      </div>

      <section className="scan-workbench">
        <div className="scan-upload">
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          {!preview ? (
            <div className="upload-card">
              <div className="upload-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5A2 2 0 0 1 6 6.5h1.2a1 1 0 0 0 .8-.4l1-1.4a1 1 0 0 1 .8-.4h4.4a1 1 0 0 1 .8.4l1 1.4a1 1 0 0 0 .8.4H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><circle cx="12" cy="12.5" r="3.4" /></svg>
              </div>
              <h3>{lang === "zh" ? "拍下或上传一张照片" : "Take or upload a photo"}</h3>
              <p>{lang === "zh" ? "对准瓶身、标签或成分表，越清晰识别越准" : "Aim at the bottle, label or ingredient list"}</p>
              <button className="upload-cta" onClick={() => inputRef.current?.click()}>
                {lang === "zh" ? "拍照 / 选图" : "Camera / Gallery"}
              </button>
              <div className="sample-row" data-tour="samples" style={{ marginTop: 12, justifyContent: "center" }}>
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
                          const file = new File([b], src.split("/").pop() as string, { type: "image/jpeg" });
                          // 直接存到 ref，不依赖 state（避免异步问题）
                          if (inputRef.current) {
                            const dt = new DataTransfer();
                            dt.items.add(file);
                            inputRef.current.files = dt.files;
                          }
                          setFile(file);
                          setResult(null);
                          setError(null);
                          setSaved(false);
                          setPreview(URL.createObjectURL(file));
                        } catch { /* sample fetch failed, ignore */ }
                      }}
                    >
                      {t.samples[i]}
                    </button>
                  ))}
                </div>
                <span className="sample-hint" style={{ textAlign: "center" }}>{t.samplesHint}</span>
              </div>
            </div>
          ) : (
            <>
              <button className="preview-frame" onClick={() => inputRef.current?.click()} aria-label={lang === "zh" ? "重新选择" : "Reselect"}>
                <img src={preview} alt={lang === "zh" ? "待识别图片预览" : "preview"} />
                <span className="preview-change">{lang === "zh" ? "点击更换" : "Change"}</span>
              </button>
              <div className="scan-actions">
                {status.status === "ready" && (
                  <button className="analyze-btn" onClick={analyze} disabled={busy}>
                    {busy ? t.busy : t.analyze}
                  </button>
                )}
                {result && <button className="save-btn" onClick={saveToHousehold} disabled={saved}>{saved ? t.saved : t.save}</button>}
                {result && <a className="save-btn" href="/mix?prefill=1">{t.goMix}</a>}
                {saved && <a className="save-btn" href="/archive">{t.goArchive}</a>}
              </div>
            </>
          )}
          {errorText && <p className="scan-error">⚠ {errorText}</p>}

          {/* 最近分析（社会证明 + 回访入口） */}
          {recentItems.length > 0 && (
            <div className="recent-box">
              <p className="recent-label">{lang === "zh" ? "最近分析" : "Recent"}</p>
              <ul className="recent-list">
                {[...recentItems].slice(-3).reverse().map((it) => {
                  const rl = it.analysis?.risk_level || "unknown";
                  return (
                    <li key={it.id} className="recent-item">
                      <span className="risk-band" style={{ background: RISK_BAND[(rl as RiskBand)]?.bg, color: RISK_BAND[(rl as RiskBand)]?.color, fontSize: 10, padding: "2px 8px" }}>
                        {riskScore(rl)}
                      </span>
                      <span className="recent-name">#{it.id} · {it.observed_name ?? (lang === "zh" ? "未命名" : "Unnamed")}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {!a && (
          <div className="scan-placeholder">
            <h3>{t.placeholderTitle}</h3>
            <ul>
              {t.placeholderList.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}

        {a && (
          <div className="scan-result">
            <div className="risk-band-row">
              <span className="risk-band" style={{ background: RISK_BAND[(a.risk_level as RiskBand) ?? "unknown"]?.bg, color: RISK_BAND[(a.risk_level as RiskBand) ?? "unknown"]?.color }}>
                {RISK_BAND[(a.risk_level as RiskBand) ?? "unknown"]?.[lang]}
              </span>
              <span className="risk-score" style={{ color: levelColor[a.risk_level] }}>
                {lang === "zh" ? "评分" : "Score"} {riskScore(a.risk_level)}
              </span>
            </div>
            <p className="score-note">{scoreNote(lang)}</p>
            {a.risk_level === "unknown" && (
              <p className="unknown-note">{lang === "zh" ? "信息不足 ≠ 安全。请补拍瓶身标签与成分表。" : "Not enough info — not the same as safe."}</p>
            )}
            <p className="confidence-note">{lang === "zh" ? "本结论基于包装识别与结构校验，非实验室成分检测。" : "Based on packaging recognition, not a lab test."}</p>
            {profileHints(a, loadProfile(), lang).map((hint) => (
              <p key={hint} className="profile-hint">{hint}</p>
            ))}
            <h2>{a.product.name ?? t.unnamedProduct}</h2>
            <p className="result-meta">
              {[a.product.brand, a.product.category, a.product.barcode].filter(Boolean).join(" · ") || t.noLabel}
            </p>
            <p className="result-summary">{a.summary}</p>

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
                <div className="result-block block-danger"><h3>⚠ {t.doNotMix}</h3><ul>{a.do_not_mix_with.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              )}
            </div>

            {result?.disposal && (
              <div className={`result-block disposal-block${result.disposal.hazardous_waste ? " is-hazard" : ""}`}>
                <h3>♻ {t.disposalTitle}{result.disposal.hazardous_waste ? ` · ${t.disposalHazard}` : ""}</h3>
                <p className={`disposal-drain drain-${result.disposal.drain_safe}`}>{result.disposal.drain_safe_text}</p>
                <ul>
                  <li><b>{t.disposalRoute}：</b>{result.disposal.disposal_route}</li>
                  <li><b>{t.disposalContainer}：</b>{result.disposal.container}</li>
                  <li><b>🌱 {t.disposalEco}：</b>{result.disposal.eco_tip}</li>
                </ul>
              </div>
            )}

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
              <div className="result-block block-uncertain"><h3>❓ {t.uncertainties}</h3><ul>{a.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            )}
            {a.needs_more_images.length > 0 && (
              <div className="result-block block-retake"><h3>📷 {t.moreImages}</h3><ul>{a.needs_more_images.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            )}

            {result?.database_match && (
              <p className="db-match">{t.dbMatch} #{String(result.database_match.id)}</p>
            )}

            {/* 规则引擎判定 + 依据 */}
            {result?.rules && (
              <div className="rules-block">
                <h3>{lang === "zh" ? "规则引擎判定" : "Rule engine"}</h3>
                <p className="rules-meta">
                  {lang === "zh"
                    ? `命中规则 ${result.rules.findings.length} 条 · 风险等级由规则引擎兜底（非大模型推测）`
                    : `${result.rules.findings.length} rule(s) · ruled by engine`}
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
                    {lang === "zh" ? `⏳ ${result.expiring_standards.map((e) => e.standard_no || e.title).join("、")} 即将换代` : `⏳ Standards expiring soon`}
                  </p>
                )}
              </div>
            )}

            {/* 主动混用预警弹卡 */}
            {result?.cross_risks && result.cross_risks.length > 0 && (
              <div className="mix-alert">
                <h3>{lang === "zh" ? "⚠ 主动混用预警" : "⚠ Mixing alert"}</h3>
                <p className="mix-rule-tag">{lang === "zh" ? "基于规则库判定，非大模型推测" : "Ruled by rules"}</p>
                {result.cross_risks.slice(0, 3).map((c, i) => (
                  <div key={i} className="mix-pair">
                    <b>{c.a}</b> ✕ <b>{c.b}</b>
                    <p>{c.reason}</p>
                    <p className="mix-action">{lang === "zh" ? "→ 分开存放、绝不混用；使用后充分通风。" : "→ Keep apart. Never mix."}</p>
                  </div>
                ))}
                {result.cross_risks.length > 3 && (
                  <a className="mix-more" href="/mix">{lang === "zh" ? `查看全部 ${result.cross_risks.length} 组 →` : "See all →"}</a>
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
                <div className="evidence-title">{e.title}{e.standard_no && <span className="ev-no">{e.standard_no}</span>}</div>
                {e.source_level_label && <span className={`ev-level ev-${e.source_level}`}>{e.source_level_label}</span>}
                {e.clause && <p className="ev-clause">{e.clause}</p>}
                {e.summary && <p className="ev-summary">{e.summary}</p>}
                {e.note && <p className="ev-note">{e.note}</p>}
                <p className="ev-dates">
                  {e.effective_from && (lang === "zh" ? `生效 ${e.effective_from}` : `from ${e.effective_from}`)}
                  {e.next_effective_from && (lang === "zh" ? ` 换代 ${e.next_effective_from}` : ` next ${e.next_effective_from}`)}
                </p>
                {e.url && <a className="ev-url" href={e.url} target="_blank" rel="noreferrer">{lang === "zh" ? "查看原文" : "Source"}</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      <FeedbackBar page="m-scan" />

      <Assistant />

      <footer className="scan-foot"><p>{t.footer}</p></footer>
      </div>
    </AppShell>
  );
}
