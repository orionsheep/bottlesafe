"use client";

// 桌面端 AI 安全管家：右下角悬浮球，点开即聊。
// 复用 Assistant 组件（语音/打字、画像与档案上下文）；
// 导航里的「AI 助手」按钮通过 bottlesafe-open-assistant 事件唤起本面板。

import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import Assistant from "./assistant";

export default function AssistantFab() {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("bottlesafe-open-assistant", onOpen);
    return () => window.removeEventListener("bottlesafe-open-assistant", onOpen);
  }, []);

  return (
    <>
      {open && (
        <div className="assist-panel" role="dialog" aria-label={lang === "zh" ? "AI 安全管家" : "AI assistant"}>
          <div className="assist-panel-head">
            <b>{lang === "zh" ? "AI 安全管家" : "AI safety assistant"}</b>
            <button className="assist-close" onClick={() => setOpen(false)} aria-label={lang === "zh" ? "关闭" : "Close"}>×</button>
          </div>
          <Assistant />
        </div>
      )}
      <button
        className={`assist-fab${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={lang === "zh" ? "打开 AI 安全管家" : "Open AI assistant"}
      >
        {open ? "×" : "安"}
      </button>
    </>
  );
}

/** 导航「AI 助手」按钮的点击处理：唤起悬浮面板。 */
export function openAssistant() {
  window.dispatchEvent(new Event("bottlesafe-open-assistant"));
}
