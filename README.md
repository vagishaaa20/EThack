# 📰 ET Cortex: The AI-Native News Experience
**Transforming Business News into Personalized, Interactive Intelligence.**

[![Built with React](https://img.shields.io/badge/Frontend-React-blue?style=flat-square&logo=react)](#)
[![Built with Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=flat-square&logo=node.js)](#)
[![Database MongoDB](https://img.shields.io/badge/Database-MongoDB-darkgreen?style=flat-square&logo=mongodb)](#)
[![Powered by AI](https://img.shields.io/badge/AI-Multi--Agent_System-orange?style=flat-square)](#)

> **ET Gen AI Hackathon Submission**
> Business news in 2026 is still delivered like it's 2005. We built a platform that replaces static text articles with hyper-personalized feeds, interactive AI briefings, broadcast-quality short video scripts, and vernacular audio. 

---

## 🚀 The Vision & Problem Solved
Traditional news relies on static text and a one-size-fits-all homepage. Our platform introduces **My ET**, a fundamentally different newsroom. A mutual fund investor gets portfolio-relevant stories, while a startup founder gets competitor moves. Instead of reading 8 separate articles about a Union Budget, users interact with a single AI-powered deep briefing that synthesizes all coverage into an explorable document with follow-up Q&A.

---

## ✨ Core Platform Features

* **Hyper-Personalized Feeds:** Role-based relevance filtering (Investor, Founder, Student) that increases daily active use and retention.
* **News Navigator:** Synthesizes 5+ articles into an executive briefing in seconds, highlighting key events, impacts, and risks.
* **Story Arc Tracker:** Extracts timelines, maps key players, and tracks sentiment shifts across ongoing stories (outputted as structured JSON).
* **AI Video Studio:** Automatically transforms breaking news into 60–90s video scripts with scene breakdowns, ready for rapid social video production.
* **Vernacular Engine:** Real-time, context-aware translation of English business news into Hindi, Tamil, Telugu, and Bengali—focusing on culturally adapted explanations, not just literal translation.
* **Frictionless Audio & Voice UI:** Browser speech-to-text (SR) and OpenAI TTS integration for hands-free conversational Q&A and read-aloud audio briefings.

---

## 🧠 The Multi-Agent Architecture
Our Express.js backend utilizes a central Orchestrator to route user intent to specialized AI agents working in parallel:

1. **Navigator Agent** (`navigatorAgent.js`): Produces concise summaries and extracts risks.
2. **Story Agent** (`storyAgent.js`): Generates strict JSON timelines and contrarian views.
3. **Profile Agent** (`profileAgent.js`): Scores article relevance based on user profiles.
4. **Translation Agent:** Handles localized, jargon-explained translations.
5. **Video & TTS Agent** (`videoAgent.js`): Drafts video scripts and manages MP3 generation.

### 🛡️ Error Handling & Observability
Built for production reliability. The system includes:
* **API Fallbacks:** Graceful degradation if external LLMs hit rate limits.
* **Strict JSON Validation:** Ensures downstream apps don't crash from LLM hallucinations.
* **In-Memory Logging:** Dedicated endpoints (`server.js`) to fetch/clear logs for real-time debugging and stable live demos.

---

## 🛠️ Tech Stack
* **Frontend:** React.js, TailwindCSS, Web Speech API (Voice UI)
* **Backend:** Node.js, Express.js
* **Database:** MongoDB (File-based persistence for bookmarks and preference tracking)
* **AI & External APIs:** Large Language Models (for agent logic), OpenAI TTS, NewsAPI (for data ingestion)

---

## 💻 Local Setup & Installation

Follow these steps to run the application locally.

### Prerequisites
* Node.js (v18 or higher)
* MongoDB (Local instance or MongoDB Atlas URI)
* Required API Keys (LLM provider, TTS, News API)

### 1. Clone the Repository
```bash
git clone [https://github.com/vagishaaa20/EThack.git](https://github.com/vagishaaa20/EThack.git)
cd EThack


### 2. backend setup
Open a terminal and navigate to the backend directory:
```bash
cd backend
npm install

Create a .env file in the backend directory and configure your environment variables:
PORT=5000
MONGO_URI=your_mongodb_connection_string
LLM_API_KEY=your_ai_api_key
OPENAI_API_KEY=your_openai_api_key
NEWS_API_KEY=your_news_api_key

Start the backend server:
npm start


### 3. Frontend Setup
Open a new terminal window and navigate to the frontend directory:
cd frontend
npm install
npm run dev


