"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Message as Msg, ToolCall, Usage } from "@/lib/types";
import { estimateCost, formatCost, formatTokens } from "@/lib/pricing";
import { useSpeech } from "@/lib/speech";
import { useStore } from "@/lib/store";
import { cellAlignFrom, cx, formatBytes } from "@/lib/utils";
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
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-sunken">
      <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{lang || "code"}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted transition-colors hover:bg-hover hover:text-ink"
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
    <div className="mb-3 overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setManual(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-hover"
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
  // Closed until asked: a search should not unfold its whole JSON on its own.
  const [open, setOpen] = useState(false);
  const status = call.pending ? "running" : call.ok ? "ok" : "error";
  const tone =
    status === "running" ? "text-accent-soft" : status === "ok" ? "text-ok/90" : "text-danger";

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-hover"
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
            <pre className="overflow-x-auto rounded-lg bg-field p-2 font-mono text-[11px] leading-relaxed text-accent-pale/85">
              {JSON.stringify(call.args ?? {}, null, 2)}
            </pre>
          </div>
          {call.content || call.error ? (
            <div>
              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/80">result</div>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg bg-field p-2 font-mono text-[11px] leading-relaxed text-ink/80">
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
    return <pre className="my-3 overflow-x-auto rounded-xl border border-line bg-sunken p-3">{children}</pre>;
  },
  code({ className, children }) {
    return (
      <code className="rounded border border-line bg-surface px-1.5 py-[1px] font-mono text-[12.5px] text-accent-pale">
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
  ul({ children, className }) {
    const tasks = Boolean(className?.includes("contains-task-list"));
    return <ul className={cx("my-2 space-y-1.5", tasks ? "pl-0" : "pl-1")}>{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:text-accent-soft/70">{children}</ol>;
  },
  li({ children, className }) {
    // "- [ ]" task items get the checkbox instead of the accent bullet.
    if (className?.includes("task-list-item")) {
      return (
        <li className="flex list-none items-start gap-2 text-[14.5px] leading-[1.7] text-ink/90">
          {children}
        </li>
      );
    }
    return (
      <li className="text-[14.5px] leading-[1.7] text-ink/90 marker:text-accent-soft/70 [ul>&]:flex [ul>&]:gap-2">
        <span className="hidden [ul>&]:mt-[9px] [ul>&]:block [ul>&]:h-1 [ul>&]:w-1 [ul>&]:shrink-0 [ul>&]:rounded-full [ul>&]:bg-accent-soft/70" />
        <span className="min-w-0">{children}</span>
      </li>
    );
  },
  del({ children }) {
    return <del className="text-muted line-through">{children}</del>;
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
        <table className="md-table w-full border-collapse text-left text-[13px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-surface">{children}</thead>;
  },
  // `|---:|` / `|:--:|` in the separator row arrive as align on the cell.
  th({ children, node }) {
    return (
      <th
        style={{ textAlign: cellAlignFrom(node) }}
        className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-pale"
      >
        {children}
      </th>
    );
  },
  td({ children, node }) {
    return (
      <td
        style={{ textAlign: cellAlignFrom(node) }}
        className="border-b border-line/60 px-3 py-2 align-top text-ink/85"
      >
        {children}
      </td>
    );
  },
  img({ src, alt }) {
    // Remote images (a search result, a page thumbnail) are plain <img>: no
    // next/image domain list to maintain, and no-referrer so the host does not
    // learn where the reader came from.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={typeof src === "string" ? src : ""}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="my-3 max-h-[420px] w-auto max-w-full rounded-xl border border-line bg-sunken object-contain"
      />
    );
  },
};

/** Everything the workspace knows about how a reply was produced, as plain JSON. */
const PREVIEW_CHARS = 600;

/** Long answers are summarised, not dumped — a 20k-character reply makes the panel useless. */
function preview(text: string) {
  return {
    characters: text.length,
    preview: text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text,
    truncated: text.length > PREVIEW_CHARS,
  };
}

export function traceFor(m: Msg, options: { fullText?: boolean } = {}) {
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
    usage: m.usage
      ? { ...m.usage, costUsd: estimateCost(m.model ?? m.routing?.selectedModel, m.usage) }
      : null,
    tools: { count: tools.length, calls: tools },
    notices: m.notices ?? [],
    reasoning: m.thinking
      ? options.fullText
        ? { characters: m.thinking.length, text: m.thinking }
        : preview(m.thinking)
      : null,
    quote: m.quote ?? null,
    attachments: (m.attachments ?? []).map((a) => ({ name: a.name, type: a.type, size: a.size })),
    content: options.fullText ? { characters: m.content.length, text: m.content } : preview(m.content),
  };
}

/** Token and cost meter for one turn. */
function UsageLine({ usage, model }: { usage: Usage; model?: string | null }) {
  const cost = estimateCost(model, usage);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint/70">
      <span>{formatTokens(usage.inputTokens)} in</span>
      <span className="text-faint/40">·</span>
      <span>{formatTokens(usage.outputTokens)} out</span>
      {usage.thoughtTokens ? (
        <>
          <span className="text-faint/40">·</span>
          <span>{formatTokens(usage.thoughtTokens)} thinking</span>
        </>
      ) : null}
      <span className="text-faint/40">·</span>
      <span className={cost == null ? "text-faint/60" : "text-ok/80"}>{formatCost(cost)}</span>
    </div>
  );
}

