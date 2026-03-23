import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  const url = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch video info");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.title || "YouTube Video";
}

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { url, cardCount = 20 } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = await fetchVideoTitle(videoId);
    console.log(`Video title: ${title}`);

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const clampedCount = Math.min(Math.max(cardCount, 5), 50);

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${body.model || 'gemini-3.1-flash-lite-preview'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `You are an expert educator. Generate high-quality study flashcards about the given topic. Each flashcard should have a clear, concise question on the front and a comprehensive answer on the back. Cover key concepts, definitions, and important details.` }] },
          contents: [{ parts: [{ text: `Generate exactly ${clampedCount} flashcards for studying the topic from this YouTube video titled: "${title}". Cover the key concepts, definitions, facts, and important details that would typically be covered in a video about this subject.` }] }],
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
    if (!rawText) throw new Error("No flashcards generated");

    const { flashcards } = JSON.parse(rawText);
    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error("No flashcards in AI response");
    }

    const { data: topicData, error: topicError } = await supabase
      .from("topics")
      .insert({ title, user_id: userId })
      .select("id")
      .single();
    if (topicError) throw topicError;

    const topicId = topicData.id;

    const { data: group, error: groupError } = await supabase
      .from("flashcard_groups")
      .insert({ user_id: userId, name: title, topic_id: topicId })
      .select("id")
      .single();
    if (groupError) throw groupError;

    const rows = flashcards.map((fc: { front: string; back: string }) => ({
      front: fc.front,
      back: fc.back,
      topic_id: topicId,
      user_id: userId,
      group_id: group.id,
    }));

    const { error: insertError } = await supabase.from("flashcards").insert(rows);
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ topicId, title, cardsGenerated: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("youtube-flashcards error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
