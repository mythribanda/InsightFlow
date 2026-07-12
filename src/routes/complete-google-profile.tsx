import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorComponent } from "./__root";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Loader2, Phone, User, Mail } from "lucide-react";
import { DataPointsBackground } from "@/components/DataPointsBackground";

export const Route = createFileRoute("/complete-google-profile")({
  component: CompleteGoogleProfile,
  errorComponent: ErrorComponent,
});

function CompleteGoogleProfile() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user data from Google OAuth session
  useEffect(() => {
    async function loadGoogleUser() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          toast.error("Please sign up first");
          navigate({ to: "/signup" });
          return;
        }

        // Check if profile is already complete
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, phone")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.display_name && profile?.phone) {
          navigate({ to: "/app" });
          return;
        }

        // Pre-fill email and name from Google session metadata
        setEmail(user.email || "");
        setFullName(
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          ""
        );
      } catch (err) {
        console.error("Failed to load user:", err);
        navigate({ to: "/signup" });
      } finally {
        setCheckingSession(false);
      }
    }

    loadGoogleUser();
  }, [navigate]);

  const isValid = fullName.trim().length > 0 && mobile.trim().length > 0 && email.trim().length > 0;

  async function handleComplete() {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      // Update profile — trigger already created the row on OAuth signup
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: fullName.trim(),
          email: email.trim(),
          phone: mobile.trim(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      toast.success("Profile completed successfully!");
      navigate({ to: "/app" });
    } catch (err: any) {
      setError(err.message || "Failed to complete profile");
      toast.error("Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <DataPointsBackground />
        <div className="absolute inset-0 bg-grid opacity-5" />
        <div className="flex flex-col items-center space-y-4 relative z-10">
          <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Loading profile details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Layer 1: animated particles */}
      <DataPointsBackground />

      {/* Layer 2: soft color glows */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none z-[1]"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%)" }} />
      <div className="absolute bottom-[5%] right-[15%] w-[400px] h-[400px] rounded-full pointer-events-none z-[1]"
        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.05), transparent 70%)" }} />

      {/* Layer 3: content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo block */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "var(--gradient-primary)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Insight<span className="bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] bg-clip-text text-transparent">Flow</span>
          </h1>
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl p-8 border border-white/8 backdrop-blur-md shadow-2xl"
          style={{
            background: "linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05)), #15151F",
            boxShadow: "0 25px 60px -25px rgba(0, 0, 0, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.02)",
          }}
        >
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-white mb-1">
              Complete your profile
            </h2>
            <p className="text-sm text-muted-foreground">
              Just a couple more details to get started
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-300 animate-in fade-in zoom-in-95 duration-200"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Full name <span className="text-primary">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder:text-muted-foreground/30 outline-none transition-all bg-white/5 border border-white/10"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.boxShadow = "var(--shadow-glow)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Mobile number <span className="text-primary">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+91 98765 43210"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder:text-muted-foreground/30 outline-none transition-all bg-white/5 border border-white/10"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.boxShadow = "var(--shadow-glow)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder:text-muted-foreground/30 outline-none transition-all bg-white/5 border border-white/10"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.boxShadow = "var(--shadow-glow)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Submit button */}
            <button
              onClick={handleComplete}
              disabled={!isValid || loading}
              className="w-full py-3.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 mt-2 text-xs"
              style={
                isValid && !loading
                  ? {
                      background: "var(--gradient-primary)",
                      color: "#fff",
                      boxShadow: "var(--shadow-glow)",
                      cursor: "pointer",
                    }
                  : {
                      background: "rgba(255, 255, 255, 0.04)",
                      color: "rgba(255, 255, 255, 0.3)",
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
                "Complete Signup"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
