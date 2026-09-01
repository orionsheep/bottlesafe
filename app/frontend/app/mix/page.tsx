"use client";

import { useEffect, useState } from "react";
import { HOME_COPY, MIX_COPY, useLang } from "../i18n";
import DeskNav from "../DeskNav";

const API = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? "http://127.0.0.1:8000" : "";
const SESSION_KEY = "bottlesafe-mix-session";

type Analysis = {
  product?: { name?: string | null };
  risk_level?: string;
  [k: string]: unknown;
};
type MixCandidate = {
  key: string;
  name: string;
  risk_level: string;
  image_path?: string;
  analysis: Analysis;
};
type CrossRisk = { a: string; b: string; reason: string; severity: string };
type MixResp = { cross_risks: CrossRisk[]; has_critical: boolean };

const RISK: Record<string, string> = {
  unknown: "?", low: "LOW", medium: "MED", high: "HIGH", critical: "CRIT",
};

function imgSrc(path?: string) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API}/${path.replace(/^\//, "")}`;
}

function loadSession(): MixCandidate[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<MixCandidate>>;
    return parsed
      .filter((x) => x && x.analysis)
      .map((x, i) => ({
        key: x.key || `scan:${i}`,
        name: x.name || "未命名",
        risk_level: x.risk_level || "unknown",
        image_path: x.image_path,
        analysis: x.analysis as Analysis,
      }));
  } catch {
    return [];
  }
}

function outcomeTitle(reason: string, gasWord: string) {
  if (/氯气/.test(reason) || /chlorine/i.test(reason)) return gasWord;
  const after = reason.split(/[：:]/)[1];
  if (after) return after.replace(/——.*/, "").trim().slice(0, 24);
  return reason.slice(0, 24);
}

