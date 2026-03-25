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
   🎤 VOICE SYSTEM — fixed
   Root bugs that killed listening:
   1. STALE CLOSURE: onend read finalText from closure captured at mount (always "")
      Fix → store accumulated text in a ref, never in state during recognition
   2. continuous:true RESTART LOOP: many browsers fire onend then auto-restart,
      creating an infinite loop that burns CPU and never delivers results
      Fix → continuous:false, but we recreate the recognizer for each session
   3. DUAL MIC CONFLICT: two MicBtns sharing one recognizer → start() on an
      already-started instance throws, silently killing both
      Fix → track which "owner" (id) is active; other buttons are disabled
   4. interimResults with continuous caused partial results to overwrite finals
      Fix → accumulate finals in ref; interim shown separately
═══════════════════════════════════════════════════════════════════════════════ */
const VoiceCtx = createContext(null);

function VoiceProvider({ children }) {
  const [listening,   setListening]   = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const [interimText, setInterimText] = useState("");
  const [activeOwner, setActiveOwner] = useState(null); // which MicBtn owns the mic
  const [supported,   setSupported]   = useState(false);

  // Use refs for things read inside recognition callbacks (avoids stale closures)
  const accTextRef  = useRef("");   // accumulated final transcript for current session
  const onDoneRef   = useRef(null); // callback(text) to fire when done
  const ownerRef    = useRef(null); // mirrors activeOwner for use inside callbacks
  const recRef      = useRef(null); // current SpeechRecognition instance
  const audioRef    = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  // Creates a fresh recognizer each session — avoids stale state issues
  const startListening = useCallback((ownerId, onDone) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || listening) return;

    // Abort any leftover recognizer
    if (recRef.current) { try { recRef.current.abort(); } catch {} }

    const rec = new SR();
    rec.lang           = "en-IN";
    rec.continuous     = false;   // single utterance — reliable across all browsers
    rec.interimResults = true;    // still show live feedback
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
          accTextRef.current += t + " "; // accumulate into ref, not state
          setInterimText("");
        } else {
          interim += t;
        }
      }
      if (interim) setInterimText(interim);
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech") {
        // no-speech just means silence — fire callback with whatever we got
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
      // Read from ref — never stale
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

  // ── TTS ───────────────────────────────────────────────────────────────────
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
// id     — unique string so the provider knows which button owns the mic
// onDone — called with final transcript when user stops speaking
function MicBtn({ id, onDone, style: s = {} }) {
  const { listening, interimText, activeOwner, supported, startListening, stopListening } = useVoiceCtx();
  if (!supported) return null;

  const isMine    = activeOwner === id;
  const otherBusy = listening && !isMine; // another MicBtn is active

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
      {/* Live transcript bubble */}
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


/* ─── 🆕 BOOKMARK HOOK ───────────────────────────────────────────────────────── */
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
      if (r.status === 409) return; // already saved
      const data = await r.json();
      setBookmarks((prev) => [data.bookmark, ...prev]);
      // Track preference
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


/* ─── 🆕 BOOKMARK BUTTON ─────────────────────────────────────────────────────── */
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


/* ─── 🆕 SMART SUGGESTIONS ───────────────────────────────────────────────────── */
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


/* ─── 🆕 BOOKMARKS TAB ───────────────────────────────────────────────────────── */
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
      // ✅ Auto-speak the answer via OpenAI TTS
      speak(ans);
    } finally { setLoadQ(false); }
  };

  // Called by MicBtn when user finishes speaking
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
          {/* ✅ Shared MicBtn — onDone fires ask() automatically */}
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
            {/* 🆕 Speak the answer */}
            <SpeakBtn text={answer} />
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: DS.textPrimary, whiteSpace: "pre-wrap" }}>{answer}</p>
        </Card>
      )}

      {/* 🆕 Bookmark articles listed below briefing */}
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
  { value: "mutual_fund_investor", label: "Investor" },
  { value: "startup_founder", label: "Founder" },
  { value: "student", label: "Student" },
  { value: "corporate_executive", label: "Executive" },
];
const ROLE_INTERESTS = {
  mutual_fund_investor: ["Markets", "Mutual Funds", "RBI Policy", "Economy", "Tax"],
  startup_founder: ["Funding", "Startups", "Tech", "Regulation", "Competitors"],
  student: ["Economy basics", "Budget", "Jobs", "Policy", "Global markets"],
  corporate_executive: ["M&A", "Industry trends", "Regulation", "Leadership", "ESG"],
};

