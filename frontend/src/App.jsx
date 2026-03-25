import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import {
  askAI,
  fetchNews,
  summarizeNews,
  getTimeline,
  getPersonalizedFeed,
} from "./services/api";

/* ─── Design system ─────────────────────────────────────────────────────────── */
const DS = {
  bg: "#0a0a0f",
  surface: "#111118",
  surfaceHover: "#18181f",
  border: "#1e1e2a",
  accent: "#e8a034",
  accentDim: "#e8a03420",
  accentHover: "#f0b44a",
  textPrimary: "#f0ede8",
  textSecondary: "#8a8795",
  textDim: "#4a4855",
  red: "#e05252",
  green: "#52c87a",
  blue: "#5289e0",
  purple: "#9b72e8",
  fontDisplay: "'Playfair Display', Georgia, serif",
  fontBody: "'DM Sans', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', monospace",
};

if (!document.getElementById("et-fonts")) {
  const link = document.createElement("link");
  link.id = "et-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400&display=swap";
  document.head.appendChild(link);
}

if (!document.getElementById("et-style")) {
  const s = document.createElement("style");
  s.id = "et-style";
  s.textContent = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:${DS.bg};color:${DS.textPrimary};font-family:${DS.fontBody}}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-track{background:${DS.bg}}
    ::-webkit-scrollbar-thumb{background:${DS.border};border-radius:2px}
    a{color:${DS.accent};text-decoration:none}
    a:hover{color:${DS.accentHover}}
    input,textarea{background:${DS.surface};border:1px solid ${DS.border};border-radius:8px;color:${DS.textPrimary};font-family:${DS.fontBody};font-size:14px;padding:10px 14px;outline:none;transition:border-color .2s;width:100%}
    input:focus,textarea:focus{border-color:${DS.accent}}
    input::placeholder{color:${DS.textDim}}
    button{cursor:pointer;font-family:${DS.fontBody}}
    @keyframes fadeSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.7}}
    @keyframes ripple{0%{box-shadow:0 0 0 0 rgba(232,160,52,.4)}100%{box-shadow:0 0 0 18px rgba(232,160,52,0)}}
    .fade-in{animation:fadeSlide .3s ease both}
    .ticker-wrap{overflow:hidden;border-top:1px solid ${DS.border};border-bottom:1px solid ${DS.border}}
    .ticker-inner{display:flex;animation:ticker 30s linear infinite;white-space:nowrap}
    .ticker-inner:hover{animation-play-state:paused}
    .mic-listening{animation:ripple 1.2s ease-out infinite,pulse 1.2s ease-in-out infinite}
  `;
  document.head.appendChild(s);
}

/* ─── Primitives ─────────────────────────────────────────────────────────────── */
const Btn = ({ children, onClick, disabled, variant = "primary", style: s = {} }) => {
  const base = { padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 500, letterSpacing: ".02em", transition: "all .15s", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...s };
  const v = { primary: { background: DS.accent, color: "#000" }, ghost: { background: "transparent", color: DS.textSecondary, border: `1px solid ${DS.border}` } };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...(v[variant] || v.primary) }}>{children}</button>;
};

const Card = ({ children, style: s = {}, className = "" }) => (
  <div className={className} style={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: 12, padding: "20px 24px", ...s }}>{children}</div>
);

const Spinner = () => (
  <span style={{ display: "inline-block", width: 13, height: 13, border: `2px solid ${DS.border}`, borderTopColor: DS.accent, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
);

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", color: DS.textDim, marginBottom: 12 }}>{children}</div>
);

const Pill = ({ children, active, color = DS.accent, onClick }) => (
  <button onClick={onClick} style={{
    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s",
    background: active ? color + "20" : "transparent",
    color: active ? color : DS.textDim,
    border: `1px solid ${active ? color + "50" : DS.border}`,
  }}>{children}</button>
);


/* ═══════════════════════════════════════════════════════════════════════════════
   🎤 VOICE SYSTEM
═══════════════════════════════════════════════════════════════════════════════ */
const VoiceCtx = createContext(null);

function VoiceProvider({ children }) {
  const [listening,   setListening]   = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const [interimText, setInterimText] = useState("");
  const [activeOwner, setActiveOwner] = useState(null);
  const [supported,   setSupported]   = useState(false);

  const accTextRef  = useRef("");
  const onDoneRef   = useRef(null);
  const ownerRef    = useRef(null);
  const recRef      = useRef(null);
  const audioRef    = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const startListening = useCallback((ownerId, onDone) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || listening) return;

    if (recRef.current) { try { recRef.current.abort(); } catch {} }

    const rec = new SR();
    rec.lang           = "en-IN";
    rec.continuous     = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    accTextRef.current  = "";
    onDoneRef.current   = onDone || null;
    ownerRef.current    = ownerId;
    recRef.current      = rec;

    rec.onstart = () => {
      setListening(true);
      setActiveOwner(ownerId);
      setInterimText("");
    };

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          accTextRef.current += t + " ";
          setInterimText("");
        } else {
          interim += t;
        }
      }
      if (interim) setInterimText(interim);
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech") {
        const text = accTextRef.current.trim();
        if (text && onDoneRef.current) onDoneRef.current(text);
      } else {
        console.error("STT error:", e.error);
      }
      setListening(false);
      setActiveOwner(null);
      setInterimText("");
      ownerRef.current = null;
    };

    rec.onend = () => {
      const text = accTextRef.current.trim();
      if (text && onDoneRef.current) {
        onDoneRef.current(text);
      }
      accTextRef.current = "";
      onDoneRef.current  = null;
      ownerRef.current   = null;
      setListening(false);
      setActiveOwner(null);
      setInterimText("");
    };

    try { rec.start(); } catch (err) { console.error("rec.start() failed:", err); }
  }, [listening]);

  const stopListening = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
    }
  }, []);

  const speak = useCallback(async (text, voice = "nova") => {
    if (!text?.trim()) return;
    if (audioRef.current) {
      audioRef.current.pause();
      try { URL.revokeObjectURL(audioRef.current.src); } catch {}
      audioRef.current = null;
    }
    setSpeaking(true);
    try {
      const res = await fetch("http://localhost:5000/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4000), voice }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(false); try { URL.revokeObjectURL(url); } catch {} audioRef.current = null; };
      audio.onerror = () => { setSpeaking(false); audioRef.current = null; };
      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
      setSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
  }, []);

  const value = { listening, speaking, interimText, activeOwner, supported, startListening, stopListening, speak, stopSpeaking };
  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}

const useVoiceCtx = () => useContext(VoiceCtx);


/* ─── MIC BUTTON ─────────────────────────────────────────────────────────────── */
function MicBtn({ id, onDone, style: s = {} }) {
  const { listening, interimText, activeOwner, supported, startListening, stopListening } = useVoiceCtx();
  if (!supported) return null;

  const isMine    = activeOwner === id;
  const otherBusy = listening && !isMine;

  const toggle = () => {
    if (isMine) stopListening();
    else if (!otherBusy) startListening(id, onDone);
  };

  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        onClick={toggle}
        disabled={otherBusy}
        className={isMine ? "mic-listening" : ""}
        title={isMine ? "Listening… click to stop" : otherBusy ? "Mic in use elsewhere" : "Speak"}
        style={{
          width: 40, height: 40, borderRadius: "50%", border: "none", flexShrink: 0,
          background: isMine ? DS.accent : DS.surfaceHover,
          color:      isMine ? "#000"    : DS.textSecondary,
          opacity:    otherBusy ? 0.35 : 1,
          fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .2s", cursor: otherBusy ? "not-allowed" : "pointer", ...s,
        }}
      >
        {isMine ? "⏹" : "🎤"}
      </button>
      {isMine && (
        <div style={{
          position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)",
          background: DS.surface, border: `1px solid ${DS.accent}60`, borderRadius: 8,
          padding: "6px 14px", fontSize: 12, color: DS.accent, whiteSpace: "nowrap",
          maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", zIndex: 200,
          boxShadow: "0 4px 24px rgba(0,0,0,.6)",
          animation: "fadeSlide .2s ease",
        }}>
          {interimText || "🎤 Listening…"}
        </div>
      )}
    </div>
  );
}


/* ─── SPEAK BUTTON ───────────────────────────────────────────────────────────── */
function SpeakBtn({ text, voice = "nova" }) {
  const { speaking, speak, stopSpeaking } = useVoiceCtx();
  return (
    <button
      onClick={speaking ? stopSpeaking : () => speak(text, voice)}
      title={speaking ? "Stop" : "Read aloud"}
      style={{
        background: "transparent", border: `1px solid ${DS.border}`, borderRadius: 6,
        color: speaking ? DS.accent : DS.textDim, fontSize: 12, padding: "4px 10px",
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, transition: "all .15s",
      }}
    >
      {speaking ? "⏹ Stop" : "🔊 Listen"}
    </button>
  );
}


/* ─── BOOKMARK HOOK ──────────────────────────────────────────────────────────── */
function useBookmarks() {
  const [bookmarks, setBookmarks] = useState([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("http://localhost:5000/bookmarks");
      const data = await r.json();
      setBookmarks(data.bookmarks || []);
    } catch (e) { console.error("Bookmark load failed:", e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (article) => {
    try {
      const r = await fetch("http://localhost:5000/bookmarks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article }),
      });
      if (r.status === 409) return;
      const data = await r.json();
      setBookmarks((prev) => [data.bookmark, ...prev]);
      if (article.title) {
        const topic = article.title.split(" ").slice(0, 3).join(" ");
        fetch("http://localhost:5000/preferences/track", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, action: "bookmark" }),
        }).catch(() => {});
      }
    } catch (e) { console.error("Bookmark add failed:", e); }
  }, []);

  const remove = useCallback(async (url) => {
    try {
      await fetch("http://localhost:5000/bookmarks", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setBookmarks((prev) => prev.filter((b) => b.url !== url));
    } catch (e) { console.error("Bookmark remove failed:", e); }
  }, []);

  const isSaved = useCallback((url) => bookmarks.some((b) => b.url === url), [bookmarks]);

  return { bookmarks, add, remove, isSaved, reload: load };
}


/* ─── BOOKMARK BUTTON ────────────────────────────────────────────────────────── */
function BookmarkBtn({ article, bookmarks }) {
  const saved = bookmarks.isSaved(article.url);
  return (
    <button
      onClick={() => saved ? bookmarks.remove(article.url) : bookmarks.add(article)}
      title={saved ? "Remove bookmark" : "Save article"}
      style={{
        background: saved ? DS.accent + "20" : "transparent",
        border: `1px solid ${saved ? DS.accent + "60" : DS.border}`,
        borderRadius: 6, color: saved ? DS.accent : DS.textDim,
        fontSize: 12, padding: "4px 10px", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 4, transition: "all .15s",
      }}
    >
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}


/* ─── SMART SUGGESTIONS ──────────────────────────────────────────────────────── */
function SmartSuggestions({ onSelect }) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/preferences/suggestions")
      .then((r) => r.json())
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(() => {});
  }, []);

  if (!suggestions.length) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: DS.textDim, letterSpacing: ".08em" }}>For you:</span>
      {suggestions.map((s) => (
        <button
          key={s.topic}
          onClick={() => onSelect(s.topic)}
          style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
            background: DS.accent + "15", color: DS.accent,
            border: `1px solid ${DS.accent}30`, fontWeight: 500,
          }}
        >
          {s.topic}
        </button>
      ))}
    </div>
  );
}


/* ─── BOOKMARKS TAB ──────────────────────────────────────────────────────────── */
function BookmarksTab({ bookmarks }) {
  const { speak, speaking, stopSpeaking } = useVoiceCtx();

  const readAll = () => {
    if (speaking) { stopSpeaking(); return; }
    const allText = bookmarks.bookmarks
      .map((b) => `${b.title}. ${b.description || ""}`)
      .join(". Next article: ");
    speak(allText);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>Saved Articles</h2>
          <p style={{ color: DS.textSecondary, fontSize: 13, marginTop: 4 }}>
            {bookmarks.bookmarks.length} article{bookmarks.bookmarks.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        {bookmarks.bookmarks.length > 0 && (
          <Btn onClick={readAll} variant="ghost">
            {speaking ? "⏹ Stop" : "🔊 Read All"}
          </Btn>
        )}
      </div>

      {bookmarks.bookmarks.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>☆</div>
          <p style={{ color: DS.textDim, fontSize: 14 }}>No bookmarks yet. Hit ☆ Save on any article.</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bookmarks.bookmarks.map((b) => (
            <Card key={b.id} className="fade-in" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <a href={b.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 15, fontWeight: 500, color: DS.textPrimary, lineHeight: 1.4, display: "block", marginBottom: 5 }}>
                  {b.title}
                </a>
                {b.description && (
                  <p style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5, marginBottom: 8 }}>{b.description}</p>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: DS.textDim }}>
                    {new Date(b.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <SpeakBtn text={`${b.title}. ${b.description || ""}`} />
                  <button
                    onClick={() => bookmarks.remove(b.url)}
                    style={{ background: "transparent", border: `1px solid ${DS.border}`, borderRadius: 6, color: DS.red, fontSize: 11, padding: "3px 9px", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


/* ─── Ticker ─────────────────────────────────────────────────────────────────── */
const Ticker = ({ articles }) => {
  if (!articles.length) return null;
  const items = [...articles, ...articles];
  return (
    <div className="ticker-wrap" style={{ padding: "7px 0" }}>
      <div className="ticker-inner">
        {items.map((a, i) => (
          <span key={i} style={{ color: DS.textSecondary, fontSize: 12, marginRight: 48 }}>
            <span style={{ color: DS.accent, marginRight: 8 }}>◆</span>{a.title}
          </span>
        ))}
      </div>
    </div>
  );
};


/* ─── NAVIGATOR ──────────────────────────────────────────────────────────────── */
function NavigatorTab({ articles, bookmarks }) {
  const [briefing, setBriefing]   = useState("");
  const [question, setQuestion]   = useState("");
  const [answer,   setAnswer]     = useState("");
  const [loadB,    setLoadB]      = useState(false);
  const [loadQ,    setLoadQ]      = useState(false);
  const { listening, interimText, speak } = useVoiceCtx();
  const suggested = ["What's the market impact?", "Who are the key players?", "What are the risks?", "What happens next?"];

  const genBriefing = async () => {
    setLoadB(true);
    try { const r = await summarizeNews(articles); setBriefing(r.data.summary); } finally { setLoadB(false); }
  };

  const ask = async (q) => {
    const txt = (q || question).trim();
    if (!txt) return;
    setLoadQ(true);
    try {
      const r = await askAI(txt, articles);
      const ans = r.data.result;
      setAnswer(ans);
      speak(ans);
    } finally { setLoadQ(false); }
  };

  const handleVoiceDone = (text) => {
    setQuestion(text);
    ask(text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>Intelligence Briefing</h2>
          <p style={{ color: DS.textSecondary, fontSize: 13, marginTop: 4 }}>{articles.length} articles synthesized into one explorable document</p>
        </div>
        <Btn onClick={genBriefing} disabled={loadB || !articles.length}>{loadB ? <><Spinner /> Generating…</> : "Generate Briefing"}</Btn>
      </div>

      {briefing && (
        <Card className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionLabel>AI Briefing</SectionLabel>
            <SpeakBtn text={briefing} />
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: DS.textPrimary, whiteSpace: "pre-wrap" }}>{briefing}</p>
        </Card>
      )}

      <Card>
        <SectionLabel>Ask a follow-up {<span style={{ color: DS.accent }}>· Voice enabled 🎤</span>}</SectionLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask anything… or tap 🎤 to speak"
            style={{ flex: 1, borderColor: listening ? DS.accent : undefined }}
          />
          <MicBtn id="navigator-ask" onDone={handleVoiceDone} />
          <Btn onClick={() => ask()} disabled={loadQ || !question.trim()}>{loadQ ? <Spinner /> : "Ask"}</Btn>
        </div>
        {listening && (
          <p style={{ fontSize: 12, color: DS.accent, marginBottom: 10 }}>
            🎤 {interimText || "Listening… speak your question"}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {suggested.map((s) => <Pill key={s} onClick={() => { setQuestion(s); ask(s); }}>{s}</Pill>)}
        </div>
      </Card>

      {answer && (
        <Card className="fade-in" style={{ borderLeft: `3px solid ${DS.accent}`, borderRadius: "0 12px 12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionLabel>Answer</SectionLabel>
            <SpeakBtn text={answer} />
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: DS.textPrimary, whiteSpace: "pre-wrap" }}>{answer}</p>
        </Card>
      )}

      {articles.length > 0 && (
        <div>
          <SectionLabel>Source Articles</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {articles.map((a, i) => (
              <Card key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
                <a href={a.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 13, color: DS.textPrimary, lineHeight: 1.4, flex: 1, marginRight: 12 }}>
                  {a.title}
                </a>
                <BookmarkBtn article={a} bookmarks={bookmarks} />
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── MY ET ──────────────────────────────────────────────────────────────────── */
const ROLES = [
  { value: "mutual_fund_investor", label: "Investor",        icon: "📈", desc: "MF, stocks & bonds" },
  { value: "trader",               label: "Trader",          icon: "⚡", desc: "Intraday & F&O" },
  { value: "startup_founder",      label: "Founder",         icon: "🚀", desc: "Startups & funding" },
  { value: "student",              label: "Student",         icon: "🎓", desc: "Learning economics" },
  { value: "corporate_executive",  label: "Executive",       icon: "🏢", desc: "Strategy & M&A" },
  { value: "sme_owner",            label: "SME Owner",       icon: "🏪", desc: "GST, loans & ops" },
  { value: "real_estate",          label: "RE Investor",     icon: "🏠", desc: "Property & REITs" },
  { value: "nri",                  label: "NRI",             icon: "✈️",  desc: "India investments" },
  { value: "government_employee",  label: "Govt. Employee",  icon: "🏛️",  desc: "Policy & pension" },
  { value: "freelancer",           label: "Freelancer",      icon: "💻", desc: "Tax & gig economy" },
  { value: "farmer",               label: "Farmer",          icon: "🌾", desc: "Agri & commodity" },
  { value: "homemaker",            label: "Homemaker",       icon: "🏡", desc: "Savings & family" },
];

const ROLE_INTERESTS = {
  mutual_fund_investor: ["SIP returns", "Nifty50", "RBI rate cut", "Debt funds", "Tax saving", "NFO", "ELSS", "Gold ETF"],
  trader:               ["F&O ban list", "OI data", "Options chain", "Circuit filters", "PCR ratio", "Bulk deals", "SGX Nifty"],
  startup_founder:      ["Funding rounds", "Term sheets", "SEBI norms", "Unicorns", "ESOPs", "GST", "Angel tax", "DPIIT"],
  student:              ["GDP basics", "Budget 2025", "Jobs data", "Inflation", "Global markets", "RBI policy", "Trade deficit"],
  corporate_executive:  ["M&A", "ESG", "Leadership", "Boardroom news", "SEBI norms", "FDI", "IBC", "PLI scheme"],
  sme_owner:            ["GST input credit", "MSME loan", "SIDBI", "Working capital", "Export incentives", "TReDS", "CGTMSE"],
  real_estate:          ["REIT dividends", "Housing price index", "Repo rate", "RERA", "PropTech", "NHB", "Affordable housing"],
  nri:                  ["FEMA rules", "NRE/NRO account", "Remittance", "Double taxation", "India GDP", "LRS limit", "DTAA"],
  government_employee:  ["8th Pay Commission", "NPS returns", "DA hike", "CPC", "Pension reform", "Gratuity", "EPF"],
  freelancer:           ["ITR filing", "Section 44ADA", "TDS refund", "Gig economy", "UPI limit", "Advance tax", "GST threshold"],
  farmer:               ["MSP hike", "Kisan Credit Card", "APMC reform", "Monsoon forecast", "Agri export", "PM-KISAN", "Soil health"],
  homemaker:            ["Gold price", "School fee hike", "Food inflation", "Health insurance", "FD rates", "PPF", "Sukanya Samriddhi"],
};

const ROLE_PLACEHOLDERS = {
  mutual_fund_investor: "e.g. I hold Nifty50 index funds, SIP of ₹10k/month…",
  trader:               "e.g. I trade Nifty weekly options, positional calls…",
  startup_founder:      "e.g. Series A SaaS startup in fintech, 20 employees…",
  student:              "e.g. Final-year economics student, preparing for UPSC…",
  corporate_executive:  "e.g. CFO at a mid-size manufacturing firm, listed company…",
  sme_owner:            "e.g. Textile export business, 50 employees, MSME registered…",
  real_estate:          "e.g. Own 2 residential properties, looking at commercial REITs…",
  nri:                  "e.g. Based in Dubai, invested in Indian real estate and NRE FDs…",
  government_employee:  "e.g. IAS officer, 15 years service, invested in NPS and PPF…",
  freelancer:           "e.g. Freelance developer, invoicing via Razorpay, 44ADA filer…",
  farmer:               "e.g. Wheat and rice farmer in Punjab, 5 acres, sell at mandi…",
  homemaker:            "e.g. Managing family savings, two school-going kids, SIP via bank…",
};

function MyETTab({ articles, bookmarks }) {
  const [role, setRole] = useState("mutual_fund_investor");
  const [interests, setInterests] = useState([]);
  const [context, setContext] = useState("");
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchRole, setSearchRole] = useState("");

  const toggle = (i) => setInterests((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i]);
  const scoreColor = (s) => s >= 8 ? DS.green : s >= 5 ? DS.accent : DS.textDim;

  const handleRoleChange = (r) => {
    setRole(r);
    setInterests([]);
    setContext("");
    fetch("http://localhost:5000/preferences/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: r, action: "select" }),
    }).catch(() => {});
  };

  const generate = async () => {
    if (!articles.length) return;
    setLoading(true);
    try {
      const r = await getPersonalizedFeed(articles, {
        role,
        interests: interests.join(", ") || "general business news",
        context,
      });
      const raw = r.data.result;
      setFeed(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error(err);
      alert("Failed to generate personalized feed");
    } finally { setLoading(false); }
  };

  const filteredRoles = ROLES.filter((r) =>
    r.label.toLowerCase().includes(searchRole.toLowerCase()) ||
    r.desc.toLowerCase().includes(searchRole.toLowerCase())
  );

  const activeRoleMeta = ROLES.find((r) => r.value === role);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>My ET — Your Newsroom</h2>

      <Card>
        <SectionLabel>I am a…</SectionLabel>

        {/* Role search */}
        <input
          value={searchRole}
          onChange={(e) => setSearchRole(e.target.value)}
          placeholder="Search role… e.g. trader, farmer, NRI"
          style={{ marginBottom: 14 }}
        />

        {/* Role grid — 12 roles, icon cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}>
          {filteredRoles.map((r) => (
            <button
              key={r.value}
              onClick={() => handleRoleChange(r.value)}
              style={{
                padding: "12px 10px",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                transition: "all .15s",
                border: "none",
                background: role === r.value ? DS.accent + "20" : DS.surfaceHover,
                outline: role === r.value
                  ? `2px solid ${DS.accent}`
                  : `1px solid ${DS.border}`,
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>{r.icon}</div>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: role === r.value ? DS.accent : DS.textPrimary,
              }}>
                {r.label}
              </div>
              <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2, lineHeight: 1.4 }}>
                {r.desc}
              </div>
            </button>
          ))}
          {filteredRoles.length === 0 && (
            <p style={{
              fontSize: 13, color: DS.textDim,
              gridColumn: "1 / -1", padding: "8px 0",
            }}>
              No matching role — your profile will still be used as-is.
            </p>
          )}
        </div>

        <SectionLabel>
          I care about
          {activeRoleMeta && (
            <span style={{ color: DS.accent, marginLeft: 6 }}>
              · {activeRoleMeta.icon} {activeRoleMeta.label}
            </span>
          )}
        </SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(ROLE_INTERESTS[role] || []).map((i) => (
            <Pill key={i} active={interests.includes(i)} onClick={() => toggle(i)}>{i}</Pill>
          ))}
        </div>

        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={ROLE_PLACEHOLDERS[role] || "Any context about your situation…"}
          style={{ marginBottom: 14 }}
        />
        <Btn onClick={generate} disabled={loading || !articles.length}>
          {loading ? <><Spinner /> Ranking…</> : "Build my feed"}
        </Btn>
      </Card>

      {feed.length > 0 && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel>
            Ranked for — {activeRoleMeta?.icon} {activeRoleMeta?.label}
          </SectionLabel>
          {feed.map((a, i) => {
            const score = typeof a.relevanceScore === "number" ? a.relevanceScore
              : typeof a.score === "number" ? a.score : 0;
            return (
              <Card key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  minWidth: 38, height: 38, borderRadius: 8,
                  background: scoreColor(score) + "18",
                  border: `1px solid ${scoreColor(score)}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: scoreColor(score), fontFamily: DS.fontMono,
                }}>
                  {score}
                </div>
                <div style={{ flex: 1 }}>
                  <a href={a.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 15, fontWeight: 500, color: DS.textPrimary, lineHeight: 1.4, display: "block", marginBottom: 5 }}>
                    {a.title}
                  </a>
                  {a.reason && <p style={{ fontSize: 12, color: DS.accent, marginBottom: 4 }}>↳ {a.reason}</p>}
                  {a.description && <p style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>{a.description}</p>}
                </div>
                <BookmarkBtn article={a} bookmarks={bookmarks} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ─── STORY ARC ──────────────────────────────────────────────────────────────── */
