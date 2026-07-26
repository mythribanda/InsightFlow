import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, Bot, User, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askDataset } from "@/utils/ai.functions";
import { getStory } from "@/server/analysis";
import type { DatasetProfile } from "@/lib/profiler";
import { toast } from "sonner";

interface Msg { role: "user" | "assistant"; content: string }

export function ChatPanel({
  profile, persona, suggestions, sessionId, analysis,
  initialStory, initialSourceJson,
}: {
  profile: DatasetProfile;
  persona: string;
  suggestions: string[];
  sessionId: string;
  analysis: any;
  initialStory?: string;
  initialSourceJson?: any;
}) {
  const ask = useServerFn(askDataset);
  const runGetStory = useServerFn(getStory);
  
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  
  const [sourceJson, setSourceJson] = useState<any>(null);
  const [loadingStory, setLoadingStory] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // DECISION: We explicitly remove the client-side fallback chatbot.
  // Chat features are completely disabled until backend analysis compiles,
  // preventing discrepant or ungrounded responses.
  useEffect(() => {
    if (initialStory) {
      setSourceJson(initialSourceJson || null);
      setMessages([
        {
          role: "assistant",
          content: initialStory
        }
      ]);
    } else if (sessionId && analysis) {
      setLoadingStory(true);
      runGetStory({ data: { session_id: sessionId } })
        .then((res) => {
          setSourceJson(res.source_json);
          setMessages([
            {
              role: "assistant",
              content: res.narrative || "Data story loaded. Ask me anything about these insights!"
            }
          ]);
        })
        .catch((err) => {
          console.error(err);
          toast.error("Failed to load backend narrative story");
        })
        .finally(() => {
          setLoadingStory(false);
        });
    }
  }, [sessionId, analysis, initialStory, initialSourceJson]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (q: string) => {
    if (!q.trim() || busy || loadingStory) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await ask({
        data: {
          profile: sourceJson, // Grounded in computed insights instead of client fallback
          question: q,
          persona,
          history: messages,
          mode: "chat"
        }
      });
      if (res.error) {
        toast.error(res.error);
        setMessages([...next, { role: "assistant", content: `_${res.error}_` }]);
      } else {
        setMessages([...next, { role: "assistant", content: res.content || "_(empty)_" }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    if (sourceJson) {
      setMessages([
        {
          role: "assistant",
          content: "Data story reset. Ask me anything about the computed insights!"
        }
      ]);
    } else {
      setMessages([]);
    }
    toast.success("Chat history cleared");
  };

  if (!analysis) {
    return (
      <div className="surface-card flex h-[560px] flex-col items-center justify-center p-5 text-center">
        <Sparkles className="h-8 w-8 text-primary animate-pulse mb-3" />
        <p className="text-sm font-semibold">Grounded AI Chat Loading...</p>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          Chat features will be available once the backend intelligence profiling completes.
        </p>
      </div>
    );
  }

  if (loadingStory) {
    return (
      <div className="surface-card flex h-[560px] flex-col items-center justify-center p-5 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3" />
        <p className="text-sm font-medium">Generating grounded data insights...</p>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          Compiling computed metrics, leakage flags, and model results for grounding.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card flex h-[560px] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Ask your data</h3>
          <p className="text-[10px] text-muted-foreground">AI-powered Q&A grounded in computed facts</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          persona · {persona}
        </span>
        {messages.length > 1 && (
          <button
            onClick={clearChat}
            className="ml-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Auditable Grounding Source JSON banner */}
      {sourceJson && (
        <div className="border-b border-border/40 bg-secondary/10 px-5 py-2">
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground select-none flex items-center gap-1.5">
              <span>🔍 Show the grounding data behind this chatbot (source JSON)</span>
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-slate-950 p-3 font-mono text-[10px] text-emerald-400">
              <pre>{JSON.stringify(sourceJson, null, 2)}</pre>
            </div>
          </details>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length <= 1 && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-3 text-sm font-medium">Ask follow-up questions</p>
              <p className="mt-1 text-xs text-muted-foreground">Ask anything about the computed metrics and risks shown above.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-secondary/40 px-3.5 py-2 text-xs text-foreground transition-all duration-200 hover:border-primary hover:text-primary hover:bg-primary/5 hover:scale-105"
                >
                  <Sparkles className="mr-1.5 inline h-3 w-3 text-primary/60" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="flex items-start gap-2.5 max-w-[88%]">
              {m.role === "assistant" && (
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div className={
                m.role === "user"
                  ? "rounded-2xl rounded-tr-sm bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 px-4 py-2.5 text-sm text-foreground"
                  : "rounded-2xl rounded-tl-sm bg-secondary/50 border border-border/40 px-4 py-2.5 text-sm"
              }>
                <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
              {m.role === "user" && (
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10">
                  <User className="h-3.5 w-3.5 text-accent" />
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-start gap-2.5">
            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-secondary/50 border border-border/40 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-primary typing-dot" />
                <div className="h-2 w-2 rounded-full bg-primary typing-dot" />
                <div className="h-2 w-2 rounded-full bg-primary typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-center gap-2 border-t border-border/60 p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about this dataset…"
          className="flex-1 rounded-lg border border-input bg-background/60 px-3.5 py-2.5 text-sm outline-none backdrop-blur-sm transition-all duration-200 focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={busy || !input.trim() || loadingStory}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_0_20px_-4px_var(--color-primary)] transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100"
        >
          <Send className="h-3.5 w-3.5" /> Ask
        </button>
      </form>
    </div>
  );
}
