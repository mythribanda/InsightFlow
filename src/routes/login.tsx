import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Brain, Loader2, Mail, Lock, Eye, EyeOff, Sparkles, ShieldCheck, Activity, ChevronDown, Globe, Sun, Moon, ArrowRight } from "lucide-react";
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
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col justify-between font-sans">
      {/* Layer 1: animated particles */}
      <DataPointsBackground />

      {/* Layer 2: soft radial glowing background blobs */}
      <div className="absolute top-[5%] left-[10%] w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(14,165,233,0.08), transparent 70%)" }} />
      <div className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.06), transparent 70%)" }} />

      {/* Main Grid Container */}
      <div className="flex-grow max-w-[1500px] mx-auto w-full px-4 sm:px-8 py-8 flex items-center justify-center z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center w-full">
          
          {/* Left Marketing Pane (7 columns, hidden on mobile/tablet for clean mobile styling) */}
          <div className="hidden lg:flex lg:col-span-7 flex-col space-y-8 select-none">
            {/* Header / Logo */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #0ea5e9, #a855f7)",
                  boxShadow: "0 0 25px rgba(14,165,233,0.4)",
                }}
              >
                <Brain className="w-5.5 h-5.5 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Insight<span className="text-cyan-400">Flow</span>
              </h1>
            </div>

            {/* Headline section */}
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan-400 w-fit">
                AI-POWERED • ANALYST-GRADE • TRUSTED
              </div>
              <h2 className="text-4xl xl:text-[50px] font-extrabold tracking-tight text-white leading-[1.15]">
                Turn raw data<br />
                into <span className="text-gradient">decisions.</span>
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-slate-400 font-medium">
                Upload your data, uncover insights, and get AI-powered explanations you can trust.
              </p>
            </div>

            {/* 3D Hologram Area */}
            <div className="relative w-full h-[280px] flex items-center justify-center overflow-visible" style={{ perspective: "1500px" }}>
              
              {/* Isometric Pedestal Grid Surface */}
              <div className="absolute w-[220px] h-[70px] rounded-full border border-cyan-500/35 bg-cyan-950/20 backdrop-blur-sm animate-pedestal-glow"
                style={{
                  transform: "rotateX(60deg) rotateZ(-30deg) translate3d(0, 100px, 0)",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Embedded Grid pattern inside pedestal */}
                <div className="absolute inset-0 rounded-full bg-grid opacity-35" />
                {/* Secondary orbital ring */}
                <div className="absolute inset-[-15px] rounded-full border border-dashed border-cyan-400/20" />
              </div>

              {/* Pedestal solid disc */}
              <div className="absolute w-[180px] h-[15px] rounded-full bg-slate-900 border border-slate-800"
                style={{
                  transform: "rotateX(60deg) rotateZ(-30deg) translate3d(0, 100px, 6px)",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8), inset 0 2px 2px rgba(255,255,255,0.05)",
                }}
              />

              {/* Pedestal top glowing rim */}
              <div className="absolute w-[176px] h-[5px] rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 blur-[2px]"
                style={{
                  transform: "rotateX(60deg) rotateZ(-30deg) translate3d(0, 100px, 12px)",
                }}
              />

              {/* Floating Hologram: Line Chart */}
              <div className="absolute animate-float-hologram pointer-events-none" style={{ transformStyle: 'preserve-3d', zIndex: 10 }}>
                {/* Holographic container */}
                <div className="relative w-44 h-48 rounded-xl bg-slate-950/30 border border-cyan-500/20 backdrop-blur-md flex flex-col p-4 shadow-3xl"
                  style={{
                    transformStyle: 'preserve-3d',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6), inset 0 0 15px rgba(6,182,212,0.1)',
                  }}
                >
                  {/* Grid Lines in background of hologram */}
                  <div className="absolute inset-0 bg-grid opacity-10 rounded-xl" />
                  
                  {/* Glow dots at corners */}
                  <div className="absolute top-0 left-0 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_8px_#0ea5e9]" />
                  <div className="absolute bottom-0 right-0 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_8px_#a855f7]" />

                  {/* SVG Holographic line graph */}
                  <svg className="w-full h-full" viewBox="0 0 140 160" fill="none">
                    <defs>
                      <linearGradient id="holoLineGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#0ea5e9" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                      <linearGradient id="holoLineFill" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Mesh helper lines */}
                    <line x1="0" y1="40" x2="140" y2="40" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    <line x1="0" y1="80" x2="140" y2="80" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    <line x1="0" y1="120" x2="140" y2="120" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

                    {/* Chart Gradient Fill */}
                    <path d="M 0,130 L 15,100 L 40,115 L 70,80 L 100,95 L 125,50 L 140,40 L 140,160 L 0,160 Z" fill="url(#holoLineFill)" />
                    
                    {/* Glowing Stroke */}
                    <path d="M 0,130 L 15,100 L 40,115 L 70,80 L 100,95 L 125,50 L 140,40" stroke="url(#holoLineGlow)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Data dots */}
                    <circle cx="70" cy="80" r="3" fill="#0ea5e9" className="animate-pulse" />
                    <circle cx="125" cy="50" r="3" fill="#a855f7" />
                  </svg>
                </div>
              </div>

              {/* Floating Widget 1: Bar Chart (Left) */}
              <div className="absolute animate-float-widget-bar" style={{ transformStyle: 'preserve-3d' }}>
                <div className="w-20 h-20 bg-slate-950/45 border border-cyan-500/15 backdrop-blur-md rounded-xl p-3 flex flex-col justify-between shadow-2xl">
                  <div className="flex gap-1 items-end h-10 w-full">
                    <div className="w-2.5 h-[40%] bg-cyan-500/40 rounded-sm" />
                    <div className="w-2.5 h-[70%] bg-cyan-500/70 rounded-sm" />
                    <div className="w-2.5 h-[50%] bg-cyan-500/50 rounded-sm" />
                    <div className="w-2.5 h-[90%] bg-cyan-500 rounded-sm" />
                  </div>
                  <div className="h-2 w-10 bg-slate-800 rounded" />
                </div>
              </div>

              {/* Floating Widget 2: Donut Chart (Right) */}
              <div className="absolute animate-float-widget-donut" style={{ transformStyle: 'preserve-3d' }}>
                <div className="w-20 h-20 bg-slate-950/45 border border-purple-500/15 backdrop-blur-md rounded-xl p-3 flex items-center justify-center shadow-2xl">
                  <div className="relative w-12 h-12 rounded-full border-[6.5px] border-slate-900 flex items-center justify-center">
                    {/* Ring layers representing segments */}
                    <div className="absolute inset-[-6.5px] rounded-full border-[6.5px] border-purple-500 border-t-transparent border-l-transparent" />
                    <div className="absolute inset-[-6.5px] rounded-full border-[6.5px] border-cyan-400 border-b-transparent border-r-transparent rotate-45" />
                  </div>
                </div>
              </div>

              {/* Floating Widget 3: Bullet points card (Bottom Right) */}
              <div className="absolute animate-float-widget-list" style={{ transformStyle: 'preserve-3d' }}>
                <div className="w-24 bg-slate-950/45 border border-slate-800/80 backdrop-blur-md rounded-xl p-3 space-y-2 shadow-2xl">
                  <div className="h-1.5 w-12 bg-slate-700 rounded" />
                  <div className="space-y-1">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <div className="h-1 w-10 bg-slate-800 rounded" />
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      <div className="h-1 w-12 bg-slate-800 rounded" />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Three Pillars columns */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-900/60 max-w-xl">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200">Instant Insights</h4>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Get AI-generated insights in seconds.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold text-slate-200">Trust & Security</h4>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Enterprise-grade security for your data.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200">Smarter Decisions</h4>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Make confident decisions with clarity.
                </p>
              </div>
            </div>

          </div>

          {/* Right Login Pane (5 columns on desktop, full-width on mobile) */}
          <div className="lg:col-span-5 flex flex-col justify-center items-center w-full min-h-[500px]">
            
            {/* Top controls: Logo block (shown on mobile instead since left marketing pane is hidden) */}
            <div className="w-full max-w-md flex justify-between items-center mb-6 lg:hidden select-none animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #0ea5e9, #a855f7)",
                  }}
                >
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-base font-bold text-white">InsightFlow</h1>
              </div>
            </div>

            {/* Orbiting particles behind login card (decor only) */}
            <div className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400/80 blur-[1.5px] animate-orbit-card-outer pointer-events-none z-[1]" style={{ left: 'calc(50% - 7px)', top: 'calc(50% - 7px)' }} />
            <div className="absolute w-2.5 h-2.5 rounded-full bg-purple-400/80 blur-[1.5px] animate-orbit-card-inner pointer-events-none z-[1]" style={{ left: 'calc(50% - 5px)', top: 'calc(50% - 5px)' }} />

            {/* Glass Login Card */}
            <div
              className="w-full max-w-md rounded-3xl p-8 border shadow-card transition-all duration-300 hover:border-cyan-500/25 z-10"
              style={{
                background: "rgba(10, 16, 32, 0.45)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                borderColor: "rgba(148, 163, 184, 0.12)",
                boxShadow: "0 25px 60px -25px oklch(0 0 0 / 0.85), inset 0 0 0 1px rgba(255,255,255,0.02)",
              }}
            >
              
              {step === "credentials" ? (
                <>
                  <div className="text-center mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <h2 className="text-2xl font-bold text-white mb-1.5 flex items-center justify-center gap-2">
                      Welcome back
                    </h2>
                    <p className="text-xs text-slate-400">
                      Sign in to continue to InsightFlow
                    </p>
                  </div>

                  {error && (
                    <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-xs text-red-300 animate-in fade-in zoom-in-95 duration-200"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      {error}
                    </div>
                  )}

                  {/* Google OAuth Button */}
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "80ms", animationFillMode: "both" }}>
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={loading}
                      className="w-full py-2.5 rounded-xl font-semibold border border-slate-800 bg-slate-950/60 hover:bg-slate-900/80 text-xs text-slate-200 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-900" />
                      <span className="flex-shrink mx-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold">or</span>
                      <div className="flex-grow border-t border-slate-900" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Email Input */}
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "140ms", animationFillMode: "both" }}>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                        Email address <span className="text-cyan-400">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          disabled={loading}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder:text-slate-600 outline-none text-xs transition-all bg-slate-950/80 border border-slate-800"
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "#0ea5e9";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.12)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "rgba(148,163,184,0.12)";
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
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Password <span className="text-cyan-400">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => navigate({ to: "/reset-password" })}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold hover:underline transition-colors"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            disabled={loading}
                            className="w-full pl-10 pr-10 py-2.5 rounded-xl text-white placeholder:text-slate-600 outline-none text-xs transition-all bg-slate-950/80 border border-slate-800"
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "#0ea5e9";
                              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.12)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "rgba(148,163,184,0.12)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCredentialsSubmit();
                            }}
                          />
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
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

                    {/* Sign In Button */}
                    <button
                      onClick={loginMethod === "password" ? handleCredentialsSubmit : handleSendOtp}
                      disabled={!isCredentialsValid || loading}
                      className="w-full py-3 rounded-xl font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 mt-4 text-xs animate-in fade-in slide-in-from-bottom-2 duration-500"
                      style={
                        isCredentialsValid && !loading
                          ? {
                              background: "linear-gradient(135deg, #0ea5e9, #a855f7)",
                              color: "#fff",
                              boxShadow: "0 4px 20px -4px rgba(14,165,233,0.4)",
                              cursor: "pointer",
                              animationDelay: "260ms",
                              animationFillMode: "both"
                            }
                          : {
                              background: "rgba(148,163,184,0.08)",
                              color: "rgba(148,163,184,0.5)",
                              cursor: "not-allowed",
                              animationDelay: "260ms",
                              animationFillMode: "both"
                            }
                      }
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          Sign in
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </>
                      )}
                    </button>

                    {/* Footer options */}
                    <div className="flex flex-col gap-2.5 pt-4 text-center select-none animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "320ms", animationFillMode: "both" }}>
                      
                      {/* OTP Toggle Link */}
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMethod(loginMethod === "password" ? "email_otp" : "password");
                          setError(null);
                        }}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer hover:underline transition-all"
                      >
                        {loginMethod === "password"
                          ? "Sign in with email code instead"
                          : "Sign in with password instead"}
                      </button>

                      {/* Sign Up Link */}
                      <div className="text-xs">
                        <span className="text-slate-400">Don't have an account? </span>
                        <button
                          onClick={() => navigate({ to: "/signup" })}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer hover:underline transition-all"
                        >
                          Sign up
                        </button>
                      </div>
                    </div>

                  </div>
                </>
              ) : (
                <>
                  {/* OTP Code Entry step */}
                  <div className="text-center mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <h2 className="text-xl font-bold text-white mb-1.5">
                      Verify your email
                    </h2>
                    <p className="text-xs text-slate-400">
                      Enter the 6-digit verification code sent to your email
                    </p>
                  </div>

                  {error && (
                    <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-xs text-red-300 animate-in fade-in zoom-in-95 duration-200"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Verification Code Input */}
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "80ms", animationFillMode: "both" }}>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                        Verification Code <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123456"
                        disabled={loading}
                        maxLength={6}
                        className="w-full text-center text-xl tracking-widest py-2.5 rounded-xl text-white placeholder:text-slate-700 outline-none transition-all bg-slate-950/80 border border-slate-800"
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "#0ea5e9";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.12)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "rgba(148,163,184,0.12)";
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
                      className="w-full py-3 rounded-xl font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 mt-2 text-xs animate-in fade-in slide-in-from-bottom-2 duration-500"
                      style={
                        otp.length === 6 && !loading
                          ? {
                              background: "linear-gradient(135deg, #0ea5e9, #a855f7)",
                              color: "#fff",
                              boxShadow: "0 4px 20px -4px rgba(14,165,233,0.4)",
                              cursor: "pointer",
                              animationDelay: "140ms",
                              animationFillMode: "both"
                            }
                          : {
                              background: "rgba(148,163,184,0.08)",
                              color: "rgba(148,163,184,0.5)",
                              cursor: "not-allowed",
                              animationDelay: "140ms",
                              animationFillMode: "both"
                            }
                      }
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
                      className="w-full py-3 rounded-xl font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 border border-slate-800 text-slate-300 hover:text-white bg-transparent cursor-pointer text-xs animate-in fade-in slide-in-from-bottom-2 duration-500"
                      style={{
                        animationDelay: "200ms",
                        animationFillMode: "both"
                      }}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>

        </div>
      </div>

      {/* Subtle Footer */}
      <footer className="w-full text-center py-4 border-t border-slate-900/40 select-none z-10">
        <p className="text-[10px] text-slate-500 font-mono">
          &copy; {new Date().getFullYear()} InsightFlow. All rights reserved. Data remains in your local sandbox environment.
        </p>
      </footer>
    </div>
  );
}

