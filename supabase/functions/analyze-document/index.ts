import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, url, scope, model } = await req.json();

    let textContent = content || "";

    if (url && !textContent) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminarBot/1.0)" },
        });
        const html = await response.text();
        textContent = html
          .replace(new RegExp("<script[^>]*>[\\s\\S]*?<\\/script>", "gi"), "")
          .replace(new RegExp("<style[^>]*>[\\s\\S]*?<\\/style>", "gi"), "")
          .replace(new RegExp("<[^>]+>", "g"), " ")
          .replace(new RegExp("\\s+", "g"), " ")
          .trim();
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch URL content" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!textContent || textContent.length < 50) {
      return new Response(
        JSON.stringify({ error: "Content is too short to analyze. Please provide more text." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const truncated = textContent.length > 15000 ? textContent.slice(0, 15000) + "\n[...content truncated...]" : textContent;

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const scopeInstruction = scope
      ? `\n\nIMPORTANT: The user has specified a focus/scope for the flashcards: "${scope}". Only analyze and identify topics relevant to this scope. Ignore content outside this scope.`
      : "";

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `You are a content analyzer. Analyze the provided text and identify the main topics and subtopics that could be turned into flashcards. For each topic, estimate how many meaningful flashcards can be created. Be thorough but realistic.${scopeInstruction}` }] },
          contents: [{ parts: [{ text: `Analyze this content and identify topics/subtopics for flashcard generation:\n\n${truncated}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                title: { type: "string" },
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      subtopics: { type: "array", items: { type: "string" } },
                      estimatedCards: { type: "number" },
                    },
                    required: ["name", "subtopics", "estimatedCards"],
                  },
                },
                totalRecommendedCards: { type: "number" },
                summary: { type: "string" },
              },
              required: ["title", "topics", "totalRecommendedCards", "summary"],
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

    const analysis = JSON.parse(rawText);

    return new Response(JSON.stringify({ analysis, contentLength: textContent.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
