import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── YouTube Search via Innertube (no API key needed) ──
async function searchYouTube(query: string, maxResults = 2): Promise<Array<{ name: string; url: string; type: "video" }>> {
  try {
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20240313.05.00",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240313.05.00",
              hl: "en",
              gl: "US",
            },
          },
          query,
        }),
      }
    );

    if (!response.ok) {
      console.log(`YouTube search returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) return [];

    const results: Array<{ name: string; url: string; type: "video" }> = [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;
      for (const item of items) {
        const vid = item?.videoRenderer;
        if (!vid?.videoId) continue;
        const title =
          vid.title?.runs?.[0]?.text || vid.title?.simpleText || "YouTube Video";
        results.push({
          name: title,
          url: `https://www.youtube.com/watch?v=${vid.videoId}`,
          type: "video",
        });
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }

    return results;
  } catch (e) {
    console.error("YouTube search error:", e);
    return [];
  }
}

// ── URL Verification via HEAD request ──
async function verifyUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkChecker/1.0)",
      },
    });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, sourceContent, strictMode, additionalInfo } = await req.json();
    if (!topic || typeof topic !== "string" || topic.trim().length === 0 || topic.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid topic" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const hasSource = sourceContent && typeof sourceContent === "string" && sourceContent.length > 50;
    const truncatedSource = hasSource ? sourceContent.slice(0, 15000) : "";
    const isStrict = hasSource && strictMode === true;

    const strictInstruction = isStrict
      ? `\n\nCRITICAL: You are in STRICT MODE. The roadmap MUST be based EXCLUSIVELY on the provided source material. Do NOT add any topics, concepts, or steps that are not covered in the source material. Every step must directly reference or derive from the content provided. If the source material doesn't cover enough for 8 steps, create fewer steps (minimum 4) but NEVER invent content not in the source.`
      : hasSource
        ? `\n\nIMPORTANT: Use the provided source material to create a highly relevant roadmap aligned with the material. You may supplement with additional knowledge to fill gaps and ensure comprehensive coverage.`
        : "";

    const hasAdditionalInfo = additionalInfo && typeof additionalInfo === "string" && additionalInfo.trim().length > 0;
    const additionalInstruction = hasAdditionalInfo
      ? `\n\nADDITIONAL USER INSTRUCTIONS: The user has provided the following instructions about what to include, exclude, or focus on in the roadmap. Follow these carefully:\n"${additionalInfo.trim().slice(0, 1000)}"`
      : "";

    const systemPrompt = `You are an expert learning roadmap generator. Given a topic${hasSource ? " and source material" : ""}, create a comprehensive learning roadmap with ${isStrict ? "4-12" : "8-12"} steps from beginner to advanced.

Each step must have:
- A clear, specific title
- A detailed description (3-5 sentences)
- A realistic estimated time (e.g. "2-3 hours", "1 week")
- A videoSearchQuery: a YouTube search query to find the best tutorial video for this step (be specific, e.g. "React hooks useState useEffect tutorial for beginners")
- 2-4 suggestedResources: non-video resources (docs, websites, exercises) with REAL URLs from well-known sites (MDN, W3Schools, freeCodeCamp, GeeksforGeeks, official docs, Khan Academy, LeetCode, Exercism, etc.)

For suggestedResources:
- Use REAL URLs you are confident exist on well-known domains
- Types: "website", "docs", "exercise"
- Do NOT include video resources here — videos will be found via live YouTube search

Make the roadmap progressive — each step builds on the previous one.${strictInstruction}${additionalInstruction}`;

    const userContent = hasSource
      ? `Create a learning roadmap for: "${topic.trim()}".\n\nSource material:\n\n${truncatedSource}`
      : `Create a learning roadmap for: "${topic.trim()}". Cover fundamentals to advanced concepts.`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${body.model || 'gemini-2.5-flash'}:generateContent?key=${GEMINI_API_KEY}`,
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
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      estimatedTime: { type: "string" },
                      videoSearchQuery: { type: "string" },
                      suggestedResources: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            url: { type: "string" },
                            type: { type: "string" },
                          },
                          required: ["name", "url", "type"],
                        },
                      },
                    },
                    required: ["title", "description", "estimatedTime", "videoSearchQuery"],
                  },
                },
              },
              required: ["steps"],
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

    const { steps: rawSteps } = JSON.parse(rawText);
    console.log(`AI generated ${rawSteps.length} steps, now searching for real resources...`);

    // ── Phase 2: Live YouTube search + URL verification (all in parallel) ──
    const enrichedSteps = await Promise.all(
      rawSteps.map(async (step: any, i: number) => {
        const [youtubeResults, verifiedResources] = await Promise.all([
          searchYouTube(step.videoSearchQuery, 2),
          (async () => {
            const suggested = step.suggestedResources || [];
            const verifications = await Promise.allSettled(
              suggested.map(async (r: any) => {
                const valid = await verifyUrl(r.url);
                return valid ? r : null;
              })
            );
            return verifications
              .filter((v): v is PromiseFulfilledResult<any> => v.status === "fulfilled" && v.value !== null)
              .map((v) => v.value);
          })(),
        ]);

        const resources = [...youtubeResults, ...verifiedResources];

        console.log(
          `Step ${i + 1} "${step.title}": ${youtubeResults.length} YouTube videos, ${verifiedResources.length}/${(step.suggestedResources || []).length} URLs verified`
        );

        return {
          title: step.title,
          description: step.description,
          estimatedTime: step.estimatedTime,
          resources,
          completed: false,
          order: i,
        };
      })
    );

    // ── Save to database ──
    const { data: topicData, error: topicError } = await supabase
      .from("topics")
      .insert({ title: topic.trim(), user_id: user.id })
      .select("id")
      .single();

    if (topicError) throw topicError;

    const { data: roadmapData, error: roadmapError } = await supabase
      .from("roadmaps")
      .insert({
        topic_id: topicData.id,
        user_id: user.id,
        steps: enrichedSteps,
        progress: 0,
      })
      .select("id")
      .single();

    if (roadmapError) throw roadmapError;

    return new Response(
      JSON.stringify({ topicId: topicData.id, roadmapId: roadmapData.id, steps: enrichedSteps }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-roadmap error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
