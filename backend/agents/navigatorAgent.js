
import { logAgent } from "../utils/logger.js";
import { openai } from "../config/openai.js";


export const runNavigatorAgent = async (articles) => {
  logAgent("Navigator Agent", "Analyzing articles and generating briefing...");

  const content = articles
    .map(a => `${a.title || ""} ${a.description || ""}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
You are a News Intelligence Agent.

Analyze multiple articles and generate:
- Summary
- Key Events
- Impact
- Risks
- What next
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