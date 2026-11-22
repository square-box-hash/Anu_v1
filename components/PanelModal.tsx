"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PanelBody } from "./RightPanel";
import type { PanelTab } from "./RightPanel";
import { cx } from "@/lib/utils";
import { Bolt, Layers, Plug, Sliders, X } from "./Icons";

/** Heading and one-line hint per panel, so the window explains itself. */
const TITLES: Record<PanelTab, { label: string; hint: string; Icon: (p: { className?: string }) => React.ReactElement }> = {
  connectors: {
    label: "MCP servers",
    hint: "Remote and local tool servers exposed to the model for this chat.",
    Icon: Plug,
  },
  skills: {
    label: "Skills",
    hint: "Workspace instructions the model loads only when a task needs them.",
    Icon: Bolt,
  },
  harness: {
    label: "Agents",
    hint: "The orchestrator, its subagents and the limits they run under.",
    Icon: Layers,
  },
  settings: {
    label: "Models & config",
    hint: "Which model answers, how it routes, and what it costs.",
    Icon: Sliders,
  },
};

const ORDER: PanelTab[] = ["connectors", "skills", "harness", "settings"];

/**
 * A panel is a window, not a sidebar page: opening one centres it over the
 * conversation and blurs what is behind it, so the chat stays where it was.
 */
export default function PanelModal({
  tab,
  onTab,
  onClose,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
}) {
  // The overlay is portalled to <body>: the workspace sits inside a stacking
  // context, so a fixed overlay rendered there would paint under the rail.
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

  const current = TITLES[tab];
  const Heading = current.Icon;

  const overlay = (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <div
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-scrimsoft backdrop-blur-[6px]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.label}
        className="relative flex max-h-[90dvh] w-full max-w-[880px] animate-rise flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_90px_-30px_rgba(0,0,0,0.8)] sm:max-h-[86vh]"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-accent-soft">
            <Heading className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold leading-tight text-ink">{current.label}</h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{current.hint}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="rounded-lg p-1.5 text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-1.5 no-scrollbar">
          {ORDER.map((id) => {
            const item = TITLES[id];
            const ItemIcon = item.Icon;
            const active = id === tab;
            return (
              <button
                key={id}
                onClick={() => onTab(id)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors",
                  active ? "bg-accent/15 text-accent-pale" : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                <ItemIcon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <PanelBody tab={tab} />
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(overlay, document.body) : null;
}
