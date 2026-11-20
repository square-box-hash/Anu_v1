"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { MODELS, findModel } from "@/lib/types";
import { cx, greetingFor } from "@/lib/utils";
import Message from "./Message";
import Composer from "./Composer";
import type { PanelTab } from "./RightPanel";
import { Bolt, Chevron, Layers, Menu, Sparkles, Terminal } from "./Icons";
import { Pill, StatusDot } from "./ui";

const SUGGESTIONS = [
  { icon: <Sparkles className="h-3.5 w-3.5" />, title: "Solve chemistry doubts", body: "Explain SN1 vs SN2 reaction mechanisms with energy diagrams and stereochemistry." },
  { icon: <Terminal className="h-3.5 w-3.5" />, title: "Architect & delegate code", body: "Design a multi-module TypeScript queue and write focused unit tests for edge cases." },
  { icon: <Layers className="h-3.5 w-3.5" />, title: "Extract structured JSON", body: "Drop a large log or document and compress key facts into clean typed JSON." },
  { icon: <Bolt className="h-3.5 w-3.5" />, title: "Casual quick chat", body: "Brainstorm weekend project ideas I can build and share with 20–30 friends." },
];

export default function ChatView({
  onOpenSidebar,
  onOpenSection,
}: {
  onOpenSidebar: () => void;
  onOpenSection: (tab: PanelTab) => void;
}) {
  const store = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = store.activeChat?.messages ?? [];
  const lastContent = messages[messages.length - 1]?.content ?? "";
  const model = findModel(store.settings.model, store.settings.customModels) ?? MODELS[1] ?? MODELS[0];
  const activeSkills = store.skills.filter((s) => s.enabled);
  const { user } = useAuth();
  const greeting = greetingFor(user?.displayName || user?.email?.split("@")[0]);

  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastContent]);

  // Show the jump button once the reader has scrolled away from the newest turn.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 160);
  };

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setAtBottom(true);
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col">
      <header className="z-20 flex h-[54px] shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
        <button
          onClick={onOpenSidebar}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold text-ink">
            {store.activeChat?.title ?? "New chat"}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-faint">
            <span className="truncate">
              {store.settings.autoRoute && model.id !== "auto" ? `Auto (${model.label})` : model.label}
            </span>
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
          onClick={() => onOpenSection("settings")}
          className="hidden items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-linestrong hover:text-accent-pale sm:flex"
        >
          <Sparkles className="h-3 w-3 text-accent-soft" />
          Settings
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col justify-center px-4 py-10 sm:px-8 sm:py-14">
            <div className="animate-rise mb-6 flex items-center justify-center gap-2.5 sm:mb-7">
              <Sparkles className="h-6 w-6 shrink-0 text-accent-soft sm:h-7 sm:w-7" />
              <h1 className="text-center font-serif text-[28px] leading-tight tracking-[-0.01em] text-ink sm:text-[38px]">
                {greeting}
              </h1>
            </div>

            <Composer variant="hero" />

            <div className="mt-9 grid gap-2 sm:mt-12 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => void store.send(s.body)}
                  className="group flex items-start gap-3 rounded-xl border border-line/70 bg-surface p-3 text-left transition-all hover:border-accent/40 hover:bg-accent/[0.05]"
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
          <div className="mx-auto w-full max-w-[760px] space-y-6 px-3.5 py-5 sm:space-y-7 sm:px-6 sm:py-6">
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

        {!atBottom && messages.length > 0 && (
          <button
            onClick={jumpToLatest}
            aria-label="Scroll to latest"
            title="Scroll to latest"
            className="absolute bottom-3 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 animate-fade items-center justify-center rounded-full border border-line bg-panel/95 text-muted shadow-[0_6px_24px_-8px_rgba(0,0,0,0.9)] backdrop-blur transition-colors hover:border-accent/50 hover:text-accent-pale"
          >
            <Chevron className="h-4 w-4" />
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div className="shrink-0">
          <Composer />
        </div>
      )}
    </main>
  );
}
