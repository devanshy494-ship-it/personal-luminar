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

    const { topicId, stepIndex, stepTitle, cardCount, model } = await req.json();
    if (!topicId) {
      return new Response(JSON.stringify({ error: "topicId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: topic } = await supabase.from("topics").select("title, generation_context").eq("id", topicId).single();
    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const numCards = cardCount || 10;
    const ctx = topic.generation_context as any;

    let systemPrompt: string;
    let userPrompt: string;

    if (ctx && ctx.selectedTopics) {
      const topicsList = ctx.selectedTopics
        .map((t: any) => `- ${t.name}: ${t.subtopics?.join(", ") || "general"}`)
        .join("\n");

      const scopeInstruction = ctx.scope
        ? `\n\nIMPORTANT FOCUS: The user wants flashcards specifically about: "${ctx.scope}". All new cards must stay relevant to this focus.`
        : "";

      systemPrompt = `You are a flashcard generator for learning. Create ${numCards} NEW flashcards covering these topics:\n${topicsList}\n\nEach flashcard should have a front (question/term) and back (answer/definition). Make them progressively harder. Do NOT repeat concepts that would be in basic flashcards — generate fresh, deeper questions.${scopeInstruction}`;

      const contentHint = ctx.contentSummary
        ? `\n\nHere is a summary of the original source content for reference:\n${ctx.contentSummary}`
        : "";

      userPrompt = `Create ${numCards} additional flashcards for "${topic.title}".${contentHint}`;
    } else {
      const subject = stepTitle ? `"${stepTitle}" (part of "${topic.title}")` : `"${topic.title}"`;
      systemPrompt = `You are a flashcard generator for learning. Create ${numCards} flashcards with a front (question/term) and back (answer/definition) for the given topic. Make them progressively harder.`;
      userPrompt = `Create flashcards for studying: ${subject}`;
    }

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-3.1-flash-lite'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
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
                    },
                    required: ["front", "back"],
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
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Gemini API error: " + errorText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("No response from AI");

    const { flashcards } = JSON.parse(rawText);

    // Create a flashcard group
    const groupName = stepTitle ? `${topic.title} - ${stepTitle}` : topic.title;
    const { data: group, error: groupError } = await supabase
      .from("flashcard_groups")
      .insert({ user_id: user.id, name: groupName, topic_id: topicId })
      .select("id")
      .single();
    if (groupError) throw groupError;

    const flashcardRows = flashcards.map((fc: any) => ({
      topic_id: topicId,
      user_id: user.id,
      front: fc.front,
      back: fc.back,
      mastery_level: 0,
      step_index: stepIndex ?? null,
      group_id: group.id,
    }));

    const { error: insertError } = await supabase.from("flashcards").insert(flashcardRows);
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ flashcards, topicTitle: topic.title, stepIndex: stepIndex ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-flashcards error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