/**
 * Everything a reply carries behind it — which model answered, how it was
 * routed, the tools and MCP calls with their JSON, notices and cost — in one
 * centred window over a blurred conversation, the same shape as the panel
 * windows, instead of a block that pushed the answer around.
 */
function MessageDetails({ message, onClose }: { message: Msg; onClose: () => void }) {
  const [raw, setRaw] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const json = React.useMemo(
    () => JSON.stringify(traceFor(message, { fullText }), null, 2),
    [message, fullText],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  const overlay = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-scrimsoft backdrop-blur-[6px]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How this reply was produced"
        className="relative flex max-h-[90dvh] w-full max-w-[720px] animate-rise flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_90px_-30px_rgba(0,0,0,0.8)] sm:max-h-[86vh]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <Cpu className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
          <h2 className="min-w-0 truncate text-[12.5px] font-semibold text-ink">How this reply was produced</h2>
          <span className="shrink-0 rounded border border-line px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-faint">
            {message.role}
          </span>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-hover hover:text-ink"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-1.5">
          <button
            onClick={() => setRaw(false)}
            aria-pressed={!raw}
            className={cx(
              "rounded-lg px-2.5 py-1 text-[11.5px] transition-colors",
              !raw ? "bg-accent/15 text-accent-pale" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            details
          </button>
          <button
            onClick={() => setRaw(true)}
            aria-pressed={raw}
            className={cx(
              "rounded-lg px-2.5 py-1 text-[11.5px] transition-colors",
              raw ? "bg-accent/15 text-accent-pale" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            raw JSON
          </button>

          {raw ? (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setFullText((value) => !value)}
                title="Include the whole reply instead of a preview"
                className={cx(
                  "rounded-md border px-1.5 py-1 text-[10px] transition-colors",
                  fullText ? "border-accent/40 bg-accent/15 text-accent-pale" : "border-line text-faint hover:text-ink",
                )}
              >
                full text
              </button>
              <button
                onClick={copy}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>

        {raw ? (
          <div className="min-h-0 flex-1 overflow-auto bg-field p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.65] text-accent-pale/85">
              {json}
            </pre>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span className="font-mono text-accent-pale">{message.routing?.selectedModel ?? message.model ?? "unknown model"}</span>
              {message.routing?.category && message.routing.category !== "direct" ? (
                <>
                  <span className="h-2.5 w-px bg-line" />
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-faint">
                    {message.routing.category.replace(/_/g, " ")}
                  </span>
                </>
              ) : null}
              {message.routing?.routerModel ? (
                <span className="text-[10px] text-faint/80">· via {message.routing.routerModel}</span>
              ) : null}
            </div>

            {message.routing?.reason ? (
              <p className="text-[11.5px] leading-relaxed text-faint">{message.routing.reason}</p>
            ) : null}

            {message.routing?.steps?.length ? (
              <p className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.1em] text-faint/70">
                {message.routing.steps.join(" → ")}
              </p>
            ) : null}

            <div>
              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/80">
                tools used · {message.toolCalls?.length ?? 0}
              </div>
              {message.toolCalls?.length ? (
                message.toolCalls.map((call) => <ToolCallCard key={call.id} call={call} />)
              ) : (
                <p className="text-[11px] text-faint">No tool was called for this reply.</p>
              )}
            </div>

            {message.notices?.length ? (
              <div className="space-y-1">
                {message.notices.map((notice, index) => (
                  <p key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
                    <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-amber-300/70" />
                    <span className="min-w-0 break-words">{notice}</span>
                  </p>
                ))}
              </div>
            ) : null}

            {message.usage ? (
              <UsageLine usage={message.usage} model={message.model ?? message.routing?.selectedModel} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return mounted ? createPortal(overlay, document.body) : null;
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Overlays are portalled to <body>: every message is its own stacking context
  // (the rise animation leaves a transform in place), so a fixed overlay inside
  // one message painted underneath the messages after it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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

  const openMenuAt = (x: number, y: number) => {
    const width = 208;
    const height = 210;
    setMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  };

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    openMenuAt(event.clientX, event.clientY);
  };

  // Phones have no right-click, so a long press opens the same menu.
  const pressTimer = React.useRef<number | null>(null);
  const cancelPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const startPress = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      openMenuAt(touch.clientX, touch.clientY);
    }, 480);
  };
  const touchHandlers = {
    onTouchStart: startPress,
    onTouchEnd: cancelPress,
    onTouchMove: cancelPress,
    onTouchCancel: cancelPress,
  };

  /** Touch selection settles after touchend, so read it a tick later. */
  const endTouch = () => {
    window.setTimeout(onSelect, 90);
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
    <div className="mb-1.5 rounded-xl border-l-2 border-accent/50 bg-surface px-3 py-1.5 text-[12px] leading-relaxed text-faint">
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
        className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-hover hover:text-ink"
        title={copied ? "Copied" : "Copy message"}
        aria-label="Copy message"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>

      {speechSupported && (
        <button
          onClick={toggleSpeech}
          className={cx(
            "inline-flex items-center gap-1 rounded-md p-1.5 transition-colors hover:bg-hover",
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
        className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-hover hover:text-ink"
        title="Reply to this message"
        aria-label="Reply to this message"
      >
        <ArrowRight className="h-3.5 w-3.5 -rotate-180" />
      </button>

      {!isUser && (
        <button
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className={cx(
            "inline-flex items-center gap-1 rounded-md p-1.5 transition-colors hover:bg-hover",
            detailsOpen ? "text-accent-pale" : "text-faint hover:text-ink",
          )}
          title={detailsOpen ? "Hide model, tools and MCP details" : "Model, tools and MCP details"}
          aria-label={detailsOpen ? "Hide details" : "Show details"}
        >
          <span className="text-[15px] leading-none tracking-[0.06em]">⋯</span>
        </button>
      )}

      {!isUser && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-hover hover:text-ink"
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
          className="fixed z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-accent/40 bg-panel px-2.5 py-1.5 text-[11px] font-medium text-accent-pale shadow-xl transition-colors hover:bg-accent/20"
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
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-2xl"
          >
            {[
              { label: "Copy message", run: () => void copy() },
              { label: "Copy as JSON", run: () => void copy(JSON.stringify(traceFor(message), null, 2)) },
              ...(speechSupported
                ? [{ label: speaking ? "Stop reading" : "Read aloud", run: toggleSpeech }]
                : []),
              { label: "Reply to this message", run: quoteWhole },
              { label: "How this reply was made", run: () => setDetailsOpen(true) },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.run();
                  setMenu(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {detailsOpen && <MessageDetails message={message} onClose={() => setDetailsOpen(false)} />}
    </>
  );

  if (isUser) {
    return (
      <div className="group flex animate-rise justify-end" onContextMenu={openMenu} {...touchHandlers}>
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
            onTouchEnd={endTouch}
            className="select-text rounded-2xl border border-line bg-surface px-4 py-2.5 text-[14.5px] leading-[1.65] text-ink whitespace-pre-wrap"
          >
            {message.content}
          </div>
          <div className="focus-within:opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
            {actionBar("right")}
          </div>
        </div>
        {mounted ? createPortal(overlays, document.body) : null}
      </div>
    );
  }

  return (
    <div className="group animate-rise" onContextMenu={openMenu} {...touchHandlers}>
      {quoteChip}

      {message.thinking ? (
        <ThinkingBlock
          text={message.thinking}
          streaming={Boolean(message.pending)}
          hasContent={Boolean(message.content)}
        />
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
        <div
          className={cx("md-body min-w-0", message.pending && "caret")}
          onMouseUp={onSelect}
          onTouchEnd={endTouch}
        >
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

      {mounted ? createPortal(overlays, document.body) : null}
    </div>
  );
}