function MyETTab({ articles, bookmarks }) {
  const [role, setRole] = useState("mutual_fund_investor");
  const [interests, setInterests] = useState([]);
  const [context, setContext] = useState("");
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const toggle = (i) => setInterests((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i]);
  const scoreColor = (s) => s >= 8 ? DS.green : s >= 5 ? DS.accent : DS.textDim;

  // Track role preference
  const handleRoleChange = (r) => {
    setRole(r); setInterests([]);
    fetch("http://localhost:5000/preferences/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: r, action: "select" }),
    }).catch(() => {});
  };

  const generate = async () => {
    if (!articles.length) return;
    setLoading(true);
    try {
      const r = await getPersonalizedFeed(articles, { role, interests: interests.join(", ") || "stocks, startups", context });
      const raw = r.data.result;
      setFeed(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error(err);
      alert("Failed to generate personalized feed");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>My ET — Your Newsroom</h2>
      <Card>
        <SectionLabel>I am a…</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {ROLES.map((r) => (
            <button key={r.value} onClick={() => handleRoleChange(r.value)} style={{
              padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .15s",
              background: role === r.value ? DS.accent : "transparent",
              color: role === r.value ? "#000" : DS.textSecondary,
              border: `1px solid ${role === r.value ? DS.accent : DS.border}`,
            }}>{r.label}</button>
          ))}
        </div>
        <SectionLabel>I care about</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(ROLE_INTERESTS[role] || []).map((i) => <Pill key={i} active={interests.includes(i)} onClick={() => toggle(i)}>{i}</Pill>)}
        </div>
        <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Any context? e.g. I hold Nifty50 index funds…" style={{ marginBottom: 14 }} />
        <Btn onClick={generate} disabled={loading || !articles.length}>{loading ? <><Spinner /> Ranking…</> : "Build my feed"}</Btn>
      </Card>

      {feed.length > 0 && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel>Ranked for — {ROLES.find((r) => r.value === role)?.label}</SectionLabel>
          {feed.map((a, i) => {
            const score = typeof a.relevanceScore === "number" ? a.relevanceScore
              : typeof a.score === "number" ? a.score : 0;
            return (
              <Card key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ minWidth: 38, height: 38, borderRadius: 8, background: scoreColor(score) + "18", border: `1px solid ${scoreColor(score)}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: scoreColor(score), fontFamily: DS.fontMono }}>
                  {score}
                </div>
                <div style={{ flex: 1 }}>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 15, fontWeight: 500, color: DS.textPrimary, lineHeight: 1.4, display: "block", marginBottom: 5 }}>{a.title}</a>
                  {a.reason && <p style={{ fontSize: 12, color: DS.accent, marginBottom: 4 }}>↳ {a.reason}</p>}
                  {a.description && <p style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>{a.description}</p>}
                </div>
                {/* 🆕 Bookmark button on each ranked article */}
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
function StoryArcTab({ articles }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { speak, speaking, stopSpeaking } = useVoiceCtx();

  const sentimentColor = (s) => {
    if (!s) return DS.textDim;
    const l = s.toLowerCase();
    return l.includes("positive") || l.includes("bullish") ? DS.green
      : l.includes("negative") || l.includes("bearish") ? DS.red
      : DS.accent;
  };

  const build = async () => {
    setLoading(true);
    try {
      const r = await getTimeline(articles);
      const story = r.data.story;
      setData({
        events: Array.isArray(story.timeline) ? story.timeline : [],
        players: Array.isArray(story.key_players) ? story.key_players : [],
        sentiment: typeof story.sentiment === "string" ? story.sentiment : "",
        contrarian: typeof story.contrarian_view === "string" ? story.contrarian_view : "",
        whatNext: typeof story.what_next === "string" ? story.what_next : "",
        summary: "",
      });
    } catch (err) {
      console.error(err);
      setData({ summary: "Failed to load story", events: [], players: [], sentiment: "", contrarian: "", whatNext: "" });
    } finally { setLoading(false); }
  };

  const evText = (ev) => {
    if (typeof ev === "string") return ev;
    if (ev && typeof ev === "object") return ev.event || ev.description || JSON.stringify(ev);
    return String(ev);
  };
  const evDate = (ev) => (ev && typeof ev === "object" ? ev.date || null : null);
  const playerName = (p) => {
    if (typeof p === "string") return p;
    if (p && typeof p === "object") return p.name || p.role || JSON.stringify(p);
    return String(p);
  };
  const playerRole = (p) => (p && typeof p === "object" ? p.role || null : null);

  const narrateStory = () => {
    if (!data) return;
    if (speaking) { stopSpeaking(); return; }
    const text = [
      data.events.length ? "Timeline: " + data.events.map(evText).join(". ") : "",
      data.sentiment ? "Market sentiment is " + data.sentiment + "." : "",
      data.contrarian ? "Contrarian view: " + data.contrarian : "",
      data.whatNext ? "What to watch next: " + data.whatNext : "",
    ].filter(Boolean).join(" ");
    speak(text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontFamily: DS.fontDisplay, fontSize: 24, fontWeight: 700 }}>Story Arc Tracker</h2>
          <p style={{ color: DS.textSecondary, fontSize: 13, marginTop: 4 }}>Full visual narrative — timeline, players, sentiment, predictions</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {data && (
            <Btn onClick={narrateStory} variant="ghost">
              {speaking ? "⏹ Stop" : "🔊 Narrate"}
            </Btn>
          )}
          <Btn onClick={build} disabled={loading || !articles.length}>{loading ? <><Spinner /> Building…</> : "Build Story Arc"}</Btn>
        </div>
      </div>

      {data && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.events.length > 0 && (
            <Card>
              <SectionLabel>Timeline</SectionLabel>
              <div style={{ position: "relative", paddingLeft: 28 }}>
                <div style={{ position: "absolute", left: 9, top: 6, bottom: 6, width: 1, background: DS.border }} />
                {data.events.map((ev, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: 22 }}>
                    <div style={{ position: "absolute", left: -23, top: 5, width: 10, height: 10, borderRadius: "50%", background: DS.accent, border: `2px solid ${DS.bg}` }} />
                    {evDate(ev) && <div style={{ fontSize: 11, color: DS.textDim, fontFamily: DS.fontMono, marginBottom: 3 }}>{evDate(ev)}</div>}
                    <div style={{ fontSize: 14, color: DS.textPrimary, lineHeight: 1.6 }}>{evText(ev)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {data.players.length > 0 && (
              <Card>
                <SectionLabel>Key Players</SectionLabel>
                {data.players.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ minWidth: 34, height: 34, borderRadius: 8, background: DS.purple + "20", border: `1px solid ${DS.purple}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: DS.purple, fontWeight: 700 }}>
                      {playerName(p)?.[0] ?? "?"}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{playerName(p)}</div>
                      {playerRole(p) && <div style={{ fontSize: 11, color: DS.textDim }}>{playerRole(p)}</div>}
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {data.sentiment && (
              <Card>
                <SectionLabel>Market Sentiment</SectionLabel>
                <div style={{ fontSize: 22, fontWeight: 700, color: sentimentColor(data.sentiment), marginBottom: 12 }}>{data.sentiment}</div>
                {data.contrarian && (
                  <>
                    <SectionLabel>Contrarian View</SectionLabel>
                    <p style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.6 }}>{data.contrarian}</p>
                  </>
                )}
              </Card>
            )}

            {data.whatNext && (
              <Card style={{ borderTop: `3px solid ${DS.green}`, borderRadius: "0 0 12px 12px" }}>
                <SectionLabel>What to watch next</SectionLabel>
                <p style={{ fontSize: 13, color: DS.textPrimary, lineHeight: 1.7 }}>{data.whatNext}</p>
              </Card>
            )}
          </div>

          {data.summary && !data.events.length && (
            <Card><p style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", color: DS.textPrimary }}>{data.summary}</p></Card>
          )}
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
    // 🆕 If AI voice selected, use OpenAI TTS for the full script
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
              {/* 🆕 AI Voice toggle */}
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
  { code: "hi", script: "हिन्दी", name: "Hindi" },
  { code: "ta", script: "தமிழ்", name: "Tamil" },
  { code: "te", script: "తెలుగు", name: "Telugu" },
  { code: "bn", script: "বাংলা", name: "Bengali" },
];

function VernacularTab({ articles }) {
  const [lang, setLang] = useState(LANGS[0]);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        <p style={{ color: DS.textSecondary, fontSize: 13, marginTop: 4 }}>Culturally adapted — not literal translation</p>
      </div>

      <Card>
        <SectionLabel>Target language</SectionLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => { setLang(l); setResult(""); setError(""); }} style={{
              padding: "12px 22px", borderRadius: 10, cursor: "pointer", transition: "all .15s", textAlign: "center",
              background: lang.code === l.code ? DS.accent : DS.surfaceHover,
              color: lang.code === l.code ? "#000" : DS.textSecondary,
              border: `1px solid ${lang.code === l.code ? DS.accent : DS.border}`,
            }}>
              <div style={{ fontSize: 20, marginBottom: 3 }}>{l.script}</div>
              <div style={{ fontSize: 11, opacity: .7 }}>{l.name}</div>
            </button>
          ))}
        </div>
        <Btn onClick={translate} disabled={loading || !articles.length}>
          {loading ? <><Spinner /> Translating…</> : `Translate to ${lang.name}`}
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
            {/* 🆕 TTS for vernacular — note: TTS voice quality varies by language */}
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


