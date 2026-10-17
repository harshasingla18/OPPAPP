# OPPAPP — The Opportunity App

**It's out there. Find it here.**

OPPAPP helps students discover opportunities they qualify for, turn their experiences into compelling applications, and keep moving forward. It connects opportunity discovery directly to application readiness and progress tracking — it isn't another internship directory, résumé generator or chatbot.

Built at **DubHacks '26** · Title track: **Cook Smarter**.

## The demo journey

1. Upload a résumé → Gemini extracts a structured profile, citing the résumé line behind every item.
2. Review and approve — nothing is saved until you check it; items Gemini can't trace to the résumé start unchecked.
3. Discover source-linked opportunities (real programs + clearly labeled demo listings).
4. See your fit: rule-based checks plus a Gemini explanation that separates **confirmed**, **possible**, **unknown** and **gap**.
5. Prepare an application: outreach / research-inquiry emails, statements of interest, experience summaries and form answers.
6. Review: any statement the server can't trace to your profile is flagged and blocks "I submitted this" until you fix or confirm it.
7. Track: Interested → Submitted → Interview → Accepted / Rejected / Withdrawn, with deadlines, follow-ups, notes, search and filters.

## Architecture

```
index.html            single-page app (vanilla JS), data in localStorage
api/health.js         GET  — is Gemini configured? (never returns the key)
api/parse-resume.js   POST — résumé text → profile items with evidence
api/match.js          POST — profile + opportunity → explained fit
api/draft.js          POST — grounded drafts + unsupported-claim flags
lib/gemini.js         server-side Gemini REST client (structured JSON output)
lib/grounding.js      evidence checks + unsupported skill/credential/figure scan
lib/input.js          input cleaning, size limits, untrusted-content wrapper
lib/http.js           method/CORS/rate-limit/error handling (no payload logging)
tests/                node --test unit + API tests (Gemini stubbed)
scripts/dev-server.mjs  local server that mirrors Vercel routing
```

### AI safeguards (and their limits)

- The Gemini key lives only in server environment variables.
- Opportunity text and résumés are wrapped as untrusted data; the model is told not to follow instructions inside them.
- Every AI claim must cite profile evidence; the server verifies citations and downgrades or flags what it can't find.
- A heuristic scan flags skills, awards, publications, grades and figures that aren't in the profile.
- Contact details from résumé parsing must appear verbatim in the résumé or they're dropped.
- Phone numbers and LinkedIn URLs are never sent to the AI.
- The student must review, and the app never sends email or submits applications.

These checks are heuristics: they catch common unsupported claims but can't prove a draft is accurate, which is why human review stays mandatory.

## Run locally

```bash
cp .env.example .env      # add GEMINI_API_KEY
npm run dev               # http://localhost:3000
npm test                  # 17 tests, no network needed
```

Without a key the app still works end to end using rule-based extraction and template drafts, and shows "AI offline".

## Deploy

**Vercel (full app with Gemini):** import this repo at vercel.com/new, add `GEMINI_API_KEY` under Environment Variables, deploy. No build step.

**GitHub Pages (static fallback):** serves `index.html` only. To let it use the AI server, set `<meta name="oppapp-api" content="https://YOUR-APP.vercel.app">` in `index.html` and add the Pages origin to `ALLOWED_ORIGINS` on Vercel.
