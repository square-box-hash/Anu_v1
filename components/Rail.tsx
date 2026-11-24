"use client";

import React from "react";
import { cx } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import Logo from "./Logo";
import { Bolt, BookOpen, Bot, Layers, Moon, Palette, Plug, Sliders, Sun } from "./Icons";
import type { PanelTab } from "./RightPanel";

export type Section = "chats" | PanelTab;

export const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "chats", label: "Chats", icon: <Bot className="h-[17px] w-[17px]" /> },
  { id: "skills", label: "Skills", icon: <Bolt className="h-[17px] w-[17px]" /> },
  { id: "memory", label: "Notebook", icon: <BookOpen className="h-[17px] w-[17px]" /> },
  { id: "connectors", label: "Connectors", icon: <Plug className="h-[17px] w-[17px]" /> },
  { id: "harness", label: "Agents", icon: <Layers className="h-[17px] w-[17px]" /> },
  { id: "settings", label: "Models & config", icon: <Sliders className="h-[17px] w-[17px]" /> },
];

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "U").toUpperCase();
}

/** Narrow icon rail: switches which section the panel beside it shows. */
export default function Rail({
  section,
  onSection,
  onOpenAccount,
  initials,
  hasPhoto,
  photoUrl,
}: {
  section: Section;
  onSection: (section: Section) => void;
  onOpenAccount: () => void;
  initials: string;
  hasPhoto?: boolean;
  photoUrl?: string | null;
}) {
  const { theme, cycleTheme, themes } = useTheme();
  const current = themes.find((t) => t.id === theme) ?? themes[0];
  const next = themes[(themes.findIndex((t) => t.id === theme) + 1) % themes.length];
  const ThemeIcon = theme === "light" || theme === "lumen" ? Sun : theme === "plum" ? Palette : Moon;

  return (
    <nav className="flex h-full w-[56px] shrink-0 flex-col items-center gap-1 border-r border-line bg-soft/60 py-3">
      <div className="mb-2 flex h-9 w-9 items-center justify-center">
        <Logo className="h-7 w-7" />
      </div>

      {SECTIONS.map((item) => {
        const active = section === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSection(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
              active
                ? "bg-accent/15 text-accent-pale"
                : "text-faint hover:bg-hover hover:text-ink",
            )}
          >
            {active && (
              <span className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent-soft" />
            )}
            {item.icon}
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <button
          onClick={cycleTheme}
          title={`Theme: ${current.label} — switch to ${next.label}`}
          aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-faint transition-colors hover:bg-hover hover:text-ink"
        >
          <ThemeIcon className="h-[15px] w-[15px]" />
        </button>
        <button
          onClick={onOpenAccount}
          title="Account"
          aria-label="Account"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-line bg-accent/20 text-[10.5px] font-semibold text-accent-pale transition-colors hover:border-accent/50"
        >
          {hasPhoto && photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </button>
      </div>
    </nav>
  );
}
