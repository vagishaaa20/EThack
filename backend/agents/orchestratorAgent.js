import { openai } from "../config/openai.js";
import { logAgent } from "../utils/logger.js";

export const decideAgent = async (query) => {
  logAgent("Orchestrator Agent", "Deciding which agent to use...");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
You are an Orchestrator AI.

Based on the user query, decide which agent to call.

Rules:
- If user wants summary / explanation → return "navigator"
- If user wants timeline / history → return "story"

Return ONLY one word:
navigator OR story
        `,
      },
      {
        role: "user",
        content: query,
      },
    ],
  });

  return completion.choices[0].message.content.trim().toLowerCase();
};