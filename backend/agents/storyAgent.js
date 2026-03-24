
import { openai } from "../config/openai.js";
import { logAgent } from "../utils/logger.js";

export const runStoryAgent = async (articles) => {
  logAgent("Story Agent", "Building full story arc...");

  const content = articles
    .map((a) => `${a.title} ${a.description}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
You are a Story Intelligence Agent.

Extract:

1. timeline: [{date, event}]
2. key_players: list of companies/people
3. sentiment: overall sentiment (positive/negative/neutral)
4. contrarian_view: an alternative perspective
5. what_next: future predictions

Return STRICT JSON.
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