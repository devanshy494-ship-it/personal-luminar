import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractVideoId(url: string): string | null {
  const cleaned = url.trim();
  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.has("v")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
  } catch {}
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\n/g, " ")
    .trim();
}

function encodeTranscriptParams(videoId: string): string {
  const videoIdBytes = new TextEncoder().encode(videoId);
  const inner = new Uint8Array(2 + videoIdBytes.length);
  inner[0] = 0x0a;
  inner[1] = videoIdBytes.length;
  inner.set(videoIdBytes, 2);

  const outer = new Uint8Array(2 + inner.length);
  outer[0] = 0x0a;
  outer[1] = inner.length;
  outer.set(inner, 2);

  let binary = '';
  for (let i = 0; i < outer.length; i++) {
    binary += String.fromCharCode(outer[i]);
  }
  return btoa(binary);
}

async function tryInnertubeGetTranscript(videoId: string): Promise<string | null> {
  console.log("Trying Innertube get_transcript endpoint...");
  
  const params = encodeTranscriptParams(videoId);
  
  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240313.05.00",
        hl: "en",
        gl: "US",
      }
    },
    params,
  };

  try {
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/get_transcript?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20240313.05.00",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.log(`get_transcript returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    const actions = data?.actions;
    if (!actions || !Array.isArray(actions)) {
      console.log("No actions in get_transcript response");
      return null;
    }

    const transcriptAction = actions.find((a: any) => 
      a?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments
    );

    let segments: any[] | undefined;
    
    if (transcriptAction) {
      segments = transcriptAction.updateEngagementPanelAction.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer.initialSegments;
    }

    if (!segments) {
      for (const action of actions) {
        const body = action?.updateEngagementPanelAction?.content?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroups;
        if (body && Array.isArray(body)) {
          const texts = body.map((g: any) => {
            const cues = g?.transcriptCueGroupRenderer?.cues;
            if (!cues) return '';
            return cues.map((c: any) => 
              c?.transcriptCueRenderer?.cue?.simpleText || ''
            ).join(' ');
          }).filter(Boolean);
          
          if (texts.length > 0) {
            const result = texts.join(' ').trim();
            console.log(`Got transcript via Innertube cueGroups (${result.length} chars)`);
            return result;
          }
        }
      }
    }

    if (segments && segments.length > 0) {
      const texts = segments.map((seg: any) => {
        const snippet = seg?.transcriptSegmentRenderer?.snippet?.runs;
        if (snippet && Array.isArray(snippet)) {
          return snippet.map((r: any) => r.text || '').join('');
        }
        return '';
      }).filter(Boolean);

      if (texts.length > 0) {
        const result = texts.join(' ').trim();
        console.log(`Got transcript via Innertube segments (${result.length} chars)`);
        return result;
      }
    }

    console.log("Could not extract text from get_transcript response structure");
    return null;
  } catch (e) {
    console.error("Innertube get_transcript error:", e);
    return null;
  }
}

async function tryWatchPageScraping(videoId: string): Promise<string | null> {
  console.log("Trying watch page scraping with consent bypass...");
  
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const pageResponse = await fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+634; GPS=1",
      },
    });

    if (!pageResponse.ok) {
      console.log(`Watch page returned ${pageResponse.status}`);
      return null;
    }

    const html = await pageResponse.text();

    let captionTracks: any[] | null = null;

    const captionMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])\s*[,}]/s);
    if (captionMatch) {
      try {
        captionTracks = JSON.parse(captionMatch[1]);
        console.log("Found captionTracks via direct regex");
      } catch {}
    }

    if (!captionTracks) {
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script|\n)/s);
      if (playerMatch) {
        try {
          const player = JSON.parse(playerMatch[1]);
          captionTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (captionTracks) console.log("Found captionTracks via ytInitialPlayerResponse");
        } catch {}
      }
    }

    if (!captionTracks) {
      const urlMatch = html.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
      if (urlMatch) {
        const baseUrl = urlMatch[1].replace(/\\u0026/g, '&');
        console.log("Found timedtext URL directly in HTML");
        return await fetchCaptionFromUrl(baseUrl);
      }
    }

    if (!captionTracks || captionTracks.length === 0) {
      console.log("No caption tracks found in page HTML");
      return null;
    }

    const enTrack = captionTracks.find((t: any) =>
      t.languageCode === "en" || t.languageCode?.startsWith("en")
    );
    const track = enTrack || captionTracks[0];
    let captionUrl = track.baseUrl;

    if (!captionUrl) return null;

    captionUrl = captionUrl.replace(/\\u0026/g, '&');
    console.log(`Using caption track: ${track.languageCode}`);

    return await fetchCaptionFromUrl(captionUrl);
  } catch (e) {
    console.error("Watch page scraping error:", e);
    return null;
  }
}

