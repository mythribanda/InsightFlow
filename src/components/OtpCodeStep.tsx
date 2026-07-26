import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyRound, ArrowLeft, Loader2 } from "lucide-react";

interface OtpCodeStepProps {
  email: string;
  onBack: () => void;
  onSubmit: (code: string) => void;
  buttonText: string;
  loading?: boolean;
}

export function OtpCodeStep({
  email,
  onBack,
  onSubmit,
  buttonText,
  loading = false,
}: OtpCodeStepProps) {
  const [otpCode, setOtpCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length >= 6 && otpCode.length <= 8) {
      onSubmit(otpCode);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
            <Input
              type="text"
              placeholder="12345678"
              maxLength={8}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              required
              disabled={loading}
              className="pl-10 h-11 border-border/60 bg-background/50 font-mono tracking-widest text-center text-lg focus:border-primary"
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading || otpCode.length < 6 || otpCode.length > 8}
          className="w-full h-11 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 active:scale-98 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : buttonText}
        </Button>
      </form>

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 font-medium cursor-pointer disabled:cursor-not-allowed"
      >
        <ArrowLeft className="h-3 w-3" /> Change email address
      </button>
    </div>
  );
}
