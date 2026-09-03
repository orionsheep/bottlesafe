"use client";

// AI 安全管家：微信式对话界面。
// 语音识别用浏览器 Web Speech API（Chrome/Edge，zh-CN），零成本零依赖；
// 不支持语音的环境自动降级为文字输入，功能不缺失。
// 上下文：家庭画像（localStorage）+ 最近档案品名；回答经 /api/ask（知识图谱 + 硅基流动 LLM）。

import { useEffect, useRef, useState } from "react";
import { SCAN_COPY, useLang } from "../i18n";
import { emptyProfile, loadProfile, loadStorage, selectedLabels, toAskContext, type HouseholdProfile } from "../profile";
import "./report-extra.css";

const API =
  typeof window !== "undefined"
    ? (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
        ? "http://127.0.0.1:8000"
        : `http://${window.location.hostname}:8000`)
    : "";

type KgNode = { id: string; type: string; name: string };
type AskMeta = {
  graph: { matched_nodes: KgNode[]; facts: string[]; advice: string[]; cross_risks: { a: string; b: string; reason: string }[] };
  related_items: { id: number; name: string; matched: string[]; risk_level: string }[];
};
type Msg = { role: "user" | "assistant"; content: string; meta?: AskMeta };

export default function Assistant() {
  const { lang } = useLang();
  const t = SCAN_COPY[lang];
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [profile, setProfile] = useState<HouseholdProfile>(emptyProfile);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // 开场白素材：本地画像 + 最近 3 件档案品名
  useEffect(() => {
    const sync = () => setProfile(loadProfile());
    sync();
    window.addEventListener("bottlesafe-profile", sync);
    fetch(`${API}/api/household/items`)
      .then((r) => r.json())
      .then((d) => {
        const names: string[] = (d.items ?? [])
          .map((it: { observed_name?: string; analysis?: { product?: { name?: string | null } } }) =>
            it.observed_name || it.analysis?.product?.name || "")
          .filter(Boolean);
        setRecentNames(names.slice(-3).reverse());
      })
      .catch(() => {});
    return () => window.removeEventListener("bottlesafe-profile", sync);
  }, []);

  // 从其他页带 #assistant 锚点进来时，客户端渲染完成后滚到本区块
  useEffect(() => {
    if (window.location.hash === "#assistant") {
      threadRef.current?.closest(".assistant-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // 新消息自动滚到底（微信式）
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          mode: "auto",
          history: next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          context: toAskContext(loadProfile(), loadStorage()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      const graph = data.graph ?? { matched_nodes: [], facts: [], advice: [], cross_risks: [] };
      const related = Array.isArray(data.related_items) ? data.related_items : [];
      setMessages([...next, { role: "assistant", content: data.answer, meta: { graph, related_items: related } }]);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const fallback = lang === "zh"
        ? `回答失败：${detail}。请确认后端在 127.0.0.1:8000 且已配置文本模型。`
        : `Ask failed: ${detail}`;
      setMessages([...next, { role: "assistant", content: fallback }]);
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
      if (text) void ask(text);
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

  const profileLabels = selectedLabels(profile, lang);
  const greeting = lang === "zh"
    ? [
        "你好，我是你的家庭安全管家。",
        profileLabels.length
          ? `我记着你的画像（${profileLabels.join("、")}），回答会按这个来。`
          : "还没设置家庭画像，点上方画像条配置后我会按你家情况回答。",
        recentNames.length ? `最近扫过的 ${recentNames.join("、")} 我也还记得，随时可以问。` : "",
      ].join("")
    : [
        "Hi, I'm your home-safety butler. ",
        profileLabels.length
          ? `I remember your household profile (${profileLabels.join(", ")}) and will answer accordingly. `
          : "No household profile yet — set it via the profile bar above and I'll tailor answers to your home. ",
        recentNames.length ? `I still remember your recently scanned ${recentNames.join(", ")} — ask me anytime.` : "",
      ].join("");

  const quickChips: string[] = lang === "zh"
    ? ["结合我家情况，看看这款产品能用吗", "对比我扫过的产品，挑更合适的一款", "拍不清的成分表，帮我看看要注意什么",
       "皮肤发红还痒", "总在家咳嗽", "厨房有什么危险", "卫生间有什么危险"]
    : ["Given my household, is this product OK to use?", "Compare the products I scanned and pick a better one", "The ingredient list is blurry — what should I watch for?",
       "Skin red and itchy", "Coughing at home", "Kitchen hazards", "Bathroom hazards"];

  return (
    <section className="assistant-chat" id="assistant">
      <div className="chat-thread" ref={threadRef}>
        {/* 开场白：管家的第一条消息 */}
        <div className="msg-row bot">
          <span className="msg-avatar" aria-hidden="true">安</span>
          <div className="msg-bubble">{greeting}</div>
        </div>

        {messages.length === 0 && (
          <div className="chat-chips">
            {quickChips.map((c) => (
              <button key={c} type="button" onClick={() => void ask(c)}>{c}</button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg-row ${m.role === "user" ? "user" : "bot"}`}>
            {m.role === "assistant" && <span className="msg-avatar" aria-hidden="true">安</span>}
            <div className="msg-main">
              <div className="msg-bubble">{m.content}</div>
              {m.role === "assistant" && (
                <div className="msg-side">
                  {"speechSynthesis" in window && (
                    <button type="button" className="msg-speak" onClick={() => speak(m.content)}>
                      {speaking ? "■" : "🔊"}
                    </button>
                  )}
                  {m.meta && (m.meta.related_items?.length ?? 0) > 0 && (
                    <span className="msg-related">
                      {t.relatedItems}：{m.meta.related_items.map((it) => `#${it.id} ${it.name || "?"}`).join("、")}
                    </span>
                  )}
                  {m.meta && (m.meta.graph?.facts?.length ?? 0) > 0 && (
                    <details className="msg-facts">
                      <summary>{t.graphFacts}（{m.meta.graph.facts.length}）</summary>
                      <ul>{m.meta.graph.facts.map((f, fi) => <li key={fi}>{f}</li>)}</ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg-row bot">
            <span className="msg-avatar" aria-hidden="true">安</span>
            <div className="msg-bubble msg-typing">{t.asking}…</div>
          </div>
        )}
      </div>

      <div className="chat-input-bar">
        {voiceOk && (
          <button type="button" className={`chat-mic${listening ? " listening" : ""}`} onClick={listening ? stopVoice : startVoice}
                  aria-label={listening ? t.micListening : t.micStart}>
            <i />
          </button>
        )}
        <input value={question} onChange={(e) => setQuestion(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void ask(question); }}
               placeholder={voiceOk ? (lang === "zh" ? "打字或点左侧说话…" : "Type, or tap the mic…") : t.micUnsupported} />
        <button type="button" className="chat-send" onClick={() => void ask(question)} disabled={busy || !question.trim()}
                aria-label={t.askBtn}>↑</button>
      </div>
    </section>
  );
}
