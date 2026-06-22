import { createServerFn } from "@tanstack/react-start";

const SYS_BASE = `You are a senior data analyst inside the "InsightFlow" platform.
You receive a JSON profile of a dataset (column types, missing %, distributions, correlations, top values, risks).
You DO NOT have raw rows — only the profile. Be precise, decisive, human, and never generic.

STYLE RULES:
- Use markdown with short paragraphs and bullet lists.
- Cite column names with backticks like \`age\`.
- For every insight, risk, or recommendation, ALWAYS add a line that begins with **Why this matters:** explaining the business or analytical implication in one sentence.
- Prefer concrete numbers from the profile over vague language ("most rows", "many columns" → cite the actual figure).
- No filler, no "as an AI", no apologies. If the profile lacks information for a question, say so plainly in one line and suggest the closest answerable question.`;

const PERSONA_PROMPTS: Record<string, string> = {
  business: "Audience: a business decision-maker. Lead with implications, money, and actions. Avoid jargon.",
  student: "Audience: a learning student. Explain terms briefly when introduced. Friendly, instructive tone.",
  developer: "Audience: a developer/data scientist. Be technical, mention transforms, modeling implications, code-level steps.",
};

interface ChatInput {
  profile: unknown;
  question: string;
  persona?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  mode?: "chat" | "narrative" | "story";
}

export const askDataset = createServerFn({ method: "POST" })
  .inputValidator((i: ChatInput) => i)
  .handler(async ({ data }) => {
    let apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    let endpoint = "https://api.openai.com/v1/chat/completions";
    let model = "gpt-4o-mini";

    if (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions";
      model = "gemini-1.5-flash";
    }

    // Allow manual overrides
    if (process.env.AI_API_KEY) {
      apiKey = process.env.AI_API_KEY;
    }
    if (process.env.AI_API_ENDPOINT) {
      endpoint = process.env.AI_API_ENDPOINT;
    }
    if (process.env.AI_MODEL) {
      model = process.env.AI_MODEL;
    }

    if (!apiKey) {
      return { error: "AI is not configured. Please set OPENAI_API_KEY or GEMINI_API_KEY." };
    }

    const persona = PERSONA_PROMPTS[data.persona ?? "business"] ?? PERSONA_PROMPTS.business;
    let userPrompt = "";
    if (data.mode === "narrative") {
      userPrompt = `Write a 4–6 sentence **behavioral narrative** of this dataset. Cover sparsity, balance, skew, noise, stability, and time scope. Then a "**Watch-outs**" list with 3 bullets, each ending with a "Why this matters:" line.`;
    } else if (data.mode === "story") {
      userPrompt = `Produce a presentation-style "Data Story" with these exact markdown sections:
## Title
A punchy 6–10 word headline.

## Summary
2–3 sentences capturing the dataset's character.

## Key Insights
3–5 bullets. Each bullet must include a **Why this matters:** sub-line.

## Risks
2–4 bullets, each labelled with severity \`[HIGH]\`, \`[MED]\`, or \`[LOW]\` at the start, followed by a **Why this matters:** line.

## Recommended Actions
3–5 imperative bullets ("Drop…", "Impute…", "Investigate…").

## Closing Statement
One decisive sentence.`;
    } else {
      userPrompt = data.question;
    }

    const messages = [
      { role: "system", content: `${SYS_BASE}\n${persona}` },
      { role: "system", content: `DATASET_PROFILE_JSON:\n${JSON.stringify(data.profile).slice(0, 60_000)}` },
      ...(data.history ?? []),
      { role: "user", content: userPrompt },
    ];

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${apiKey}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ model, messages }),
      });
      if (res.status === 429) return { error: "Rate limit reached. Try again in a moment." };
      if (!res.ok) return { error: `AI error (${res.status}).` };
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      return { content };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
