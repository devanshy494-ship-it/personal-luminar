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

    const { content, title, selectedTopics, totalCards, scope } = await req.json();

    if (!content || !title || !selectedTopics || !totalCards) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .insert({ title, user_id: user.id })
      .select("id")
      .single();

    if (topicError || !topic) {
      throw new Error("Failed to create topic: " + (topicError?.message || "Unknown"));
    }

    const contentSummary = content.length > 2000 ? content.slice(0, 2000) : content;
    const generationContext = { selectedTopics, scope: scope || null, totalCards, contentSummary };

    await supabase.from("topics").update({ generation_context: generationContext }).eq("id", topic.id);

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const truncated = content.length > 15000 ? content.slice(0, 15000) + "\n[...content truncated...]" : content;

    const topicsList = selectedTopics
      .map((t: any) => `- ${t.name}: ${t.subtopics.join(", ")}`)
      .join("\n");

    const scopeInstruction = scope
      ? `\n\nIMPORTANT FOCUS: The user wants flashcards specifically about: "${scope}". Prioritize this focus area and ensure all cards are relevant to it.`
      : "";

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${body.model || 'gemini-3.1-flash-lite'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `You are a flashcard generator. Create exactly ${totalCards} flashcards from the provided content, covering these topics:\n${topicsList}\n\nEach flashcard should have a clear question (front) and concise answer (back). Make them progressively harder. Cover all listed topics proportionally.${scopeInstruction}` }] },
          contents: [{ parts: [{ text: `Generate ${totalCards} flashcards from this content:\n\n${truncated}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                flashcards: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      front: { type: "string" },
                      back: { type: "string" },
                      topicName: { type: "string" },
                    },
                    required: ["front", "back", "topicName"],
                  },
                },
              },
              required: ["flashcards"],
            },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      await supabase.from("topics").delete().eq("id", topic.id);
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Gemini API error: " + errorText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      await supabase.from("topics").delete().eq("id", topic.id);
      throw new Error("No response from AI");
    }

    const { flashcards } = JSON.parse(rawText);

    const { data: group, error: groupError } = await supabase
      .from("flashcard_groups")
      .insert({ user_id: user.id, name: title, topic_id: topic.id })
      .select("id")
      .single();
    if (groupError) {
      await supabase.from("topics").delete().eq("id", topic.id);
      throw groupError;
    }

    const flashcardRows = flashcards.map((fc: any) => ({
      topic_id: topic.id,
      user_id: user.id,
      front: fc.front,
      back: fc.back,
      mastery_level: 0,
      step_index: null,
      group_id: group.id,
    }));

    const { error: insertError } = await supabase.from("flashcards").insert(flashcardRows);
    if (insertError) {
      await supabase.from("topics").delete().eq("id", topic.id);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ topicId: topic.id, title, cardsGenerated: flashcards.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-document-flashcards error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
