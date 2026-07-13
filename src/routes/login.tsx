import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorComponent } from "./__root";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Brain, Loader2, Mail, Lock, Eye, EyeOff, Sparkles, ShieldCheck, Activity, ChevronDown, Globe, Sun, Moon, ArrowRight } from "lucide-react";
import { DataPointsBackground } from "@/components/DataPointsBackground";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  errorComponent: ErrorComponent,
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
          navigate({ to: "/app" });
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
          navigate({ to: "/app" });
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
    if (otp.length !== 8) return;
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
          navigate({ to: "/app" });
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

  // GitHub OAuth
  async function handleGithubSignIn() {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/complete-google-profile`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "GitHub sign-in failed");
      toast.error("GitHub sign-in failed");
      setLoading(false);
    }
  }

  // Discord OAuth
  async function handleDiscordSignIn() {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: `${window.location.origin}/complete-google-profile`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "Discord sign-in failed");
      toast.error("Discord sign-in failed");
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
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-between font-sans">
      {/* Soft background glows */}
      <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%)" }} />
      <div className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.05), transparent 70%)" }} />

      {/* Main Grid Container */}
      <div className="flex-grow max-w-[1500px] mx-auto w-full px-4 sm:px-8 py-8 flex items-center justify-center z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center w-full">
          
          {/* Left Marketing Pane (7 columns, hidden on mobile/tablet for clean mobile styling) */}
          <div className="hidden lg:flex lg:col-span-7 flex-col space-y-8 select-none">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "var(--gradient-primary)",
                  boxShadow: "var(--shadow-glow)",
                }}
              >
                <Brain className="w-5.5 h-5.5 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Insight<span className="bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] bg-clip-text text-transparent">Flow</span>
              </h1>
            </div>

            {/* Headline section */}
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 font-mono text-[9px] uppercase tracking-wider text-primary w-fit">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />TRUSTED
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
              <div className="absolute w-[220px] h-[70px] rounded-full border border-primary/30 bg-primary/5 backdrop-blur-sm animate-pedestal-glow"
                style={{
                  transform: "rotateX(60deg) rotateZ(-30deg) translate3d(0, 100px, 0)",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Embedded Grid pattern inside pedestal */}
                <div className="absolute inset-0 rounded-full bg-grid opacity-35" />
                {/* Secondary orbital ring */}
                <div className="absolute inset-[-15px] rounded-full border border-dashed border-primary/20" />
              </div>

              {/* Pedestal solid disc */}
              <div className="absolute w-[180px] h-[15px] rounded-full bg-[#15151F] border border-white/5"
                style={{
                  transform: "rotateX(60deg) rotateZ(-30deg) translate3d(0, 100px, 6px)",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8), inset 0 2px 2px rgba(255,255,255,0.05)",
                }}
              />

              {/* Pedestal top glowing rim */}
              <div className="absolute w-[176px] h-[5px] rounded-full bg-gradient-to-r from-primary to-secondary blur-[2px]"
                style={{
                  transform: "rotateX(60deg) rotateZ(-30deg) translate3d(0, 100px, 12px)",
                }}
              />

              {/* Floating Hologram: Line Chart */}
              <div className="absolute animate-float-hologram pointer-events-none" style={{ transformStyle: 'preserve-3d', zIndex: 10 }}>
                {/* Holographic container */}
                <div className="relative w-44 h-48 rounded-xl bg-[#15151F]/45 border border-primary/20 backdrop-blur-md flex flex-col p-4 shadow-3xl"
                  style={{
                    transformStyle: 'preserve-3d',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6), inset 0 0 15px rgba(139,92,246,0.15)',
                  }}
                >
                  {/* Grid Lines in background of hologram */}
                  <div className="absolute inset-0 bg-grid opacity-10 rounded-xl" />
                  
                  {/* Glow dots at corners */}
                  <div className="absolute top-0 left-0 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_var(--color-primary)]" />
                  <div className="absolute bottom-0 right-0 w-1 h-1 bg-secondary rounded-full shadow-[0_0_8px_var(--color-secondary)]" />

                  {/* SVG Holographic line graph */}
                  <svg className="w-full h-full" viewBox="0 0 140 160" fill="none">
                    <defs>
                      <linearGradient id="holoLineGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                      <linearGradient id="holoLineFill" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
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
                    <circle cx="70" cy="80" r="3" fill="#8B5CF6" className="animate-pulse" />
                    <circle cx="125" cy="50" r="3" fill="#a855f7" />
                  </svg>
                </div>
              </div>

              {/* Floating Widget 1: Bar Chart (Left) */}
              <div className="absolute animate-float-widget-bar" style={{ transformStyle: 'preserve-3d' }}>
                <div className="w-20 h-20 bg-[#15151F]/45 border border-primary/20 backdrop-blur-md rounded-xl p-3 flex flex-col justify-between shadow-2xl">
                  <div className="flex gap-1 items-end h-10 w-full">
                    <div className="w-2.5 h-[40%] bg-primary/40 rounded-sm" />
                    <div className="w-2.5 h-[70%] bg-primary/70 rounded-sm" />
                    <div className="w-2.5 h-[50%] bg-primary/50 rounded-sm" />
                    <div className="w-2.5 h-[90%] bg-primary rounded-sm" />
                  </div>
                  <div className="h-2 w-10 bg-white/5 rounded" />
                </div>
              </div>

              {/* Floating Widget 2: Donut Chart (Right) */}
              <div className="absolute animate-float-widget-donut" style={{ transformStyle: 'preserve-3d' }}>
                <div className="w-20 h-20 bg-[#15151F]/45 border border-secondary/20 backdrop-blur-md rounded-xl p-3 flex items-center justify-center shadow-2xl">
                  <div className="relative w-12 h-12 rounded-full border-[6.5px] border-white/5 flex items-center justify-center">
                    {/* Ring layers representing segments */}
                    <div className="absolute inset-[-6.5px] rounded-full border-[6.5px] border-secondary border-t-transparent border-l-transparent" />
                    <div className="absolute inset-[-6.5px] rounded-full border-[6.5px] border-success border-b-transparent border-r-transparent rotate-45" />
                  </div>
                </div>
              </div>

              {/* Floating Widget 3: Bullet points card (Bottom Right) */}
              <div className="absolute animate-float-widget-list" style={{ transformStyle: 'preserve-3d' }}>
                <div className="w-24 bg-[#15151F]/45 border border-white/5 backdrop-blur-md rounded-xl p-3 space-y-2 shadow-2xl">
                  <div className="h-1.5 w-12 bg-white/10 rounded" />
                  <div className="space-y-1">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <div className="h-1 w-10 bg-white/5 rounded" />
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      <div className="h-1 w-12 bg-white/5 rounded" />
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
            <div className="absolute w-3.5 h-3.5 rounded-full bg-primary/80 blur-[1.5px] animate-orbit-card-outer pointer-events-none z-[1]" style={{ left: 'calc(50% - 7px)', top: 'calc(50% - 7px)' }} />
            <div className="absolute w-2.5 h-2.5 rounded-full bg-success/80 blur-[1.5px] animate-orbit-card-inner pointer-events-none z-[1]" style={{ left: 'calc(50% - 5px)', top: 'calc(50% - 5px)' }} />

            {/* Glass Login Card */}
            <div
              className="w-full max-w-md rounded-3xl p-8 border border-white/10 bg-[#15151F]/80 backdrop-blur-xl shadow-2xl transition-all duration-300 hover:border-primary/20 z-10"
              style={{
                boxShadow: "0 25px 60px -25px rgba(0, 0, 0, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
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
                      className="w-full py-2.5 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-foreground transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
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

                    <button
                      onClick={handleGithubSignIn}
                      disabled={loading}
                      className="w-full py-2.5 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-foreground transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                      Continue with GitHub
                    </button>

                    <button
                      onClick={handleDiscordSignIn}
                      disabled={loading}
                      className="w-full py-2.5 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-foreground transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#5865F2">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z" />
                      </svg>
                      Continue with Discord
                    </button>

                    {/* Divider */}
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-white/5" />
                      <span className="flex-shrink mx-3 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">or</span>
                      <div className="flex-grow border-t border-white/5" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Email Input */}
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "140ms", animationFillMode: "both" }}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                        Email address <span className="text-primary">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          disabled={loading}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder:text-muted-foreground/30 outline-none text-xs transition-all bg-white/5 border border-white/10"
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "#0ea5e9";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.12)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
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
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Password <span className="text-primary">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => navigate({ to: "/reset-password" })}
                            className="text-[10px] text-primary hover:text-primary-foreground font-bold hover:underline transition-colors animate-in duration-300"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            disabled={loading}
                            className="w-full pl-10 pr-10 py-2.5 rounded-xl text-white placeholder:text-muted-foreground/30 outline-none text-xs transition-all bg-white/5 border border-white/10"
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "var(--color-primary)";
                              e.currentTarget.style.boxShadow = "var(--shadow-glow)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
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
                      className="w-full py-3 rounded-full font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 mt-4 text-xs animate-in fade-in slide-in-from-bottom-2 duration-500"
                      style={
                        isCredentialsValid && !loading
                          ? {
                              background: "var(--gradient-primary)",
                              color: "#fff",
                              boxShadow: "var(--shadow-glow)",
                              cursor: "pointer",
                              animationDelay: "260ms",
                              animationFillMode: "both"
                            }
                          : {
                              background: "rgba(255, 255, 255, 0.04)",
                              color: "rgba(255, 255, 255, 0.3)",
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
                        className="text-[10px] text-primary hover:text-primary-foreground font-bold cursor-pointer hover:underline transition-all"
                      >
                        {loginMethod === "password"
                          ? "Sign in with email code instead"
                          : "Sign in with password instead"}
                      </button>

                      {/* Sign Up Link */}
                      <div className="text-xs">
                        <span className="text-muted-foreground">Don't have an account? </span>
                        <button
                          onClick={() => navigate({ to: "/signup" })}
                          className="text-primary hover:text-primary-foreground font-semibold cursor-pointer hover:underline transition-all"
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
                      Enter the 8-digit verification code sent to your email
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
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                        Verification Code <span className="text-primary">*</span>
                      </label>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="12345678"
                        disabled={loading}
                        maxLength={8}
                        className="w-full text-center text-xl tracking-widest py-2.5 rounded-xl text-white placeholder:text-muted-foreground/30 outline-none transition-all bg-white/5 border border-white/10"
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-primary)";
                          e.currentTarget.style.boxShadow = "var(--shadow-glow)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && otp.length === 8) handleOtpSubmit();
                        }}
                      />
                    </div>

                    {/* Verify Button */}
                    <button
                      onClick={handleOtpSubmit}
                      disabled={otp.length !== 8 || loading}
                      className="w-full py-3 rounded-full font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 mt-2 text-xs animate-in fade-in slide-in-from-bottom-2 duration-500"
                      style={
                        otp.length === 8 && !loading
                          ? {
                              background: "var(--gradient-primary)",
                              color: "#fff",
                              boxShadow: "var(--shadow-glow)",
                              cursor: "pointer",
                              animationDelay: "140ms",
                              animationFillMode: "both"
                            }
                          : {
                              background: "rgba(255, 255, 255, 0.04)",
                              color: "rgba(255, 255, 255, 0.3)",
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
                      className="w-full py-3 rounded-full font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 border border-white/10 text-muted-foreground hover:text-white bg-transparent cursor-pointer text-xs animate-in fade-in slide-in-from-bottom-2 duration-500"
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

