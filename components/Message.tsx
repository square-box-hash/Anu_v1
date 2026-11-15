"use client";

import React, { useState } from "react";
import type { Message as Msg } from "@/lib/types";
import { cx, formatBytes } from "@/lib/utils";
import { Bot, Check, Copy, File, Image as ImageIcon } from "./Icons";

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
          return (
            <strong key={i} className="font-semibold text-ink">
              {p.slice(2, -2)}
            </strong>
          );
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
          return (
            <code key={i} className="rounded border border-line bg-white/[0.05] px-1.5 py-[1px] font-mono text-[12px] text-accent-pale">
              {p.slice(1, -1)}
            </code>
          );
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
          return (
            <em key={i} className="text-muted">
              {p.slice(1, -1)}
            </em>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
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
        <code>{code.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}

function Blocks({ content }: { content: string }) {
  const out: React.ReactNode[] = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  const pushText = (chunk: string) => {
    const lines = chunk.split("\n");
    let list: string[] = [];
    const flush = () => {
      if (!list.length) return;
      out.push(
        <ul key={`ul-${key++}`} className="my-2 space-y-1.5 pl-1">
          {list.map((item, i) => (
            <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink/90">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-soft/70" />
              <span>
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) {
        flush();
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        list.push(line.replace(/^\s*[-*]\s+/, ""));
        continue;
      }
      flush();
      if (/^#{1,4}\s/.test(line)) {
        out.push(
          <h4 key={`h-${key++}`} className="mt-3 mb-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-accent-pale">
            {line.replace(/^#{1,4}\s/, "")}
          </h4>,
        );
        continue;
      }
      out.push(
        <p key={`p-${key++}`} className="my-1.5 text-[14px] leading-[1.72] text-ink/90">
          <Inline text={line} />
        </p>,
      );
    }
    flush();
  };

  while ((m = fence.exec(content))) {
    if (m.index > last) pushText(content.slice(last, m.index));
    out.push(<CodeBlock key={`c-${key++}`} lang={m[1]} code={m[2]} />);
    last = m.index + m[0].length;
  }
  if (last < content.length) pushText(content.slice(last));

  return <div className="min-w-0">{out}</div>;
}

export default function Message({ message }: { message: Msg }) {
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
      <div className="group flex animate-rise justify-end gap-3">
        <div className="max-w-[min(680px,86%)]">
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
          <div className="rounded-2xl rounded-br-md border border-accent/25 bg-accent/[0.13] px-4 py-2.5 text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white/[0.04] text-[11px] font-semibold text-accent-pale">
          GM
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-rise gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-accent-pale">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[12px] font-semibold text-ink">Nebula</span>
          {message.demo ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-amber-200/90">
              demo
            </span>
          ) : null}
        </div>
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
          <div className={cx(message.pending && "caret")}>
            <Blocks content={message.content} />
          </div>
        )}
        {!message.pending && message.content ? (
          <button
            onClick={copy}
            className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-ink group-hover:opacity-100"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
