---
name: repobase-web-chat
overview: Build a local-first web client (Next.js + Vercel AI SDK patterns) that lets users chat with their indexed repos by exposing repobase engine capabilities as AI tools. V1 will call `@repobase/engine` directly from server routes and store chats locally (sqlite).
todos:
  - id: web-scaffold
    content: Clone `vercel/ai-chatbot` into `packages/web/`, remove .git, update package.json name and add engine dep.
    status: pending
  - id: strip-vercel-infra
    content: Remove Postgres/Redis/Blob/geolocation deps; simplify auth to local-only; switch to direct LLM provider.
    status: pending
  - id: chat-api-stream
    content: Implement streaming `/api/chat` route using AI SDK `streamText` and SSE transform.
    status: pending
  - id: repobase-tools
    content: Expose repobase engine functions as AI tools (list_repos/search/list_files/glob_files/read_file/grep), matching MCP inputs.
    status: pending
  - id: sqlite-persistence
    content: Add sqlite persistence for chats/messages; load context per chatId and save assistant outputs.
    status: pending
  - id: repo-scope-controls
    content: Add UI controls for repo scope and search mode; pass through to server prompt/tools.
    status: pending
---

## Goal

- Add a new **local web client** to this monorepo that provides a chat UI (based on `vercel-ai-chatbot` patterns) and lets the model call **repobase tools** (`list_repos`, `search`, `list_files`, `glob_files`, `read_file`, `grep`) to “chat with your repos”.

## Key reference points (what we learned from `vercel-ai-chatbot`)

- **Tool calling pattern**: tools are defined with `tool({ description, inputSchema, execute })` and passed into `streamText({ tools: { ... } })`.
- **Streaming API route**: `app/(chat)/api/chat/route.ts` uses `streamText` + `createUIMessageStream` + `JsonToSseTransformStream` to stream UI messages and tool calls.
- **Client hook**: `components/chat.tsx` uses `useChat` + `DefaultChatTransport({ api: "/api/chat" })` for streaming.

(See: `vercel-ai-chatbot/app/(chat)/api/chat/route.ts`, `vercel-ai-chatbot/lib/ai/tools/*`, `vercel-ai-chatbot/components/chat.tsx`.)

## Proposed architecture (v1)

- **New package**: `packages/web/` (Next.js App Router).
- **Server-side tool execution**: Next.js route handler imports and uses `@repobase/engine` directly (no MCP hop).
- **Local persistence**: sqlite for chat sessions + messages (minimal tables: `chat`, `message`).
- **Model provider**: use AI SDK provider compatible with local dev. Keep provider config minimal and environment-driven (no Vercel-only assumptions).

## Implementation outline

### 1) Scaffold by cloning `vercel/ai-chatbot`

```bash
# From repo root
git clone --depth 1 https://github.com/vercel/ai-chatbot.git packag


es/web

rm -rf packages/web/.git  # Remove its git history
```

- Update `packages/web/package.json`:
  - Change `"name"` to `"@repobase/web"`
  - Add `"@repobase/engine": "workspace:*"` dependency
- Wire root workspace: add `"web": "bun run --cwd packages/web dev"` script to root `package.json`

### 2) Strip out Vercel-specific infrastructure (keep chat UI + streaming)

**Remove / replace:**

- `lib/db/` postgres/drizzle setup → replace with sqlite (see step 4)
- `@vercel/blob` file uploads → remove for v1
- `@vercel/functions` geolocation → remove or stub
- Redis resumable streams → remove (optional enhancement later)
- Auth.js full setup → simplify to anonymous/local-only for v1
- Vercel AI Gateway provider → switch to direct OpenAI/Anthropic provider via env var

**Keep:**

- `components/chat.tsx`, `components/messages.tsx`, `components/multimodal-input.tsx` (core chat UI)
- `app/(chat)/api/chat/route.ts` structure (streaming pattern)
- `lib/ai/tools/` pattern (we'll replace tool implementations)
- `useChat` hook wiring
- shadcn/ui components + Tailwind styling

### 3) Implement the chat API route with repobase tools

- Create `packages/web/app/api/chat/route.ts`:

  - Parse request body: `id`, `messages`, and optionally selected repo(s)/mode.
  - Call `streamText({ model, system, messages, tools })`.
  - Stream response via `JsonToSseTransformStream()`.

- Implement tool set mirroring MCP server inputs/outputs (so prompts and usage are consistent with other clients):

  - `list_repos()`
  - `search({ query, mode, limit, repo })`
  - `list_files({ repo, path })`
  - `glob_files({ pattern, repo, limit })`
  - `read_file({ repo, path, offset, limit, lineNumbers })`
  - `grep({ pattern, repo, ignoreCase, contextBefore, contextAfter, context, filesWithMatches, count, fileType, limit })`

- Tool implementation detail:
  - Use `@repobase/engine` services similarly to `packages/mcp-server/src/main.ts` (it already shows how to build a runtime and call engine/indexer).
  - Keep JSON-returned tool outputs compact but structured (the model can reason over structure better than raw text).

### 4) Add sqlite persistence (v1)

- Use a lightweight sqlite approach (either a minimal sqlite driver or a small ORM) and store:
  - `chat(id, createdAt, title?)`
  - `message(id, chatId, role, content/json, createdAt)`
- On each `/api/chat` request:
  - Load prior messages for `chatId`
  - Append new user message
  - After stream completes, persist assistant/tool result messages

### 5) UX for “chat with repos”

- Add a small selector in the UI:
  - **Scope**: all repos vs selected repo
  - **Mode**: hybrid/keyword/semantic (maps to `SearchMode`)
- Include these as request params so the system prompt can instruct the model how to use tools and what scope to default to.

### 6) Safety + guardrails (local)

- Add a system prompt section that:
  - Encourages using `search` then `read_file` before making claims.
  - Limits `read_file` size via `limit` defaults.
  - Avoids leaking local paths unless requested.
- Add basic rate limiting or concurrency limits per request (optional for v1).

### 7) Acceptance criteria for v1

- From the web UI, user can:
  - Ask “What does X do?” and the assistant uses repobase tools to find code and answer.
  - Restrict to a single repo and get relevant results.
  - Open and quote file excerpts via `read_file`.
- Works entirely locally with sqlite persistence.

## Likely files to add/change

- **Add**: `packages/web/` (Next.js app)
- **Change**: root `package.json` scripts/workspaces (if needed) to run web app
- **Reuse patterns from**:
  - `packages/mcp-server/src/main.ts` for tool schemas + engine runtime wiring
  - `vercel-ai-chatbot/app/(chat)/api/chat/route.ts` for streaming and tool calling patterns

## Execution order (recommended)

1. Scaffold `packages/web` and verify it runs.
2. Implement `/api/chat` with a hardcoded “echo” model response to confirm streaming works.
3. Wire in repobase tool implementations (start with `search` + `read_file`).
4. Add UI controls for repo scope + mode.
5. Add sqlite persistence.
6. Polish prompts + defaults; add a small “tool output viewer” in dev mode (optional).