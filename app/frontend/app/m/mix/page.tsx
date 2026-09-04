"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { MIX_COPY, useLang } from "../../i18n";
import { loadMixSession } from "./session";

const API = "";
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
  location?: string | null;
  analysis: Analysis;
};
type CrossRisk = { a: string; b: string; reason: string; severity: string; source?: "rules" | "llm"; same_location?: boolean; location?: string };
type MixResp = {
  cross_risks: CrossRisk[];
  has_critical: boolean;
  verdict?: "danger" | "caution" | "unknown" | "no_edge";
  verdict_source?: "rules" | "llm";
  llm_used?: boolean;
  unknown_names?: string[];
};

const RISK: Record<string, string> = {
  unknown: "?", low: "低危", medium: "中危", high: "高危", critical: "危急",
};
const RISK_EN: Record<string, string> = {
  unknown: "?", low: "LOW", medium: "MED", high: "HIGH", critical: "CRIT",
};

function imgSrc(path?: string) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API}/${path.replace(/^\//, "")}`;
}

function outcomeTitle(reason: string, gasWord: string) {
  if (/氯气/.test(reason) || /chlorine/i.test(reason)) return gasWord;
  const after = reason.split(/[：:]/)[1];
  if (after) return after.replace(/——.*/, "").trim().slice(0, 24);
  return reason.slice(0, 24);
}

export default function MobileMixPage() {
  const { lang } = useLang();
  const t = MIX_COPY[lang];
  const riskLabel = lang === "zh" ? RISK : RISK_EN;
  const [tray, setTray] = useState<MixCandidate[]>([]);
  const [slotA, setSlotA] = useState<MixCandidate | null>(null);
  const [slotB, setSlotB] = useState<MixCandidate | null>(null);
  const [lastFilled, setLastFilled] = useState<"a" | "b">("a");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MixResp | null>(null);

  useEffect(() => {
    const session = loadMixSession() as MixCandidate[];
    const wantPrefill = new URLSearchParams(window.location.search).get("prefill") === "1";
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => {
        const house: MixCandidate[] = (d.items ?? [])
          .filter((it: { analysis?: Analysis }) => it.analysis && Object.keys(it.analysis).length)
          .map((it: { id: number; observed_name?: string; image_path?: string; location?: string | null; analysis: Analysis }) => ({
            key: `house:${it.id}`,
            name: it.analysis?.product?.name || it.observed_name || t.unnamed,
            risk_level: it.analysis?.risk_level || "unknown",
            image_path: it.image_path,
            location: it.location ?? null,
            analysis: it.analysis,
          }));
        const seen = new Set<string>();
        const merged: MixCandidate[] = [];
        for (const c of [...session, ...house]) {
          if (seen.has(c.key) || seen.has(`name:${c.name}`)) continue;
          seen.add(c.key);
          seen.add(`name:${c.name}`);
          merged.push(c);
        }
        setTray(merged);
        if (wantPrefill && session.length >= 2) {
          setSlotA(session[0]);
          setSlotB(session[1]);
          setLastFilled("b");
        } else if (wantPrefill && session.length === 1) {
          setSlotA(session[0]);
          setLastFilled("a");
        }
      })
      .catch(() => {
        setTray(session);
        if (wantPrefill && session.length >= 2) {
          setSlotA(session[0]);
          setSlotB(session[1]);
          setLastFilled("b");
        }
      });
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
            { analysis: slotA.analysis, name: slotA.name, image_path: slotA.image_path, location: slotA.location ?? null },
            { analysis: slotB.analysis, name: slotB.name, image_path: slotB.image_path, location: slotB.location ?? null },
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
  const verdict = result?.verdict || (hot ? "danger" : result ? "no_edge" : undefined);
  const sameLoc = result?.cross_risks.find((c) => c.same_location)?.location;

  return (
    <AppShell active="archive">
      <div className="phone-mix">
        <header className="page-head">
          <h1>{t.h1}</h1>
          <p>{t.hint}</p>
        </header>

        <aside className="mix-demo-card" data-tour="mix-demo">
          <em>{lang === "zh" ? "演示组合 · 规则库" : "Demo pair · rule library"}</em>
          <b>{lang === "zh" ? "84 消毒液 × 洁厕灵 → 氯气" : "Bleach × toilet cleaner → chlorine gas"}</b>
          <p>{lang === "zh" ? "马桶是这两瓶最容易先后相遇的地方。分开存放，绝不同时或先后紧邻倒入。本组合判定基于规则库，非大模型推测。" : "The toilet is where these two meet. Store apart. This call is from the rule library, not the model."}</p>
        </aside>

        <div className="phone-mix-stage">
          <PhoneSlot cand={slotA} empty={t.slot} clearLabel={t.slotClear} riskLabel={riskLabel} onClear={() => clearSlot("a")} />
          <span className="phone-mix-x" aria-hidden="true">✕</span>
          <PhoneSlot cand={slotB} empty={t.slot} clearLabel={t.slotClear} riskLabel={riskLabel} onClear={() => clearSlot("b")} />
        </div>

        <button className="phone-mix-btn" onClick={() => void mix()} disabled={!ready || busy}>
          {busy ? t.mixing : ready ? t.mix : t.mixNeed}
        </button>

        {error && <p className="scan-error">⚠ {error}</p>}

        {result && !busy && verdict === "danger" && hot && (
          <section className="phone-mix-outcome is-hot" aria-live="assertive">
            <em>{outcomeTitle(hot.reason, t.outcomeGas)}</em>
            {hot.source === "llm" ? (
              <span
                className="xc-rule-badge"
                style={{ background: "rgba(217,119,6,.14)", color: "#b45309", borderColor: "rgba(217,119,6,.45)" }}
              >
                {lang === "zh" ? "AI推测" : "AI guess"}
              </span>
            ) : (
              <span className="xc-rule-badge">{lang === "zh" ? "基于规则库" : "Rule-based"}</span>
            )}
            <b>{slotA?.name} ✕ {slotB?.name}</b>
            {sameLoc && (
              <p className="mix-same-loc">
                📍 {lang === "zh" ? `这两瓶放在同一位置（${sameLoc}），现在就分开` : `Both are stored in the same spot (${sameLoc}) — separate them now`}
              </p>
            )}
            <p>{hot.reason}</p>
            {hot.source === "llm" && (
              <p style={{ fontSize: "0.78rem", color: "#b45309" }}>{lang === "zh"
                ? "此组合由 AI 推断，非规则库结论，请以产品标签为准"
                : "This pair was inferred by AI, not from the rule base — follow the product labels."}</p>
            )}
            <ul>
              <li>{t.action1}</li>
              <li>{t.action2}</li>
              <li>{t.action3}</li>
            </ul>
          </section>
        )}
        {result && !busy && verdict === "caution" && (
          <section className="phone-mix-outcome is-unknown" aria-live="polite">
            <em>{lang === "zh" ? "需注意的组合（非急性危险）" : "Pairs to note (not acute)"}</em>
            <b>{slotA?.name} ✕ {slotB?.name}</b>
            {sameLoc && (
              <p className="mix-same-loc">
                📍 {lang === "zh" ? `这两瓶放在同一位置（${sameLoc}），现在就分开` : `Both are stored in the same spot (${sameLoc}) — separate them now`}
              </p>
            )}
            {result.cross_risks.map((c, i) => (
              <div key={i}>
                <p>
                  {c.source === "llm" ? (
                    <span
                      className="xc-rule-badge"
                      style={{ background: "rgba(217,119,6,.14)", color: "#b45309", borderColor: "rgba(217,119,6,.45)" }}
                    >
                      {lang === "zh" ? "AI推测" : "AI guess"}
                    </span>
                  ) : (
                    <span className="xc-rule-badge">{lang === "zh" ? "基于规则库" : "Rule-based"}</span>
                  )}{" "}
                  {c.reason}
                </p>
                {c.source === "llm" && (
                  <p style={{ fontSize: "0.78rem", color: "#b45309" }}>{lang === "zh"
                    ? "此组合由 AI 推断，非规则库结论，请以产品标签为准"
                    : "This pair was inferred by AI, not from the rule base — follow the product labels."}</p>
                )}
              </div>
            ))}
          </section>
        )}
        {result && !busy && verdict === "unknown" && (
          <section className="phone-mix-outcome is-unknown" aria-live="polite">
            <em>{t.unknownTitle}</em>
            <b>{slotA?.name} ✕ {slotB?.name}</b>
            <p>{t.unknownBody}</p>
          </section>
        )}
        {result && !busy && verdict === "no_edge" && (
          <section className="phone-mix-outcome is-clear" aria-live="polite">
            <b>{t.missTitle}</b>
            <p>{t.missBody}</p>
          </section>
        )}

        <section className="phone-mix-tray">
          <h2>{t.tray}</h2>
          {tray.length === 0 ? (
            <p className="mix-empty">{t.empty} <a href="/scan">{t.goScan}</a></p>
          ) : (
            <ul>
              {tray.map((c) => (
                <li key={c.key}>
                  <button
                    className={`phone-mix-chip${slotA?.key === c.key || slotB?.key === c.key ? " is-on" : ""}`}
                    onClick={() => pick(c)}
                  >
                    {imgSrc(c.image_path)
                      ? <img src={imgSrc(c.image_path)!} alt="" />
                      : <span>{c.name.slice(0, 1)}</span>}
                    <b>{c.name}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function PhoneSlot({
  cand, empty, clearLabel, riskLabel, onClear,
}: {
  cand: MixCandidate | null;
  empty: string;
  clearLabel: string;
  riskLabel: Record<string, string>;
  onClear: () => void;
}) {
  const src = imgSrc(cand?.image_path);
  return (
    <div className={`phone-mix-slot${cand ? " is-filled" : ""}`}>
      {cand ? (
        <>
          {src ? <img src={src} alt={cand.name} /> : <span className="phone-mix-fallback">{cand.name.slice(0, 1)}</span>}
          <div>
            <b>{cand.name}</b>
            <i>{riskLabel[cand.risk_level] ?? cand.risk_level}</i>
          </div>
          <button type="button" onClick={onClear}>{clearLabel}</button>
        </>
      ) : (
        <span>{empty}</span>
      )}
    </div>
  );
}
