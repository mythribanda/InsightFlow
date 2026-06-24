import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getDevLoginLink = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    if (typeof v === "object" && v !== null && "email" in v) {
      return v as { email: string; redirectTo?: string };
    }
    throw new Error("Invalid request");
  })
  .handler(async ({ data: request }) => {
    const email = request.email.trim();
    const redirectTo = request.redirectTo || "http://localhost:8081/";

    try {
      // 1. Generate Link using try-catch fallback (try magiclink first, then signup if user doesn't exist)
      let data, error;
      try {
        const res = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: {
            redirectTo,
          },
        });
        if (res.error) throw res.error;
        data = res.data;
      } catch (err: any) {
        // Fallback to signup if magiclink fails
        const res = await supabaseAdmin.auth.admin.generateLink({
          type: "signup",
          email,
          password: Math.random().toString(36).slice(-10) + "A1!",
          options: {
            redirectTo,
          },
        });
        if (res.error) throw res.error;
        data = res.data;
      }

      const otp = data.properties?.email_otp || "";
      const actionLink = data.properties?.action_link || "";

      // Log to terminal
      console.log(`\n==================================================`);
      console.log(`🔑 [DEV-ONLY AUTH BYPASS] Email: ${email}`);
      console.log(`👉 Link: ${actionLink}`);
      console.log(`👉 Code: ${otp}`);
      console.log(`==================================================\n`);

      return {
        success: true,
        actionLink,
        otp,
      };
    } catch (error: any) {
      console.error("Dev login link generation failed:", error);
      throw new Error(error?.message || "Failed to generate development login link.");
    }
  });
