# Anu — AI Chat Workspace

A purple-themed AI chat interface in the spirit of Claude / ChatGPT / Gemini, with a dense,
rig.ai-style workspace layout. Built with **Next.js (App Router) + TypeScript + Tailwind CSS**,
streaming from Google Gemini.

Live: https://anuv1.vercel.app/

## Features

- **Chat** — real token streaming from Gemini, full markdown (GFM tables, blockquotes, ordered and nested lists, links, headings) with KaTeX for inline `$…$` and display `$$…$$` maths, fenced code blocks with copy, per-message copy and regenerate, stop generation, auto-scroll.
- **Landing** — a serif hero on a near-black violet canvas; the purple glow follows your cursor and text shifts to violet on hover.
- **Chat history** — grouped by Today / Previous 7 days / Older, searchable, rename inline, delete, persisted in `localStorage`. `⌘K` / `Ctrl+K` starts a new chat.
- **File attachments** — paperclip picker and drag-and-drop onto the composer, up to 8 files, chips with size/type, removable before sending. File metadata is sent with the request; the files themselves never leave the browser.
- **Skills** — instruction packs you add yourself; enabled skills are sent with each request and shown in the header. Nothing is pre-installed.
- **MCP connectors** — add Model Context Protocol servers over `stdio`, `http` or `sse` and toggle them per session. Nothing is pre-connected.
- **Harness bridge** — endpoint, bearer token, agent mode, auto-approve tools, max steps per turn and a subagent list, all forwarded with the request.
- **Config** — model picker, temperature, system prompt, clear-all-chats.
- **Responsive** — collapsible sidebar, right context panel (`⌘B`), mobile drawers.

## Run it

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm run typecheck            # tsc --noEmit
```

## Model

The workspace ships with **`gemini-4-hydrogen`** as its model (`lib/types.ts` → `DEFAULT_MODEL`).
Resolution order on the server is: request model → `GEMINI_MODEL` env → `DEFAULT_MODEL`.

To offer more than one model in the picker, set `NEXT_PUBLIC_GEMINI_MODELS` to a comma separated
list at build time (first entry is the default):

```
NEXT_PUBLIC_GEMINI_MODELS=gemini-4-hydrogen,gemini-4-hydrogen-pro
```

## How a turn flows

1. `components/Composer.tsx` → `lib/store.tsx` `send()` appends your message and a pending reply.
2. `POST /api/chat` receives a typed `ChatRequest` (messages, model, system prompt, temperature, attachments, enabled skills, MCP servers, harness config).
3. `lib/providers/gemini.ts` calls `:streamGenerateContent?alt=sse` and yields text deltas.
4. The route pipes those deltas to the browser as a plain text stream; the store appends each chunk to the message as it arrives.

The Gemini key is read server-side only (`GEMINI_API_KEY`) and never reaches the client.

## Project structure

```
app/
  layout.tsx          root layout + metadata
  page.tsx            renders the workspace
  globals.css         theme tokens, grid/glow background, scrollbars
  api/chat/route.ts   POST endpoint, streams provider deltas
components/
  ChatApp.tsx         layout shell, drawers, keyboard shortcuts
  Sidebar.tsx         history, search, footer stats
  ChatView.tsx        header, empty state, message list
  Message.tsx         markdown-lite renderer, code blocks, message actions
  Composer.tsx        textarea, attachments, model picker, toolbar
  RightPanel.tsx      Skills / MCP / Harness / Config tabs
  ui.tsx, Icons.tsx   primitives and icon set
lib/
  types.ts            domain types, model list
  store.tsx           state, persistence, streaming, regenerate
  providers/gemini.ts provider adapter (SSE streaming)
```

## Design notes

Near-black canvas (`#050408`) with a faint grid and a cursor-following violet spotlight, panels on
`#100d19`, violet accent `#8b5cf6` / `#a78bfa`. The landing hero pairs a serif headline with an
italic violet-gradient second line, in the spirit of open-harness. Your messages sit in a neutral rounded box on the right;
assistant replies are plain text with copy / regenerate actions beneath, the way Claude renders
a conversation.

## License

MIT © 2026 Gourav Mandi — see [LICENSE](./LICENSE).
