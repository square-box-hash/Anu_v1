"use client";

import React, { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { MODELS } from "@/lib/types";
import { cx } from "@/lib/utils";
import Message from "./Message";
import Composer, { focusComposer } from "./Composer";
import type { PanelTab } from "./RightPanel";
import { ArrowRight, Bolt, Chevron, Layers, Menu, PanelRight, Sparkles, Terminal } from "./Icons";
import { Pill, StatusDot } from "./ui";

const SUGGESTIONS = [
  { icon: <Sparkles className="h-3.5 w-3.5" />, title: "Plan a product launch", body: "Draft a 6-week launch plan with owners and risks." },
  { icon: <Terminal className="h-3.5 w-3.5" />, title: "Review this repo", body: "Attach a diff and ask for a security-focused review." },
  { icon: <Layers className="h-3.5 w-3.5" />, title: "Summarise a document", body: "Drop a PDF and get a one-page brief with action items." },
  { icon: <Bolt className="h-3.5 w-3.5" />, title: "Build a data story", body: "Turn a CSV into findings, charts and next steps." },
];

export default function ChatView({
  onOpenSidebar,
  onTogglePanel,
  panelOpen,
  onOpenSettings,
  onOpenPanelTab,
}: {
  onOpenSidebar: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  onOpenSettings: () => void;
  onOpenPanelTab: (tab: PanelTab) => void;
}) {
  const store = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = store.activeChat?.messages ?? [];
  const lastContent = messages[messages.length - 1]?.content ?? "";
  const model = MODELS.find((m) => m.id === store.settings.model) ?? MODELS[0];
  const activeSkills = store.skills.filter((s) => s.enabled);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastContent]);

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col">
      <header className="z-20 flex h-[54px] shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
        <button
          onClick={onOpenSidebar}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-ink lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold text-ink">
            {store.activeChat?.title ?? "New chat"}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-faint">
            <span className="truncate">{model.label}</span>
            <span className="h-2.5 w-px bg-line" />
            <span className="truncate">{messages.length} messages</span>
          </div>
        </div>

        <div className="hidden items-center gap-1.5 md:flex">
          {activeSkills.slice(0, 2).map((s) => (
            <Pill key={s.id} active>
              <Bolt className="h-2.5 w-2.5" />
              {s.name}
            </Pill>
          ))}
          {activeSkills.length > 2 && <Pill>+{activeSkills.length - 2}</Pill>}
          <Pill
            active={store.harness.enabled}
            onClick={() => store.updateHarness({ enabled: !store.harness.enabled })}
          >
            <StatusDot status={store.harness.enabled ? store.harness.status : "disconnected"} />
            harness
          </Pill>
        </div>

        <button
          onClick={onOpenSettings}
          className="hidden items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-linestrong hover:text-accent-pale sm:flex"
        >
          <Sparkles className="h-3 w-3 text-accent-soft" />
          Settings
        </button>

        <button
          onClick={onTogglePanel}
          className={cx(
            "rounded-lg p-1.5 transition-colors",
            panelOpen ? "bg-accent/15 text-accent-pale" : "text-muted hover:bg-white/5 hover:text-ink",
          )}
          aria-label="Toggle context panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col justify-center px-6 py-14 sm:px-10">
            <div className="animate-rise">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                <span className="h-1 w-1 rounded-full bg-accent-soft" />
                {model.id}
              </div>

              <h1 className="font-serif text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-ink transition-colors sm:text-[62px]">
                <span className="transition-colors duration-300 hover:text-accent-pale">Talk to Anu</span> about
                <span className="mt-1 block pr-3 italic leading-[1.06]">
                  <span className="bg-gradient-to-r from-accent-soft via-fuchsia-300 to-accent-pale bg-clip-text text-transparent">
                    anything at all
                  </span>
                </span>
              </h1>

              <p className="mt-7 max-w-[540px] text-[15px] leading-[1.72] text-muted">
                Ask a question, drop a file, arm a skill or connect an MCP server. Answers stream back with
                markdown, code blocks, tables and maths rendered properly.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => focusComposer()}
                  className="group inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-[13.5px] font-medium text-white shadow-[0_0_30px_-8px_rgba(139,92,246,0.9)] transition-all hover:bg-accent-soft hover:shadow-[0_0_40px_-6px_rgba(167,139,250,0.9)]"
                >
                  Start typing
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => onOpenPanelTab("connectors")}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-5 py-3 text-[13.5px] font-medium text-ink transition-colors hover:border-accent/50 hover:text-accent-pale"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Connect a tool
                </button>
              </div>
            </div>

            <div className="mt-12 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => void store.send(s.body)}
                  className="group flex items-start gap-3 rounded-xl border border-line/70 bg-white/[0.015] p-3 text-left transition-all hover:border-accent/40 hover:bg-accent/[0.05]"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-faint transition-colors group-hover:border-accent/40 group-hover:text-accent-soft">
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-ink transition-colors group-hover:text-accent-pale">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">{s.body}</span>
                  </span>
                  <Chevron className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 -rotate-90 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent-soft" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[760px] space-y-7 px-4 py-6 sm:px-6">
            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                onRegenerate={
                  m.role === "assistant" && m.id === messages[messages.length - 1]?.id && !store.streaming
                    ? () => void store.regenerate()
                    : undefined
                }
              />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      <div className="shrink-0">
        <Composer />
      </div>
    </main>
  );
}
