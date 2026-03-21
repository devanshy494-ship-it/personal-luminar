import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password_text, action, password_id, user_email } = await req.json();

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate a signup password
    if (!action || action === "validate") {
      if (!password_text || typeof password_text !== "string") {
        return new Response(JSON.stringify({ valid: false, error: "Signup password required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await serviceClient
        .from("signup_passwords")
        .select("id, max_uses, use_count, is_active")
        .eq("password_text", password_text.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ valid: false, error: "Invalid signup password" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (data.use_count >= data.max_uses) {
        return new Response(JSON.stringify({ valid: false, error: "This signup password has reached its usage limit" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ valid: true, password_id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record usage after successful signup
    if (action === "record_usage") {
      if (!password_id || !user_email) {
        return new Response(JSON.stringify({ error: "password_id and user_email required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Increment use_count
      const { data: pwd } = await serviceClient
        .from("signup_passwords")
        .select("use_count")
        .eq("id", password_id)
        .single();

      if (pwd) {
        await serviceClient
          .from("signup_passwords")
          .update({ use_count: pwd.use_count + 1 })
          .eq("id", password_id);
      }

      // Log usage
      await serviceClient
        .from("signup_password_usage")
        .insert({ password_id, user_email });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("validate-signup-password error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
