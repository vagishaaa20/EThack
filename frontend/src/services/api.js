import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000",
});

// 🔹 Orchestrator
export const askAI = (query, articles) =>
  API.post("/ask", { query, articles });

// 🔹 News
export const fetchNews = (query) =>
  API.get(`/news?q=${query}`);

// 🔹 Navigator Agent
export const summarizeNews = (articles) =>
  API.post("/summarize", { articles });

// 🔹 Story Agent
export const getTimeline = (articles) =>
  API.post("/timeline", { articles });

export const getLogs = () =>
  API.get("/logs");

export const clearLogs = () =>
  API.post("/clear-logs");

export const getPersonalizedFeed = (articles, profile) =>
  API.post("/my-et", { articles, profile });

export const translateText = (text, language) =>
  API.post("/translate", { text, language });

export const generateVideo = (articles) =>
  API.post("/video", { articles });