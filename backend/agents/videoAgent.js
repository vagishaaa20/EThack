import { openai } from "../config/openai.js";
import { logAgent } from "../utils/logger.js";

export const runVideoAgent = async (articles) => {
  logAgent("Video Agent", "Generating video script...");

  const content = articles
    .map((a) => `${a.title} ${a.description}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
You are an AI Video Producer.

Create a 60–90 second business news video script.

Return JSON:

{
  "title": "...",
  "narration": "...",
  "scenes": [
    { "scene": 1, "visual": "...", "text": "..." }
  ]
}

Make it engaging like a news anchor.
        `,
      },
      {
        role: "user",
        content,
      },
    ],
  });

  return completion.choices[0].message.content;
};