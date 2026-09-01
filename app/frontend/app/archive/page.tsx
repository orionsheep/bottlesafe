"use client";

import { useEffect, useMemo, useState } from "react";
import { HOME_COPY, SCAN_COPY, useLang } from "../i18n";
import ReportPanel from "../scan/report";

const API = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? "http://127.0.0.1:8000" : "";

type Analysis = {
  product?: { name?: string | null; brand?: string | null; category?: string | null };
  hazards?: { type: string; severity: string; evidence?: string }[];
  ingredients?: { name: string }[];
  do_not_mix_with?: string[];
  safe_storage?: string[];
  risk_level?: string;
  summary?: string;
};
type ArchiveItem = {
  id: number;
  observed_name?: string;
  image_path?: string;
  created_at?: string;
  analysis?: Analysis;
};

const RISK: Record<string, string> = {
  unknown: "?", low: "LOW", medium: "MED", high: "HIGH", critical: "CRIT",
};

function imgSrc(path?: string) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API}/${path.replace(/^\//, "")}`;
}

function itemName(it: ArchiveItem, unnamed: string) {
  return it.analysis?.product?.name || it.observed_name || unnamed;
}

export default function ArchivePage() {
  const { lang, setLang } = useLang();
  const hn = HOME_COPY[lang];
  const t = SCAN_COPY[lang];
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = () => {
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  const removeItem = async (id: number) => {
    await fetch(`${API}/api/household/items/${id}`, { method: "DELETE" });
    setItems((list) => list.filter((it) => it.id !== id));
    if (openId === id) setOpenId(null);
  };

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: items.length };
    items.forEach((it) => {
      const k = (it.analysis?.risk_level || "unknown") as keyof typeof c;
      if (k in c && k !== "total") c[k] += 1;
    });
    return c;
  }, [items]);

  return (
    <main className={`arch-page${lang === "zh" ? " lang-zh" : ""}`}>
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
        <div className="nav-links">
          <a href="/">{hn.navIndex}</a>
          <a href="/scan">{hn.navScan}</a>
          <a href="/mix">{hn.navMix}</a>
          <a href="/archive">{hn.navArchive}</a>
        </div>
        <div className="nav-right">
          <button className="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>{lang === "zh" ? "EN" : "中文"}</button>
          <a className="menu" href="/scan"><span />{hn.navScan}</a>
        </div>
      </nav>

      <header className="arch-top">
        <div>
          <p className="section-no">{t.archiveNo}</p>
          <h1>{t.archiveTitle}</h1>
          <p className="arch-lead">
            {lang === "zh"
              ? "家里已经入库的瓶子。点开看成分与禁忌，全屋报告在本页下方。"
              : "Bottles already saved to this home. Open a card for details; the whole-home report sits below."}
          </p>
        </div>
        <ul className="arch-stats">
          <li><b>{counts.total}</b><span>{lang === "zh" ? "件" : "items"}</span></li>
          <li><b>{counts.critical + counts.high}</b><span>{lang === "zh" ? "高危" : "high"}</span></li>
          <li><b>{counts.medium}</b><span>{lang === "zh" ? "中危" : "med"}</span></li>
          <li><b>{counts.low}</b><span>{lang === "zh" ? "低危" : "low"}</span></li>
        </ul>
      </header>

      <section className="arch-grid-wrap">
        {items.length === 0 ? (
          <p className="arch-empty">{t.archiveEmpty} <a href="/scan">{hn.navScan} →</a></p>
        ) : (
          <ul className="arch-grid">
            {items.map((it) => {
              const name = itemName(it, t.unnamed);
              const risk = it.analysis?.risk_level || "unknown";
              const src = imgSrc(it.image_path);
              const open = openId === it.id;
              const a = it.analysis;
              return (
                <li key={it.id} className={`arch-card${open ? " is-open" : ""}`}>
                  <button type="button" className="arch-card-main" onClick={() => setOpenId(open ? null : it.id)}>
                    {src
                      ? <img src={src} alt={name} />
                      : <span className="arch-fallback">{name.slice(0, 1)}</span>}
                    <div>
                      <i className={`risk-badge risk-${risk}`}>RISK / {RISK[risk] ?? risk}</i>
                      <b>{name}</b>
                      <span>{[a?.product?.brand, a?.product?.category].filter(Boolean).join(" · ") || `#${it.id}`}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="arch-card-detail">
                      {a?.summary && <p>{a.summary}</p>}
                      {!!a?.ingredients?.length && (
                        <p><em>{t.ingredients}</em> {a.ingredients.map((g) => g.name).join("、")}</p>
                      )}
                      {!!a?.do_not_mix_with?.length && (
                        <p><em>{t.doNotMix}</em> {a.do_not_mix_with.join("、")}</p>
                      )}
                      {!!a?.safe_storage?.length && (
                        <p><em>{t.safeStorage}</em> {a.safe_storage.join("、")}</p>
                      )}
                      <div className="arch-card-actions">
                        <a href="/mix">{hn.navMix} →</a>
                        <button type="button" onClick={() => void removeItem(it.id)}>{t.remove}</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ReportPanel nItems={items.length} />

      <footer>
        <a className="brand" href="/"><span className="brand-mark">H/H</span><span>HOME<br />HAZARD</span></a>
        <p>{t.footer}</p>
        <a href="/scan" className="back">{hn.navScan}</a>
      </footer>
    </main>
  );
}
