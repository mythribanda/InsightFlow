import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Brain, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { DataPointsBackground } from "@/components/DataPointsBackground";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [loginMethod, setLoginMethod] = useState<"password" | "email_otp">("password");

  // Credentials / OTP inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP verification inputs
  const [otp, setOtp] = useState("");
  const [tempEmail, setTempEmail] = useState("");

  // UI states
  const [loading, setLoading] = useState(false);
  const { session, loading: checkingSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Check if profile is complete
  async function checkProfileComplete(userId: string) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("display_name, phone")
        .eq("id", userId)
        .single();

      if (error || !profile?.display_name || !profile?.phone) {
        navigate({ to: "/complete-profile" });
        return false;
      }
      return true;
    } catch {
      navigate({ to: "/complete-profile" });
      return false;
    }
  }

  // Check session on mount
  useEffect(() => {
    if (checkingSession) return;

    async function checkSession() {
      if (session) {
        const isComplete = await checkProfileComplete(session.user.id);
        if (isComplete) {
          navigate({ to: "/" });
        }
      }
    }
    checkSession();
  }, [session, checkingSession, navigate]);

  // Handle Continue Button for Password Mode
  async function handleCredentialsSubmit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
          setError("Email or password incorrect. Try again or sign up.");
        } else {
          setError(signInError.message);
        }
        throw signInError;
      }

      if (data.session) {
        const isComplete = await checkProfileComplete(data.user.id);
        if (isComplete) {
          toast.success("Login successful!");
          navigate({ to: "/" });
        }
      } else {
        setTempEmail(email.trim());
        setStep("otp");
        toast.info("Check your email for verification code");
      }
    } catch (err: any) {
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Handle Continue Button for Email OTP Mode
  async function handleSendOtp() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        if (otpError.message.includes("Error sending confirmation email") || otpError.status === 500) {
          toast.warning("Email rate limit reached. Proceeding to OTP entry in case you have a recent code.");
          setTempEmail(email.trim());
          setStep("otp");
          return;
        }
        throw otpError;
      }

      setTempEmail(email.trim());
      setStep("otp");
      toast.info("Verification code sent to your email");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code");
      toast.error("Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  // Handle OTP Code Verification
  async function handleOtpSubmit() {
    if (otp.length !== 6) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: tempEmail || email.trim(),
        token: otp,
        type: "email",
      });

      if (verifyError) throw verifyError;

      if (data.user) {
        const isComplete = await checkProfileComplete(data.user.id);
        if (isComplete) {
          toast.success("Verification successful!");
          navigate({ to: "/" });
        }
      }
    } catch (err: any) {
      setError(err.message || "OTP verification failed");
      toast.error("Verification failed");
    } finally {
      setLoading(false);
    }
  }

  // Google OAuth
  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/complete-google-profile`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "Google sign-in failed");
      toast.error("Google sign-in failed");
      setLoading(false);
    }
  }

  const isCredentialsValid = loginMethod === "password" ? (email.trim().length > 0 && password.length > 0) : email.trim().length > 0;

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <DataPointsBackground />
        <div className="absolute inset-0 bg-grid opacity-5" />
        <div className="flex flex-col items-center space-y-4 relative z-10">
          <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Checking active sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center p-4">
      {/* Layer 1: animated particles */}
      <DataPointsBackground />

      {/* Layer 2: soft color glows */}
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

        {/* Glass card */}
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
              {step === "credentials" ? "Sign in to InsightFlow" : "Verify your email"}
            </h2>
            <p className="text-sm text-slate-400">
              {step === "credentials"
                ? loginMethod === "password"
                  ? "Enter your email and password or continue with Google"
                  : "Enter your email to receive a verification code"
                : "Enter the 6-digit code sent to your email"}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-sm text-red-300 text-destructive"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              {error}
            </div>
          )}

          <div className="space-y-4">
            {step === "credentials" ? (
              <>
                {/* Email Input */}
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
                      placeholder="your@email.com"
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          loginMethod === "password" ? handleCredentialsSubmit() : handleSendOtp();
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Password Input (only in password mode) */}
                {loginMethod === "password" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      Password <span className="text-cyan-400">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={loading}
                        className="w-full pl-10 pr-10 py-3 rounded-xl text-white placeholder:text-slate-500 outline-none transition-all"
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCredentialsSubmit();
                        }}
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Continue button */}
                <button
                  onClick={loginMethod === "password" ? handleCredentialsSubmit : handleSendOtp}
                  disabled={!isCredentialsValid || loading}
                  className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 mt-2"
                  style={
                    isCredentialsValid && !loading
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
                      Signing in...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>

                {/* Toggle button */}
                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod(loginMethod === "password" ? "email_otp" : "password");
                      setError(null);
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                  >
                    {loginMethod === "password"
                      ? "Sign in with email code instead"
                      : "Sign in with password instead"}
                  </button>
                </div>

                {/* Divider */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-slate-900/90 px-2 text-slate-400">Or</span>
                  </div>
                </div>

                {/* Google Button */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-3 cursor-pointer"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(148,163,184,0.2)",
                    color: "#cbd5e1",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                {/* Sign Up Link */}
                <div className="text-center text-sm mt-1">
                  <span className="text-slate-400">Don't have an account? </span>
                  <button
                    onClick={() => navigate({ to: "/signup" })}
                    className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                  >
                    Sign up
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* OTP Input */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Verification Code <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    disabled={loading}
                    maxLength={6}
                    className="w-full text-center text-2xl tracking-widest py-3 rounded-xl text-white placeholder:text-slate-600 outline-none transition-all"
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && otp.length === 6) handleOtpSubmit();
                    }}
                  />
                </div>

                {/* Verify Button */}
                <button
                  onClick={handleOtpSubmit}
                  disabled={otp.length !== 6 || loading}
                  className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 mt-2"
                  style={
                    otp.length === 6 && !loading
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
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </button>

                {/* Back Button */}
                <button
                  onClick={() => {
                    setStep("credentials");
                    setOtp("");
                    setError(null);
                  }}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 border cursor-pointer"
                  style={{
                    background: "transparent",
                    borderColor: "rgba(148,163,184,0.2)",
                    color: "#cbd5e1",
                  }}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
