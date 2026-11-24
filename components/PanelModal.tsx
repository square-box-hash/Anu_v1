"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PanelBody } from "./RightPanel";
import type { PanelTab } from "./RightPanel";
import { cx } from "@/lib/utils";
import { X } from "./Icons";

/** One line of context per pane, so the drawer explains itself. */
const TITLES: Record<PanelTab, { label: string; hint: string }> = {
  connectors: { label: "Connectors", hint: "MCP servers whose tools the model can call in this chat." },
  skills: { label: "Skills", hint: "Instructions the model loads only when a task needs them." },
  harness: { label: "Agents", hint: "The four stages a turn passes through, and what each one costs." },
  settings: { label: "Models and config", hint: "Which model answers, how it routes, and what it costs." },
};

const ORDER: PanelTab[] = ["connectors", "skills", "harness", "settings"];

/**
 * Settings live in a drawer that slides in from the right, over a scrim, with
 * a tab per pane — the chat stays where it was behind it.
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
  // Portalled to <body>: the workspace sits inside a stacking context, so a
  // fixed overlay rendered there would paint under the rail.
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

  const overlay = (
    <div className="fixed inset-0 z-[70]">
      <div
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-scrim backdrop-blur-[2px]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.label}
        className="absolute inset-y-0 right-0 flex w-full max-w-[540px] animate-drawer flex-col border-l border-linestrong bg-bg shadow-[-20px_0_60px_-30px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-2 px-5 pt-5">
          <h2 className="min-w-0 flex-1 truncate text-[19px] font-medium tracking-[-0.01em] text-ink">
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            title="Close (Esc)"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div role="tablist" className="mt-3 flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-4 no-scrollbar">
          {ORDER.map((id) => {
            const active = id === tab;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => onTab(id)}
                className={cx(
                  "shrink-0 border-b-2 px-2.5 py-2 text-[12.5px] transition-colors",
                  active
                    ? "border-accent font-medium text-accent-pale"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {TITLES[id].label}
              </button>
            );
          })}
        </div>

        <p className="shrink-0 px-5 pb-1 pt-3 text-[11.5px] leading-relaxed text-faint">{current.hint}</p>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          <PanelBody tab={tab} />
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(overlay, document.body) : null;
}
