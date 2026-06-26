import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Brain,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  MailWarning,
} from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();

  // Auth States
  const { session, loading: checkingSession } = useAuth();
  const hasSession = !!session;

  // Form States
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI Flow States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form validations
  const isPasswordValid = password.length >= 8;
  const isConfirmPasswordDirty = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  const isFormValid = isPasswordValid && passwordsMatch && password && confirmPassword;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess(true);
      toast.success("Password reset successfully! Redirecting...");

      // Delay navigation slightly to let the user see success message
      setTimeout(() => {
        navigate({ to: "/" });
      }, 1500);
    } catch (err) {
      console.error("Password update error:", err);
      setError(
        (err as Error)?.message || "Failed to update your password. The link may have expired.",
      );
      toast.error("Password reset failed");
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
          <p className="text-xs text-muted-foreground font-mono">
            Initializing recovery session...
          </p>
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
              {hasSession ? "Choose new password" : "Invalid recovery link"}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {hasSession
                ? "Set a secure password for your workspace account"
                : "No active password recovery session detected"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Reset Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-400 text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription>Your password has been updated. Logging in...</AlertDescription>
              </Alert>
            )}

            {hasSession ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* New Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    New password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading || success}
                      className="pl-10 pr-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading || success}
                      className="absolute right-3.5 top-3.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password && !isPasswordValid && (
                    <p className="text-[11px] text-rose-400 font-medium">
                      Password must be at least 8 characters.
                    </p>
                  )}
                </div>

                {/* Confirm New Password */}
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
                      disabled={loading || success}
                      className="pl-10 pr-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={loading || success}
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
                    <p className="text-[11px] text-rose-400 font-medium">Passwords do not match.</p>
                  )}
                </div>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={loading || success || !isFormValid}
                  className="w-full h-11 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 active:scale-98 cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                  ) : (
                    "Reset password"
                  )}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center space-y-4 py-4 text-center">
                <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-full">
                  <MailWarning className="h-6 w-6 text-rose-400" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <p className="text-sm font-medium text-foreground">Link Invalid or Expired</p>
                  <p className="text-xs text-muted-foreground leading-normal">
                    This password reset link is invalid, expired, or has already been used. Please
                    request a new recovery link from the login page.
                  </p>
                </div>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold transition-colors mt-2"
                >
                  Go to Login <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