if (!document.getElementById("arc-style")) {
  const s = document.createElement("style");
  s.id = "arc-style";
  s.textContent = `
    @keyframes arcFadeUp   { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:none } }
    @keyframes arcSlideIn  { from { opacity:0; transform:translateX(-32px) } to { opacity:1; transform:none } }
    @keyframes arcPop      { 0%{transform:scale(0.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
    @keyframes arcOrb      { 0%,100%{transform:scale(1) rotate(0deg)} 33%{transform:scale(1.08) rotate(120deg)} 66%{transform:scale(0.95) rotate(240deg)} }
    @keyframes arcGlow     { 0%,100%{box-shadow:0 0 20px 4px var(--glow)} 50%{box-shadow:0 0 40px 12px var(--glow)} }
    @keyframes arcDraw     { from{stroke-dashoffset:1200} to{stroke-dashoffset:0} }
    @keyframes arcScan     { from{transform:translateX(-100%)} to{transform:translateX(400%)} }
    @keyframes arcPulseRing{ 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.2);opacity:0} }
    @keyframes arcBlink    { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes arcCounter  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
    .arc-event-enter       { animation: arcSlideIn .45s cubic-bezier(.22,1,.36,1) both }
    .arc-player-enter      { animation: arcPop .5s cubic-bezier(.22,1,.36,1) both }
    .arc-section-enter     { animation: arcFadeUp .5s cubic-bezier(.22,1,.36,1) both }
    .arc-timeline-line     { stroke-dasharray:1200; animation: arcDraw 1.8s cubic-bezier(.4,0,.2,1) forwards }
  `;
  document.head.appendChild(s);
}

