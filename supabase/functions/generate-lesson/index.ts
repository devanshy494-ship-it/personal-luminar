import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topicTitle, stepTitle, stepDescription, minWords, maxWords } = await req.json();
    if (!topicTitle || !stepTitle) {
      return new Response(JSON.stringify({ error: "topicTitle and stepTitle are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wordLimitInstruction = minWords || maxWords
      ? `\n\nIMPORTANT WORD LIMIT: The total lesson content (all sections combined) must be ${minWords ? `at least ${minWords} words` : ''}${minWords && maxWords ? ' and ' : ''}${maxWords ? `no more than ${maxWords} words` : ''}. Adjust the depth and number of examples accordingly to meet this requirement.`
      : '';

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const systemPrompt = `You are an expert educator. Generate a comprehensive, beginner-friendly lesson for a specific step in a learning roadmap. The lesson should be detailed, engaging, and include practical examples. Use clear explanations and break down complex concepts.${wordLimitInstruction}`;

    const userPrompt = `Topic: "${topicTitle}"
Step: "${stepTitle}"
Step description: "${stepDescription || ''}"

Create a detailed lesson for this step.`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${body.model || 'gemini-3.1-flash-lite'}:generateContent?key=${GEMINI_API_KEY}`,
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
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      heading: { type: "string" },
                      content: { type: "string" },
                    },
                    required: ["heading", "content"],
                  },
                },
                keyTakeaways: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["sections", "keyTakeaways"],
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

    const lesson = JSON.parse(rawText);

    return new Response(
      JSON.stringify(lesson),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-lesson error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
