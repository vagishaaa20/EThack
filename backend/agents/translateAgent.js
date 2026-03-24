import { openai } from "../config/openai.js";
import { logAgent } from "../utils/logger.js";

export const runTranslateAgent = async (text, language) => {
  logAgent("Translation Agent", `Translating to ${language}`);

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
You are a Business News Translator.

Translate the given news into ${language} with:

- Simple, easy-to-understand language
- Explain complex financial terms in local context
- Keep tone conversational (like news for common people)
- DO NOT do literal translation
- Adapt culturally (Indian audience)

Example:
Instead of "stock volatility increased"
→ explain as "share prices went up and down frequently"

        `,
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  return completion.choices[0].message.content;
};