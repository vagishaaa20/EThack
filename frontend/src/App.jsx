import { useState } from "react";
import {
  askAI,
  fetchNews,
  summarizeNews,
  getTimeline,
  getLogs,
  getPersonalizedFeed,
  translateText,
  generateVideo
} from "./services/api";

function App() {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [summary, setSummary] = useState("");
  const [timeline, setTimeline] = useState("");
  const [result, setResult] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [logs, setLogs] = useState([]);
  const [language, setLanguage] = useState("Hindi");
  const [translated, setTranslated] = useState("");
  const [briefing, setBriefing] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  // 🔥 My ET
  const [role, setRole] = useState("investor");
  const [personalized, setPersonalized] = useState("");
  const [video, setVideo] = useState(null);

  /* =========================
     🔹 FETCH NEWS
  ========================= */
  const handleFetchNews = async () => {
    const res = await fetchNews(query);
    setArticles(res.data);
  };

  /* =========================
     🔹 SUMMARY
  ========================= */
  const handleSummarize = async () => {
    if (!articles.length) return alert("Fetch news first!");
    
    const res = await summarizeNews(articles);
    setSummary(res.data.summary);
    setBriefing(res.data.summary);
  };

  /* =========================
     🔹 TIMELINE
  ========================= */
  const handleTimeline = async () => {
    if (!articles.length) return alert("Fetch news first!");

    setLoading(true);
    const res = await getTimeline(articles);
    setTimeline(res.data.story);
    setLoading(false);
  };

  /* =========================
     🔹 ORCHESTRATOR (ASK AI)
  ========================= */
const handleAsk = async () => {
  if (!articles.length) {
    alert("Fetch news first!");
    return;
  }

  if (!briefing) {
    alert("Generate briefing first!");
    return;
  }

  setLoading(true);

  try {
    const enhancedQuery = `
You are answering based on this briefing:

${briefing}

User Question:
${query}
    `;

    const res = await askAI(enhancedQuery, articles);

    // 🔥 store in separate state
    setFollowUpAnswer(res.data.result);

    // keep reasoning + logs
    setReasoning(res.data.reasoning || "");

    const logRes = await getLogs();
    setLogs(logRes.data.logs);

  } catch (err) {
    console.error(err);
    alert("Error getting answer");
  }

  setLoading(false);
};

  /* =========================
     🔹 MY ET (PERSONALIZATION)
  ========================= */
  const handlePersonalized = async () => {
    if (!articles.length) return alert("Fetch news first!");

    const res = await getPersonalizedFeed(articles, {
      role,
      interests: "stocks, startups",
      context: ""
    });

    setPersonalized(res.data.result);
  };

const handleTranslate = async () => {
  console.log("Translate clicked");

  // ✅ Allow translation if ANY data exists
  if (!articles.length && !summary && !result) {
    alert("Fetch news first!");
    return;
  }

  // ✅ Smart text selection
  let text = "";

  if (result) {
    text = result;
  } else if (summary) {
    text = summary;
  } else if (articles.length) {
    text = articles.map(a => a.title || "").join(". ");
  }

  console.log("TEXT SENT:", text);

  try {
    const res = await fetch("http://localhost:5000/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, language }),
    });

    if (!res.ok) {
      console.error("Response not OK:", res);
      alert("Translation failed!");
      return;
    }

    const data = await res.json();

    console.log("RESPONSE:", data);

    // ✅ FIX: Ensure safe fallback
    setTranslated(data.translated || "⚠️ No translation received");

  } catch (err) {
    console.error("ERROR:", err);
    alert("Translation failed due to error");
  }
};

