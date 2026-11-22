"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cellAlignFrom, cx } from "@/lib/utils";
import { Check, Copy } from "./Icons";

/** Models sometimes emit \( … \) and \[ … \]; normalise to $ … $ / $$ … $$. */
export function normalizeMath(input: string): string {
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

export default function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ?? "md-body min-w-0"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={components}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
}
