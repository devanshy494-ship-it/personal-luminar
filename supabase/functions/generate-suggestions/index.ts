import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [topicsRes, mindmapsRes, flashcardGroupsRes, quizResultsRes] = await Promise.all([
      supabase.from("topics").select("title, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("mindmaps").select("topic, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("flashcard_groups").select("name, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("quiz_results").select("topic_id, completed_at").eq("user_id", user.id).order("completed_at", { ascending: false }).limit(20),
    ]);

    const pastTopics = (topicsRes.data || []).map(t => t.title);
    const pastMindmaps = (mindmapsRes.data || []).map(m => m.topic);
    const pastFlashcards = (flashcardGroupsRes.data || []).map(f => f.name);

    const allPastItems = [...new Set([...pastTopics, ...pastMindmaps, ...pastFlashcards])];

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const userHistory = allPastItems.length > 0
      ? `User's past learning topics: ${allPastItems.slice(0, 15).join(", ")}`
      : "User has no past learning history yet.";

    const systemPrompt = `You are a learning recommendation engine. Given a user's past learning history, generate exactly 6 topic suggestions for their next learning roadmap.

Rules:
- Suggestion 1-2: Directly based on the user's past topics. These should deepen or extend what they've already studied.
- Suggestion 3-4: Completely random interesting topics unrelated to their history.
- Suggestion 5-6: Tangentially related topics that aren't closely related but would be useful.

Each suggestion should be 2-5 words, specific enough to generate a roadmap from.
Do NOT repeat any topic the user has already studied.
If the user has no history, make all 6 suggestions diverse and interesting across different fields.`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-3.1-flash-lite'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userHistory }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      topic: { type: "string" },
                      category: { type: "string" },
                    },
                    required: ["topic", "category"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Gemini API error: " + errorText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("No response from AI");

    const { suggestions } = JSON.parse(rawText);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-suggestions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