const handleVideo = async () => {
  if (!articles.length) {
    alert("Fetch news first!");
    return;
  }

  const res = await generateVideo(articles);
  setVideo(res.data.video);
};

  return (
    <div style={{ padding: "20px" }}>
      <h1>🧠 AI News Intelligence Platform</h1>

      {/* INPUT */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter topic..."
        style={{ padding: "10px", width: "300px" }}
      />

      <br /><br />

      {/* BUTTONS */}
      <button onClick={handleFetchNews}>Fetch News</button>
      <button onClick={handleSummarize}>Briefing</button>
      <button onClick={handleTimeline}>Timeline</button>
      <button onClick={handleAsk}>Ask AI</button>
      
<h3>💬 Ask Follow-up Questions</h3>

<input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="Ask about this news..."
/>

<button onClick={handleAsk}>
  Ask Question
</button>

<div>
  <p>💡 Suggested Questions:</p>

  <button onClick={() => setQuery("What is the impact?")}>
    Impact
  </button>

  <button onClick={() => setQuery("Who benefits?")}>
    Who benefits?
  </button>

  <button onClick={() => setQuery("What are the risks?")}>
    Risks
  </button>

  <button onClick={handleVideo}>
  Generate Video 🎥
  </button>

</div>

<h3>🤖 Answer</h3>

{followUpAnswer && (
  <div
    style={{
      background: "#eef",
      padding: "15px",
      borderRadius: "10px",
      marginTop: "10px",
    }}
  >
    {followUpAnswer}
  </div>
)}

      <br /><br />

      {/* PERSONALIZATION */}
      <h3>🎯 My ET (Personalized Feed)</h3>
      <select onChange={(e) => setRole(e.target.value)}>
        <option value="investor">Investor</option>
        <option value="founder">Founder</option>
        <option value="student">Student</option>
      </select>

      <button onClick={handlePersonalized}>Generate Feed</button>

      {loading && <p>⏳ Processing...</p>}

      {/* ARTICLES */}
      <h2>📰 Articles</h2>
      {articles.map((a, i) => (
        <p key={i}>• {a.title}</p>
      ))}

    <h2>🎥 AI News Video</h2>

{video && (
  <div style={{ background: "#000", color: "#fff", padding: "20px", borderRadius: "10px" }}>
    
    <h3>{video.title}</h3>

    <p><strong>🗣️ Narration:</strong></p>
    <p>{video.narration}</p>

    <h4>🎬 Scenes</h4>
    {video.scenes?.map((s, i) => (
      <div key={i} style={{ marginBottom: "10px" }}>
        <strong>Scene {s.scene}:</strong>
        <p>{s.visual}</p>
        <p>{s.text}</p>
      </div>
    ))}

  </div>
)}

      {/* SUMMARY */}
      <h2>📊 AI Briefing</h2>
      <pre>{summary}</pre>

      {/* TIMELINE */}
      <h3>📅 Timeline</h3>

{timeline?.timeline?.map((t, i) => (
  <div
    key={i}
    style={{
      borderLeft: "4px solid #4CAF50",
      paddingLeft: "10px",
      marginBottom: "10px",
    }}
  >
    <strong>{t.date}</strong>
    <p>{t.event}</p>
  </div>
))}

<h4>👥 Key Players</h4>

<div>
  {timeline?.key_players?.map((p, i) => (
    <span
      key={i}
      style={{
        background: "#e0e0e0",
        padding: "5px 10px",
        marginRight: "5px",
        borderRadius: "10px",
      }}
    >
      {p}
    </span>
  ))}
</div>

<h4>📉 Sentiment</h4>

<span
  style={{
    padding: "5px 10px",
    borderRadius: "10px",
    background:
      timeline?.sentiment === "positive"
        ? "#d4edda"
        : timeline?.sentiment === "negative"
        ? "#f8d7da"
        : "#eee",
  }}
>
  {timeline?.sentiment}
</span>

<h4>🤔 Contrarian View</h4>

<div
  style={{
    background: "#f8d7da",
    padding: "10px",
    borderRadius: "10px",
  }}
>
  {timeline?.contrarian_view}
</div>

<h4>🔮 What Next</h4>
<p>{timeline?.what_next}</p>

      {/* ORCHESTRATOR OUTPUT */}
      <h2>🤖 AI Response</h2>
      <pre>{result}</pre>

      {/* 🔥 REASONING PANEL */}
      <h3>🧠 Why this result?</h3>
      <p>{reasoning}</p>

      {/* 🔥 AGENT LOGS */}
      <h3>🤖 Agent Activity</h3>
      <div style={{ background: "#111", color: "#0f0", padding: "10px" }}>
        {logs.map((log, i) => (
          <p key={i}>{log}</p>
        ))}
      </div>

<h3>🌐 Vernacular News Engine</h3>

<select onChange={(e) => setLanguage(e.target.value)}>
  <option>Hindi</option>
  <option>Tamil</option>
  <option>Telugu</option>
  <option>Bengali</option>
</select>

<button onClick={handleTranslate}>
  Translate News
</button>

<h3>🌐 Translated Output</h3>

{translated && (
  <div
    style={{
      background: "#eef",
      padding: "15px",
      borderRadius: "10px",
      marginTop: "10px",
    }}
  >
    {translated}
  </div>
)}

      {/* PERSONALIZED OUTPUT */}
      <h2>🎯 Personalized Feed</h2>

{Array.isArray(personalized) &&
  personalized.map((item, i) => (
    <div
      key={i}
      style={{
        border: "1px solid #ccc",
        padding: "10px",
        marginBottom: "10px",
      }}
    >
      <h4>{item.title}</h4>

      <p style={{ color: item.score > 7 ? "green" : item.score > 4 ? "orange" : "gray" }}>
      Score: {item.score}/10
      </p>

      <p>
        <strong>Why it matters:</strong> {item.reason}
      </p>
    </div>
  ))}
    </div>
  );
}

export default App;