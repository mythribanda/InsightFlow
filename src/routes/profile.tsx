import { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Brain,
  Mail,
  Loader2,
  Lock,
  User,
  Phone,
  ArrowLeft,
  Upload,
  LogOut,
  AlertTriangle,
  LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // User & Auth states
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Check session and fetch profile data
  useEffect(() => {
    async function checkAuthAndFetchProfile() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!sessionData.session) {
          toast.error("You must be signed in to view this page.");
          navigate({ to: "/login" });
          return;
        }

        const user = sessionData.session.user;
        setUserId(user.id);
        setEmail(user.email || "");

        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (profileError) {
          // If no profile row exists, we might need to handle it, but it should exist due to trigger
          console.warn("Profile fetch error:", profileError.message);
        } else if (profileData) {
          setDisplayName(profileData.display_name || "");
          setPhone(profileData.phone || "");
          setAvatarUrl(profileData.avatar_url || null);
        }
      } catch (err) {
        console.error("Initialization error:", err);
        setError("Failed to load user profile. Please try again.");
      } finally {
        setCheckingSession(false);
      }
    }

    checkAuthAndFetchProfile();
  }, [navigate]);

  // Handle Avatar File Upload
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setFileError(null);

    // Validate type
    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setFileError("Invalid file type. Only PNG, JPEG, and WEBP images are allowed.");
      toast.error("Invalid image type");
      return;
    }

    // Validate size (2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setFileError("File exceeds the 2MB size limit. Please select a smaller image.");
      toast.error("File too large");
      return;
    }

    if (!userId) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const filePath = `${userId}/avatar.${ext}`;

      // Upload file with upsert: true
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update database profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Force cache-busting of the URL to display immediately
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      toast.success("Avatar updated successfully!");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setFileError((err as Error)?.message || "Failed to upload avatar image.");
      toast.error("Avatar upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Save profile changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          phone: phone.trim(),
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      toast.success("Profile saved successfully!");
    } catch (err) {
      console.error("Profile update failed:", err);
      setError((err as Error)?.message || "Failed to update profile settings.");
      toast.error("Failed to save changes");
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      navigate({ to: "/login" });
    } catch (err) {
      console.error("Sign out error:", err);
      toast.error("Failed to sign out");
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-5" />
        <div className="flex flex-col items-center space-y-4 relative">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Loading profile workspace...</p>
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
            <div className="flex items-center justify-between">
              <Link
                to="/"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors font-medium"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
            <CardTitle className="text-xl font-bold text-center mt-2">User Profile</CardTitle>
            <CardDescription className="text-center text-xs">
              Manage your personal workspace account settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Profile Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Avatar Section */}
            <div className="flex flex-col items-center space-y-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full border-2 border-border/80 overflow-hidden bg-background/50 flex items-center justify-center shadow-inner relative">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                      onError={() => setAvatarUrl(null)}
                    />
                  ) : (
                    <User className="w-10 h-10 text-muted-foreground/60" />
                  )}
                  {/* Hover Overlay */}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="h-5 w-5 text-primary" />
                  </button>
                </div>
              </div>
              <div className="text-center">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:underline font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "Uploading..." : "Change avatar"}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                />
                {fileError && (
                  <p className="text-[11px] text-rose-400 font-medium mt-1 max-w-[250px] mx-auto leading-normal">
                    {fileError}
                  </p>
                )}
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Full name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    type="text"
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={loading || uploading}
                    className="pl-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Phone number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading || uploading}
                    className="pl-10 h-11 border-border/60 bg-background/50 text-sm focus:border-primary"
                  />
                </div>
              </div>

              {/* Email (Read-Only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Email address{" "}
                  <span className="text-[10px] text-muted-foreground/50 font-normal">
                    (Read-only)
                  </span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    type="email"
                    value={email}
                    disabled
                    className="pl-10 h-11 border-border/40 bg-muted/20 text-muted-foreground/60 text-sm cursor-not-allowed opacity-75"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed pt-0.5">
                  * Email updates are disabled in this preview. Future versions will support secure
                  email change verification.
                </p>
              </div>

              {/* Save Changes Button */}
              <Button
                type="submit"
                disabled={loading || uploading || !displayName.trim()}
                className="w-full h-11 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 active:scale-98 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                ) : (
                  "Save changes"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
