import { openai } from "../config/openai.js";
import { logAgent } from "../utils/logger.js";

export const runProfileAgent = async (articles, profile) => {
  logAgent("Profile Agent", "Personalizing feed...");

  const content = articles
    .map((a, i) => `Article ${i + 1}: ${a.title} ${a.description}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
You are a Personalized News Intelligence Agent.

User Profile:
Role: ${profile.role}
Interests: ${profile.interests}
Context: ${profile.context}

For EACH article:
- Assign a relevance score (0–10)
- Give a 1-line reason

Return JSON array:
[
  { "title": "...", "score": 9, "reason": "..." }
]
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