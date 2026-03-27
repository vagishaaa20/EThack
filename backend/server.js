import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { decideAgent } from "./agents/orchestratorAgent.js";
import { runNavigatorAgent } from "./agents/navigatorAgent.js";
import { runStoryAgent } from "./agents/storyAgent.js";
import { runProfileAgent } from "./agents/profileAgent.js";
import { runTranslateAgent } from "./agents/translateAgent.js";
import { runVideoAgent } from "./agents/videoAgent.js";
import { runTTSAgent } from "./agents/ttsAgent.js"; // 🆕 TTS Agent

import { logAgent, getLogs, clearLogs } from "./utils/logger.js";

import connect   from "./db.js";
import Bookmark  from "./models/bookmark.js";
import Preference from "./models/Preference.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🆕 Simple file-based persistence for bookmarks & preferences
const DATA_FILE = path.join(__dirname, "userData.json");

function loadUserData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load user data:", e);
  }
  return { bookmarks: [], preferences: { topics: {}, roles: {}, readCount: 0 } };
}

function saveUserData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to save user data:", e);
  }
}

await connect();

const app = express();
app.use(cors());
app.use(express.json());


/* =========================
   EXISTING ROUTES (unchanged)
========================= */

app.post("/ask", async (req, res) => {
  const { query, articles } = req.body;
  if (!articles || articles.length === 0)
    return res.status(400).json({ error: "No articles provided" });

  try {
    logAgent("Orchestrator", `Received query: ${query}`);
    const decision = await decideAgent(query);
    logAgent("Orchestrator", `Decision: ${decision}`);

    let result, reasoning;

    if (decision === "story") {
      result = await runStoryAgent(articles);
      reasoning = "User asked for timeline/history → Story Agent selected";
      return res.json({ type: "timeline", result, reasoning });
    }

    result = await runNavigatorAgent(articles);
    reasoning = "User asked for explanation → Navigator Agent selected";
    return res.json({ type: "summary", result, reasoning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Orchestrator failed" });
  }
});

function extractJSON(text) {
  try {
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("JSON parse failed:", err);
    return { timeline: [], key_players: [], sentiment: "unknown", contrarian_view: text, what_next: "Parsing failed" };
  }
}

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

app.post("/timeline", async (req, res) => {
  const { articles } = req.body;
  if (!articles || articles.length === 0)
    return res.status(400).json({ error: "No articles provided" });

  try {
    logAgent("Orchestrator", "Calling Story Agent for full story arc...");
    const raw = await runStoryAgent(articles);
    const parsed = extractJSON(raw);
    res.json({ story: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Story Agent failed" });
  }
});

app.post("/my-et", async (req, res) => {
  const { articles, profile } = req.body;
  if (!articles || articles.length === 0)
    return res.status(400).json({ error: "No articles provided" });
  if (!profile || !profile.role)
    return res.status(400).json({ error: "Profile is required" });

  try {
    logAgent("Orchestrator", "Calling Profile Agent for personalization...");
    const raw = await runProfileAgent(articles, profile);
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
    res.json({ result: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Profile Agent failed" });
  }
});

app.post("/translate", async (req, res) => {
  const { text, language } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

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
  if (!articles || articles.length === 0)
    return res.status(400).json({ error: "No articles provided" });

  try {
    logAgent("Orchestrator", "Calling Video Agent...");
    const raw = await runVideoAgent(articles);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    res.json({ video: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Video generation failed" });
  }
});


/* =========================
   🆕 BOOKMARKS SYSTEM
========================= */

// GET all bookmarks
app.get("/bookmarks", (req, res) => {
  const userData = loadUserData();
  res.json({ bookmarks: userData.bookmarks });
});

// POST — add a bookmark
app.post("/bookmarks", (req, res) => {
  const { article } = req.body;
  if (!article || !article.url)
    return res.status(400).json({ error: "Article with URL required" });

  const userData = loadUserData();

  // Avoid duplicates by URL
  const exists = userData.bookmarks.some((b) => b.url === article.url);
  if (exists)
    return res.status(409).json({ error: "Already bookmarked" });

  const bookmark = {
    ...article,
    savedAt: new Date().toISOString(),
    id: Date.now().toString(),
  };

  userData.bookmarks.unshift(bookmark); // newest first
  saveUserData(userData);

  logAgent("Bookmarks", `Saved: ${article.title}`);
  res.json({ bookmark });
});

// DELETE — remove a bookmark by URL
app.delete("/bookmarks", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  const userData = loadUserData();
  userData.bookmarks = userData.bookmarks.filter((b) => b.url !== url);
  saveUserData(userData);

  logAgent("Bookmarks", `Removed bookmark: ${url}`);
  res.json({ message: "Removed" });
});


/* =========================
   🆕 PREFERENCE LEARNING SYSTEM
========================= */

// GET current learned preferences
app.get("/preferences", (req, res) => {
  const userData = loadUserData();
  res.json({ preferences: userData.preferences });
});

// POST — record a user interaction to learn preferences
// Call this whenever a user fetches a topic, bookmarks, or reads more
app.post("/preferences/track", (req, res) => {
  const { topic, role, action } = req.body;
  // action: "search" | "bookmark" | "read"
  if (!topic && !role)
    return res.status(400).json({ error: "topic or role required" });

  const userData = loadUserData();
  const prefs = userData.preferences;

  if (topic) {
    // Weight: bookmark=3, read=2, search=1
    const weight = action === "bookmark" ? 3 : action === "read" ? 2 : 1;
    prefs.topics[topic] = (prefs.topics[topic] || 0) + weight;
  }

  if (role) {
    prefs.roles[role] = (prefs.roles[role] || 0) + 1;
  }

  prefs.readCount = (prefs.readCount || 0) + 1;

  saveUserData(userData);
  res.json({ preferences: prefs });
});

// GET — smart topic suggestions based on learned preferences
app.get("/preferences/suggestions", (req, res) => {
  const userData = loadUserData();
  const { topics } = userData.preferences;

  // Sort topics by score, return top 5
  const suggestions = Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, score]) => ({ topic, score }));

  res.json({ suggestions });
});


/* =========================
   🆕 TEXT-TO-SPEECH (TTS)
========================= */

// POST — convert text to speech, returns audio as binary stream
app.post("/tts", async (req, res) => {
  const { text, voice = "nova" } = req.body;
  // Available OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    logAgent("TTS Agent", `Generating speech (voice: ${voice})`);

    const audioBuffer = await runTTSAgent(text, voice);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "no-cache",
    });

    res.send(audioBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TTS generation failed" });
  }
});


/* =========================
   LOG SYSTEM
========================= */
app.get("/logs", (req, res) => res.json({ logs: getLogs() }));
app.post("/clear-logs", (req, res) => { clearLogs(); res.json({ message: "Logs cleared" }); });


/* =========================
   SERVER START
========================= */
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});