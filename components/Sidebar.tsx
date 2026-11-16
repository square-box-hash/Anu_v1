"use client";

import React, { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { cx, groupByDay, relativeTime } from "@/lib/utils";
import Logo from "./Logo";
import { SECTIONS, initialsFor } from "./Rail";
import type { Section } from "./Rail";
import { PanelBody } from "./RightPanel";
import { Bolt, Chevron, Layers, LogOut, Pencil, Plug, Plus, Search, Sliders, Trash, X } from "./Icons";

export default function Sidebar({
  section,
  onSection,
  onClose,
  onOpenAccount,
}: {
  section: Section;
  onSection: (section: Section) => void;
  onClose?: () => void;
  onOpenAccount: () => void;
}) {
  const { user, hasPasswordProvider, signOutUser } = useAuth();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...store.chats].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [store.chats, query]);

  const groups = groupByDay(filtered);
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Account";
  const subtitle = !hasPasswordProvider
    ? "Set up password"
    : user?.emailVerified
      ? (user.email ?? "Verified account")
      : "Verify email to sync";
  const activeSection = SECTIONS.find((s) => s.id === section);

  return (
    <aside className="flex h-full w-[min(calc(100vw-72px),272px)] shrink-0 flex-col border-r border-line bg-soft/70 lg:w-[272px]">
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8 drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]" />
          <div className="leading-none">
            <div className="font-serif text-[16px] leading-none tracking-tight text-ink">Anu</div>
            <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
              chat workspace
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-ink lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {section === "chats" ? (
        <>
          <div className="px-3 pt-4">
            <button
              onClick={() => {
                store.createChat();
                onClose?.();
              }}
              className="group flex w-full items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-[13px] font-medium text-ink transition-all hover:border-accent/50 hover:bg-accent/10"
            >
              <Plus className="h-3.5 w-3.5 text-accent-soft" />
              New chat
              <span className="ml-auto rounded border border-line px-1 py-[1px] font-mono text-[9.5px] text-faint">
                ⌘K
              </span>
            </button>
          </div>

          <div className="mt-3 space-y-0.5 px-2">
            {SECTIONS.filter((s) => s.id !== "chats").map((s) => (
              <button
                key={s.id}
                onClick={() => onSection(s.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] text-muted transition-colors hover:bg-white/[0.05] hover:text-ink"
              >
                <span className="text-faint">{s.icon}</span>
                {s.label}
                <Chevron className="ml-auto h-3 w-3 -rotate-90 text-faint/70" />
              </button>
            ))}
          </div>

          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 rounded-lg border border-transparent bg-black/25 px-2.5 py-1.5 transition-colors focus-within:border-line">
              <Search className="h-3.5 w-3.5 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats"
                className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint/70"
              />
            </div>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
            {groups.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-faint">
                {query ? "No chats match that search." : "No chats yet. Start one above."}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint/80">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const chat = store.chats.find((c) => c.id === item.id);
                      if (!chat) return null;
                      const active = store.activeId === item.id;
                      const isEditing = editing === item.id;
                      return (
                        <div
                          key={item.id}
                          className={cx(
                            "group relative flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                            active ? "bg-accent/[0.14] text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink",
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent-soft" />
                          )}
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => {
                                store.renameChat(item.id, draft);
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  store.renameChat(item.id, draft);
                                  setEditing(null);
                                }
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="w-full rounded border border-accent/50 bg-black/40 px-1.5 py-0.5 text-[12.5px] text-ink outline-none"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  store.selectChat(item.id);
                                  onClose?.();
                                }}
                                className="min-w-0 flex-1 truncate text-left text-[12.5px]"
                                title={chat.title}
                              >
                                {chat.title}
                              </button>
                              <span className="shrink-0 text-[9.5px] text-faint group-hover:hidden">
                                {relativeTime(item.updatedAt)}
                              </span>
                              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                <button
                                  onClick={() => {
                                    setEditing(item.id);
                                    setDraft(chat.title);
                                  }}
                                  className="rounded p-1 text-faint hover:bg-white/10 hover:text-ink"
                                  aria-label="Rename chat"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => store.deleteChat(item.id)}
                                  className="rounded p-1 text-faint hover:bg-rose-500/15 hover:text-rose-300"
                                  aria-label="Delete chat"
                                >
                                  <Trash className="h-3 w-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 pt-4">
            <button
              onClick={() => onSection("chats")}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11.5px] text-muted transition-colors hover:bg-white/5 hover:text-ink"
            >
              <Chevron className="h-3 w-3 rotate-90" />
              Chats
            </button>
            <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">
              {activeSection?.label}
            </span>
          </div>

          <div className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
            {activeSection && <PanelBody tab={activeSection.id as Exclude<Section, "chats">} />}
          </div>
        </>
      )}

      <div className="border-t border-line px-2.5 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenAccount}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-accent/20 text-[10px] font-semibold text-accent-pale">
              {initialsFor(displayName)}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12px] font-medium text-ink">{displayName}</span>
              <span className="block truncate text-[10px] text-faint">{subtitle}</span>
            </span>
          </button>
          <button
            onClick={() => void signOutUser()}
            className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-rose-500/15 hover:text-rose-300"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
