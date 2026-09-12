# Forgot AI — PRD

## Problem statement (verbatim)
Manifest V3 Chrome extension that saves highlighted text or on-page content
(posts / AI responses / articles) to Forgot AI in one click, with server-side
AI enrichment. Two capture modes:
- **Mode A** — floating "Save to Forgot AI" pill near a text selection.
- **Mode B** — per-item Save pill on X, ChatGPT, Claude, Gemini, Perplexity,
  plus a Readability-style generic article fallback.
Silent dedupe on `(user_id, source_url, content_hash)`. AI enrichment
(title/summary/topics/keywords/entities) runs server-side after original save,
with 1 auto-retry then `failed` on second miss.

## User choices (Jan 2026)
- Backend: FastAPI + MongoDB scaffold that mimics InsForge; ready-to-deploy
  InsForge SQL + server function shipped in `/app/insforge/`.
- AI: Claude Haiku 4.5 via Emergent Universal Key (`claude-haiku-4-5-20251001`).
- Host permission: `<all_urls>` so Mode A works anywhere.
- No keyboard shortcut. Minimal dark pill UI. Popup shows identity + logout only.

## Architecture
- `/app/extension/` — Vite + CRXJS + React + TypeScript + Tailwind extension.
  Content script uses a Shadow-DOM pill (no React on host pages) for zero
  style bleed. Adapters: `x`, `chatgpt`, `claude`, `gemini`, `perplexity`,
  `genericArticle`. Service worker owns auth session + save routing.
- `/app/backend/` — FastAPI + MongoDB, endpoints `/api/auth/{signup,login,logout,me}`
  and `/api/memories(/{id})`. Background task enriches via Emergent LLM key.
  Unique index on `(user_id, source_url, content_hash)` for silent dedupe.
- `/app/insforge/` — 01_schema.sql, 02_rls.sql, server_functions/process_memory.ts
  for real InsForge deployment.

## Delivered (Jan 2026)
- Phase 1 Foundations: MV3 scaffold, InsForge migrations, auth tab, session
  persistence in `chrome.storage.local`, popup shell.
- Phase 2 Mode A: selection watcher, viewport-aware Shadow-DOM pill,
  editable/contenteditable guards, save states, silent dedupe.
- Phase 3 Mode B core: adapter interface, injection engine, generic article
  fallback, Mode A > Mode B priority rule (Mode B hides while a selection
  is active).
- Phase 4 Site adapters: X, ChatGPT, Claude, Gemini, Perplexity — each with
  visible-item injection + text extraction.
- Phase 5 AI pipeline: background enrichment with structured JSON parsing +
  1 auto-retry + `failed` fallback.
- Phase 6 Hardening: viewport-edge positioning, MutationObserver + rAF
  throttling, SPA-navigation re-hydration, no localhost/keys in the built
  extension.

## Verified
- 30/30 backend tests pass (auth, memory, dedupe variants, cross-user
  isolation, capture_type validation, live Claude Haiku 4.5 enrichment).
- `yarn build` in `/app/extension/` produces a clean `dist/` for chrome
  Load-unpacked install.

## Backlog / next tasks
- P1: popup "recent saves" list (optional — spec default is identity + logout).
- P1: keyboard shortcut `Alt+S` (optional).
- P1: option to scope Mode A to the 5 supported sites only (config toggle).
- P2: adapter drift monitoring / one adapter test fixture per site.
- P2: real InsForge SDK swap in `src/lib/api.ts` for teams choosing InsForge
  auth over the bundled JWT backend.
