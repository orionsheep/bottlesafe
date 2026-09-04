"use client";

// 电脑端混用判定页（/mix）：杂志风外壳，不用 AppShell。
// 逻辑参照手机端 app/m/mix/page.tsx：两瓶选择 → POST /api/mix → 判定展示。
// 候选来源：家庭档案（GET /api/household/items）+ 手动贴品名；结果复用双瓶对比卡（report.tsx）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { HOME_COPY, MIX_COPY, SCAN_COPY, useLang } from "../i18n";
import { CrossCompareCard, type HouseItem } from "../scan/report";
import AssistantFab from "../scan/AssistantFab";
import "./mix-desk.css";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

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
  has_critical?: boolean;
  verdict?: "danger" | "caution" | "unknown" | "no_edge";
  verdict_source?: "rules" | "llm";
  llm_used?: boolean;
  unknown_names?: string[];
};

const RISK_ZH: Record<string, string> = {
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

export default function DeskMixPage() {
  const { lang, setLang } = useLang();
  const t = MIX_COPY[lang];
  const st = SCAN_COPY[lang];
  const hn = HOME_COPY[lang];
  const riskLabel = lang === "zh" ? RISK_ZH : RISK_EN;
  const [tray, setTray] = useState<MixCandidate[]>([]);
  const [houseItems, setHouseItems] = useState<HouseItem[]>([]);
  const [slotA, setSlotA] = useState<MixCandidate | null>(null);
  const [slotB, setSlotB] = useState<MixCandidate | null>(null);
  const [lastFilled, setLastFilled] = useState<"a" | "b">("a");
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MixResp | null>(null);

  useEffect(() => {
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => {
        const raw = (d.items ?? []) as HouseItem[];
        setHouseItems(raw);
        setTray(
          raw
            .filter((it) => it.analysis && Object.keys(it.analysis).length)
            .map((it) => ({
              key: `house:${it.id}`,
              name: it.analysis?.product?.name || it.observed_name || t.unnamed,
              risk_level: it.analysis?.risk_level || "unknown",
              image_path: (it as { image_path?: string }).image_path,
              location: (it as { location?: string | null }).location ?? null,
              analysis: (it.analysis ?? {}) as Analysis,
            })),
        );
      })
      .catch(() => {});
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

  // 档案里没有的瓶子：直接贴品名作为候选（analysis 为空 → 后端判 unknown）。
  const addManual = () => {
    const name = customName.trim().slice(0, 40);
    if (!name) return;
    const cand: MixCandidate = { key: `manual:${name}`, name, risk_level: "unknown", analysis: {} };
    setTray((list) => (list.some((c) => c.key === cand.key || c.name === name) ? list : [...list, cand]));
    setResult(null);
    setError(null);
    if (!slotA) { setSlotA(cand); setLastFilled("a"); }
    else if (!slotB) { setSlotB(cand); setLastFilled("b"); }
    setCustomName("");
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
    <main className={`mix-desk${lang === "zh" ? " lang-zh" : ""}`}>
      <nav className="nav" aria-label="Main navigation">
        <Link className="brand" href="/"><span className="brand-mark"><img src="/mascot.png" alt="" width={30} height={30} style={{ borderRadius: "50%", display: "block" }} /></span><span>HOME<br />HAZARD</span></Link>
        <div className="nav-links"><Link href="/">{hn.navIndex}</Link><Link href="/scan">{hn.navScan}</Link><Link href="/archive">{lang === "zh" ? "档案工作台" : "Archive desk"}</Link></div>
        <div className="nav-right">
          <button className="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label="Switch language">{lang === "zh" ? "EN" : "中文"}</button>
          <Link className="menu" href="/"><span />{st.back}</Link>
        </div>
      </nav>

      <header className="mix-head">
        <div>
          <p className="section-no">{t.no}</p>
          <h1>{t.h1}</h1>
        </div>
        <p className="mix-hint">{t.hint}</p>
      </header>

      <div className="mix-body">
        <div className="mix-main">
          <aside className="mix-demo">
            <em>{lang === "zh" ? "演示组合 · 规则库" : "Demo pair · rule library"}</em>
            <b>{lang === "zh" ? "84 消毒液 × 洁厕灵 → 氯气" : "Bleach × toilet cleaner → chlorine gas"}</b>
            <p>{lang === "zh" ? "马桶是这两瓶最容易先后相遇的地方。分开存放，绝不同时或先后紧邻倒入。本组合判定基于规则库，非大模型推测。" : "The toilet is where these two meet. Store apart. This call is from the rule library, not the model."}</p>
          </aside>

          <div className="mix-stage">
            <DeskSlot cand={slotA} empty={t.slot} clearLabel={t.slotClear} riskLabel={riskLabel} onClear={() => clearSlot("a")} />
            <span className="mix-x" aria-hidden="true">✕</span>
            <DeskSlot cand={slotB} empty={t.slot} clearLabel={t.slotClear} riskLabel={riskLabel} onClear={() => clearSlot("b")} />
          </div>

          <button className="mix-btn" onClick={() => void mix()} disabled={!ready || busy}>
            {busy ? t.mixing : ready ? t.mix : t.mixNeed}
          </button>

          {error && <p className="scan-error">⚠ {error}</p>}

          {result && !busy && verdict === "danger" && hot && (
            <section className="mix-verdict is-danger" aria-live="assertive">
              <div className="mix-verdict-head">
                <em>{outcomeTitle(hot.reason, t.outcomeGas)}</em>
                <b>{slotA?.name} ✕ {slotB?.name}</b>
              </div>
              {sameLoc && (
                <p className="mix-same-loc">
                  📍 {lang === "zh" ? `这两瓶放在同一位置（${sameLoc}），现在就分开` : `Both are stored in the same spot (${sameLoc}) — separate them now`}
                </p>
              )}
              <ul className="mix-verdict-actions">
                <li>{t.action1}</li>
                <li>{t.action2}</li>
                <li>{t.action3}</li>
              </ul>
              <div className="xc-list">
                {result.cross_risks.map((c, i) => (
                  <CrossCompareCard key={i} c={c} items={houseItems} lang={lang} />
                ))}
              </div>
            </section>
          )}
          {result && !busy && verdict === "unknown" && (
            <section className="mix-verdict is-unknown" aria-live="polite">
              <div className="mix-verdict-head">
                <em>{t.unknownTitle}</em>
                <b>{slotA?.name} ✕ {slotB?.name}</b>
              </div>
              {/* 保守声明：无法判断 ≠ 安全，必须显著 */}
              <p className="mix-verdict-note">{lang === "zh" ? "暂无法判断 ≠ 安全" : "Cannot judge ≠ safe"}</p>
              <p className="mix-verdict-body">{t.unknownBody}</p>
              {result.unknown_names && result.unknown_names.length > 0 && (
                <p className="mix-verdict-body">
                  {lang === "zh" ? `未识别到已知成分：${result.unknown_names.join("、")}` : `Unmatched: ${result.unknown_names.join(", ")}`}
                </p>
              )}
            </section>
          )}
          {result && !busy && verdict === "caution" && (
            <section className="mix-verdict is-unknown" aria-live="polite">
              <div className="mix-verdict-head">
                <em>{lang === "zh" ? "需注意的组合（非急性危险）" : "Pairs to note (not acute)"}</em>
                <b>{slotA?.name} ✕ {slotB?.name}</b>
              </div>
              {sameLoc && (
                <p className="mix-same-loc">
                  📍 {lang === "zh" ? `这两瓶放在同一位置（${sameLoc}），现在就分开` : `Both are stored in the same spot (${sameLoc}) — separate them now`}
                </p>
              )}
              <p className="mix-verdict-note">{lang === "zh" ? "暂无法判断 ≠ 安全" : "Cannot judge ≠ safe"}</p>
              <div className="xc-list">
                {result.cross_risks.map((c, i) => (
                  <CrossCompareCard key={i} c={c} items={houseItems} lang={lang} />
                ))}
              </div>
            </section>
          )}
          {result && !busy && verdict === "no_edge" && (
            <section className="mix-verdict is-clear" aria-live="polite">
              <div className="mix-verdict-head">
                <em>{t.missTitle}</em>
              </div>
              <p className="mix-verdict-body">{t.missBody}</p>
            </section>
          )}
        </div>

        <aside className="mix-tray">
          <h2>{t.tray}</h2>
          {tray.length === 0 ? (
            <p className="mix-empty">{t.empty} <Link href="/scan">{t.goScan}</Link></p>
          ) : (
            <ul className="mix-tray-list">
              {tray.map((c) => (
                <li key={c.key}>
                  <button
                    className={`mix-chip${slotA?.key === c.key || slotB?.key === c.key ? " is-on" : ""}`}
                    onClick={() => pick(c)}
                  >
                    {imgSrc(c.image_path)
                      ? <img src={imgSrc(c.image_path)!} alt="" />
                      : <span className="mix-chip-letter">{c.name.slice(0, 1)}</span>}
                    <b>{c.name}</b>
                    <i>{riskLabel[c.risk_level] ?? c.risk_level}</i>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mix-manual"
            onSubmit={(e) => { e.preventDefault(); addManual(); }}
          >
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={lang === "zh" ? "档案里没有？直接贴品名" : "Not in archive? Type a name"}
              maxLength={40}
            />
            <button type="submit">{lang === "zh" ? "加入候选" : "Add"}</button>
          </form>
        </aside>
      </div>

      <footer><Link className="brand" href="/"><span className="brand-mark"><img src="/mascot.png" alt="" width={30} height={30} style={{ borderRadius: "50%", display: "block" }} /></span><span>HOME<br />HAZARD</span></Link><p>{st.footer}</p><Link href="/" className="back">{hn.back}</Link></footer>

      <AssistantFab />
    </main>
  );
}

function DeskSlot({
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
    <div className={`mix-slot${cand ? " is-filled" : ""}`}>
      {cand ? (
        <>
          {src ? <img src={src} alt={cand.name} /> : <span className="mix-slot-fallback">{cand.name.slice(0, 1)}</span>}
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
