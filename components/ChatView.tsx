"use client";

import React, { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { MODELS } from "@/lib/types";
import { cx } from "@/lib/utils";
import Message from "./Message";
import Composer from "./Composer";
import { Bolt, Chevron, Layers, Menu, PanelRight, Sparkles, Terminal } from "./Icons";
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
}: {
  onOpenSidebar: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  onOpenSettings: () => void;
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
      <header className="z-20 flex h-[54px] shrink-0 items-center gap-2 border-b border-line bg-soft/50 px-3 backdrop-blur sm:px-4">
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
          className="hidden items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-linestrong hover:text-ink sm:flex"
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
          <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col justify-center px-5 py-10 sm:px-8">
            <div className="animate-rise">
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">
                Where should we start,
                <span className="bg-gradient-to-r from-accent-soft to-fuchsia-300 bg-clip-text text-transparent"> Gourav?</span>
              </h2>
              <p className="mt-2 max-w-[520px] text-[13.5px] leading-relaxed text-muted">
                Chat, attach files, arm skills, plug in MCP connectors and hand the turn to your harness.
              </p>
            </div>

            <div className="mt-7 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => void store.send(s.body)}
                  className="group flex items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3 text-left transition-all hover:border-accent/40 hover:bg-accent/[0.06]"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-black/30 text-accent-soft transition-colors group-hover:border-accent/40">
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-ink">{s.title}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">{s.body}</span>
                  </span>
                  <Chevron className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 -rotate-90 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-soft" />
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint/70">
              <span>{activeSkills.length} skills armed</span>
              <span>{store.servers.filter((s) => s.enabled).length} mcp servers</span>
              <span>{store.chats.length} chats stored locally</span>
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
