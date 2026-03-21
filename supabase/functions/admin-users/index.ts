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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = userData.user.id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if caller is admin
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body = list users
    }

    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── LIST USERS (default) ──
    if (!body.action) {
      const { data: profiles, error } = await serviceClient
        .from("profiles")
        .select("user_id, email, full_name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Also fetch roles for all users
      const { data: roles } = await serviceClient
        .from("user_roles")
        .select("user_id, role");

      const usersWithRoles = (profiles || []).map((p: any) => ({
        ...p,
        roles: (roles || []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
      }));

      return json({ users: usersWithRoles });
    }

    // ── DELETE USER ──
    if (body.action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === callerUserId) return json({ error: "Cannot delete yourself" }, 400);

      await serviceClient.from("flashcards").delete().eq("user_id", user_id);
      await serviceClient.from("flashcard_groups").delete().eq("user_id", user_id);
      await serviceClient.from("quiz_results").delete().eq("user_id", user_id);
      await serviceClient.from("roadmaps").delete().eq("user_id", user_id);
      await serviceClient.from("mindmaps").delete().eq("user_id", user_id);
      await serviceClient.from("topics").delete().eq("user_id", user_id);
      await serviceClient.from("user_roles").delete().eq("user_id", user_id);
      await serviceClient.from("profiles").delete().eq("user_id", user_id);

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user_id);
      if (deleteError) console.error("Error deleting auth user:", deleteError);

      return json({ success: true });
    }

    // ── PROMOTE TO ADMIN ──
    if (body.action === "promote_admin") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);

      const { error } = await serviceClient
        .from("user_roles")
        .insert({ user_id, role: "admin" });

      if (error) {
        if (error.code === "23505") return json({ error: "User is already an admin" }, 400);
        throw error;
      }
      return json({ success: true });
    }

    // ── DEMOTE FROM ADMIN ──
    if (body.action === "demote_admin") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === callerUserId) return json({ error: "Cannot demote yourself" }, 400);

      await serviceClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role", "admin");

      return json({ success: true });
    }

    // ── CREATE SIGNUP PASSWORD ──
    if (body.action === "create_password") {
      const { password_text, max_uses } = body;
      if (!password_text || typeof password_text !== "string" || password_text.trim().length === 0) {
        return json({ error: "password_text required" }, 400);
      }
      const uses = typeof max_uses === "number" && max_uses > 0 ? max_uses : 1;

      const { data, error } = await serviceClient
        .from("signup_passwords")
        .insert({
          password_text: password_text.trim(),
          max_uses: uses,
          created_by: callerUserId,
        })
        .select()
        .single();

      if (error) throw error;
      return json({ password: data });
    }

    // ── LIST SIGNUP PASSWORDS ──
    if (body.action === "list_passwords") {
      const { data, error } = await serviceClient
        .from("signup_passwords")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return json({ passwords: data });
    }

    // ── TOGGLE SIGNUP PASSWORD ──
    if (body.action === "toggle_password") {
      const { password_id, is_active } = body;
      if (!password_id) return json({ error: "password_id required" }, 400);

      const { error } = await serviceClient
        .from("signup_passwords")
        .update({ is_active: !!is_active })
        .eq("id", password_id);

      if (error) throw error;
      return json({ success: true });
    }

    // ── DELETE SIGNUP PASSWORD ──
    if (body.action === "delete_password") {
      const { password_id } = body;
      if (!password_id) return json({ error: "password_id required" }, 400);

      await serviceClient.from("signup_passwords").delete().eq("id", password_id);
      return json({ success: true });
    }

    // ── PASSWORD USAGE LOG ──
    if (body.action === "password_usage_log") {
      const { password_id } = body;
      if (!password_id) return json({ error: "password_id required" }, 400);

      const { data, error } = await serviceClient
        .from("signup_password_usage")
        .select("*")
        .eq("password_id", password_id)
        .order("used_at", { ascending: false });

      if (error) throw error;
      return json({ usage: data });
    }

    // ── VALIDATE SIGNUP PASSWORD (public-facing, but still through admin edge fn) ──
    if (body.action === "validate_signup_password") {
      const { password_text } = body;
      if (!password_text) return json({ error: "password_text required" }, 400);

      const { data, error } = await serviceClient
        .from("signup_passwords")
        .select("id, max_uses, use_count, is_active")
        .eq("password_text", password_text.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ valid: false, error: "Invalid signup password" });
      if (data.use_count >= data.max_uses) return json({ valid: false, error: "This signup password has reached its usage limit" });

      return json({ valid: true, password_id: data.id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Admin users error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
