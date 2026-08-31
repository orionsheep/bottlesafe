"use client";

// 档案中心：统计概览 + 最需关注 + 搜索/筛选/排序 + 信息化物品卡片（可展开详情）。
// 数据来自 /api/household/items，每件带完整 analysis。

import { useMemo, useState } from "react";
import { SCAN_COPY, useLang } from "../i18n";

type Analysis = {
  product?: { name?: string | null; brand?: string | null; category?: string | null };
  hazards?: { type: string; severity: string; evidence?: string }[];
  ingredients?: { name: string }[];
  do_not_mix_with?: string[];
  safe_storage?: string[];
  risk_level?: string;
  summary?: string;
};
export type ArchiveItem = {
  id: number;
  observed_name?: string;
  image_path?: string;
  created_at?: string;
  analysis?: Analysis;
};

const RISK_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };
const RISK_KEYS = ["critical", "high", "medium", "low"] as const;

function riskName(lang: "zh" | "en", r: string) {
  const t = SCAN_COPY[lang];
  return { critical: t.riskCritical, high: t.riskHigh, medium: t.riskMedium, low: t.riskLow, unknown: t.riskUnknown }[r] ?? t.riskUnknown;
}
function itemName(it: ArchiveItem, unnamed: string) {
  return it.analysis?.product?.name || it.observed_name || unnamed;
}
function fmtDate(s?: string) {
  if (!s) return "";
  return s.slice(0, 10).replace(/-/g, "/");
}

