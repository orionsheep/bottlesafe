"use client";

// 方向① 语音问答 + 方向③ 知识图谱多维解读
// 语音识别用浏览器 Web Speech API（Chrome/Edge，zh-CN），零成本零依赖；
// 不支持语音的环境自动降级为文字输入，功能不缺失。

import { useRef, useState } from "react";
import { SCAN_COPY, useLang } from "../i18n";

const API = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? "http://127.0.0.1:8000" : "";

type KgNode = { id: string; type: string; name: string };
type AskResponse = {
  answer: string;
  graph: { matched_nodes: KgNode[]; facts: string[]; advice: string[]; cross_risks: { a: string; b: string; reason: string }[] };
  related_items: { id: number; name: string; matched: string[]; risk_level: string }[];
};

export default function Assistant() {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, mode: "auto" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setResult(data);
    } catch {
      setResult({ answer: lang === "zh" ? "后端未连接——请确认服务运行在 127.0.0.1:8000。" : "Backend offline — expected at 127.0.0.1:8000.",
                  graph: { matched_nodes: [], facts: [], advice: [], cross_risks: [] }, related_items: [] });
    } finally {
      setBusy(false);
    }
  };

  const startVoice = () => {
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setVoiceOk(false); return; }
    type Rec = { lang: string; interimResults: boolean; maxAlternatives: number;
                 onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
                 onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
    const rec = new (SR as new () => Rec)();
    rec.lang = lang === "zh" ? "zh-CN" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) { setQuestion(text); void ask(text); }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const stopVoice = () => { recRef.current?.stop(); setListening(false); };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "zh" ? "zh-CN" : "en-US";
    u.rate = 1.05;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  return (
    <section className="assistant-section">
      <p className="section-no">{t.voiceNo}</p>
      <h2>{t.voiceTitle}</h2>
      <p className="assistant-hint">{t.voiceHint}</p>

      <div className="ask-bar">
        <button className={`mic-btn${listening ? " listening" : ""}`} onClick={listening ? stopVoice : startVoice}
                aria-label={listening ? t.micListening : t.micStart}>
          <i />{listening ? t.micListening : t.micStart}
        </button>
        <input value={question} onChange={(e) => setQuestion(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void ask(question); }}
               placeholder={voiceOk ? (lang === "zh" ? "也可以直接打字提问…" : "Or just type your question…") : t.micUnsupported} />
        <button className="ask-btn" onClick={() => void ask(question)} disabled={busy || !question.trim()}>
          {busy ? t.asking : t.askBtn}
        </button>
      </div>

      <div className="chip-rows">
        {[t.chipSymptom, t.chipScene, t.chipPeople].map((label, gi) => (
          <span key={label} className="chip-group">
            <em>{label}</em>
            {t.chips.slice(gi * 2, gi * 2 + 2).map((c) => (
              <button key={c} onClick={() => { setQuestion(c); void ask(c); }}>{c}</button>
            ))}
          </span>
        ))}
      </div>

      {busy && <div className="ask-bubble skeleton">{t.asking}</div>}
      {result && !busy && (
        <div className="ask-result">
          <div className="ask-bubble">
            <p>{result.answer}</p>
            {"speechSynthesis" in window && (
              <button className="speak-btn" onClick={() => speak(result.answer)}>
                {speaking ? `■ ${t.stopSpeak}` : `🔊 ${t.speak}`}
              </button>
            )}
          </div>
          {result.related_items.length > 0 && (
            <div className="related-box">
              <h4>{t.relatedItems}</h4>
              <ul>{result.related_items.map((it) => (
                <li key={it.id}><b className={`risk-dot risk-${it.risk_level}`}>●</b> #{it.id} {it.name || "?"}<small>{it.matched.join(" · ")}</small></li>
              ))}</ul>
            </div>
          )}
          {result.graph.facts.length > 0 && (
            <details className="kg-details">
              <summary>{t.graphFacts}（{result.graph.facts.length}）</summary>
              <ul>{result.graph.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
