"use client";

// 反馈建议：独立页面（从「我的 → 反馈建议」进入）。
// 真实用户反馈是比赛评分项，这里给一个完整、认真的提交入口，而不是一行 👍👎。

import { useEffect, useState } from "react";
import { useLang } from "../../i18n";
import AppShell from "../../AppShell";
import { loadProfile, selectedLabels } from "../../profile";
import "../../scan/report-extra.css";

const API = "";

export default function MobileFeedbackPage() {
  const { lang } = useLang();
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  // 画像已设置时预填人群标签，省一步输入（惰性初始化，避免 effect 里同步 setState）
  const [audience, setAudience] = useState(() => selectedLabels(loadProfile(), lang).join("、"));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/api/feedback/stats`)
      .then((r) => r.json())
      .then((d) => setTotal(typeof d.total === "number" ? d.total : null))
      .catch(() => {});
  }, [done]);

  const submit = async () => {
    if (!rating || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim(), audience: audience.trim(), page: "m-feedback" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDone(true);
    } catch {
      setError(lang === "zh" ? "提交失败，请检查后端连接后再试一次。" : "Submit failed. Check the backend and retry.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell active="me">
      <div className={`scan-page${lang === "zh" ? " lang-zh" : ""}`}>
        <header className="page-head">
          <h1>{lang === "zh" ? "反馈建议" : "Feedback"}</h1>
          <p>{lang === "zh"
            ? "你的每一条反馈都会原样进入我们的改进清单与比赛评审材料。"
            : "Every note goes straight into our improvement list and the competition review."}</p>
        </header>

        {done ? (
          <section className="fbp-done">
            <b>{lang === "zh" ? "感谢你的反馈！" : "Thank you!"}</b>
            <p>{lang === "zh"
              ? "已原样记录。我们会逐条阅读，下次更新时回来看变化。"
              : "Recorded as-is. We read every single one — come back to see what changed."}</p>
            <button className="fbp-again" onClick={() => { setDone(false); setRating(null); setComment(""); }}>
              {lang === "zh" ? "再写一条" : "Write another"}
            </button>
          </section>
        ) : (
          <section className="fbp-form">
            <h3>{lang === "zh" ? "总体感觉怎么样？" : "Overall, how is it?"}</h3>
            <div className="fbp-rating">
              <button
                className={`fbp-rate${rating === "up" ? " is-on" : ""}`}
                onClick={() => setRating("up")}
              >
                👍 {lang === "zh" ? "有帮助" : "Helpful"}
              </button>
              <button
                className={`fbp-rate${rating === "down" ? " is-on" : ""}`}
                onClick={() => setRating("down")}
              >
                👎 {lang === "zh" ? "有待改进" : "Needs work"}
              </button>
            </div>

            <h3>{lang === "zh" ? "具体说说（可选）" : "Tell us more (optional)"}</h3>
            <textarea
              className="fbp-comment"
              rows={5}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={lang === "zh"
                ? "哪里好用、哪里不对、希望增加什么……识别错了也请告诉我们错在哪。"
                : "What worked, what didn't, what's missing… If recognition was wrong, tell us how."}
            />
            <p className="fbp-count">{comment.length}/500</p>

            <h3>{lang === "zh" ? "你家的情况（可选）" : "Your household (optional)"}</h3>
            <input
              className="fbp-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              maxLength={50}
              placeholder={lang === "zh" ? "如：有2岁宝宝、养猫、家有老人" : "e.g. toddler, cat, elderly"}
            />

            {error && <p className="scan-error">⚠ {error}</p>}

            <button className="fbp-submit" onClick={() => void submit()} disabled={!rating || sending}>
              {sending
                ? (lang === "zh" ? "提交中…" : "Sending…")
                : (lang === "zh" ? "提交反馈" : "Submit feedback")}
            </button>
            {!rating && (
              <p className="fbp-hint">{lang === "zh" ? "先选一个总体评价就能提交" : "Pick an overall rating to submit"}</p>
            )}
          </section>
        )}

        {total !== null && total > 0 && (
          <p className="fbp-total">
            {lang === "zh" ? `已收到 ${total} 条真实用户反馈` : `${total} pieces of real user feedback so far`}
          </p>
        )}
      </div>
    </AppShell>
  );
}
