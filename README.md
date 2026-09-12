# Forgot AI — Chrome Extension V1

Save highlighted text or on-page content (tweets, AI responses, articles) to
Forgot AI in one click. Manifest V3, Vite + CRXJS + React + TypeScript, styled
with Tailwind inside a Shadow Root so no host site CSS bleeds in or out.

## Repo layout

```
/app
├── extension/          Chrome MV3 extension (build target)
├── backend/            FastAPI + MongoDB (drop-in for InsForge; run locally
│                       and point the extension at it OR deploy)
└── insforge/           Ready-to-deploy InsForge migrations + server function
    ├── 01_schema.sql
    ├── 02_rls.sql
    └── server_functions/process_memory.ts
```

## Build & load the extension

```bash
cd /app/extension
yarn install
yarn build         # outputs dist/
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and point at `/app/extension/dist`

To point at a different backend, set `VITE_BACKEND_URL` before build:
```bash
VITE_BACKEND_URL=https://your.insforge.app yarn build
```

## Backend

The bundled FastAPI backend implements the exact API surface the extension
expects (`/api/auth/{signup,login,logout,me}`, `/api/memories`). It performs
silent dedupe on `(user_id, source_url, content_hash)` and runs AI enrichment
in the background via Claude Haiku 4.5 (Emergent Universal Key, key server-side
only — never shipped in the extension).

## InsForge deploy

1. Create a new InsForge project.
2. Run `01_schema.sql` then `02_rls.sql` in the SQL editor.
3. Deploy `server_functions/process_memory.ts` as a server function.
4. Set secrets: `OLLAMA_ENDPOINT`, `OLLAMA_API_KEY`, `OLLAMA_MODEL`.
5. Point the extension at your InsForge project URL via `VITE_BACKEND_URL`.
   (If you're using the InsForge SDK auth flow instead of the bundled JWT
   backend, swap `src/lib/api.ts` to call the InsForge JS SDK — everything
   else in the extension stays untouched.)

## Features

- **Mode A** — highlight-triggered floating pill (Shadow DOM), viewport aware.
- **Mode B** — per-item pill on X, ChatGPT, Claude, Gemini, Perplexity, and a
  Readability-style generic article fallback.
- Priority rule: Mode A hides all Mode B pills while a selection exists.
- Silent dedupe, `Saving… → ✓ Saved` feedback, error state with retry.
- Auth tab (email + password), persistent session in `chrome.storage.local`.
- Minimal popup: identity, Open Forgot AI, Log out.
- Background AI enrichment: title, summary, topics, keywords, entities, with
  one auto-retry then `failed`.

## Permissions

`storage`, `activeTab`, `scripting`, `tabs`, host `<all_urls>` — required
because Mode A must work on any page the user highlights on. If you want to
narrow to the 5 supported sites only, edit `manifest.config.ts` and re-build.
