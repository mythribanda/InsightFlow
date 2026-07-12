import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TopTerm = {
  term: string;
  score: number;
};

export type TextAnalysisResponse = {
  top_terms: TopTerm[];
  avg_word_count: number;
  sample_count: number;
};

export const getTextAnalysis = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "column" in v) {
      return v as { session_id: string; column: string };
    }
    throw new Error("Invalid text analysis request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<TextAnalysisResponse> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(
        `${BACKEND_URL}/text-analysis/${request.session_id}/${encodeURIComponent(request.column)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail;
        const msg = typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e: any) => `${e.loc?.join(".") || "error"}: ${e.msg}`).join("; ")
            : typeof detail === "object" && detail !== null
              ? JSON.stringify(detail)
              : `Backend error: ${response.statusText}`;
        throw new Error(msg);
      }

      return (await response.json()) as TextAnalysisResponse;
    } catch (error) {
      console.error("Text analysis error:", error);
      throw new Error(
        `Text analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

export type SentimentResult = {
  text: string;
  pos: number;
  neu: number;
  neg: number;
  compound: number;
};

export type SentimentAnalysisResponse = {
  avg_compound: number;
  pct_positive: number;
  pct_negative: number;
  pct_neutral: number;
  per_row_scores: SentimentResult[];
  total_count: number;
};

export const getSentimentAnalysis = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "session_id" in v && "column" in v) {
      return v as { session_id: string; column: string };
    }
    throw new Error("Invalid sentiment analysis request");
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: request, context }): Promise<SentimentAnalysisResponse> => {
    if (!context?.userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const BACKEND_URL = process.env.MODELING_API_URL || "http://localhost:8000";

    try {
      const response = await fetch(
        `${BACKEND_URL}/sentiment-analysis/${request.session_id}/${encodeURIComponent(request.column)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": context.userId,
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail;
        const msg = typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e: any) => `${e.loc?.join(".") || "error"}: ${e.msg}`).join("; ")
            : typeof detail === "object" && detail !== null
              ? JSON.stringify(detail)
              : `Backend error: ${response.statusText}`;
        throw new Error(msg);
      }

      return (await response.json()) as SentimentAnalysisResponse;
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      throw new Error(
        `Sentiment analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });
