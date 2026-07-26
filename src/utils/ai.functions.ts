import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYS_BASE = `You are a senior data analyst inside the "InsightFlow" platform.
You receive a JSON containing computed facts and profiles of a dataset (shape, trust score + breakdown, dependencies, leakage scan flags, trained model metrics, anomalies, and recommendations).
You DO NOT have raw rows — only this structured JSON of computed facts. Be precise, decisive, human, and never generic.

STYLE RULES:
- Use markdown with short paragraphs and bullet lists.
- Cite column names with backticks like \`age\`.
- For every insight, risk, or recommendation, ALWAYS add a line that begins with **Why this matters:** explaining the business or analytical implication in one sentence.
- Prefer concrete numbers from the JSON over vague language.
- No filler, no "as an AI", no apologies. If the data lacks information for a question, say so plainly in one line and suggest the closest answerable question.`;

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
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    interface APIConfig {
      provider: string;
      apiKey: string;
      endpoint: string;
      model: string;
    }

    const isPlaceholder = (key: string | undefined): boolean => {
      if (!key) return true;
      const lower = key.toLowerCase().trim();
      return lower === "" || lower.includes("your_") || lower.includes("placeholder");
    };

    const configs: APIConfig[] = [];

    if (process.env.AI_API_KEY && !isPlaceholder(process.env.AI_API_KEY)) {
      configs.push({
        provider: "override",
        apiKey: process.env.AI_API_KEY,
        endpoint: process.env.AI_API_ENDPOINT || "https://api.openai.com/v1/chat/completions",
        model: process.env.AI_MODEL || "gpt-4o-mini",
      });
    }

    if (process.env.OPENAI_API_KEY && !isPlaceholder(process.env.OPENAI_API_KEY)) {
      configs.push({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
      });
    }

    if (process.env.GEMINI_API_KEY && !isPlaceholder(process.env.GEMINI_API_KEY)) {
      configs.push({
        provider: "gemini",
        apiKey: process.env.GEMINI_API_KEY,
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-2.5-flash",
      });
    }

    if (configs.length === 0) {
      return { error: "AI is not configured. Please set OPENAI_API_KEY or GEMINI_API_KEY in your .env file." };
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

    let lastError = "AI is not configured properly.";
    for (const config of configs) {
      try {
        console.log(`[AI] Attempting chat completions using ${config.provider} (${config.model})...`);
        const res = await fetch(config.endpoint, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${config.apiKey}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({ model: config.model, messages }),
        });

        if (res.status === 429) {
          console.warn(`[AI] Provider ${config.provider} returned 429 (Rate limit reached).`);
          lastError = "Rate limit reached. Try again in a moment.";
          continue;
        }

        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          console.warn(`[AI] Provider ${config.provider} returned status ${res.status}: ${bodyText}`);
          lastError = `AI error (${res.status}).`;
          continue;
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content ?? "";
        return { content };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`[AI] Exception with provider ${config.provider}:`, msg);
        lastError = msg;
      }
    }

    return { error: lastError };
  });