/* ─── TABS config ────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "navigator",  label: "Navigator",  icon: "◎" },
  { id: "myET",       label: "My ET",      icon: "✦" },
  { id: "storyArc",   label: "Story Arc",  icon: "◈" },
  { id: "video",      label: "AI Video",   icon: "▷" },
  { id: "vernacular", label: "Vernacular", icon: "◉" },
  { id: "bookmarks",  label: "Saved",      icon: "★" }, // 🆕
];


/* ─── ROOT APP ───────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <VoiceProvider>
      <AppInner />
    </VoiceProvider>
  );
}

function AppInner() {
  const [tab, setTab] = useState("navigator");
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const bookmarks = useBookmarks();

  // Ref so the voice callback (created once) always calls the latest handleFetch
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

  fetchRef.current = handleFetch; // always up-to-date

  // Stable callback for voice — reads from ref, never stale
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
              {/* ✅ Single MicBtn — fires handleFetch automatically when done */}
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
            {/* 🆕 Bookmark count badge */}
            {bookmarks.bookmarks.length > 0 && (
              <button onClick={() => setTab("bookmarks")} style={{ background: DS.accent + "15", border: `1px solid ${DS.accent}30`, color: DS.accent, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                ★ {bookmarks.bookmarks.length} saved
              </button>
            )}
            {error && <span style={{ fontSize: 12, color: DS.red }}>{error}</span>}
          </div>

          {/* 🆕 Smart suggestions below search bar */}
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
                {/* 🆕 Badge on Saved tab */}
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