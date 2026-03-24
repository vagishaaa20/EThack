import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

import { decideAgent } from "./agents/orchestratorAgent.js";
import { runNavigatorAgent } from "./agents/navigatorAgent.js";
import { runStoryAgent } from "./agents/storyAgent.js";
import { runProfileAgent } from "./agents/profileAgent.js";
import { runTranslateAgent } from "./agents/translateAgent.js";
import { runVideoAgent } from "./agents/videoAgent.js";

import { logAgent, getLogs, clearLogs } from "./utils/logger.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


app.post("/ask", async (req, res) => {
  const { query, articles } = req.body;

  if (!articles || articles.length === 0) {
    return res.status(400).json({ error: "No articles provided" });
  }

  try {
    logAgent("Orchestrator", `Received query: ${query}`);

    const decision = await decideAgent(query);

    logAgent("Orchestrator", `Decision: ${decision}`);

    let result;
    let reasoning;

    if (decision === "story") {
      result = await runStoryAgent(articles);
      reasoning = "User asked for timeline/history → Story Agent selected";
      return res.json({ type: "timeline", result, reasoning });
    }

    // default navigator
    result = await runNavigatorAgent(articles);
    reasoning = "User asked for explanation → Navigator Agent selected";

    return res.json({ type: "summary", result, reasoning });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Orchestrator failed" });
  }
});

/* =========================
   🔹 1. FETCH NEWS SERVICE
========================= */
app.get("/news", async (req, res) => {
  const query = req.query.q;

  try {
    logAgent("News Service", `Fetching news for query: ${query}`);

    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=${query}&apiKey=${process.env.NEWS_API_KEY}`
    );

    const articles = response.data.articles.slice(0, 5);

    res.json(articles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

/* =========================
   🔹 2. NAVIGATOR AGENT
========================= */
app.post("/summarize", async (req, res) => {
  const { articles } = req.body;

  try {
    logAgent("Orchestrator", "Calling Navigator Agent...");

    const summary = await runNavigatorAgent(articles);

    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Navigator Agent failed" });
  }
});

/* =========================
   🔹 STORY ARC TRACKER (UPGRADED)
========================= */
app.post("/timeline", async (req, res) => {
  const { articles } = req.body;

  // ✅ validation
  if (!articles || articles.length === 0) {
    return res.status(400).json({ error: "No articles provided" });
  }

  try {
    logAgent("Orchestrator", "Calling Story Agent for full story arc...");

    const raw = await runStoryAgent(articles);

    let parsed;

    try {
      parsed = JSON.parse(raw); // 🔥 structured output
    } catch (err) {
      console.error("JSON parse failed:", err);
      parsed = {
        timeline: [],
        key_players: [],
        sentiment: "unknown",
        contrarian_view: raw,
        what_next: "Unable to parse structured output",
      };
    }

    res.json({
      story: parsed,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Story Agent failed" });
  }
});

app.post("/my-et", async (req, res) => {
  const { articles, profile } = req.body;

  // ✅ Validation
  if (!articles || articles.length === 0) {
    return res.status(400).json({ error: "No articles provided" });
  }

  if (!profile || !profile.role) {
    return res.status(400).json({ error: "Profile is required" });
  }

  try {
    logAgent("Orchestrator", "Calling Profile Agent for personalization...");

    const raw = await runProfileAgent(articles, profile);

    // 🔥 Try parsing structured JSON
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      logAgent("Profile Agent", "Failed to parse JSON, returning raw output");
      parsed = raw; // fallback
    }
res.json({ result: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Profile Agent failed" });
  }
});

app.post("/translate", async (req, res) => {
  const { text, language } = req.body;

  if (!text) {
    return res.status(400).json({ error: "No text provided" });
  }

  try {
    logAgent("Orchestrator", "Calling Translation Agent...");

    const translated = await runTranslateAgent(text, language);

    res.json({ translated });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.post("/video", async (req, res) => {
  const { articles } = req.body;

  if (!articles || articles.length === 0) {
    return res.status(400).json({ error: "No articles provided" });
  }

  try {
    logAgent("Orchestrator", "Calling Video Agent...");

    const raw = await runVideoAgent(articles);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    res.json({ video: parsed });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Video generation failed" });
  }
});

/* =========================
   🔹 4. LOG SYSTEM
========================= */
app.get("/logs", (req, res) => {
  res.json({ logs: getLogs() });
});

app.post("/clear-logs", (req, res) => {
  clearLogs();
  res.json({ message: "Logs cleared" });
});

/* =========================
   🔹 SERVER START
========================= */
app.listen(5000, () => {
  console.log(" Server running on http://localhost:5000");
});