export default function MixPage() {
  const { lang } = useLang();
  const hn = HOME_COPY[lang];
  const t = MIX_COPY[lang];
  const [tray, setTray] = useState<MixCandidate[]>([]);
  const [slotA, setSlotA] = useState<MixCandidate | null>(null);
  const [slotB, setSlotB] = useState<MixCandidate | null>(null);
  const [lastFilled, setLastFilled] = useState<"a" | "b">("a");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MixResp | null>(null);

  useEffect(() => {
    const session = loadSession();
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => {
        const house: MixCandidate[] = (d.items ?? [])
          .filter((it: { analysis?: Analysis }) => it.analysis && Object.keys(it.analysis).length)
          .map((it: { id: number; observed_name?: string; image_path?: string; analysis: Analysis }) => ({
            key: `house:${it.id}`,
            name: it.analysis?.product?.name || it.observed_name || t.unnamed,
            risk_level: it.analysis?.risk_level || "unknown",
            image_path: it.image_path,
            analysis: it.analysis,
          }));
        const seen = new Set<string>();
        const merged: MixCandidate[] = [];
        for (const c of [...session, ...house]) {
          const sig = c.name;
          if (seen.has(c.key) || seen.has(`name:${sig}`)) continue;
          seen.add(c.key);
          seen.add(`name:${sig}`);
          merged.push(c);
        }
        setTray(merged);
      })
      .catch(() => setTray(session));
  }, [t.unnamed]);

  const pick = (c: MixCandidate) => {
    setResult(null);
    setError(null);
    if (slotA?.key === c.key) { setSlotA(null); return; }
    if (slotB?.key === c.key) { setSlotB(null); return; }
    if (!slotA) { setSlotA(c); setLastFilled("a"); return; }
    if (!slotB) { setSlotB(c); setLastFilled("b"); return; }
    if (lastFilled === "b") { setSlotA(c); setLastFilled("a"); }
    else { setSlotB(c); setLastFilled("b"); }
  };

  const clearSlot = (which: "a" | "b") => {
    setResult(null);
    setError(null);
    if (which === "a") setSlotA(null);
    else setSlotB(null);
  };

  const mix = async () => {
    if (!slotA || !slotB) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/mix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { analysis: slotA.analysis, name: slotA.name, image_path: slotA.image_path },
            { analysis: slotB.analysis, name: slotB.name, image_path: slotB.image_path },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(slotA && slotB);
  const hot = result?.cross_risks.find((c) => c.severity === "critical" || c.severity === "high") || result?.cross_risks[0];

  return (
    <main className={`mix-page${lang === "zh" ? " lang-zh" : ""}`}>
      <DeskNav />

      <header className="mix-top">
        <div>
          <p className="section-no">{t.no}</p>
          <h1>{t.h1a} <i>{t.h1b}</i></h1>
          <p className="mix-hint">{t.hint}</p>
        </div>
      </header>

      <section className="mix-stage">
        <SlotCard cand={slotA} label="A" empty={t.slot} clearLabel={t.slotClear} onClear={() => clearSlot("a")} />
        <span className="mix-x" aria-hidden="true">✕</span>
        <SlotCard cand={slotB} label="B" empty={t.slot} clearLabel={t.slotClear} onClear={() => clearSlot("b")} />
      </section>

      <div className="mix-actions">
        <button className="mix-btn" onClick={() => void mix()} disabled={!ready || busy}>
          {busy ? t.mixing : ready ? t.mix : t.mixNeed}
        </button>
      </div>

      {error && <p className="scan-error mix-error">⚠ {error}</p>}

      {result && !busy && (
        hot ? (
          <section className="mix-outcome is-hot" aria-live="assertive">
            <p className="mix-outcome-kicker">{outcomeTitle(hot.reason, t.outcomeGas)}</p>
            <h2>{slotA?.name} <i>✕</i> {slotB?.name}</h2>
            <p className="mix-outcome-reason">{hot.reason}</p>
            <ul>
              <li>{t.action1}</li>
              <li>{t.action2}</li>
              <li>{t.action3}</li>
            </ul>
          </section>
        ) : (
          <section className="mix-outcome is-clear" aria-live="polite">
            <h2>{t.missTitle}</h2>
            <p>{t.missBody}</p>
          </section>
        )
      )}

      <section className="mix-tray">
        <p className="section-no">{t.tray}</p>
        {tray.length === 0 ? (
          <p className="mix-empty">{t.empty} <a href="/scan">{t.goScan}</a></p>
        ) : (
          <ul>
            {tray.map((c) => (
              <li key={c.key}>
                <button
                  className={`mix-chip${slotA?.key === c.key || slotB?.key === c.key ? " is-on" : ""}`}
                  onClick={() => pick(c)}
                >
                  {imgSrc(c.image_path)
                    ? <img src={imgSrc(c.image_path)!} alt="" />
                    : <span className="mix-chip-fallback">{c.name.slice(0, 1)}</span>}
                  <b>{c.name}</b>
                  <i className={`risk-${c.risk_level}`}>{RISK[c.risk_level] ?? c.risk_level}</i>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>
        <a className="brand" href="/"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
        <a href="/scan" className="back">{hn.navScan}</a>
      </footer>
    </main>
  );
}

function SlotCard({
  cand, label, empty, clearLabel, onClear,
}: {
  cand: MixCandidate | null;
  label: string;
  empty: string;
  clearLabel: string;
  onClear: () => void;
}) {
  const src = imgSrc(cand?.image_path);
  return (
    <div className={`mix-slot${cand ? " is-filled" : ""}`}>
      <span className="mix-slot-label">{label}</span>
      {cand ? (
        <>
          {src ? <img src={src} alt={cand.name} /> : <span className="mix-slot-fallback">{cand.name.slice(0, 1)}</span>}
          <b>{cand.name}</b>
          <i className={`risk-badge risk-${cand.risk_level}`}>RISK / {RISK[cand.risk_level] ?? cand.risk_level}</i>
          <button type="button" className="mix-slot-clear" onClick={onClear}>{clearLabel}</button>
        </>
      ) : (
        <span className="mix-slot-empty">{empty}</span>
      )}
    </div>
  );
}
