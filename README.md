# Nebula — AI Chat Workspace

A purple-themed AI chat interface in the spirit of Claude / ChatGPT / Gemini, with a dense,
rig.ai-style workspace layout. Built with **Next.js (App Router) + TypeScript + Tailwind CSS**.

The UI is complete and interactive. **The model is intentionally not wired up** — every turn
returns a demo reply so you can exercise the interface without credentials. Adding a Gemini key
turns it into a real chat app (see *Going live* below).

## Features

- **Chat surface** — streaming-style replies, markdown-lite rendering (bold, italics, inline code, fenced code blocks with copy), per-message copy, stop generation, auto-scroll.
- **Chat history** — grouped by Today / Previous 7 days / Older, searchable, rename inline, delete, persisted in `localStorage`. `⌘K` / `Ctrl+K` starts a new chat.
- **File attachments** — paperclip picker and drag-and-drop onto the composer, up to 8 files, chips with size/type, removable before sending. Files never leave the browser.
- **Skills** — five built-in instruction packs plus custom skills you can add and remove; enabled skills are sent with each request and shown in the header.
- **MCP connectors** — add Model Context Protocol servers over `stdio`, `http` or `sse`, toggle them live, see tool counts and connection status.
- **Harness bridge** — point the app at an agent harness endpoint (OpenHarness-style): bearer token, agent mode, auto-approve tools, max steps per turn, subagent list and a trace preview.
- **Config** — model picker (Gemini 2.5 Pro / Flash / Flash Lite, 2.0 Flash), temperature, system prompt, clear-all-chats.
- **Responsive** — collapsible sidebar, right context panel (`⌘B`), mobile drawers.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm run typecheck            # tsc --noEmit
```

## Going live with Gemini

1. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`.
2. Restart the dev server. `app/api/chat/route.ts` stops using demo output as soon as a key is
   present (`NEBULA_DEMO=1` forces demo mode back on).
3. The adapter lives in `lib/providers/gemini.ts`. It calls `generateContent` today; swap in
   `:streamGenerateContent?alt=sse` to stream real tokens into the same UI.

The request contract between the browser and the route is `ChatRequest` in `lib/types.ts`, so a
different provider only needs a new file under `lib/providers/`.

## Project structure

```
app/
  layout.tsx          root layout + metadata
  page.tsx            renders the workspace
  globals.css         theme tokens, grid/glow background, scrollbars
  api/chat/route.ts   POST endpoint: demo reply or Gemini call
components/
  ChatApp.tsx         layout shell, drawers, keyboard shortcuts
  Sidebar.tsx         history, search, footer stats
  ChatView.tsx        header, empty state, message list
  Message.tsx         markdown-lite renderer, code blocks, attachments
  Composer.tsx        textarea, attachments, model picker, toolbar
  RightPanel.tsx      Skills / MCP / Harness / Config tabs
  ui.tsx, Icons.tsx   primitives and icon set
lib/
  types.ts            domain types, model list, seed data
  store.tsx           state, persistence, send + streaming
  demo.ts             demo reply builder
  providers/gemini.ts provider adapter
```

## Design notes

Near-black canvas (`#07060b`) with violet radial glows and a faint grid, panels on `#100d19`,
violet accent `#8b5cf6` / `#a78bfa`. Type scale is tight and small (11–14px) with monospace
labels for metadata, in the spirit of rig.ai's technical density and open-harness's purple.

## License

MIT © 2026 Gourav Mandi — see [LICENSE](./LICENSE).
