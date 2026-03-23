import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function searchYouTube(query: string, maxResults = 3): Promise<Array<{ name: string; url: string }>> {
  try {
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20240313.05.00",
        },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: "2.20240313.05.00", hl: "en", gl: "US" } },
          query,
        }),
      }
    );
    if (!response.ok) return [];
    const data = await response.json();
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) return [];
    const results: Array<{ name: string; url: string }> = [];
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;
      for (const item of items) {
        const vid = item?.videoRenderer;
        if (!vid?.videoId) continue;
        const title = vid.title?.runs?.[0]?.text || "YouTube Video";
        results.push({ name: title, url: `https://www.youtube.com/watch?v=${vid.videoId}` });
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }
    return results;
  } catch {
    return [];
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkChecker/1.0)" } });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topicTitle, stepTitle, stepDescription, stepIndex, totalSteps, allSteps, generationContext } = await req.json();
    if (!topicTitle || !stepTitle) {
      return new Response(JSON.stringify({ error: "Missing topicTitle or stepTitle" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const systemPrompt = `You are a learning resource curator. Given a topic and step within a structured learning roadmap, provide comprehensive extra learning materials categorized into: websites (tutorials, articles, documentation), books (real published books with authors), apps (learning apps, tools, IDEs, platforms), and other (podcasts, communities, forums, cheat sheets, checklists).

For each resource provide:
- name: descriptive title
- url: a REAL URL you are confident exists (use well-known domains: MDN, W3Schools, freeCodeCamp, GeeksforGeeks, official docs, Amazon for books, etc.)
- description: 1-sentence description of why it's useful for THIS specific step

Also provide a youtubeSearchQuery for finding relevant video tutorials.

Provide 3-5 items per category. Only include resources that are genuinely relevant and helpful for this specific step.`;

    const userPrompt = `Topic: "${topicTitle}"\nStep: "${stepTitle}" (Step ${stepIndex !== undefined ? stepIndex + 1 : '?'} of ${totalSteps || '?'})\n${stepDescription ? `Description: "${stepDescription}"` : ""}\n${allSteps ? `\nFull roadmap steps:\n${allSteps.map((s: any) => `${s.index + 1}. ${s.title}: ${s.description}`).join('\n')}` : ''}\n${generationContext ? `\nAdditional learning context: ${JSON.stringify(generationContext)}` : ''}\n\nProvide categorized extra learning materials specifically relevant to this step.`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${body.model || 'gemini-3.1-flash-lite-preview'}:generateContent?key=${GEMINI_API_KEY}`,
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
                youtubeSearchQuery: { type: "string" },
                websites: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, url: { type: "string" }, description: { type: "string" } },
                    required: ["name", "url", "description"],
                  },
                },
                books: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, url: { type: "string" }, description: { type: "string" } },
                    required: ["name", "url", "description"],
                  },
                },
                apps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, url: { type: "string" }, description: { type: "string" } },
                    required: ["name", "url", "description"],
                  },
                },
                other: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, url: { type: "string" }, description: { type: "string" } },
                    required: ["name", "url", "description"],
                  },
                },
              },
              required: ["youtubeSearchQuery", "websites", "books", "apps", "other"],
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

    const materials = JSON.parse(rawText);

    const allUrls = [
      ...materials.websites.map((r: any) => ({ ...r, category: "websites" })),
      ...materials.books.map((r: any) => ({ ...r, category: "books" })),
      ...materials.apps.map((r: any) => ({ ...r, category: "apps" })),
      ...materials.other.map((r: any) => ({ ...r, category: "other" })),
    ];

    const [youtubeResults, ...verificationResults] = await Promise.all([
      searchYouTube(materials.youtubeSearchQuery, 4),
      ...allUrls.map(async (item: any) => {
        const valid = await verifyUrl(item.url);
        return { ...item, valid };
      }),
    ]);

    const verified: Record<string, any[]> = { websites: [], books: [], apps: [], other: [] };
    for (const item of verificationResults as any[]) {
      if (item.valid) {
        verified[item.category].push({ name: item.name, url: item.url, description: item.description });
      }
    }

    const videos = youtubeResults.map((v: any) => ({ name: v.name, url: v.url, description: "YouTube tutorial video" }));

    console.log(`Extra materials: ${videos.length} videos, ${verified.websites.length} websites, ${verified.books.length} books, ${verified.apps.length} apps, ${verified.other.length} other`);

    return new Response(
      JSON.stringify({ videos, ...verified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-extra-materials error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
