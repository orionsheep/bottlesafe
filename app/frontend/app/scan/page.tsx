"use client";

import { useEffect, useRef, useState } from "react";
import { useLang, SCAN_COPY, HOME_COPY } from "../i18n";
import Assistant from "./assistant";

// 开发环境直连本地后端；生产环境走同源反代（nginx 把 /api、/uploads 转到 8000）。
const API = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? "http://127.0.0.1:8000" : "";

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
type AnalyzeResponse = { analysis: Analysis; database_match: { id: number; [k: string]: unknown } | null; image_path: string };

const riskLabel: Record<string, string> = {
  unknown: "UNKNOWN", low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL",
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
  const inputRef = useRef<HTMLInputElement>(null);

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
  };

  const analyze = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `请求失败（${res.status}）`);
      setResult(data);
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
  const statusText = lang === "zh" ? status.detail : (t.status[status.status] ?? status.detail);
  const errorText = error
    ? (lang === "zh" ? error : error.replace("识别结果未通过结构校验：", "Recognition failed schema validation: ").replace("不支持的图片格式", "Unsupported image format"))
    : null;

  return (
    <main className={`scan-page${lang === "zh" ? " lang-zh" : ""}`}>
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
        <div className="nav-links"><a href="/">{hn.navIndex}</a><a href="/scan">{hn.navScan}</a><a href="/mix">{hn.navMix}</a><a href="/archive">{hn.navArchive}</a></div>
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

      <section className="scan-workbench">
        <div className="scan-upload">
          <button className="drop-zone" onClick={() => inputRef.current?.click()} aria-label={lang === "zh" ? "选择图片" : "Choose image"}>
            {preview ? <img src={preview} alt="待识别图片预览" /> : <span>{t.dropHint[0]}<br />{t.dropHint[1]}</span>}
          </button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="scan-actions">
            <button className="analyze-btn" onClick={analyze} disabled={!file || busy || status.status !== "ready"}>
              {busy ? t.busy : status.status === "ready" ? t.analyze : t.waiting}
            </button>
            {result && <button className="save-btn" onClick={saveToHousehold} disabled={saved}>{saved ? t.saved : t.save}</button>}
            {saved && <a className="save-btn" href="/archive">{hn.navArchive} →</a>}
          </div>
          {errorText && <p className="scan-error">⚠ {errorText}</p>}
        </div>

        {!a && (
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
            <div className={`risk-badge risk-${a.risk_level}`}>RISK / {riskLabel[a.risk_level] ?? a.risk_level}</div>
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
          </div>
        )}
      </section>

      <p className="scan-sub">{t.sub}</p>

      <Assistant />

      <footer><a className="brand" href="/"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a><p>{t.footer}</p><a href="/" className="back">{hn.back}</a></footer>
    </main>
  );
}
