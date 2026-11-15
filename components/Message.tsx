import React, { useState } from "react";
import type { Message as Msg, ToolCall } from "@/lib/types";
import { cx, formatBytes } from "@/lib/utils";
import Markdown from "./Markdown";
import { Check, Chevron, Copy, File, Image as ImageIcon, Refresh, Sparkles, Terminal } from "./Icons";

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
        <div className={cx(message.pending && "caret")}>
          <Markdown content={message.content} />
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