const sentimentMeta = (s = "") => {
  const l = s.toLowerCase();
  if (l.includes("bullish") || l.includes("positive") || l.includes("optimistic"))
    return { color: "#34d399", glow: "#34d39940", label: "Bullish", icon: "▲", bg: "#0d2e22" };
  if (l.includes("bearish") || l.includes("negative") || l.includes("pessimistic"))
    return { color: "#f87171", glow: "#f8717140", label: "Bearish", icon: "▼", bg: "#2e0d0d" };
  if (l.includes("cautious") || l.includes("neutral") || l.includes("mixed"))
    return { color: "#fbbf24", glow: "#fbbf2440", label: "Cautious", icon: "◆", bg: "#2e2208" };
  return { color: DS.accent, glow: DS.accent + "40", label: s || "Neutral", icon: "●", bg: "#1e1a0e" };
};

function SentimentOrb({ sentiment, size = 96 }) {
  const meta = sentimentMeta(sentiment);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: `2px solid ${meta.color}`,
          animation: `arcPulseRing 2.4s ease-out ${i * 1.2}s infinite`,
          "--glow": meta.glow,
        }} />
      ))}
      <div style={{
        position: "absolute", inset: 8, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${meta.color}cc, ${meta.color}44)`,
        border: `2px solid ${meta.color}80`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
        animation: `arcOrb 6s ease-in-out infinite, arcGlow 3s ease-in-out infinite`,
        "--glow": meta.glow,
        boxShadow: `0 0 32px ${meta.glow}`,
      }}>
        <span style={{ fontSize: size * 0.22, color: "#fff", fontWeight: 700 }}>{meta.icon}</span>
        <span style={{ fontSize: size * 0.13, color: "#ffffffcc", fontWeight: 600, letterSpacing: ".04em" }}>{meta.label}</span>
      </div>
    </div>
  );
}

function SentimentWave({ events, meta }) {
  const W = 700, H = 90;
  const pts = events.map((_, i) => {
    const x = 40 + (i / Math.max(events.length - 1, 1)) * (W - 80);
    const noise = Math.sin(i * 1.7) * 18 + Math.cos(i * 0.9) * 10;
    const y = H / 2 + noise;
    return { x, y };
  });

  const pathD = pts.length < 2
    ? `M40,${H / 2} L${W - 40},${H / 2}`
    : pts.reduce((acc, p, i) => {
        if (i === 0) return `M${p.x},${p.y}`;
        const prev = pts[i - 1];
        const cx = (prev.x + p.x) / 2;
        return acc + ` C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
      }, "");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, overflow: "visible" }}>
      {[H * 0.25, H * 0.5, H * 0.75].map((y, i) => (
        <line key={i} x1={40} y1={y} x2={W - 40} y2={y}
          stroke={DS.border} strokeWidth="1" strokeDasharray="4 4" />
      ))}
      <defs>
        <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={meta.color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={meta.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={pathD + ` L${W - 40},${H} L40,${H} Z`} fill="url(#waveGrad)" />
      <path d={pathD} fill="none" stroke={meta.color} strokeWidth="2.5"
        className="arc-timeline-line"
        style={{ filter: `drop-shadow(0 0 6px ${meta.color})` }} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill={meta.color} stroke={DS.bg} strokeWidth="2"
            style={{ animation: `arcPop .4s ${i * 0.08}s both` }} />
        </g>
      ))}
      <rect x={40} y={0} width={80} height={H} fill={`url(#scanGrad)`} style={{ animation: "arcScan 3s ease-in-out 1.8s both" }} />
      <defs>
        <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={meta.color} stopOpacity="0" />
          <stop offset="50%" stopColor={meta.color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={meta.color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PlayerCard({ player, index, sentiment }) {
  const meta = sentimentMeta(sentiment);
  const name = typeof player === "string" ? player : player?.name || "?";
  const role = typeof player === "object" ? player?.role || "" : "";
  const impact = typeof player === "object" ? player?.impact || "" : "";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const colors = [DS.accent, "#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#fb923c"];
  const color  = colors[index % colors.length];

  return (
    <div className="arc-player-enter" style={{
      animationDelay: `${index * 0.1}s`,
      background: DS.surface, border: `1px solid ${DS.border}`,
      borderRadius: 16, padding: "20px 16px", textAlign: "center",
      position: "relative", overflow: "hidden",
      transition: "transform .2s, border-color .2s",
      cursor: "default",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = color + "60"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = DS.border; }}
    >
      <div style={{
        position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
        width: 64, height: 64, borderRadius: "50%",
        background: `radial-gradient(circle, ${color}30 0%, transparent 70%)`,
        animation: `arcGlow 3s ease-in-out ${index * 0.5}s infinite`, "--glow": color + "40",
      }} />
      <div style={{
        width: 52, height: 52, borderRadius: "50%", margin: "0 auto 12px",
        background: `linear-gradient(135deg, ${color}44, ${color}22)`,
        border: `2px solid ${color}60`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 700, color, position: "relative", zIndex: 1,
        fontFamily: DS.fontMono,
      }}>{initials}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, marginBottom: 4, lineHeight: 1.3 }}>{name}</div>
      {role && <div style={{ fontSize: 11, color, letterSpacing: ".06em", marginBottom: impact ? 8 : 0, textTransform: "uppercase", fontWeight: 500 }}>{role}</div>}
      {impact && <div style={{ fontSize: 11, color: DS.textSecondary, lineHeight: 1.5, borderTop: `1px solid ${DS.border}`, paddingTop: 8, marginTop: 4 }}>{impact}</div>}
    </div>
  );
}

