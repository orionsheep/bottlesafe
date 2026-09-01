"use client";

import { useState } from "react";
import { useLang, SCAN_COPY } from "../i18n";

const API =
  typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "";

export default function FeedbackBar({ page }: { page: string }) {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [audience, setAudience] = useState("");

  const submit = async (r: "up" | "down") => {
    if (sending) return;
    setSending(true);
    try {
      await fetch(`${API}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: r, comment, audience, page }),
      });
      setDone(true);
    } catch { /* ignore */ } finally { setSending(false); }
  };

  if (done) {
    return (
      <p className="feedback-done">
        {lang === "zh" ? "感谢反馈！这会帮助我们变得更好。" : "Thanks! Your feedback helps us improve."}
      </p>
    );
  }

  return (
    <div className="feedback-bar">
      <span className="feedback-q">{lang === "zh" ? "这个识别结果对你有用吗？" : "Was this helpful?"}</span>
      <button className="fb-btn" onClick={() => { setRating("up"); setOpen(true); }} disabled={sending} aria-label="up">👍</button>
      <button className="fb-btn" onClick={() => { setRating("down"); setOpen(true); }} disabled={sending} aria-label="down">👎</button>

      {open && (
        <div className="fb-form">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={lang === "zh" ? "一句话说说（可选）" : "A quick note (optional)"}
          />
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder={lang === "zh" ? "你家的情况（如：有2岁宝宝/养猫，可选）" : "Your household (optional)"}
          />
          <button className="fb-submit" onClick={() => submit(rating!)} disabled={sending}>
            {sending ? (lang === "zh" ? "提交中…" : "Sending…") : (lang === "zh" ? "提交" : "Send")}
          </button>
        </div>
      )}
    </div>
  );
}
