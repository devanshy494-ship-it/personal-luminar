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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { topic, sourceContent, strictMode } = await req.json();

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const hasSource = sourceContent && typeof sourceContent === "string" && sourceContent.length > 50;
    const truncatedSource = hasSource ? sourceContent.slice(0, 15000) : "";
    const isStrict = hasSource && strictMode === true;

    const systemPrompt = `You are an expert mind map generator. Given a topic${hasSource ? " and source material" : ""}, create a detailed, hierarchical mind map structure.

The mind map should have:
- A central topic node
- 4-8 main branches (level 1)
- Each main branch should have 2-5 sub-branches (level 2)
- Important sub-branches can have 1-3 leaf nodes (level 3)

Make it comprehensive and well-organized. Each node should have a concise label and optionally a brief description.${hasSource && isStrict ? "\n\nCRITICAL: You MUST use ONLY information from the provided source material. Do NOT add any external knowledge. Every node must be directly derived from the source content." : hasSource ? "\n\nIMPORTANT: Base the mind map primarily on the provided source material. Extract the key concepts, structure, and relationships from the content. You may supplement with relevant context where the source has gaps." : ""}`;

    const userContent = hasSource
      ? `Create a detailed mind map for: "${topic.trim()}".\n\nSource material:\n\n${truncatedSource}`
      : `Create a detailed mind map for: "${topic.trim()}". Cover all major aspects comprehensively.`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userContent }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                title: { type: "string" },
                branches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      description: { type: "string" },
                      color: { type: "string" },
                      children: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string" },
                            description: { type: "string" },
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
                          required: ["label"],
                        },
                      },
                    },
                    required: ["label", "color"],
                  },
                },
              },
              required: ["title", "branches"],
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

    const mindmap = JSON.parse(rawText);

    // Save to database
    const { data: savedMindmap, error: saveError } = await supabase
      .from("mindmaps")
      .insert({
        user_id: userId,
        topic: topic.trim(),
        mindmap_data: mindmap,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      throw new Error("Failed to save mindmap");
    }

    return new Response(
      JSON.stringify({ mindmap, mindmapId: savedMindmap.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-mindmap error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