function PredictionCard({ text, index }) {
  const confidence = [88, 74, 61, 82, 55][index % 5];
  const colors = [DS.green, DS.accent, DS.blue, "#a78bfa", DS.red];
  const col = colors[index % colors.length];
  return (
    <div className="arc-section-enter" style={{
      animationDelay: `${index * 0.12}s`,
      background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: 12,
      padding: "16px 18px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col, borderRadius: "12px 0 0 12px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p style={{ fontSize: 13, color: DS.textPrimary, lineHeight: 1.65, flex: 1 }}>{text}</p>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: col, fontFamily: DS.fontMono }}>{confidence}%</div>
          <div style={{ fontSize: 10, color: DS.textDim, letterSpacing: ".06em" }}>CONFIDENCE</div>
        </div>
      </div>
      <div style={{ marginTop: 10, height: 3, background: DS.border, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", background: col, borderRadius: 2,
          width: `${confidence}%`, transition: "width 1.2s cubic-bezier(.22,1,.36,1)",
          boxShadow: `0 0 8px ${col}80`,
        }} />
      </div>
    </div>
  );
}

function HorizTimeline({ events, meta }) {
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++; setRevealed(i);
      if (i >= events.length) clearInterval(t);
    }, 220);
    return () => clearInterval(t);
  }, [events.length]);

  const evText = ev => typeof ev === "string" ? ev : ev?.event || ev?.description || JSON.stringify(ev);
  const evDate = ev => typeof ev === "object" ? ev?.date || "" : "";

  return (
    <div>
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: Math.max(events.length * 96, 400), padding: "16px 24px" }}>
          {events.map((ev, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              {i > 0 && (
                <div style={{
                  flex: 1, height: 2,
                  background: i <= revealed ? meta.color : DS.border,
                  transition: "background .4s",
                  boxShadow: i <= revealed ? `0 0 6px ${meta.color}80` : "none",
                }} />
              )}
              <button onClick={() => setActive(i)} style={{
                width: 36, height: 36, borderRadius: "50%", border: "none", flexShrink: 0,
                background: active === i ? meta.color : i <= revealed ? meta.color + "30" : DS.border,
                color: active === i ? "#000" : meta.color,
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                transition: "all .3s cubic-bezier(.22,1,.36,1)",
                transform: active === i ? "scale(1.25)" : "scale(1)",
                boxShadow: active === i ? `0 0 16px ${meta.glow}` : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: i <= revealed ? 1 : 0.2,
              }}>{i + 1}</button>
            </div>
          ))}
        </div>
      </div>

      {events[active] && (
        <div key={active} className="arc-event-enter" style={{
          background: meta.bg, border: `1px solid ${meta.color}30`,
          borderRadius: 12, padding: "20px 24px", marginTop: 4,
          borderLeft: `4px solid ${meta.color}`,
        }}>
          {evDate(events[active]) && (
            <div style={{ fontSize: 11, color: meta.color, fontFamily: DS.fontMono, marginBottom: 6, letterSpacing: ".1em" }}>
              {evDate(events[active])}
            </div>
          )}
          <p style={{ fontSize: 15, color: DS.textPrimary, lineHeight: 1.75 }}>{evText(events[active])}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0}
              style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${DS.border}`, background: "transparent", color: DS.textSecondary, fontSize: 12, cursor: active === 0 ? "not-allowed" : "pointer", opacity: active === 0 ? 0.3 : 1 }}>← Prev</button>
            <button onClick={() => setActive(a => Math.min(events.length - 1, a + 1))} disabled={active === events.length - 1}
              style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${DS.border}`, background: "transparent", color: DS.textSecondary, fontSize: 12, cursor: active === events.length - 1 ? "not-allowed" : "pointer", opacity: active === events.length - 1 ? 0.3 : 1 }}>Next →</button>
            <span style={{ marginLeft: "auto", fontSize: 11, color: DS.textDim, fontFamily: DS.fontMono, alignSelf: "center" }}>
              {active + 1} / {events.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StoryArcTab({ articles }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [buildPhase, setBuildPhase] = useState("");
  const { speak, speaking, stopSpeaking } = useVoiceCtx();

  const PHASES = [
    "Scanning articles…",
    "Mapping key players…",
    "Tracing sentiment shifts…",
    "Surfacing contrarian views…",
    "Building predictions…",
  ];

  const build = async () => {
    setLoading(true); setData(null);
    let pi = 0;
    setBuildPhase(PHASES[0]);
    const phaseTimer = setInterval(() => {
      pi = Math.min(pi + 1, PHASES.length - 1);
      setBuildPhase(PHASES[pi]);
    }, 900);

    try {
      const r = await getTimeline(articles);
      const s = r.data.story;
      clearInterval(phaseTimer);
      setData({
        events:     Array.isArray(s.timeline)    ? s.timeline    : [],
        players:    Array.isArray(s.key_players) ? s.key_players : [],
        sentiment:  typeof s.sentiment           === "string" ? s.sentiment        : "Neutral",
        contrarian: typeof s.contrarian_view     === "string" ? s.contrarian_view  : "",
        whatNext:   typeof s.what_next           === "string" ? s.what_next        : "",
      });
    } catch (err) {
      clearInterval(phaseTimer);
      console.error(err);
    } finally { setLoading(false); setBuildPhase(""); }
  };

  const evText = ev => typeof ev === "string" ? ev : ev?.event || ev?.description || "";

  const narrateAll = () => {
    if (!data) return;
    if (speaking) { stopSpeaking(); return; }
    const script = [
      "Story Arc Report.",
      data.events.length ? "Key events: " + data.events.map(evText).join(". Next: ") + "." : "",
      data.players.length ? "Key players involved: " + data.players.map(p => typeof p === "string" ? p : p?.name).join(", ") + "." : "",
      data.sentiment ? `Overall market sentiment is ${data.sentiment}.` : "",
      data.contrarian ? "Contrarian perspective: " + data.contrarian : "",
      data.whatNext   ? "What to watch next: " + data.whatNext : "",
    ].filter(Boolean).join(" ");
    speak(script);
  };

  const meta = sentimentMeta(data?.sentiment || "");

  const predictions = data?.whatNext
    ? data.whatNext.split(/\.\s+|\n+/).map(s => s.trim()).filter(s => s.length > 20).slice(0, 4)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{
        background: `linear-gradient(135deg, ${DS.surface} 0%, #0d0d18 100%)`,
        border: `1px solid ${DS.border}`, borderRadius: 20, padding: "28px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", right: -40, top: -40, width: 300, height: 300,
          borderRadius: "50%", background: data ? `radial-gradient(circle, ${meta.color}12 0%, transparent 70%)` : "transparent",
          transition: "background 1s",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, color: DS.textDim, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
            ◈ Story Arc Tracker
          </div>
          <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 28, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>
            {data ? "Narrative Complete" : "Build the Full Narrative"}
          </h2>
          <p style={{ color: DS.textSecondary, fontSize: 14, maxWidth: 440, lineHeight: 1.6 }}>
            {data
              ? `${data.events.length} events · ${data.players.length} players · sentiment tracked · predictions surfaced`
              : "AI maps the complete business story — timeline, players, sentiment shifts, contrarian views & predictions"}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, position: "relative", zIndex: 1 }}>
          {data && <SentimentOrb sentiment={data.sentiment} size={88} />}
          <div style={{ display: "flex", gap: 10 }}>
            {data && (
              <button onClick={narrateAll} style={{
                padding: "9px 18px", borderRadius: 8, border: `1px solid ${DS.border}`,
                background: "transparent", color: speaking ? meta.color : DS.textSecondary,
                fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
                {speaking ? "⏹ Stop" : "🔊 Narrate"}
              </button>
            )}
            <button onClick={build} disabled={loading || !articles.length} style={{
              padding: "9px 22px", borderRadius: 8, border: "none",
              background: loading ? DS.border : DS.accent, color: loading ? DS.textDim : "#000",
              fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8, transition: "all .2s",
            }}>
              {loading ? <><Spinner /> {buildPhase}</> : data ? "↺ Rebuild" : "Build Story Arc"}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {PHASES.slice(0, 3).map((phase, i) => (
            <div key={i} style={{
              background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: 12, padding: "20px",
              display: "flex", alignItems: "center", gap: 12,
              opacity: buildPhase === phase ? 1 : 0.35, transition: "opacity .4s",
            }}>
              <Spinner />
              <span style={{ fontSize: 12, color: DS.textSecondary }}>{phase}</span>
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="arc-section-enter" style={{ animationDelay: ".05s" }}>
            <div style={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: 16, padding: "24px 28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: DS.textDim, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 4 }}>Sentiment Wave</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: meta.color, fontFamily: DS.fontDisplay }}>
                    {meta.icon} {data.sentiment}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {["Bearish","Neutral","Bullish"].map((l, i) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: [DS.red, DS.accent, DS.green][i] }} />
                      <span style={{ fontSize: 11, color: DS.textDim }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <SentimentWave events={data.events.length ? data.events : [{}, {}, {}, {}]} meta={meta} />
            </div>
          </div>

          {data.events.length > 0 && (
            <div className="arc-section-enter" style={{ animationDelay: ".1s" }}>
              <div style={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: 16, padding: "24px 28px" }}>
                <div style={{ fontSize: 10, color: DS.textDim, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 20 }}>
                  Interactive Timeline · {data.events.length} events
                </div>
                <HorizTimeline events={data.events} meta={meta} />
              </div>
            </div>
          )}

          {data.players.length > 0 && (
            <div className="arc-section-enter" style={{ animationDelay: ".15s" }}>
              <div style={{ fontSize: 10, color: DS.textDim, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 14 }}>
                Key Players · {data.players.length} identified
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                {data.players.map((p, i) => (
                  <PlayerCard key={i} player={p} index={i} sentiment={data.sentiment} />
                ))}
              </div>
            </div>
          )}

          {data.contrarian && (
            <div className="arc-section-enter" style={{ animationDelay: ".2s" }}>
              <div style={{
                background: `linear-gradient(135deg, #1a0a0a, #0d0d1a)`,
                border: `1px solid #f8717130`, borderRadius: 16, padding: "24px 28px",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", inset: 0, borderRadius: 16, opacity: 0.04,
                  backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
                  backgroundSize: "8px 8px",
                }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{
                      padding: "4px 10px", borderRadius: 6, background: "#f8717120", border: "1px solid #f8717140",
                      fontSize: 10, color: "#f87171", fontWeight: 700, letterSpacing: ".1em",
                    }}>⚠ DISSENTING VIEW</div>
                    <div style={{ height: 1, flex: 1, background: "#f8717130" }} />
                    <span style={{ fontSize: 10, color: DS.textDim, fontFamily: DS.fontMono }}>ANALYST MEMO</span>
                  </div>
                  <p style={{ fontSize: 15, color: "#fecacacc", lineHeight: 1.8, fontStyle: "italic" }}>
                    "{data.contrarian}"
                  </p>
                </div>
              </div>
            </div>
          )}

          {predictions.length > 0 && (
            <div className="arc-section-enter" style={{ animationDelay: ".25s" }}>
              <div style={{ fontSize: 10, color: DS.textDim, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 14 }}>
                📡 What to Watch Next · AI Predictions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {predictions.map((text, i) => (
                  <PredictionCard key={i} text={text} index={i} />
                ))}
              </div>
            </div>
          )}

          {predictions.length === 0 && data.whatNext && (
            <div className="arc-section-enter" style={{ animationDelay: ".25s" }}>
              <div style={{ background: DS.surface, border: `1px solid ${DS.green}30`, borderRadius: 16, padding: "22px 28px", borderTop: `3px solid ${DS.green}` }}>
                <div style={{ fontSize: 10, color: DS.textDim, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 10 }}>📡 What to Watch Next</div>
                <p style={{ fontSize: 14, color: DS.textPrimary, lineHeight: 1.75 }}>{data.whatNext}</p>
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", border: `1px dashed ${DS.border}`, borderRadius: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>◈</div>
          <p style={{ color: DS.textDim, fontSize: 14 }}>Fetch articles above, then hit Build Story Arc</p>
        </div>
      )}
    </div>
  );
}


/* ─── AI VIDEO ───────────────────────────────────────────────────────────────── */
function VideoTab({ articles }) {
  const [script, setScript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [aiVoice, setAiVoice] = useState(false);
  const { speak, speaking, stopSpeaking } = useVoiceCtx();

  const generate = async () => {
    setLoading(true);
    try {
      const r = await summarizeNews(articles);
      const lines = (r.data.summary || "").split(/\n+/).filter(Boolean);
      setScript(lines); setPlaying(false); setProgress(0); setCurrentLine(0);
    } finally { setLoading(false); }
  };

  const play = () => {
    if (!script) return;
    setPlaying(true); setCurrentLine(0); setProgress(0);
    if (aiVoice) {
      speak(script.join(". "), "nova");
    }
    let i = 0;
    const iv = setInterval(() => {
      i++; setCurrentLine(i); setProgress(Math.round((i / script.length) * 100));
      if (i >= script.length) { clearInterval(iv); setPlaying(false); }
    }, 2800);
  };

  const stop = () => {
    setPlaying(false);
    if (aiVoice) stopSpeaking();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>AI News Video Studio</h2>
          <p style={{ color: DS.textSecondary, fontSize: 13, marginTop: 4 }}>Broadcast-quality 60–120 second news script with animated player</p>
        </div>
        <Btn onClick={generate} disabled={loading || !articles.length}>{loading ? <><Spinner /> Scripting…</> : "Generate Script"}</Btn>
      </div>

      {script && (
        <div className="fade-in">
          <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", border: `1px solid ${DS.border}`, marginBottom: 16 }}>
            <div style={{ background: DS.red, padding: "6px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".1em" }}>● LIVE</span>
              <span style={{ color: "#ffe", fontSize: 11, opacity: .8 }}>ET AI NEWS STUDIO</span>
              <span style={{ marginLeft: "auto", color: "#fff", fontSize: 11, fontFamily: DS.fontMono }}>{new Date().toLocaleTimeString()}</span>
            </div>
            <div style={{ padding: "36px 48px", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {playing ? (
                <p key={currentLine} style={{ fontFamily: DS.fontDisplay, fontSize: 20, color: "#fff", textAlign: "center", lineHeight: 1.8, maxWidth: 580, animation: "fadeSlide .4s ease" }}>
                  {script[currentLine] || ""}
                </p>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 52, opacity: .2, marginBottom: 12 }}>▷</div>
                  <p style={{ color: DS.textDim, fontSize: 13 }}>Press play to begin broadcast</p>
                </div>
              )}
            </div>
            <div style={{ height: 3, background: "#1a1a1a" }}>
              <div style={{ height: "100%", background: DS.red, width: `${progress}%`, transition: "width .3s" }} />
            </div>
            <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={playing ? stop : play} style={{ background: playing ? DS.border : DS.red, color: "#fff", border: "none", borderRadius: 6, padding: "7px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {playing ? "⏹ Stop" : "▷  Play"}
              </button>
              <button
                onClick={() => setAiVoice((v) => !v)}
                style={{
                  background: aiVoice ? DS.accent + "20" : "transparent",
                  border: `1px solid ${aiVoice ? DS.accent : DS.border}`,
                  color: aiVoice ? DS.accent : DS.textDim,
                  borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                }}
              >
                🔊 AI Voice {aiVoice ? "ON" : "OFF"}
              </button>
              <span style={{ color: DS.textDim, fontSize: 12, fontFamily: DS.fontMono }}>
                {script.length} segments · ~{Math.round(script.length * 2.8)}s
              </span>
            </div>
          </div>

          <Card>
            <SectionLabel>Full script</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {script.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", opacity: playing && i > currentLine ? .25 : 1, transition: "opacity .3s" }}>
                  <span style={{ fontFamily: DS.fontMono, fontSize: 11, color: DS.textDim, minWidth: 24, paddingTop: 3 }}>{String(i + 1).padStart(2, "0")}</span>
                  <p style={{ fontSize: 14, color: DS.textPrimary, lineHeight: 1.7 }}>{line}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}


/* ─── VERNACULAR ─────────────────────────────────────────────────────────────── */
const LANGS = [
  { code: "hi", script: "हिन्दी",   name: "Hindi" },
  { code: "ta", script: "தமிழ்",   name: "Tamil" },
  { code: "te", script: "తెలుగు",  name: "Telugu" },
  { code: "bn", script: "বাংলা",   name: "Bengali" },
  { code: "mr", script: "मराठी",   name: "Marathi" },
  { code: "gu", script: "ગુજ.",    name: "Gujarati" },
  { code: "kn", script: "ಕನ್ನಡ",  name: "Kannada" },
  { code: "ml", script: "മലയ.",   name: "Malayalam" },
  { code: "pa", script: "ਪੰਜਾਬੀ", name: "Punjabi" },
  { code: "ur", script: "اردو",    name: "Urdu" },
  { code: "or", script: "ଓଡ଼ିଆ",   name: "Odia" },
  { code: "as", script: "অসমীয়া", name: "Assamese" },
];

function VernacularTab({ articles }) {
  const [lang, setLang] = useState(LANGS[0]);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const filteredLangs = LANGS.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const translate = async () => {
    if (!articles.length) return;
    setLoading(true); setError(""); setResult("");
    try {
      const text = articles.map((a, i) =>
        `Article ${i + 1}:\nHeadline: ${a.title || ""}${a.description ? "\nSummary: " + a.description : ""}`
      ).join("\n\n");

      const response = await fetch("http://localhost:5000/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: lang.name }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Server error ${response.status}`);
      }

      const data = await response.json();
      setResult(data.translated || "No translation received.");
    } catch (err) {
      console.error("Translation error:", err);
      setError(`Translation failed: ${err.message}. Is your backend running on :5000?`);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>Vernacular Business News</h2>
        <p style={{ color: DS.textSecondary, fontSize: 13, marginTop: 4 }}>
          Culturally adapted in 12 Indian languages — not literal translation
        </p>
      </div>

      <Card>
        <SectionLabel>Choose language</SectionLabel>

        {/* Language search */}
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search language… e.g. Tamil, Gujarati"
            style={{ paddingLeft: 34 }}
          />
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: DS.textDim, pointerEvents: "none", fontSize: 14,
          }}>🔍</span>
        </div>

        {/* Language grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}>
          {filteredLangs.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l); setResult(""); setError(""); }}
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "center",
                transition: "all .15s",
                background: lang.code === l.code ? DS.accent : DS.surfaceHover,
                color: lang.code === l.code ? "#000" : DS.textSecondary,
                border: `1px solid ${lang.code === l.code ? DS.accent : DS.border}`,
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 3, lineHeight: 1.2 }}>{l.script}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{l.name}</div>
            </button>
          ))}
          {filteredLangs.length === 0 && (
            <p style={{ fontSize: 13, color: DS.textDim, gridColumn: "1 / -1", padding: "8px 0" }}>
              No language matched — try a different search.
            </p>
          )}
        </div>

        <Btn onClick={translate} disabled={loading || !articles.length}>
          {loading ? <><Spinner /> Translating to {lang.name}…</> : `Translate to ${lang.name}`}
        </Btn>
      </Card>

      {error && (
        <Card className="fade-in" style={{ borderLeft: `3px solid ${DS.red}` }}>
          <p style={{ fontSize: 13, color: DS.red }}>{error}</p>
        </Card>
      )}

      {result && (
        <Card className="fade-in" style={{ borderLeft: `3px solid ${DS.purple}`, borderRadius: "0 12px 12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionLabel>{lang.name} Edition</SectionLabel>
            <SpeakBtn text={result} voice="nova" />
          </div>
          {result.split(/\n+/).filter(Boolean).map((para, i) => {
            const parts = para.split(/\*\*(.+?)\*\*/g);
            return (
              <p key={i} style={{ fontSize: 15, lineHeight: 2, color: DS.textPrimary, marginBottom: 12 }}>
                {parts.map((part, j) =>
                  j % 2 === 1 ? <strong key={j} style={{ color: DS.accent }}>{part}</strong> : part
                )}
              </p>
            );
          })}
        </Card>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// PASTE THIS ENTIRE BLOCK into your App.js, just before the TABS config section
// (i.e. before: "const TABS = [...")
// ═══════════════════════════════════════════════════════════════════════════════

/* ─── LANDING PAGE STYLES ─────────────────────────────────────────────────── */
if (!document.getElementById("lp-style")) {
  const s = document.createElement("style");
  s.id = "lp-style";
  s.textContent = `
    @keyframes lpFadeUp    { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:none} }
    @keyframes lpReveal    { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0% 0 0)} }
    @keyframes lpFloat     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
    @keyframes lpOrbit     { from{transform:rotate(0deg) translateX(140px) rotate(0deg)} to{transform:rotate(360deg) translateX(140px) rotate(-360deg)} }
    @keyframes lpGradShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
    @keyframes lpScan      { 0%{transform:translateY(-100%);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(800%);opacity:0} }
    @keyframes lpBlink     { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes lpCountUp   { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
    @keyframes lpTicker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
    @keyframes lpGlow      { 0%,100%{box-shadow:0 0 40px 8px rgba(232,160,52,.18)} 50%{box-shadow:0 0 80px 24px rgba(232,160,52,.32)} }
    @keyframes lpParticle  { 0%{transform:translateY(0) scale(1);opacity:.7} 100%{transform:translateY(-120px) scale(0);opacity:0} }

    .lp-hero-title span { display:inline-block; animation:lpFadeUp .7s cubic-bezier(.22,1,.36,1) both }
    .lp-card:hover .lp-card-icon { transform:scale(1.18) rotate(-6deg); }
    .lp-card-icon { transition:transform .35s cubic-bezier(.34,1.56,.64,1); }
    .lp-cta-btn:hover { transform:translateY(-2px) scale(1.03); box-shadow:0 12px 48px rgba(232,160,52,.45)!important; }
    .lp-cta-btn { transition:all .2s cubic-bezier(.34,1.56,.64,1)!important; }
    .lp-stat:hover .lp-stat-num { color:#f0b44a; transform:scale(1.06); }
    .lp-stat-num { transition:all .2s; }
    .lp-feature-tag { animation:lpFadeUp .5s cubic-bezier(.22,1,.36,1) both; }
  `;
  document.head.appendChild(s);
}

/* ─── LANDING PAGE FEATURES DATA ─────────────────────────────────────────── */
const LP_FEATURES = [
  {
    icon: "◎",
    title: "Intelligence Briefing",
    subtitle: "Navigator",
    desc: "AI synthesizes dozens of articles into one crisp briefing. Ask follow-ups by typing or speaking.",
    color: "#e8a034",
    tag: "Core",
  },
  {
    icon: "✦",
    title: "Personalised Feed",
    subtitle: "My ET",
    desc: "Choose your role — Trader, Founder, Farmer, NRI — and get articles ranked for what matters to you.",
    color: "#a78bfa",
    tag: "Smart",
  },
  {
    icon: "◈",
    title: "Story Arc Tracker",
    subtitle: "Narrative",
    desc: "Animated timeline, key-player cards, sentiment waves, contrarian views, and AI predictions — all in one.",
    color: "#34d399",
    tag: "Visual",
  },
  {
    icon: "▷",
    title: "AI Video Studio",
    subtitle: "Broadcast",
    desc: "Auto-generates a broadcast-quality 60–120s news script and plays it as a live-style studio segment.",
    color: "#60a5fa",
    tag: "Media",
  },
  {
    icon: "◉",
    title: "Vernacular Edition",
    subtitle: "12 Languages",
    desc: "Culturally adapted — not just translated — across Hindi, Tamil, Bengali, Gujarati, and 8 more.",
    color: "#f472b6",
    tag: "Local",
  },
  {
    icon: "🎤",
    title: "Full Voice Control",
    subtitle: "Hands-free",
    desc: "Search, ask questions, and listen to briefings entirely by voice. Powered by Web Speech API + OpenAI TTS.",
    color: "#fb923c",
    tag: "Voice",
  },
];

const LP_STATS = [
  { num: "12", label: "Indian Languages", icon: "◉" },
  { num: "6",  label: "AI-powered tabs",  icon: "◎" },
  { num: "∞",  label: "Topics to explore",icon: "✦" },
  { num: "0",  label: "Ads. Ever.",        icon: "★" },
];

const LP_ROLES = ["Investor", "Trader", "Founder", "Student", "Executive", "SME Owner", "NRI", "Farmer", "Homemaker"];

/* ─── HERO PARTICLES ─────────────────────────────────────────────────────── */
function HeroParticles() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    y: 10 + Math.random() * 80,
    delay: Math.random() * 4,
    dur: 3 + Math.random() * 4,
    size: 2 + Math.random() * 3,
  }));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: `rgba(232,160,52,${0.15 + Math.random() * 0.3})`,
            animation: `lpParticle ${p.dur}s ease-in ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── SCAN LINE ──────────────────────────────────────────────────────────── */
function ScanLine() {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, height: 2, pointerEvents: "none",
      background: "linear-gradient(90deg, transparent 0%, rgba(232,160,52,.5) 40%, rgba(232,160,52,.8) 50%, rgba(232,160,52,.5) 60%, transparent 100%)",
      animation: "lpScan 6s ease-in-out 1s infinite",
      zIndex: 2,
    }} />
  );
}

/* ─── ROLE TICKER ────────────────────────────────────────────────────────── */
function RoleTicker() {
  const items = [...LP_ROLES, ...LP_ROLES];
  return (
    <div style={{ overflow: "hidden", padding: "6px 0" }}>
      <div style={{
        display: "flex", gap: 0,
        animation: "lpTicker 18s linear infinite",
        width: "max-content",
      }}>
        {items.map((r, i) => (
          <span key={i} style={{
            padding: "4px 20px", marginRight: 8, borderRadius: 20,
            background: "rgba(232,160,52,.08)", border: "1px solid rgba(232,160,52,.18)",
            fontSize: 12, color: "#e8a034", fontWeight: 500, whiteSpace: "nowrap",
          }}>
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── FEATURE CARD ───────────────────────────────────────────────────────── */
function FeatureCard({ f, index }) {
  return (
    <div
      className="lp-card"
      style={{
        background: "#111118",
        border: `1px solid #1e1e2a`,
        borderRadius: 16,
        padding: "28px 24px",
        position: "relative",
        overflow: "hidden",
        cursor: "default",
        animation: `lpFadeUp .6s cubic-bezier(.22,1,.36,1) ${0.1 + index * 0.07}s both`,
        transition: "border-color .2s, transform .2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = f.color + "50";
        e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#1e1e2a";
        e.currentTarget.style.transform = "none";
      }}
    >
      {/* glow blob */}
      <div style={{
        position: "absolute", top: -40, right: -40, width: 140, height: 140,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${f.color}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* tag */}
      <div style={{
        display: "inline-block", padding: "3px 10px", borderRadius: 20, marginBottom: 18,
        background: f.color + "18", border: `1px solid ${f.color}35`,
        fontSize: 10, color: f.color, fontWeight: 700, letterSpacing: ".1em",
      }}>
        {f.tag}
      </div>

      {/* icon */}
      <div className="lp-card-icon" style={{
        fontSize: 32, marginBottom: 14, color: f.color,
        textShadow: `0 0 20px ${f.color}80`,
      }}>
        {f.icon}
      </div>

      <div style={{ fontSize: 10, color: "#4a4855", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 6 }}>
        {f.subtitle}
      </div>
      <h3 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 19, fontWeight: 700, color: "#f0ede8", marginBottom: 10, lineHeight: 1.3,
      }}>
        {f.title}
      </h3>
      <p style={{ fontSize: 13, color: "#8a8795", lineHeight: 1.7 }}>{f.desc}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LANDING PAGE COMPONENT — main export
═══════════════════════════════════════════════════════════════════════════ */
function LandingPage({ onEnter }) {
  const [loaded, setLoaded] = useState(false);
  const [hoverCta, setHoverCta] = useState(false);
  const [topArticles, setTopArticles] = useState([]);

  useEffect(() => {
    let mounted = true;
    fetch("http://localhost:5000/news?q=india")
      .then((r) => r.json())
      .then((data) => { if (mounted && Array.isArray(data)) setTopArticles(data); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#f0ede8",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      overflowX: "hidden",
    }}>
      {/* ── HERO ── */}
      <section style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px 60px",
        textAlign: "center",
        overflow: "hidden",
      }}>
        {/* Background mesh */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `
            radial-gradient(ellipse 900px 600px at 50% 0%, rgba(232,160,52,.12) 0%, transparent 70%),
            radial-gradient(ellipse 600px 400px at 80% 80%, rgba(94,74,186,.08) 0%, transparent 60%),
            radial-gradient(ellipse 400px 300px at 10% 60%, rgba(52,211,153,.05) 0%, transparent 60%)
          `,
        }} />

        {/* Grid lines */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: .25,
          backgroundImage: `
            linear-gradient(rgba(232,160,52,.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(232,160,52,.12) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)",
        }} />

        <HeroParticles />
        <ScanLine />

        {/* ET logo badge */}
        <div style={{
          animation: "lpFadeUp .6s cubic-bezier(.22,1,.36,1) both",
          marginBottom: 32,
          position: "relative", zIndex: 3,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "8px 20px 8px 14px", borderRadius: 40,
            background: "rgba(232,160,52,.10)",
            border: "1px solid rgba(232,160,52,.30)",
            animation: "lpGlow 3s ease-in-out infinite",
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg, #e8a034, #f0b44a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 900, color: "#000",
              fontFamily: "'Playfair Display', serif",
            }}>ET</div>
            <span style={{ fontSize: 12, color: "#e8a034", fontWeight: 600, letterSpacing: ".08em" }}>
              AI NEWSROOM · POWERED BY CLAUDE
            </span>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "#34d399",
              animation: "lpBlink 1.2s ease-in-out infinite",
            }} />
          </div>
        </div>

        {/* Main headline */}
        <h1
          className="lp-hero-title"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "clamp(38px, 7vw, 84px)",
            fontWeight: 700,
            lineHeight: 1.08,
            maxWidth: 820,
            position: "relative", zIndex: 3,
            marginBottom: 24,
          }}
        >
          {["The", "Smartest", "Way", "to", "Read", "Business", "News."].map((word, i) => (
            <span key={i} style={{
              animationDelay: `${0.15 + i * 0.07}s`,
              color: ["Smartest", "Business"].includes(word) ? "#e8a034" : "#f0ede8",
              marginRight: "0.28em",
            }}>
              {word}
            </span>
          ))}
        </h1>

        {/* Sub */}
        <p style={{
          fontSize: "clamp(14px, 2vw, 18px)",
          color: "#8a8795",
          maxWidth: 560,
          lineHeight: 1.75,
          marginBottom: 40,
          position: "relative", zIndex: 3,
          animation: "lpFadeUp .7s cubic-bezier(.22,1,.36,1) .55s both",
        }}>
          AI briefings, story arcs, voice control, vernacular editions, and a
          personalised feed — all tailored to your role in India's economy.
        </p>

        {/* CTA buttons */}
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center",
          position: "relative", zIndex: 3,
          animation: "lpFadeUp .7s cubic-bezier(.22,1,.36,1) .7s both",
          marginBottom: 56,
        }}>
          <button
            className="lp-cta-btn"
            onClick={onEnter}
            style={{
              padding: "14px 36px", borderRadius: 40, border: "none",
              background: "linear-gradient(135deg, #e8a034, #f0b44a)",
              color: "#000", fontSize: 15, fontWeight: 700,
              letterSpacing: ".02em", cursor: "pointer",
              boxShadow: "0 8px 32px rgba(232,160,52,.35)",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            Enter the Newsroom <span style={{ fontSize: 18 }}>→</span>
          </button>
          <button
            style={{
              padding: "14px 28px", borderRadius: 40,
              border: "1px solid rgba(232,160,52,.30)",
              background: "transparent",
              color: "#e8a034", fontSize: 14, fontWeight: 500,
              cursor: "pointer", transition: "all .2s",
              letterSpacing: ".02em",
            }}
            onClick={() => {
              document.getElementById("lp-features")?.scrollIntoView({ behavior: "smooth" });
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,160,52,.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Explore features ↓
          </button>
        </div>

        {/* Role ticker */}
        <div style={{
          width: "100%", maxWidth: 700,
          position: "relative", zIndex: 3,
          animation: "lpFadeUp .7s cubic-bezier(.22,1,.36,1) .85s both",
        }}>
          <div style={{ fontSize: 10, color: "#4a4855", letterSpacing: ".12em", marginBottom: 8 }}>
            BUILT FOR EVERY INDIAN PROFESSIONAL
          </div>
          <RoleTicker />
        </div>

        {/* Scroll hint */}
        <div style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          opacity: .45, animation: "lpFloat 2.5s ease-in-out infinite",
          zIndex: 3,
        }}>
          <div style={{ width: 1, height: 40, background: "linear-gradient(to bottom, #e8a034, transparent)" }} />
          <span style={{ fontSize: 9, color: "#e8a034", letterSpacing: ".14em" }}>SCROLL</span>
        </div>
      </section>

      {/* ── TOP STORIES + MODULE SIDEBAR ── */}
      <section id="lp-daily" style={{ padding: "40px 24px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 10, color: "#e8a034", letterSpacing: ".18em", fontWeight: 700, marginBottom: 6 }}>LIVE · {topArticles.length} ARTICLES ANALYSED TODAY</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: "#f0ede8", margin: 0 }}>India's business news, <span style={{ color: "#e8a034" }}>intelligently</span> understood</h2>
                <p style={{ color: "#8a8795", marginTop: 8, maxWidth: 680 }}>ET AI Newsroom layers generative AI directly onto today's headlines — giving you personalised briefings, story arcs, voice-first Q&A, and vernacular translation. Not a chatbot. A newsroom co-pilot.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onEnter} className="lp-cta-btn" style={{ padding: "12px 20px", borderRadius: 28, background: "linear-gradient(135deg,#e8a034,#f0b44a)", color: "#000", fontWeight: 700 }}>Open AI Newsroom</button>
                <button onClick={() => document.getElementById('lp-daily')?.scrollIntoView({ behavior: 'smooth' })} style={{ padding: "12px 18px", borderRadius: 28, border: "1px solid rgba(232,160,52,.2)", background: "transparent", color: "#e8a034" }}>Read today's news ↓</button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {topArticles.map((a, i) => (
                <div key={i} style={{ padding: 18, borderRadius: 12, background: "#0d0d14", border: "1px solid #1e1e2a", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#e8a034", marginBottom: 8 }}>{a.source?.name || 'News'}</div>
                    <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "#f0ede8", fontSize: 18, fontWeight: 700, textDecoration: 'none' }}>{a.title}</a>
                    <p style={{ color: "#8a8795", marginTop: 8 }}>{a.description}</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#4a4855' }}>{new Date(a.publishedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      <button onClick={() => { /* placeholder for build story arc */ }} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #1e1e2a', background: 'transparent', color: '#e8a034' }}>Build story arc</button>
                      <button onClick={() => onEnter()} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: DS.accent, border: 'none', color: '#000' }}>Open in Newsroom →</button>
                    </div>
                  </div>
                  <div style={{ width: 120, height: 80, borderRadius: 8, background: '#0a0a0f', flexShrink: 0, overflow: 'hidden' }}>
                    {a.urlToImage ? <img src={a.urlToImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#111118' }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside>
            <div style={{ position: 'sticky', top: 24 }}>
              <div style={{ background: '#0d0d14', border: '1px solid #1e1e2a', borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 12, color: '#e8a034', marginBottom: 8 }}>ET AI NEWSROOM</div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, margin: 0, color: '#f0ede8' }}>Your personal news intelligence layer</h3>
                <p style={{ color: '#8a8795', marginTop: 8, fontSize: 13 }}>Search any topic. Get briefings, ask follow-ups, translate to your language, and see the full story arc — in seconds.</p>
                <ul style={{ color: '#8a8795', marginTop: 10, paddingLeft: 16 }}>
                  <li>Voice-first Q&A on any article</li>
                  <li>Personalised for 12 reader profiles</li>
                  <li>12 Indian language translations</li>
                  <li>AI story arc with timeline & players</li>
                </ul>
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button onClick={onEnter} style={{ padding: '10px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#e8a034,#f0b44a)', border: 'none', color: '#000', fontWeight: 700 }}>Launch AI Newsroom →</button>
                </div>
              </div>

              <div style={{ marginTop: 14, background: '#0d0d14', border: '1px solid #1e1e2a', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, color: '#e8a034', marginBottom: 8 }}>TRENDING TOPICS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topArticles.slice(0,5).map((t,i) => (
                    <a key={i} href={t.url} target="_blank" rel="noreferrer" style={{ color: '#f0ede8', fontSize: 13, textDecoration: 'none' }}>{t.title}</a>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{
        padding: "64px 24px",
        borderTop: "1px solid #1e1e2a",
        borderBottom: "1px solid #1e1e2a",
        background: "#0d0d14",
      }}>
        <div style={{
          maxWidth: 900, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 0,
        }}>
          {LP_STATS.map((stat, i) => (
            <div
              key={i}
              className="lp-stat"
              style={{
                textAlign: "center", padding: "24px 16px",
                borderRight: i < LP_STATS.length - 1 ? "1px solid #1e1e2a" : "none",
                animation: `lpCountUp .6s cubic-bezier(.22,1,.36,1) ${i * .1}s both`,
              }}
            >
              <div style={{ fontSize: 11, color: "#e8a034", marginBottom: 8 }}>{stat.icon}</div>
              <div
                className="lp-stat-num"
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 42, fontWeight: 700, color: "#f0ede8",
                  lineHeight: 1, marginBottom: 6,
                }}
              >
                {stat.num}
              </div>
              <div style={{ fontSize: 12, color: "#4a4855", letterSpacing: ".06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="lp-features" style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          {/* Section header */}
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{
              fontSize: 10, color: "#e8a034", letterSpacing: ".18em",
              textTransform: "uppercase", fontWeight: 600, marginBottom: 14,
            }}>
              SIX REASONS TO SWITCH
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(28px, 5vw, 52px)",
              fontWeight: 700, color: "#f0ede8", lineHeight: 1.15,
            }}>
              Everything a busy professional needs,<br />
              <span style={{ color: "#e8a034" }}>powered by AI.</span>
            </h2>
          </div>

          {/* Feature grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {LP_FEATURES.map((f, i) => (
              <FeatureCard key={i} f={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{
        padding: "80px 24px",
        background: "#0d0d14",
        borderTop: "1px solid #1e1e2a",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#e8a034", letterSpacing: ".18em", marginBottom: 14, fontWeight: 600 }}>
            THREE STEPS
          </div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(24px, 4vw, 40px)",
            fontWeight: 700, marginBottom: 56, color: "#f0ede8",
          }}>
            From a topic to full intelligence in seconds.
          </h2>

          <div style={{ display: "flex", gap: 0, position: "relative", flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { num: "01", title: "Enter a topic", desc: "Type or speak a query — anything from 'RBI rate cut' to 'Adani group'." },
              { num: "02", title: "Choose your view", desc: "Navigator briefing, Story Arc, My ET feed, Video, or Vernacular edition." },
              { num: "03", title: "Explore & listen", desc: "Read, save, and listen to AI-synthesised insights, hands-free if you like." },
            ].map((step, i) => (
              <div
                key={i}
                style={{
                  flex: "1 1 200px", padding: "32px 24px", textAlign: "center",
                  borderRight: i < 2 ? "1px solid #1e1e2a" : "none",
                  animation: `lpFadeUp .6s cubic-bezier(.22,1,.36,1) ${i * .15}s both`,
                }}
              >
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, color: "#e8a034", fontWeight: 700,
                  letterSpacing: ".14em", marginBottom: 16,
                }}>
                  {step.num}
                </div>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%", margin: "0 auto 16px",
                  background: "rgba(232,160,52,.12)", border: "1px solid rgba(232,160,52,.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#e8a034",
                }}>
                  {['🔍', '✦', '🔊'][i]}
                </div>
                <h3 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 18, fontWeight: 700, marginBottom: 10, color: "#f0ede8",
                }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 13, color: "#8a8795", lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{
        padding: "96px 24px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 700px 500px at 50% 50%, rgba(232,160,52,.09) 0%, transparent 70%)",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, color: "#4a4855", letterSpacing: ".2em",
            marginBottom: 20,
          }}>
            ◈ ET AI NEWSROOM
          </div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(28px, 5vw, 56px)",
            fontWeight: 700, color: "#f0ede8", lineHeight: 1.15, marginBottom: 16,
          }}>
            Your personalised newsroom<br />
            <span style={{ color: "#e8a034" }}>is ready.</span>
          </h2>
          <p style={{ fontSize: 15, color: "#8a8795", marginBottom: 40 }}>
            No account needed. Just a topic and your curiosity.
          </p>

          <button
            className="lp-cta-btn"
            onClick={onEnter}
            style={{
              padding: "16px 48px", borderRadius: 40, border: "none",
              background: "linear-gradient(135deg, #e8a034, #f0b44a)",
              color: "#000", fontSize: 16, fontWeight: 700,
              letterSpacing: ".02em", cursor: "pointer",
              boxShadow: "0 8px 40px rgba(232,160,52,.4)",
              display: "inline-flex", alignItems: "center", gap: 10,
            }}
          >
            Enter the Newsroom <span style={{ fontSize: 20 }}>→</span>
          </button>

          <p style={{ fontSize: 11, color: "#4a4855", marginTop: 20, letterSpacing: ".05em" }}>
            Powered by NewsAPI · Claude AI · OpenAI TTS
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid #1e1e2a",
        padding: "24px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        background: "#0a0a0f",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 18, fontWeight: 700, color: "#e8a034",
          }}>ET</span>
          <span style={{ fontSize: 10, color: "#4a4855", letterSpacing: ".12em" }}>AI NEWSROOM</span>
        </div>
        <p style={{ fontSize: 11, color: "#4a4855" }}>
          Not affiliated with The Economic Times · For demo purposes only
        </p>
        <button
          onClick={onEnter}
          style={{
            background: "transparent", border: "1px solid #1e1e2a",
            color: "#8a8795", borderRadius: 20, padding: "5px 16px",
            fontSize: 12, cursor: "pointer",
          }}
        >
          Launch app →
        </button>
      </footer>
    </div>
  );
}

const TABS = [
  { id: "navigator",  label: "Navigator",  icon: "◎" },
  { id: "myET",       label: "My ET",      icon: "✦" },
  { id: "storyArc",   label: "Story Arc",  icon: "◈" },
  { id: "video",      label: "AI Video",   icon: "▷" },
  { id: "vernacular", label: "Vernacular", icon: "◉" },
  { id: "bookmarks",  label: "Saved",      icon: "★" },
];


/* ─── ROOT APP ───────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <VoiceProvider>
      <AppRoot />
    </VoiceProvider>
  );
}

function AppRoot() {
  const [showLanding, setShowLanding] = useState(true);

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return <AppInner />;
}

function AppInner() {
  const [tab, setTab] = useState("navigator");
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const bookmarks = useBookmarks();

  const fetchRef = useRef(null);

  const handleFetch = async (overrideQuery) => {
    const q = (typeof overrideQuery === "string" ? overrideQuery : query).trim();
    if (!q) return;
    setFetching(true); setError("");
    try {
      const r = await fetchNews(q);
      setArticles(r.data || []);
      fetch("http://localhost:5000/preferences/track", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: q, action: "search" }),
      }).catch(() => {});
    } catch {
      setError("Backend unreachable — is server.js running on :5000?");
    } finally { setFetching(false); }
  };

  fetchRef.current = handleFetch;

  const handleVoiceDone = useCallback((text) => {
    setQuery(text);
    fetchRef.current(text);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: DS.bg }}>
      <header style={{ borderBottom: `1px solid ${DS.border}`, padding: "0 32px", position: "sticky", top: 0, background: DS.bg, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 0 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700, color: DS.accent }}>ET</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: DS.textDim, letterSpacing: ".14em", textTransform: "uppercase" }}>AI Newsroom</span>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 8, maxWidth: 560, alignItems: "center" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                placeholder="Union Budget · Adani · RBI rate cut · or 🎤 speak"
                style={{ flex: 1 }}
              />
              <MicBtn id="header-search" onDone={handleVoiceDone} />
              <Btn onClick={() => handleFetch()} disabled={fetching || !query.trim()}>
                {fetching ? <Spinner /> : "Fetch"}
              </Btn>
            </div>
            {articles.length > 0 && (
              <span style={{ fontSize: 11, color: DS.green, border: `1px solid ${DS.green}30`, background: DS.green + "10", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>
                {articles.length} articles loaded
              </span>
            )}
            {bookmarks.bookmarks.length > 0 && (
              <button onClick={() => setTab("bookmarks")} style={{ background: DS.accent + "15", border: `1px solid ${DS.accent}30`, color: DS.accent, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                ★ {bookmarks.bookmarks.length} saved
              </button>
            )}
            {error && <span style={{ fontSize: 12, color: DS.red }}>{error}</span>}
          </div>

          <div style={{ padding: "8px 0 6px" }}>
            <SmartSuggestions onSelect={(topic) => { setQuery(topic); }} />
          </div>

          <nav style={{ display: "flex", gap: 0, marginTop: 2 }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "10px 22px", background: "transparent", border: "none",
                borderBottom: `2px solid ${tab === t.id ? DS.accent : "transparent"}`,
                color: tab === t.id ? DS.accent : DS.textDim,
                fontSize: 13, fontWeight: tab === t.id ? 500 : 400,
                cursor: "pointer", transition: "all .15s",
                display: "flex", alignItems: "center", gap: 7,
              }}>
                <span style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
                {t.id === "bookmarks" && bookmarks.bookmarks.length > 0 && (
                  <span style={{ background: DS.accent, color: "#000", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                    {bookmarks.bookmarks.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {articles.length > 0 && <Ticker articles={articles} />}

      {!articles.length && tab !== "bookmarks" && (
        <div style={{ textAlign: "center", padding: "100px 20px" }}>
          <div style={{ fontFamily: DS.fontDisplay, fontSize: 56, color: DS.textDim, marginBottom: 16, lineHeight: 1 }}>◎</div>
          <h3 style={{ fontFamily: DS.fontDisplay, fontSize: 24, color: DS.textSecondary, fontWeight: 400, marginBottom: 10 }}>
            Enter a topic to begin
          </h3>
          <p style={{ color: DS.textDim, fontSize: 14, maxWidth: 400, margin: "0 auto", lineHeight: 1.7 }}>
            Try "Union Budget 2025", "Adani group", "RBI rate cut", or "Indian startup funding"
          </p>
          <p style={{ color: DS.textDim, fontSize: 12, marginTop: 10 }}>
            🎤 Or click the mic icon and speak your query
          </p>
        </div>
      )}

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 64px" }}>
        {tab === "bookmarks"  && <BookmarksTab bookmarks={bookmarks} />}
        {articles.length > 0 && (
          <>
            {tab === "navigator"  && <NavigatorTab  articles={articles} bookmarks={bookmarks} />}
            {tab === "myET"       && <MyETTab        articles={articles} bookmarks={bookmarks} />}
            {tab === "storyArc"   && <StoryArcTab    articles={articles} />}
            {tab === "video"      && <VideoTab        articles={articles} />}
            {tab === "vernacular" && <VernacularTab   articles={articles} />}
          </>
        )}
      </main>
    </div>
  );
}