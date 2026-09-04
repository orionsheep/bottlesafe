"use client";

// 家庭成分报告：独立页面。根据家庭档案自动生成完整报告（简报 + 详情默认展开 + 时间线）。
// 从「我的 → 家庭报告」进入；档案页里的折叠简报保留不变。

import { useCallback, useEffect, useState } from "react";
import { useLang } from "../../i18n";
import AppShell from "../../AppShell";
import ReportPanel, { type Report } from "../../scan/report";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

export default function MobileReportPage() {
  const { lang } = useLang();
  const [nItems, setNItems] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/household/report`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => {
        const n = (d.items ?? []).length;
        setNItems(n);
        if (n > 0) void generate();
      })
      .catch(() => setNItems(0));
  }, [generate]);

  return (
    <AppShell active="me">
      <div className={`scan-page${lang === "zh" ? " lang-zh" : ""}`}>
        <header className="page-head">
          <h1>{lang === "zh" ? "家庭成分报告" : "Household report"}</h1>
          <p>{lang === "zh"
            ? "根据家庭档案自动生成：整体怎么样、哪些优先、具体哪几件、下一步怎么办。"
            : "Generated from your archive: overall status, priorities, exact items, next steps."}</p>
        </header>

        {nItems === 0 && (
          <p className="archive-empty">
            {lang === "zh" ? "档案还是空的。先去「识别」拍一瓶，再回来看报告。" : "Archive is empty. Scan a bottle first."}
          </p>
        )}

        {busy && !report && (
          <p className="assistant-hint">{lang === "zh" ? "正在分析你的家…（约半分钟）" : "Analyzing your home…"}</p>
        )}

        {nItems !== null && nItems > 0 && (
          <ReportPanel
            nItems={nItems}
            report={report}
            busy={busy}
            error={error}
            onGenerate={() => void generate()}
            defaultOpen
          />
        )}
      </div>
    </AppShell>
  );
}
