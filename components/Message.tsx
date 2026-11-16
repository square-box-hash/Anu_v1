"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Message as Msg, ToolCall } from "@/lib/types";
import { useSpeech } from "@/lib/speech";
import { useStore } from "@/lib/store";
import { cx, formatBytes } from "@/lib/utils";
import { focusComposer } from "./Composer";
import {
  ArrowRight,
  Check,
  Chevron,
  Copy,
  Cpu,
  File,
  Image as ImageIcon,
  Refresh,
  Sparkles,
  Stop,
  Terminal,
  Volume2,
  X,
} from "./Icons";

/** Models sometimes emit \( … \) and \[ … \]; normalise to $ … $ / $$ … $$. */
function normalizeMath(input: string): string {
  return input
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body.trim()}$`);
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-black/50">
      <div className="flex items-center justify-between border-b border-line bg-white/[0.02] px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{lang || "code"}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted transition-colors hover:bg-white/5 hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-accent-pale/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}


function ThinkingBlock({
  text,
  streaming,
  hasContent,
}: {
  text: string;
  streaming: boolean;
  hasContent: boolean;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  const auto = streaming && !hasContent;
  const open = manual ?? auto;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-line bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setManual(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Sparkles className={cx("h-3.5 w-3.5", streaming ? "animate-pulse text-accent-soft" : "text-faint")} />
        <span className="text-[11.5px] font-medium text-muted">
          {streaming ? "Thinking…" : "Thought process"}
        </span>
        <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/70">
          {streaming ? "live" : "done"}
        </span>
        <Chevron className={cx("h-3 w-3 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="max-h-[280px] overflow-y-auto border-t border-line px-3 py-2.5 text-[12.5px] leading-[1.7] whitespace-pre-wrap text-faint">
          {text}
        </div>
      ) : null}
    </div>
  );
}


function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(Boolean(call.pending));
  const status = call.pending ? "running" : call.ok ? "ok" : "error";
  const tone =
    status === "running" ? "text-accent-soft" : status === "ok" ? "text-emerald-300/90" : "text-rose-300/90";

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-line bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Terminal className={cx("h-3.5 w-3.5", status === "running" ? "animate-pulse text-accent-soft" : "text-faint")} />
        <span className="truncate font-mono text-[11.5px] text-ink">{call.name}</span>
        <span className="shrink-0 rounded border border-line px-1 font-mono text-[8.5px] uppercase tracking-wider text-faint">
          {call.server}
        </span>
        <span className={cx("ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em]", tone)}>{status}</span>
        <Chevron className={cx("h-3 w-3 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          <div>
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/80">arguments</div>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-accent-pale/85">
              {JSON.stringify(call.args ?? {}, null, 2)}
            </pre>
          </div>
          {call.content || call.error ? (
            <div>
              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/80">result</div>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-ink/80">
                {call.error ?? call.content}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const components: Components = {
  pre({ children }) {
    const child = React.Children.toArray(children)[0];
    if (React.isValidElement(child)) {
      const props = child.props as { className?: string; children?: React.ReactNode };
      const lang = /language-([\w-]+)/.exec(props.className ?? "")?.[1] ?? "";
      const code = String(props.children ?? "").replace(/\n$/, "");
      return <CodeBlock lang={lang} code={code} />;
    }
    return <pre className="my-3 overflow-x-auto rounded-xl border border-line bg-black/50 p-3">{children}</pre>;
  },
  code({ className, children }) {
    return (
      <code className="rounded border border-line bg-white/[0.06] px-1.5 py-[1px] font-mono text-[12.5px] text-accent-pale">
        {children}
      </code>
    );
  },
  p({ children }) {
    return <p className="my-2 text-[14.5px] leading-[1.75] text-ink/90">{children}</p>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-ink">{children}</strong>;
  },
  em({ children }) {
    return <em className="text-ink/80">{children}</em>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-accent-soft underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent-pale"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="my-2 space-y-1.5 pl-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:text-accent-soft/70">{children}</ol>;
  },
  li({ children }) {
    return (
      <li className="text-[14.5px] leading-[1.7] text-ink/90 marker:text-accent-soft/70 [ul>&]:flex [ul>&]:gap-2">
        <span className="hidden [ul>&]:mt-[9px] [ul>&]:block [ul>&]:h-1 [ul>&]:w-1 [ul>&]:shrink-0 [ul>&]:rounded-full [ul>&]:bg-accent-soft/70" />
        <span className="min-w-0">{children}</span>
      </li>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-2 border-accent/40 pl-3.5 text-[14.5px] leading-[1.7] text-muted [&>p]:my-1">
        {children}
      </blockquote>
    );
  },
  h1({ children }) {
    return <h2 className="mb-1.5 mt-4 font-serif text-[22px] leading-tight text-ink">{children}</h2>;
  },
  h2({ children }) {
    return <h2 className="mb-1.5 mt-4 font-serif text-[19px] leading-tight text-ink">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-1 mt-3 text-[15px] font-semibold text-ink">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-pale">{children}</h4>;
  },
  hr() {
    return <hr className="my-5 border-line" />;
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-left text-[13px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-white/[0.04]">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-pale">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-b border-line/60 px-3 py-2 align-top text-ink/85">{children}</td>;
  },
  img({ src, alt }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} className="my-3 max-w-full rounded-xl border border-line" />
    );
  },
};

/** Everything the workspace knows about how a reply was produced, as plain JSON. */
export function traceFor(m: Msg) {
  const tools = (m.toolCalls ?? []).map((call: ToolCall) => ({
    id: call.id,
    server: call.server,
    name: call.name,
    status: call.pending ? "running" : call.ok ? "ok" : "error",
    arguments: call.args ?? null,
    result: call.error
      ? { error: call.error }
      : call.content
        ? {
            content: call.content.length > 4000 ? `${call.content.slice(0, 4000)}…` : call.content,
            truncated: call.content.length > 4000,
            characters: call.content.length,
          }
        : null,
  }));

  return {
    message: {
      id: m.id,
      role: m.role,
      model: m.model ?? null,
      createdAt: new Date(m.createdAt).toISOString(),
      pending: Boolean(m.pending),
      failed: Boolean(m.error),
    },
    routing: m.routing ?? null,
    tools: { count: tools.length, calls: tools },
    notices: m.notices ?? [],
    reasoning: m.thinking ? { characters: m.thinking.length, text: m.thinking } : null,
    quote: m.quote ?? null,
    attachments: (m.attachments ?? []).map((a) => ({ name: a.name, type: a.type, size: a.size })),
    content: { characters: m.content.length, text: m.content },
  };
}

function Inspector({ message, onClose }: { message: Msg; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const json = React.useMemo(() => JSON.stringify(traceFor(message), null, 2), [message]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[86vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-[#0d0a16] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Cpu className="h-3.5 w-3.5 text-accent-soft" />
          <h2 className="text-[12.5px] font-semibold text-ink">How this reply was produced</h2>
          <span className="rounded border border-line px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-faint">
            {message.role}
          </span>
          <button
            onClick={copy}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-black/40 p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.65] text-accent-pale/85">
            {json}
          </pre>
        </div>
        <div className="border-t border-line px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/70">
          routing · tools · reasoning · quote · content
        </div>
      </div>
    </div>
  );
}

interface MenuState {
  x: number;
  y: number;
}

export default function Message({
  message,
  onRegenerate,
}: {
  message: Msg;
  onRegenerate?: () => void;
}) {
  const store = useStore();
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const { speak, stop, speakingId, supported: speechSupported } = useSpeech();
  const isUser = message.role === "user";
  const speaking = speakingId === message.id;

  const copy = async (text = message.content) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const width = 208;
    const height = 176;
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
    });
  };

  const quoteWhole = () => {
    store.setQuote({ text: message.content, messageId: message.id, role: message.role });
    focusComposer();
  };

  /** Highlight any part of a message, then reply to just that. */
  const onSelect = () => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!sel || !text || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setSelection(null);
      return;
    }
    setSelection({
      text: text.length > 1200 ? `${text.slice(0, 1200)}…` : text,
      x: Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90),
      y: rect.top,
    });
  };

  const quoteSelection = () => {
    if (!selection) return;
    store.setQuote({ text: selection.text, messageId: message.id, role: message.role });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    focusComposer();
  };

  const toggleSpeech = () => {
    if (speaking) stop();
    else speak(message.id, message.content);
  };

  const quote = message.quote;

  const quoteChip = quote ? (
    <div className="mb-1.5 rounded-xl border-l-2 border-accent/50 bg-white/[0.03] px-3 py-1.5 text-[12px] leading-relaxed text-faint">
      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint/70">
        replying to {quote.role === "user" ? "your message" : "the reply"}
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words">{quote.text}</p>
    </div>
  ) : null;

  const actionBar = (align: "left" | "right") => (
    <div className={cx("mt-1.5 flex items-center gap-0.5", align === "right" && "justify-end")}>
      <button
        onClick={() => void copy()}
        className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
        title={copied ? "Copied" : "Copy message"}
        aria-label="Copy message"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>

      {speechSupported && (
        <button
          onClick={toggleSpeech}
          className={cx(
            "inline-flex items-center gap-1 rounded-md p-1.5 transition-colors hover:bg-white/5",
            speaking ? "text-accent-pale" : "text-faint hover:text-ink",
          )}
          title={speaking ? "Stop reading" : "Read aloud"}
          aria-label={speaking ? "Stop reading" : "Read aloud"}
        >
          {speaking ? <Stop className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      )}

      <button
        onClick={quoteWhole}
        className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
        title="Reply to this message"
        aria-label="Reply to this message"
      >
        <ArrowRight className="h-3.5 w-3.5 -rotate-180" />
      </button>

      <button
        onClick={() => setInspecting(true)}
        className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
        title="Inspect routing, tools and reasoning"
        aria-label="Inspect trace"
      >
        <Cpu className="h-3.5 w-3.5" />
      </button>

      {!isUser && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          title="Regenerate"
          aria-label="Regenerate response"
        >
          <Refresh className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const overlays = (
    <>
      {selection && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={quoteSelection}
          style={{ left: selection.x, top: Math.max(selection.y - 38, 8) }}
          className="fixed z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-accent/40 bg-[#171126] px-2.5 py-1.5 text-[11px] font-medium text-accent-pale shadow-xl transition-colors hover:bg-accent/20"
        >
          <ArrowRight className="h-3 w-3 -rotate-180" />
          Reply to this
        </button>
      )}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-[#120e1e] py-1 shadow-2xl"
          >
            {[
              { label: "Copy message", run: () => void copy() },
              { label: "Copy as JSON", run: () => void copy(JSON.stringify(traceFor(message), null, 2)) },
              ...(speechSupported
                ? [{ label: speaking ? "Stop reading" : "Read aloud", run: toggleSpeech }]
                : []),
              { label: "Reply to this message", run: quoteWhole },
              { label: "Inspect hidden details", run: () => setInspecting(true) },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.run();
                  setMenu(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {inspecting && <Inspector message={message} onClose={() => setInspecting(false)} />}
    </>
  );

  if (isUser) {
    return (
      <div className="flex animate-rise justify-end" onContextMenu={openMenu}>
        <div className="max-w-[min(660px,88%)]">
          {quoteChip}
          {message.attachments?.length ? (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-[11px] text-muted"
                >
                  {a.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <File className="h-3 w-3" />}
                  <span className="max-w-[180px] truncate text-ink/80">{a.name}</span>
                  <span className="text-faint">{formatBytes(a.size)}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div
            onMouseUp={onSelect}
            className="select-text rounded-2xl border border-white/[0.07] bg-white/[0.07] px-4 py-2.5 text-[14.5px] leading-[1.65] text-ink whitespace-pre-wrap"
          >
            {message.content}
          </div>
          <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {actionBar("right")}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  return (
    <div className="group animate-rise" onContextMenu={openMenu}>
      {quoteChip}

      {(message.routing || message.model) && (
        <div
          className="mb-2 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white/[0.025] px-2.5 py-1 text-[10.5px] text-muted"
          title={message.routing?.reason}
        >
          <Cpu className="h-3 w-3 shrink-0 text-accent-soft" />
          <span className="font-mono text-accent-pale">{message.routing?.selectedModel ?? message.model}</span>
          {message.routing?.category && message.routing.category !== "direct" && (
            <>
              <span className="h-2.5 w-px bg-line" />
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-faint">
                {message.routing.category.replace(/_/g, " ")}
              </span>
            </>
          )}
          {message.routing?.routerModel && (
            <span className="hidden text-[10px] text-faint/80 sm:inline">· via {message.routing.routerModel}</span>
          )}
        </div>
      )}

      {message.thinking ? (
        <ThinkingBlock
          text={message.thinking}
          streaming={Boolean(message.pending)}
          hasContent={Boolean(message.content)}
        />
      ) : null}

      {message.toolCalls?.length ? (
        <div className="mb-2">
          {message.toolCalls.map((call) => (
            <ToolCallCard key={call.id} call={call} />
          ))}
        </div>
      ) : null}

      {message.notices?.length ? (
        <div className="mb-2 space-y-1">
          {message.notices.map((notice, index) => (
            <p key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200/70">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-amber-300/70" />
              <span className="min-w-0 break-words">{notice}</span>
            </p>
          ))}
        </div>
      ) : null}

      {message.pending && !message.content ? (
        <div className="flex items-center gap-1.5 py-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-soft/80"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : (
        <div className={cx("md-body min-w-0", message.pending && "caret")} onMouseUp={onSelect}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
            components={components}
          >
            {normalizeMath(message.content)}
          </ReactMarkdown>
        </div>
      )}

      {!message.pending && message.content ? actionBar("left") : null}

      {overlays}
    </div>
  );
}
