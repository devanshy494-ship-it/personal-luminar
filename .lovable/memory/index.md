AI Learning Platform — Design & Decisions

## Design: Light & Editorial
- Cream/warm white background, rich charcoal text
- Serif display font: Playfair Display
- Body font: DM Sans
- Warm amber/gold accent for CTAs
- Generous whitespace, card-based layouts

## Platform: Web App + PWA
- Responsive web app (works on all devices)
- PWA install support (Add to Home Screen)
- No native mobile app

## AI Backend: Google Gemini API
- All AI calls use Google Gemini API directly (gemini-1.5-flash model)
- API key stored as backend secret: VITE_GEMINI_API_KEY
- Endpoint: generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
- Structured output via generationConfig.responseSchema (JSON mode)
- Response parsing: data.candidates[0].content.parts[0].text -> JSON.parse()
- NO Lovable AI gateway — removed entirely

## User Profiles: Minimal
- Just name + email, no public profile

## Phase 1 Scope
- Landing, Auth (email), Dashboard, Topic Input, Roadmap View, Flashcards, Quiz
- DB: profiles, topics, roadmaps, flashcards, quiz_results
- AI edge functions: generate-roadmap, generate-flashcards, generate-quiz
- PWA manifest + install prompt

## Phase 2 (NOT now)
- File uploads / PDF parsing
- Settings page
- Social features
- Spaced repetition algorithm
