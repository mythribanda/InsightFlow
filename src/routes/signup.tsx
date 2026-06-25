import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Brain, Mail, Loader2, Lock, User, Phone, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { OtpCodeStep } from "@/components/OtpCodeStep";

export const Route = createFileRoute("/signup")({
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation checks
  const isPasswordValid = password.length >= 8;
  const isConfirmPasswordDirty = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  const isFormValid =
    fullName.trim() !== "" && email.trim() !== "" && isPasswordValid && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError(null);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim() || undefined,
          },
        },
      });

      if (signUpError) throw signUpError;

      setStep("otp");
      toast.success("Verification code sent to your email!");
    } catch (err) {
      console.error("Signup error:", err);
      const rawMessage = (err as Error)?.message || "";

      // Map known Supabase errors to user-friendly messages
      let friendlyMessage: string;
      if (
        rawMessage.toLowerCase().includes("error sending confirmation email") ||
        rawMessage.toLowerCase().includes("sending confirmation email")
      ) {
        friendlyMessage =
          "Unable to send verification email right now. This is usually caused by Supabase's email rate limit (3 emails/hour on free tier). Please wait a few minutes and try again, or contact support if the issue persists.";
      } else if (rawMessage.toLowerCase().includes("user already registered")) {
        friendlyMessage =
          "An account with this email already exists. Try signing in instead.";
      } else if (rawMessage.toLowerCase().includes("invalid email")) {
        friendlyMessage = "Please enter a valid email address.";
      } else if (rawMessage.toLowerCase().includes("password")) {
        friendlyMessage = rawMessage;
      } else {
        friendlyMessage = rawMessage || "Failed to create account. Please try again.";
      }

      setError(friendlyMessage);
      toast.error("Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (code: string) => {
    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "signup",
      });

      if (verifyError) throw verifyError;

      toast.success("Account created successfully!");
      navigate({ to: "/" });
    } catch (err) {
      console.error("OTP verification error:", err);
      setError((err as Error)?.message || "Invalid or expired verification code.");
      toast.error("Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Decorative Glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-5 pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
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
              {step === "form" ? "Create your account" : "Check your email"}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {step === "form"
                ? "Get started with your free data intelligence account"
                : `Enter the 6-digit code sent to ${email}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Signup Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === "form" ? (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Full Name Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      Full name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      Email address <span className="text-rose-500">*</span>
                    </label>
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

                  {/* Phone Number Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      Phone number{" "}
                      <span className="text-muted-foreground/40 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={loading}
                        className="pl-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-10 pr-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                        className="absolute right-3.5 top-3.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {password && !isPasswordValid && (
                      <p className="text-[11px] text-rose-400 font-medium">
                        Password must be at least 8 characters.
                      </p>
                    )}
                  </div>

                  {/* Confirm Password Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      Confirm password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-10 pr-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={loading}
                        className="absolute right-3.5 top-3.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {isConfirmPasswordDirty && !passwordsMatch && (
                      <p className="text-[11px] text-rose-400 font-medium">
                        Passwords do not match.
                      </p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={loading || !isFormValid}
                    className="w-full h-11 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 active:scale-98 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                    ) : (
                      "Create account"
                    )}
                  </Button>
                </form>

                {/* Footer Switcher */}
                <div className="text-center text-xs text-muted-foreground pt-2">
                  Already have an account?{" "}
                  <Link
                    to="/login"
                    className="text-primary hover:underline font-medium transition-colors"
                  >
                    Sign in
                  </Link>
                </div>
              </>
            ) : (
              <OtpCodeStep
                email={email}
                onBack={() => setStep("form")}
                onSubmit={handleOtpSubmit}
                buttonText="Verify & Continue"
                loading={loading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
