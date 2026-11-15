"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Message as Msg } from "@/lib/types";
import { cx, formatBytes } from "@/lib/utils";
import { Check, Chevron, Copy, File, Image as ImageIcon, Refresh, Sparkles } from "./Icons";

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

export default function Message({
  message,
  onRegenerate,
}: {
  message: Msg;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  if (isUser) {
    return (
      <div className="flex animate-rise justify-end">
        <div className="max-w-[min(660px,88%)]">
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
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.07] px-4 py-2.5 text-[14.5px] leading-[1.65] text-ink whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group animate-rise">
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
        <div className={cx("md-body min-w-0", message.pending && "caret")}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
            components={components}
          >
            {normalizeMath(message.content)}
          </ReactMarkdown>
        </div>
      )}

      {!message.pending && message.content ? (
        <div className="mt-1.5 flex items-center gap-0.5">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
            title={copied ? "Copied" : "Copy"}
            aria-label="Copy message"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {onRegenerate && (
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
      ) : null}
    </div>
  );
}
