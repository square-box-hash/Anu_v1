# Anu — AI Chat Workspace

A purple-themed AI chat interface in the spirit of Claude / ChatGPT / Gemini, with a dense,
rig.ai-style workspace layout. Built with **Next.js (App Router) + TypeScript + Tailwind CSS**,
streaming from Google Gemini.

Live: https://anuv1.vercel.app/

## Features

- **Thinking** — when the model returns reasoning tokens (`includeThoughts`), they stream into a collapsible "Thought process" panel: it opens while the model is thinking, closes when the answer starts, and can be re-opened any time. Set `GEMINI_THINKING=0` to disable.
- **Chat** — real token streaming from Gemini, full markdown (GFM tables, blockquotes, ordered and nested lists, links, headings) with KaTeX for inline `$…$` and display `$$…$$` maths, fenced code blocks with copy, per-message copy and regenerate, stop generation, auto-scroll.
- **Landing** — a serif hero on a near-black violet canvas; the purple glow follows your cursor and text shifts to violet on hover.
- **Chat history** — grouped by Today / Previous 7 days / Older, searchable, rename inline, delete, persisted in `localStorage`. `⌘K` / `Ctrl+K` starts a new chat.
- **File attachments** — paperclip picker and drag-and-drop onto the composer, up to 8 files, chips with size/type, removable before sending. File metadata is sent with the request; the files themselves never leave the browser.
- **Skills (SKILL.md)** — real skill folders under `skills/<name>/`, with YAML frontmatter and supporting files. The model sees only each skill's name and description, then calls `load_skill` / `read_skill_file` when one applies — progressive disclosure, so long instructions cost nothing until used. Quick one-line rules can still be added inline.
- **MCP connectors, for real** — connect Model Context Protocol servers over `stdio`, `http` or `sse`. The server lists each server's tools at request time, hands them to the model as Gemini function declarations, runs whatever the model calls, feeds the results back and loops until the task is done. Every call appears in the transcript as a card with its arguments and output.
- **Harness bridge** — endpoint, bearer token, agent mode, auto-approve tools, max steps per turn and a subagent list, all forwarded with the request.
- **Config** — model picker, temperature, system prompt, clear-all-chats.
- **Responsive** — collapsible sidebar, right context panel (`⌘B`); on phones the panel becomes a drawer that starts closed, the hero reflows to a single column, and the composer respects the safe area.

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

## Skills

A skill is a folder under `skills/` with a `SKILL.md`:

```
skills/analysis-validation/
  SKILL.md                 frontmatter + instructions
  references/checklist.md  supporting file, read on demand
```

```markdown
---
name: analysis-validation
description: Critique the analysis before presenting. Load before the final answer on any RCA or KPI claim.
---

# Analysis validation
...
```

Only `name` and `description` are put in front of the model. The full body is fetched with
`load_skill`, and `references/…` files with `read_skill_file`, so the prompt stays small until a skill
is actually needed. Toggle skills in the **Skills** tab; the enabled ones are the only ones exposed for
that chat. The tab also has *Rescan skills folder* after you add files.

`skills/analysis-validation` ships as a working example.

Inline instructions (name + one line) still exist for throwaway rules — they go into the system prompt
on every turn, so keep them short.

## Tools (MCP)

Tools are real, not mocked. `/api/chat` connects to every enabled server, calls `listTools()`, converts each
JSON Schema into a Gemini function declaration, and runs a function-calling loop:

```
user turn → Gemini streams → functionCall → MCP callTool → functionResponse → Gemini streams again → …
```

The loop is capped by the **Max steps** value in the Harness tab (default 6, hard cap 12).

### Adding a server

The fastest path is the **MCP** tab → *Paste a config*. It takes the same JSON Claude Desktop uses:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "my-http-server": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer …" }
    }
  }
}
```

`command` → stdio transport, `url` → http (or sse when `type: "sse"`). Imported servers are checked
immediately: the panel shows the tool names each one reported, or the error if it could not connect.
The refresh icon re-checks a server at any time; the add form has one-click presets for the common
`npx` servers.

### Local test server

`examples/echo-server.mjs` is a two-tool MCP server you can point the app at:

```
node examples/echo-server.mjs
```

Add it with transport `stdio` and target `node examples/echo-server.mjs` — the model then sees
`echo` and `add`.

### Deployment note

`stdio` servers are spawned as child processes, which works locally and on a normal Node host but
**not** on serverless platforms such as Vercel. On Vercel use `http`/`sse` servers, or self-host the
app if you need `npx`-style servers.

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
3. `lib/providers/gemini.ts` calls `:streamGenerateContent?alt=sse` and yields typed deltas (`text` or `thought`).
4. The route pipes those as newline-delimited JSON (`{"type":"thought","text":"…"}`); the store keeps reasoning and answer text in separate fields as they arrive.

The Gemini key is read server-side only (`GEMINI_API_KEY`) and never reaches the client.

## Project structure

```
app/
  layout.tsx          root layout + metadata
  page.tsx            renders the workspace
  globals.css         theme tokens, grid/glow background, scrollbars
  api/chat/route.ts   POST endpoint: tool loop + streamed events
  api/mcp/route.ts    POST: connect to one MCP server and list its tools
  api/skills/route.ts GET: list the skills bundled in skills/
components/
  ChatApp.tsx         layout shell, drawers, keyboard shortcuts
  Sidebar.tsx         history, search, footer stats
  ChatView.tsx        header, empty state, message list
  Message.tsx         markdown-lite renderer, code blocks, message actions
  Composer.tsx        textarea, attachments, model picker, toolbar
  RightPanel.tsx      Skills / MCP / Harness / Config tabs
  ui.tsx, Icons.tsx   primitives and icon set
lib/
  mcp.ts              MCP client pool: connect, listTools, callTool
  skills.ts           SKILL.md discovery, load_skill / read_skill_file tools
  types.ts            domain types, model list
  store.tsx           state, persistence, streaming, regenerate
  providers/gemini.ts provider adapter (SSE streaming)
```

## Brand and type

- **Logo** — `public/logo.png` (transparent), with `app/icon.png` and `app/apple-icon.png` generated from the same mark for the favicon.
- **Display serif** — Instrument Serif (regular + italic), self-hosted in `app/fonts/` and loaded through `next/font/local`, so there is no build-time network fetch and no layout shift.
- **UI sans** — Inter (variable), also self-hosted.

## Design notes

Near-black canvas (`#050408`) with a faint grid and a cursor-following violet spotlight, panels on
`#100d19`, violet accent `#8b5cf6` / `#a78bfa`. The landing hero pairs a serif headline with an
italic violet-gradient second line, in the spirit of open-harness. Your messages sit in a neutral rounded box on the right;
assistant replies are plain text with copy / regenerate actions beneath, the way Claude renders
a conversation.

## License

MIT © 2026 Gourav Mandi — see [LICENSE](./LICENSE).
