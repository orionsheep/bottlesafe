"use client";

// AI 安全管家：独立页（底部 tab 正中）。
// 复用识别页里的 Assistant 组件：语音/打字提问，结合家庭画像与最近扫描记录回答。

import { useLang } from "../../i18n";
import AppShell from "../../AppShell";
import Assistant from "../../scan/assistant";

export default function MobileAssistantPage() {
  const { lang } = useLang();
  return (
    <AppShell active="assistant">
      <div className={`scan-page assistant-page${lang === "zh" ? " lang-zh" : ""}`}>
        <header className="page-head">
          <h1>{lang === "zh" ? "AI 安全管家" : "AI safety assistant"}</h1>
          <p>{lang === "zh"
            ? "语音或打字提问，结合你的家庭画像与档案回答"
            : "Ask by voice or text — tailored to your household profile and archive."}</p>
        </header>
        <Assistant />
      </div>
    </AppShell>
  );
}