export default function ArchiveCenter({
  items,
  onRemove,
  api,
  variant = "phone",
  pairIds = [],
}: {
  items: ArchiveItem[];
  onRemove: (id: number) => void;
  api: string;
  variant?: "phone" | "desk";
  pairIds?: number[];
}) {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<"new" | "risk" | "name">(variant === "desk" ? "risk" : "new");
  const [openId, setOpenId] = useState<number | null>(null);
  const openItem = openId == null ? null : items.find((it) => it.id === openId) || null;

  const counts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    items.forEach((it) => { c[it.analysis?.risk_level || "unknown"] = (c[it.analysis?.risk_level || "unknown"] ?? 0) + 1; });
    return c;
  }, [items]);

  const topRisk = useMemo(
    () => [...items]
      .filter((it) => ["critical", "high"].includes(it.analysis?.risk_level || ""))
      .sort((a, b) => (RISK_ORDER[b.analysis?.risk_level || "unknown"] - RISK_ORDER[a.analysis?.risk_level || "unknown"]))
      .slice(0, 3),
    [items],
  );

  const shown = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter((it) => (it.analysis?.risk_level || "unknown") === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((it) =>
        itemName(it, "").toLowerCase().includes(q) ||
        (it.analysis?.product?.category || "").toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "new") sorted.sort((a, b) => b.id - a.id);
    else if (sort === "risk") sorted.sort((a, b) => RISK_ORDER[b.analysis?.risk_level || "unknown"] - RISK_ORDER[a.analysis?.risk_level || "unknown"]);
    else sorted.sort((a, b) => itemName(a, "").localeCompare(itemName(b, "")));
    return sorted;
  }, [items, filter, query, sort]);

  const pairSet = new Set(pairIds);

  return (
    <div className={`arc${variant === "desk" ? " is-desk" : ""}`}>
      {/* 统计概览（手机端取代顶栏，放最上） */}
      <div className="arc-stats">
        <button className={`arc-stat arc-stat-total${filter === "all" ? " on" : ""}`}
                onClick={() => setFilter("all")}>
          <b>{items.length}</b><span>{t.arcStatTotal}</span>
        </button>
        {RISK_KEYS.map((r) => (
          <button key={r} className={`arc-stat arc-stat-${r}${filter === r ? " on" : ""}`}
                  onClick={() => setFilter(filter === r ? "all" : r)}>
            <b>{counts[r]}</b><span>{riskName(lang, r)}</span>
          </button>
        ))}
      </div>

      {/* 台账卡片：主角，紧跟统计，占据主要空间 */}
      {shown.length === 0 ? (
        <p className="archive-empty">{items.length === 0 ? t.archiveEmpty : t.arcNoMatch}</p>
      ) : (
        <div className="arc-waterfall">
          {shown.map((it) => {
            const a = it.analysis || {};
            const risk = a.risk_level || "unknown";
            return (
              <button key={it.id} className={`arc-wf-card risk-bd-${risk}${pairSet.has(it.id) ? " is-pair" : ""}`}
                      onClick={() => setOpenId(it.id)} aria-label={itemName(it, t.unnamed)}>
                <div className="arc-wf-media">
                  {it.image_path
                    ? <img src={`${api}/${it.image_path}`} alt="" loading="lazy" />
                    : <span className="arc-wf-initial">{(itemName(it, "?")).slice(0, 1)}</span>}
                  <em className="risk-tag arc-wf-tag"><i className={`risk-dot-mini risk-bg-${risk}`} />{riskName(lang, risk)}</em>
                  <div className="arc-wf-body">
                    <b className="arc-wf-title">{itemName(it, t.unnamed)}</b>
                    <span className="arc-wf-cat">{a.product?.category || "—"}</span>
                    <span className="arc-wf-date">{t.arcArchivedAt} {fmtDate(it.created_at)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 次要工具区：搜索/排序 + 最需关注，放最下（滑到底才见） */}
      <div className="arc-secondary">
        <div className="arc-tools">
          <input className="arc-search" placeholder={t.arcSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="arc-sort">
            {([["new", t.arcSortNew], ["risk", t.arcSortRisk], ["name", t.arcSortName]] as const).map(([k, label]) => (
              <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
        </div>
        {topRisk.length > 0 && (
          <div className="arc-top">
            <h3>{t.arcTopRisk}</h3>
            <ul className="arc-top-list">
              {topRisk.map((it) => (
                <li key={it.id} onClick={() => setOpenId(it.id)}>
                  <i className={`risk-dot-mini risk-bg-${it.analysis?.risk_level}`} />
                  <span>{itemName(it, t.unnamed)}</span>
                  <em>{riskName(lang, it.analysis?.risk_level || "unknown")}</em>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 底部抽屉：物品详情 */}
      {openItem && (
        <div className={`arc-sheet-mask${variant === "desk" ? " is-desk" : ""}`} onClick={() => setOpenId(null)}>
          <div className="arc-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="arc-sheet-handle" />
            {(() => {
              const a = openItem.analysis || {};
              const risk = a.risk_level || "unknown";
              return (
                <>
                  <div className="arc-sheet-head">
                    <div className={`arc-sheet-thumb risk-bg-${risk}`}>
                      {openItem.image_path
                        ? <img src={`${api}/${openItem.image_path}`} alt="" />
                        : <span>{itemName(openItem, "?").slice(0, 1)}</span>}
                    </div>
                    <div className="arc-sheet-title">
                      <b>{itemName(openItem, t.unnamed)}</b>
                      <span className="arc-sheet-meta">{a.product?.category || "—"} · {t.arcArchivedAt} {fmtDate(openItem.created_at)}</span>
                      <em className={`risk-tag risk-bg-${risk}`}>{riskName(lang, risk)}</em>
                    </div>
                    <button className="arc-sheet-close" onClick={() => setOpenId(null)} aria-label="close">✕</button>
                  </div>

                  <div className="arc-sheet-body">
                    {a.summary && <p className="arc-sheet-summary">{a.summary}</p>}
                    {(a.hazards?.length ?? 0) > 0 && (
                      <div className="arc-detail-block">
                        <h4>{t.arcHazards}</h4>
                        <ul>{a.hazards!.map((h, i) => (
                          <li key={i}><em className={`sev-mini sev-bg-${h.severity}`}>{riskName(lang, h.severity)}</em>{h.type}</li>
                        ))}</ul>
                      </div>
                    )}
                    {(a.do_not_mix_with?.length ?? 0) > 0 && (
                      <div className="arc-detail-block is-danger">
                        <h4>⚠ {t.arcMix}</h4>
                        <p>{a.do_not_mix_with!.join("、")}</p>
                      </div>
                    )}
                    {(a.safe_storage?.length ?? 0) > 0 && (
                      <div className="arc-detail-block">
                        <h4>{t.arcStorage}</h4>
                        <ul>{a.safe_storage!.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                    <button className="arc-remove" onClick={() => { onRemove(openItem.id); setOpenId(null); }}>{t.remove}</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
