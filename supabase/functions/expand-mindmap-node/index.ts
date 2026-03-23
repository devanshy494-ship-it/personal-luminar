import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { nodeLabel, parentContext, rootTopic, model } = await req.json();

    if (!nodeLabel || typeof nodeLabel !== "string") {
      return new Response(JSON.stringify({ error: "nodeLabel is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const contextStr = parentContext ? `\nParent context: ${parentContext}` : "";

    const systemPrompt = `You are an expert mind map expander. Given a specific topic node from a mind map about "${rootTopic || nodeLabel}", generate 3-6 detailed sub-topics that break down this concept further.${contextStr}

Each sub-topic should be a meaningful expansion of the node, providing deeper insight. Keep labels concise (2-6 words) and add brief descriptions.`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-3.1-flash-lite-preview'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: `Expand this mind map node into sub-topics: "${nodeLabel}"` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["label"],
                  },
                },
              },
              required: ["children"],
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

    const result = JSON.parse(rawText);

    return new Response(
      JSON.stringify({ children: result.children }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("expand-mindmap-node error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
