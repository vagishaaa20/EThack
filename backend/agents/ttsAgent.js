// agents/ttsAgent.js
// Calls OpenAI's TTS endpoint and returns raw audio buffer (mp3)

import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * @param {string} text   — The text to speak (keep under ~4000 chars for best results)
 * @param {string} voice  — OpenAI voice: alloy | echo | fable | onyx | nova | shimmer
 * @returns {Promise<Buffer>} — Raw MP3 audio buffer
 */
export async function runTTSAgent(text, voice = "nova") {
  // Truncate if too long — OpenAI TTS max is 4096 chars
  const truncated = text.length > 4000 ? text.slice(0, 1200) + "…" : text;

  const mp3 = await openai.audio.speech.create({
    model: "tts-1",           // tts-1 = faster/cheaper | tts-1-hd = higher quality
    voice,                    // nova sounds great for news
    input: truncated,
    response_format: "mp3",
    speed: 1.0,               // 0.25–4.0
  });

  // Convert the Web ReadableStream / Response to a Node Buffer
  const arrayBuffer = await mp3.arrayBuffer();
  return Buffer.from(arrayBuffer);
}