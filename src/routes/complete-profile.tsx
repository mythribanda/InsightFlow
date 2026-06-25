// src/routes/complete-profile.tsx
// FIXED VERSION — actual glassmorphism, depth, contrast, working button states.
// Replace your existing complete-profile.tsx with this.

import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Loader2, Phone, User, Mail } from "lucide-react";
import { DataPointsBackground } from "@/components/DataPointsBackground";

export const Route = createFileRoute("/complete-profile")({
  component: CompleteProfile,
});

function CompleteProfile() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      setEmail(user.email || "");
      setFullName(
        user.user_metadata?.full_name || user.user_metadata?.name || ""
      );
    }
    loadUser();
  }, []);

  const isValid = fullName.trim().length > 0 && mobile.trim().length > 0 && email.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired. Please log in again.");

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          display_name: fullName.trim(),
          email: email.trim(),
          phone: mobile.trim(),
        });

      if (profileError) throw profileError;

      toast.success("Profile completed");
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err.message || "Failed to complete profile");
      toast.error(err.message || "Failed to complete profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center p-4">
      {/* Layer 1: animated particles, behind everything */}
      <DataPointsBackground />

      {/* Layer 2: soft color glows, above particles, below card */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none z-[1]"
        style={{ background: "radial-gradient(circle, rgba(14,165,233,0.18), transparent 70%)" }} />
      <div className="absolute bottom-[5%] right-[15%] w-[400px] h-[400px] rounded-full pointer-events-none z-[1]"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.15), transparent 70%)" }} />

      {/* Layer 3: content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo block */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "linear-gradient(135deg, #0ea5e9, #a855f7)",
              boxShadow: "0 0 40px -8px rgba(14,165,233,0.6)",
            }}
          >
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Insight<span className="text-cyan-400">Flow</span>
          </h1>
        </div>

        {/* Glass card — this is what was missing: real blur + border glow + shadow */}
        <div
          className="rounded-3xl p-8 border"
          style={{
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderColor: "rgba(148, 163, 184, 0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset",
          }}
        >
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-white mb-1">
              Complete your profile
            </h2>
            <p className="text-sm text-slate-400">
              Just a couple more details to get started
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-300"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Full name <span className="text-cyan-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder:text-slate-500 outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(148,163,184,0.2)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#0ea5e9";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(148,163,184,0.2)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Mobile number <span className="text-cyan-400">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+91 98765 43210"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder:text-slate-500 outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(148,163,184,0.2)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#0ea5e9";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(148,163,184,0.2)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Email <span className="text-cyan-400">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder:text-slate-500 outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(148,163,184,0.2)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#0ea5e9";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(148,163,184,0.2)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Submit button — fixed: clear enabled vs disabled state */}
            <button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 mt-2"
              style={
                isValid && !loading
                  ? {
                      background: "linear-gradient(135deg, #0ea5e9, #06b6d4)",
                      color: "#fff",
                      boxShadow: "0 4px 20px -4px rgba(14,165,233,0.5)",
                      cursor: "pointer",
                    }
                  : {
                      background: "rgba(148,163,184,0.12)",
                      color: "rgba(148,163,184,0.6)",
                      cursor: "not-allowed",
                    }
              }
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Completing...
                </>
              ) : (
                "Complete signup"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
