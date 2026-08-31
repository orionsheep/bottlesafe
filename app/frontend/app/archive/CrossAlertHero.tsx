"use client";

import { SCAN_COPY, useLang } from "../i18n";
import type { ArchiveItem } from "./ArchiveCenter";

export type CrossRisk = { a: string; b: string; reason: string; severity: string };

function parseId(label: string): number | null {
  const m = label.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
}

export function pairIdsFromCross(cross: CrossRisk[] | undefined): number[] {
  const first = (cross || []).find((c) => c.severity === "critical" || c.severity === "high") || (cross || [])[0];
  if (!first) return [];
  return [parseId(first.a), parseId(first.b)].filter((n): n is number => n != null);
}

function itemName(it: ArchiveItem | undefined, fallback: string) {
  return it?.analysis?.product?.name || it?.observed_name || fallback.replace(/^#\d+\s*/, "") || fallback;
}

function outcomeFromReason(reason: string, gasWord: string) {
  if (/氯气/.test(reason) || /chlorine/i.test(reason)) return gasWord;
  const after = reason.split(/[：:—–-]/)[1];
  if (after) return after.replace(/——.*/, "").trim().slice(0, 18);
  return reason.slice(0, 18);
}

function pairLine(reason: string) {
  const head = reason.split(/[：:]/)[0] || reason;
  return head.replace(/——.*/, "").trim();
}

function Thumb({
  item, api, label, unnamed,
}: {
  item: ArchiveItem | undefined;
  api: string;
  label: string;
  unnamed: string;
}) {
  const name = itemName(item, label);
  const src = item?.image_path ? `${api}/${item.image_path}` : null;
  return (
    <div className="hero-thumb">
      {src
        ? <img src={src} alt={name} />
        : <span className="hero-thumb-fallback">{name.slice(0, 1)}</span>}
      <b>{name}</b>
    </div>
  );
}

export default function CrossAlertHero({
  items, cross, api, pending,
}: {
  items: ArchiveItem[];
  cross: CrossRisk[] | undefined;
  api: string;
  pending?: boolean;
}) {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const hot = (cross || []).find((c) => c.severity === "critical" || c.severity === "high") || (cross || [])[0];

  if (pending && !hot) {
    return (
      <section className="cross-hero is-clear" aria-live="polite">
        <span className="cross-hero-ok">…</span>
        <div>
          <b>{t.genReportBusy}</b>
        </div>
      </section>
    );
  }

  if (!hot) {
    return (
      <section className="cross-hero is-clear" aria-live="polite">
        <span className="cross-hero-ok">✓</span>
        <div>
          <b>{t.heroClear}</b>
          <p>{t.noCross}</p>
        </div>
      </section>
    );
  }

  const idA = parseId(hot.a);
  const idB = parseId(hot.b);
  const itemA = items.find((it) => it.id === idA);
  const itemB = items.find((it) => it.id === idB);
  const sameBottle = !idB;

  return (
    <section className={`cross-hero is-hot sev-${hot.severity}`} aria-live="assertive">
      <div className="cross-hero-pair">
        <Thumb item={itemA} api={api} label={hot.a} unnamed={t.unnamed} />
        <span className="cross-hero-x" aria-hidden="true">✕</span>
        {sameBottle
          ? <div className="hero-thumb is-text"><b>{hot.b}</b></div>
          : <Thumb item={itemB} api={api} label={hot.b} unnamed={t.unnamed} />}
      </div>
      <div className="cross-hero-copy">
        <em>{outcomeFromReason(hot.reason, t.heroGas)}</em>
        <b>{pairLine(hot.reason)}</b>
        <p className="cross-hero-action">{t.heroAction}</p>
        <ul>
          <li>{t.heroAir}</li>
          <li>{t.heroDrain}</li>
        </ul>
      </div>
    </section>
  );
}