async function fetchCaptionFromUrl(captionUrl: string): Promise<string | null> {
  try {
    const json3Url = captionUrl + (captionUrl.includes('?') ? '&' : '?') + 'fmt=json3';
    const res = await fetch(json3Url);
    if (res.ok) {
      const data = await res.json();
      const events = data?.events;
      if (events && Array.isArray(events)) {
        const segments: string[] = [];
        for (const event of events) {
          if (event.segs) {
            for (const seg of event.segs) {
              if (seg.utf8 && seg.utf8.trim() !== "\n") {
                segments.push(seg.utf8.trim());
              }
            }
          }
        }
        const text = segments.join(" ");
        if (text.length > 50) {
          console.log(`Got transcript via json3 (${text.length} chars)`);
          return text;
        }
      }
    }
  } catch {}

  try {
    const res = await fetch(captionUrl);
    if (res.ok) {
      const xml = await res.text();
      const textSegments: string[] = [];
      const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        const text = decodeHtmlEntities(match[1]);
        if (text) textSegments.push(text);
      }
      const result = textSegments.join(" ");
      if (result.length > 50) {
        console.log(`Got transcript via XML (${result.length} chars)`);
        return result;
      }
    }
  } catch {}

  return null;
}

async function tryInnertubePlayer(videoId: string): Promise<string | null> {
  console.log("Trying Innertube player endpoint...");
  
  try {
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240313.05.00",
              hl: "en",
              gl: "US",
            }
          },
          videoId,
        }),
      }
    );

    if (!response.ok) {
      console.log(`Player endpoint returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) {
      console.log("No caption tracks from player endpoint");
      return null;
    }

    const enTrack = tracks.find((t: any) =>
      t.languageCode === "en" || t.languageCode?.startsWith("en")
    );
    const track = enTrack || tracks[0];

    if (!track.baseUrl) return null;
    console.log(`Found caption track via player: ${track.languageCode}`);

    return await fetchCaptionFromUrl(track.baseUrl);
  } catch (e) {
    console.error("Innertube player error:", e);
    return null;
  }
}

async function fetchTranscript(videoId: string): Promise<string> {
  const method1 = await tryInnertubeGetTranscript(videoId);
  if (method1 && method1.length > 50) return method1;

  const method2 = await tryInnertubePlayer(videoId);
  if (method2 && method2.length > 50) return method2;

  const method3 = await tryWatchPageScraping(videoId);
  if (method3 && method3.length > 50) return method3;

  throw new Error("TRANSCRIPT_UNAVAILABLE");
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await res.json();
    return data.title || `YouTube Video ${videoId}`;
  } catch {
    return `YouTube Video ${videoId}`;
  }
}

async function cleanupTranscript(rawTranscript: string, videoTitle: string): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("VITE_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return rawTranscript;

  const truncated = rawTranscript.length > 12000 ? rawTranscript.slice(0, 12000) : rawTranscript;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-3.1-flash-lite'}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `You are a transcript editor. Fix grammar, punctuation, capitalization, and obvious speech-to-text errors in this YouTube video transcript. The video is titled "${videoTitle}". Keep ALL the original meaning and content — only fix errors. Add proper paragraph breaks where topics change. Do NOT summarize, skip, or add content. Return ONLY the cleaned transcript text.` }] },
          contents: [{ parts: [{ text: truncated }] }],
        }),
      }
    );

    if (!response.ok) return rawTranscript;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || rawTranscript;
  } catch {
    return rawTranscript;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { url, manualTranscript } = body;

    if (manualTranscript && manualTranscript.trim().length > 50) {
      const videoId = url ? extractVideoId(url) : null;
      const title = videoId ? await fetchVideoTitle(videoId) : "Manual Transcript";
      const transcript = await cleanupTranscript(manualTranscript.trim(), title);
      return new Response(
        JSON.stringify({ transcript, title, videoId, charCount: transcript.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Invalid YouTube URL. Please paste a valid YouTube video link." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing YouTube video: ${videoId}`);

    const [rawTranscript, title] = await Promise.all([
      fetchTranscript(videoId),
      fetchVideoTitle(videoId),
    ]);

    const transcript = await cleanupTranscript(rawTranscript, title);

    return new Response(
      JSON.stringify({ transcript, title, videoId, charCount: transcript.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("youtube-transcript error:", e);
    const isUnavailable = e instanceof Error && e.message === "TRANSCRIPT_UNAVAILABLE";
    const message = isUnavailable
      ? "Could not extract transcript automatically. Please paste the transcript manually using the text field below."
      : e instanceof Error ? e.message : "Failed to extract transcript";
    return new Response(
      JSON.stringify({ error: message, fallbackToManual: isUnavailable }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
