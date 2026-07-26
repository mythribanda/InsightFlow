import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ErrorComponent } from "./__root";
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
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  QrCode,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  errorComponent: ErrorComponent,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { session, loading: checkingSession } = useAuth();
  const [activeTab, setActiveTab] = useState<"password" | "2fa">("password");

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 2FA / MFA state
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaFactor, setMfaFactor] = useState<any>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);

  // Redirect to login if no session
  useEffect(() => {
    if (checkingSession) return;
    if (!session) {
      toast.error("You must be signed in to manage settings.");
      navigate({ to: "/login" });
    }
  }, [session, checkingSession, navigate]);

  // Check MFA Status on Mount
  useEffect(() => {
    if (session?.user?.id) {
      fetchMfaStatus();
    }
  }, [session]);

  const fetchMfaStatus = async () => {
    try {
      setMfaLoading(true);
      setError(null);
      const { data, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (mfaError) throw mfaError;

      // Filter for verified TOTP factors
      const activeFactor = data?.all?.find(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );
      setMfaFactor(activeFactor || null);
    } catch (err: any) {
      console.error("Error fetching MFA status:", err);
      setError(err.message || "Failed to retrieve 2FA status.");
    } finally {
      setMfaLoading(false);
    }
  };

  // Password Update Handler
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    try {
      setPasswordLoading(true);
      setError(null);
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      toast.success("Password updated successfully!");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Password update error:", err);
      setError(err.message || "Failed to update password.");
      toast.error(err.message || "Failed to update password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // 2FA Start Enrollment
  const handleStartEnroll = async () => {
    try {
      setEnrollLoading(true);
      setError(null);
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: session?.user?.email || "InsightFlow User",
        issuer: "InsightFlow",
      });

      if (enrollError) throw enrollError;

      setFactorId(data.id);
      // data.totp.qr_code is a base64 encoded SVG data URI
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setIsEnrolling(true);
    } catch (err: any) {
      console.error("MFA enroll error:", err);
      setError(err.message || "Failed to initialize 2FA enrollment.");
      toast.error(err.message || "Failed to start 2FA.");
    } finally {
      setEnrollLoading(false);
    }
  };

  // 2FA Verification and Activation
  const handleVerifyEnroll = async () => {
    const cleanCode = mfaCode.trim();
    if (cleanCode.length !== 6 || /\D/.test(cleanCode)) {
      toast.error("Please enter a valid 6-digit code.");
      return;
    }

    try {
      setVerifyLoading(true);
      setError(null);

      // Challenge the factor
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      // Verify code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;

      toast.success("Two-Factor Authentication (2FA) is now active!");
      setIsEnrolling(false);
      setMfaCode("");
      setQrCode("");
      setSecret("");
      setFactorId("");
      fetchMfaStatus();
    } catch (err: any) {
      console.error("MFA verify error:", err);
      setError(err.message || "Invalid verification code. Please check your authenticator app.");
      toast.error(err.message || "Verification failed.");
    } finally {
      setVerifyLoading(false);
    }
  };

  // 2FA Disable
  const handleDisableMfa = async () => {
    if (!mfaFactor) return;

    if (
      !window.confirm(
        "Are you sure you want to disable Two-Factor Authentication? Your account will be less secure."
      )
    ) {
      return;
    }

    try {
      setVerifyLoading(true);
      setError(null);
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: mfaFactor.id,
      });

      if (unenrollError) throw unenrollError;

      toast.success("Two-Factor Authentication has been disabled.");
      fetchMfaStatus();
    } catch (err: any) {
      console.error("MFA unenroll error:", err);
      setError(err.message || "Failed to disable 2FA.");
      toast.error(err.message || "Failed to disable 2FA.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCancelEnroll = () => {
    setIsEnrolling(false);
    setFactorId("");
    setQrCode("");
    setSecret("");
    setMfaCode("");
    setError(null);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-mono mt-3">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4 font-sans">
      {/* Decorative Glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-secondary/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-5 pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header Logo */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-[0_0_24px_-4px_var(--color-primary)]">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Insight<span className="bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] bg-clip-text text-transparent">Flow</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            data intelligence console
          </p>
        </div>

        {/* Card */}
        <Card className="surface-card rounded-3xl overflow-hidden shadow-2xl">
          <CardHeader className="space-y-1.5 pb-6">
            <div className="flex items-center justify-between">
              <Link
                to="/app"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors font-medium"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
              </Link>
            </div>
            <CardTitle className="text-xl font-bold text-center mt-2 text-foreground">Settings</CardTitle>
            <CardDescription className="text-center text-xs text-muted-foreground">
              Manage your workspace security configurations
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="text-xs border-red-500/25 bg-red-500/10 text-red-300">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Operation Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Custom Tab Selectors */}
            <div className="flex border-b border-border mb-4">
              <button
                onClick={() => {
                  handleCancelEnroll();
                  setActiveTab("password");
                }}
                className={`flex-1 pb-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 text-center cursor-pointer ${
                  activeTab === "password"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Password Security
              </button>
              <button
                onClick={() => setActiveTab("2fa")}
                className={`flex-1 pb-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 text-center cursor-pointer ${
                  activeTab === "2fa"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Two-Factor (2FA)
              </button>
            </div>

            {/* PASSWORD SECURITY TAB */}
            {activeTab === "password" && (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                    New password <span className="text-primary">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      type="password"
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={passwordLoading}
                      className="pl-10 h-11 rounded-xl text-foreground placeholder:text-muted-foreground/30 border-border bg-foreground/5 focus:border-primary/50 focus:ring-primary/20 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                    Confirm new password <span className="text-primary">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={passwordLoading}
                      className="pl-10 h-11 rounded-xl text-foreground placeholder:text-muted-foreground/30 border-border bg-foreground/5 focus:border-primary/50 focus:ring-primary/20 text-sm"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={passwordLoading || !password || !confirmPassword}
                  className="w-full h-11 rounded-full bg-gradient-to-r from-primary to-secondary font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 text-xs"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating password...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </form>
            )}

            {/* TWO-FACTOR AUTHENTICATION TAB */}
            {activeTab === "2fa" && (
              <div className="space-y-4">
                {mfaLoading ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    <p className="text-xs text-muted-foreground font-mono">Checking security factors...</p>
                  </div>
                ) : !isEnrolling ? (
                  <div className="space-y-4">
                    {/* Status Alert Banner */}
                    {mfaFactor ? (
                      <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-400 text-xs">
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        <AlertTitle className="font-semibold">MFA Enabled</AlertTitle>
                        <AlertDescription>
                          Your account is protected with Google Authenticator (TOTP) two-factor authentication.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert className="bg-yellow-500/10 border-yellow-500/25 text-yellow-400 text-xs">
                        <ShieldAlert className="h-4 w-4 text-yellow-400" />
                        <AlertTitle className="font-semibold">MFA Recommended</AlertTitle>
                        <AlertDescription>
                          Two-factor authentication adds an extra layer of security. Please enroll a TOTP authenticator app.
                        </AlertDescription>
                      </Alert>
                    )}

                    {mfaFactor ? (
                      <div className="space-y-2 pt-2">
                        <div className="text-xs text-muted-foreground font-mono p-3 bg-foreground/[0.02] border border-border rounded-xl">
                          <div className="flex justify-between mb-1.5">
                            <span>Factor ID:</span>
                            <span className="text-foreground font-semibold">{mfaFactor.id.substring(0, 8)}...</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Factor Type:</span>
                            <span className="text-foreground font-semibold uppercase">{mfaFactor.factor_type}</span>
                          </div>
                        </div>

                        <Button
                          onClick={handleDisableMfa}
                          disabled={verifyLoading}
                          className="w-full h-11 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold transition-colors cursor-pointer text-xs"
                        >
                          {verifyLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Disabling 2FA...
                            </>
                          ) : (
                            "Disable Two-Factor Authentication"
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleStartEnroll}
                        disabled={enrollLoading}
                        className="w-full h-11 rounded-full bg-gradient-to-r from-primary to-secondary font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 text-xs"
                      >
                        {enrollLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Starting setup...
                          </>
                        ) : (
                          "Enable Two-Factor Authentication"
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  /* MFA ENROLLMENT ACTIVE VIEW */
                  <div className="space-y-4 pt-1 animate-in fade-in zoom-in-95 duration-200">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Set up Authenticator App
                    </h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      1. Scan the QR code using Google Authenticator, Microsoft Authenticator, or Duo.
                    </p>

                    {/* QR Code Container */}
                    {qrCode && (
                      <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-border shadow-inner max-w-[200px] mx-auto">
                        <img src={qrCode} alt="TOTP QR Code" className="w-40 h-40 object-contain" />
                      </div>
                    )}

                    {/* Manual Secret Key */}
                    {secret && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-mono uppercase block">
                          Or enter code manually:
                        </span>
                        <div className="font-mono text-xs select-all bg-foreground/5 p-2.5 rounded-xl border border-border text-center font-bold tracking-wider text-foreground">
                          {secret}
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      2. Enter the 6-digit verification code generated by your app.
                    </p>

                    <div className="space-y-1.5">
                      <div className="relative">
                        <QrCode className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                        <Input
                          type="text"
                          placeholder="000000"
                          maxLength={6}
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          required
                          disabled={verifyLoading}
                          className="pl-10 h-11 rounded-xl text-center text-lg tracking-widest font-mono text-foreground placeholder:text-muted-foreground/30 border-border bg-foreground/5 focus:border-primary/50 focus:ring-primary/20"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelEnroll}
                        disabled={verifyLoading}
                        className="flex-1 h-11 rounded-full border-border text-muted-foreground hover:bg-foreground/5 font-bold cursor-pointer text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handleVerifyEnroll}
                        disabled={verifyLoading || mfaCode.length !== 6}
                        className="flex-grow h-11 rounded-full bg-gradient-to-r from-primary to-secondary font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 text-xs"
                      >
                        {verifyLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Verify Factor
                          </>
                        ) : (
                          "Verify Factor"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
