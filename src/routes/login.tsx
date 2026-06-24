import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDevLoginLink } from "@/server/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Brain,
  Chrome,
  Mail,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const runGetDevLoginLink = useServerFn(getDevLoginLink);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Check if user is already signed in on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session) {
          toast.success("Welcome back! Redirecting to dashboard...");
          navigate({ to: "/" });
        }
      } catch (err) {
        console.error("Error checking session:", err);
      } finally {
        setCheckingSession(false);
      }
    }
    checkSession();
  }, [navigate]);

  // Google OAuth Login
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (err: any) {
      console.error("OAuth error:", err);
      setError(err?.message || "An unexpected error occurred during Google Sign-in.");
      toast.error("Google login failed");
    } finally {
      setLoading(false);
    }
  };

  // Request OTP Email
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        throw otpError;
      }

      setMessage(`A 6-digit confirmation code has been sent to ${email}.`);
      setStep("verify");
      toast.success("Code sent successfully!");
    } catch (err: any) {
      console.error("OTP send error:", err);
      try {
        toast.info("SMTP limits/errors detected. Attempting Dev-mode link/OTP generation...");
        const res = await runGetDevLoginLink({ data: { email: email.trim(), redirectTo: window.location.origin + "/" } });
        if (res.success && res.otp) {
          toast.success("Bypassing SMTP: OTP code generated.");
          setMessage(`[DEV BYPASS] SMTP server failed to send email. Pre-filled development login code: ${res.otp}`);
          setOtpCode(res.otp);
          setStep("verify");
          return;
        }
      } catch (fallbackErr: any) {
        console.error("Fallback error:", fallbackErr);
      }
      setError(err?.message || "Failed to send verification code. Please try again.");
      toast.error("Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP Code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError("Please enter the 6-digit code.");
      return;
    }
    if (otpCode.trim().length < 6) {
      setError("The verification code must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });

      if (verifyError) {
        throw verifyError;
      }

      toast.success("Verification successful! Logging in...");
      navigate({ to: "/" });
    } catch (err: any) {
      console.error("OTP verification error:", err);
      setError(err?.message || "Invalid or expired verification code. Please check and try again.");
      toast.error("Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-5" />
        <div className="flex flex-col items-center space-y-4 relative">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Checking active sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Decorative Glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-5 pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative">
        {/* Header Logo */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-[0_0_24px_-4px_var(--color-primary)]">
            <Brain className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Insight<span className="text-gradient">Flow</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            data intelligence console
          </p>
        </div>

        {/* Card */}
        <Card className="border border-border/80 bg-card/45 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
          <CardHeader className="space-y-1.5 pb-6">
            <CardTitle className="text-xl font-bold text-center">
              {step === "request" ? "Sign in or Sign up" : "Confirm your email"}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {step === "request"
                ? "Enter your email to receive a login code, or continue with Google"
                : `Enter the 6-digit code sent to ${email}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Success Message */}
            {message && (
              <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-400 text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === "request" ? (
              <>
                {/* Google Auth Button */}
                <Button
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full h-11 border-border/80 bg-secondary/20 hover:bg-secondary/40 font-medium text-sm flex items-center justify-center gap-3 transition-all duration-200"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Chrome className="h-4 w-4 text-primary" />
                  )}
                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-wider">
                    <span className="bg-slate-950/80 px-3 text-muted-foreground">or email magic link</span>
                  </div>
                </div>

                {/* OTP Email Form */}
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="space-y-2">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full h-11 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 active:scale-98"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      "Send Login Code"
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <>
                {/* OTP Verification Form */}
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type="text"
                        placeholder="123456"
                        maxLength={10}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\s/g, ""))}
                        required
                        disabled={loading}
                        className="pl-10 h-11 border-border/60 bg-background/50 font-mono tracking-widest text-center text-lg focus:border-primary"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || otpCode.trim().length < 6}
                    className="w-full h-11 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 active:scale-98"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      "Verify & Login"
                    )}
                  </Button>
                </form>

                {/* Back Button */}
                <button
                  type="button"
                  onClick={() => {
                    setStep("request");
                    setOtpCode("");
                    setError(null);
                    setMessage(null);
                  }}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 font-medium"
                >
                  <ArrowLeft className="h-3 w-3" /> Change email address
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
