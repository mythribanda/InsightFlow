import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorComponent } from "./__root";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Loader2, Mail, Lock, Eye, EyeOff, Phone, User } from "lucide-react";
import { DataPointsBackground } from "@/components/DataPointsBackground";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  errorComponent: ErrorComponent,
});

function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "otp" | "password">("details");

  // Step 1: Details
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");

  // Step 2: OTP
  const [otp, setOtp] = useState("");

  // Step 3: Password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation
  const isStep1Valid = fullName.trim().length > 0 && mobile.trim().length > 0 && email.trim().length > 0;
  const isStep2Valid = otp.length === 8;
  const isStep3Valid = password.length >= 8 && confirmPassword === password;

  // Get password strength
  function getPasswordStrength(pwd: string) {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z\d]/.test(pwd)) score++;
    return score;
  }

  const passwordStrength = getPasswordStrength(password);

  // Step 1: Send OTP
  async function handleSendOtp() {
    if (!isStep1Valid) return;
    setLoading(true);
    setError(null);

    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim())
        .maybeSingle();

      if (existingUser) {
        throw new Error("Email already registered. Try logging in instead.");
      }

      // Send OTP via Supabase by signing in/creating user with OTP
      const { error: signUpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          throw new Error("Email already registered. Try logging in.");
        }
        if (signUpError.message.includes("Error sending confirmation email") || signUpError.status === 500) {
          toast.warning("Email rate limit reached. Proceeding to verification in case you already received a code.");
          setStep("otp");
          return;
        }
        throw signUpError;
      }

      setStep("otp");
      toast.info("Verification code sent to your email");
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
      toast.error("Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify OTP
  async function handleVerifyOtp() {
    if (!isStep2Valid) return;
    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "email", // verifying OTP code from signInWithOtp
      });

      if (verifyError) throw verifyError;

      setStep("password");
      toast.success("Email verified!");
    } catch (err: any) {
      setError(err.message || "OTP verification failed");
      toast.error("Verification failed");
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Create Account
  async function handleCreateAccount() {
    if (!isStep3Valid) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error("Session expired. Please try signing up again.");

      // Update auth with actual password
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      // Upsert profile with all data
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          display_name: fullName.trim(),
          email: email.trim(),
          phone: mobile.trim(),
        });

      if (profileError) throw profileError;

      toast.success("Account created successfully!");
      navigate({ to: "/app" });
    } catch (err: any) {
      setError(err.message || "Failed to create account");
      toast.error("Account creation failed");
    } finally {
      setLoading(false);
    }
  }

  // Google OAuth
  async function handleGoogleSignUp() {
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
      setError(err.message || "Google sign-up failed");
      toast.error("Google sign-up failed");
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
      setError(err.message || "GitHub sign-up failed");
      toast.error("GitHub sign-up failed");
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
      setError(err.message || "Discord sign-up failed");
      toast.error("Discord sign-up failed");
      setLoading(false);
    }
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Insight<span className="bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] bg-clip-text text-transparent">Flow</span>
          </h1>
        </div>

        {/* Glass card */}
        <div className="surface-card rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-1">
              {step === "details"
                ? "Create your account"
                : step === "otp"
                ? "Verify your email"
                : "Set your password"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {step === "details"
                ? "Enter your details to get started"
                : step === "otp"
                ? "Enter the 8-digit code sent to your email"
                : "Create a strong password"}
            </p>

            {/* Progress indicator */}
            <div className="flex gap-2 pt-4">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    s <= (step === "details" ? 1 : step === "otp" ? 2 : 3)
                      ? "bg-primary"
                      : "bg-foreground/5"
                  }`}
                />
              ))}
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-sm text-red-300 animate-in fade-in zoom-in-95 duration-200"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {error}
            </div>
          )}

          <div className="space-y-4">
            {step === "details" ? (
              <>
                 {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-foreground placeholder:text-muted-foreground/30 outline-none transition-all bg-foreground/5 border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Mobile */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Mobile Number *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="+91 98765 43210"
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-foreground placeholder:text-muted-foreground/30 outline-none transition-all bg-foreground/5 border border-border focus:border-primary focus:ring-1 focus:ring-primary"
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
                      placeholder="your@email.com"
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-foreground placeholder:text-muted-foreground/30 outline-none transition-all bg-foreground/5 border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Continue Button */}
                <button
                  onClick={handleSendOtp}
                  disabled={!isStep1Valid || loading}
                  className="w-full py-3.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 mt-2 text-xs"
                  style={
                    isStep1Valid && !loading
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
                      Sending...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>

                 {/* Divider */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground uppercase tracking-widest font-bold text-[10px]">Or</span>
                  </div>
                </div>

                 {/* Google Button */}
                <button
                  onClick={handleGoogleSignUp}
                  disabled={loading}
                  className="w-full py-3 rounded-full font-semibold border border-border bg-foreground/5 hover:bg-foreground/10 text-xs text-foreground transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 cursor-pointer shadow-sm"
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

                <button
                  onClick={handleGithubSignIn}
                  disabled={loading}
                  className="w-full py-2.5 rounded-full font-semibold border border-border bg-foreground/5 hover:bg-foreground/10 text-xs text-foreground transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                  Continue with GitHub
                </button>

                <button
                  onClick={handleDiscordSignIn}
                  disabled={loading}
                  className="w-full py-2.5 rounded-full font-semibold border border-border bg-foreground/5 hover:bg-foreground/10 text-xs text-foreground transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#5865F2">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z" />
                  </svg>
                  Continue with Discord
                </button>

                {/* Sign In Link */}
                <div className="text-center text-xs mt-1">
                  <span className="text-muted-foreground">Already have an account? </span>
                  <button
                    onClick={() => navigate({ to: "/login" })}
                    className="text-primary hover:text-primary-foreground font-semibold cursor-pointer hover:underline transition-all"
                  >
                    Sign in
                  </button>
                </div>
              </>
            ) : step === "otp" ? (
              <>
                {/* OTP Input */}
                <div>
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
                    className="w-full text-center text-2xl tracking-widest py-3 rounded-xl text-foreground placeholder:text-muted-foreground/30 outline-none transition-all bg-foreground/5 border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && otp.length === 8) handleVerifyOtp();
                    }}
                  />
                </div>

                {/* Verify Button */}
                <button
                  onClick={handleVerifyOtp}
                  disabled={!isStep2Valid || loading}
                  className="w-full py-3.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 mt-2 text-xs"
                  style={
                    isStep2Valid && !loading
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
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </button>

                {/* Back Button */}
                <button
                  onClick={() => {
                    setStep("details");
                    setOtp("");
                    setError(null);
                  }}
                  disabled={loading}
                  className="w-full py-3.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 border border-border text-muted-foreground hover:text-foreground bg-transparent cursor-pointer text-xs"
                >
                  Back
                </button>
              </>
            ) : (
              <>
                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={loading}
                      className="w-full pl-10 pr-10 py-3 rounded-xl text-foreground placeholder:text-muted-foreground/30 outline-none transition-all bg-foreground/5 border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-white cursor-pointer"
                      type="button"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {password && (
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <div className="flex gap-1">
                        {[...Array(4)].map((_, i) => (
                          <div
                            key={i}
                            className={`h-1 w-6 rounded-full transition-all duration-300 ${
                              i < passwordStrength ? "bg-primary" : "bg-foreground/5"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {["Weak", "Fair", "Good", "Strong", "Very Strong"][passwordStrength]}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={loading}
                      className="w-full pl-10 pr-10 py-3 rounded-xl text-foreground placeholder:text-muted-foreground/30 outline-none transition-all bg-foreground/5 border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isStep3Valid) handleCreateAccount();
                      }}
                    />
                    <button
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-white cursor-pointer"
                      type="button"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                  )}
                </div>

                {/* Create Account Button */}
                <button
                  onClick={handleCreateAccount}
                  disabled={!isStep3Valid || loading}
                  className="w-full py-3.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 mt-2 text-xs"
                  style={
                    isStep3Valid && !loading
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
                      Creating...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>

                {/* Back Button */}
                <button
                  onClick={() => {
                    setStep("otp");
                    setPassword("");
                    setConfirmPassword("");
                    setError(null);
                  }}
                  disabled={loading}
                  className="w-full py-3.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 border border-white/10 text-muted-foreground hover:text-white bg-transparent cursor-pointer text-xs"
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
