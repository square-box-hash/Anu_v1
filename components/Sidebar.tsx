"use client";

import React, { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { cx, groupByDay, relativeTime } from "@/lib/utils";
import { SECTIONS, initialsFor } from "./Rail";
import type { Section } from "./Rail";
import { PanelBody } from "./RightPanel";
import {
  Bolt,
  BookOpen,
  Chevron,
  Clock,
  Layers,
  LogOut,
  Megaphone,
  Pencil,
  PanelLeft,
  Plug,
  Plus,
  Search,
  Sliders,
  Trash,
  X,
} from "./Icons";

const WHATS_NEW_URL = "https://github.com/square-box-hash/Anu_v1/releases";

/** Rows that map onto a real panel in this app. */
const NAV_ITEMS: { id: Section; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { id: "connectors", label: "Connectors", Icon: Plug },
  { id: "skills", label: "Skills", Icon: Bolt },
  { id: "harness", label: "Agents", Icon: Layers },
  { id: "settings", label: "Models & config", Icon: Sliders },
];

/** Shown so the shape matches the reference, but honestly disabled. */
const SOON_ITEMS = [
  { label: "Scheduled tasks", Icon: Clock },
  { label: "Knowledge base", Icon: BookOpen },
];

export default function Sidebar({
  section,
  onSection,
  onClose,
  onCollapse,
  onOpenAccount,
}: {
  section: Section;
  onSection: (section: Section) => void;
  onClose?: () => void;
  onCollapse?: () => void;
  onOpenAccount: () => void;
}) {
  const { user, signOutUser } = useAuth();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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
  const activeSection = SECTIONS.find((s) => s.id === section);
  const agents = store.harness.subagents;

  return (
    <aside className="flex h-full w-[min(calc(100vw-72px),284px)] shrink-0 flex-col border-r border-line bg-soft/70 lg:w-[284px]">
      {/* header */}
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h1 className="font-serif text-[17px] leading-none tracking-tight text-ink">Anu v1</h1>
        <div className="flex items-center gap-0.5">
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Hide panel"
              aria-label="Hide panel"
              className="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink lg:block"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {section === "chats" ? (
        <>
          {/* primary actions */}
          <div className="px-2 pt-3">
            <button
              onClick={() => {
                store.createChat();
                onClose?.();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-ink transition-colors hover:bg-hover"
            >
              <Plus className="h-4 w-4 text-muted" />
              New chat
              <span className="ml-auto font-mono text-[9.5px] text-faint">⌘K</span>
            </button>

            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => onSection(id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                <Icon className="h-4 w-4 shrink-0 text-faint" />
                {label}
              </button>
            ))}

            {SOON_ITEMS.map(({ label, Icon }) => (
              <div
                key={label}
                aria-disabled="true"
                title={`${label} is not built yet`}
                className="flex w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-faint/60"
              >
                <Icon className="h-4 w-4 shrink-0 text-faint/50" />
                {label}
                <span className="ml-auto rounded border border-line px-1 py-[1px] font-mono text-[8.5px] uppercase tracking-[0.1em]">
                  soon
                </span>
              </div>
            ))}
          </div>

          {agents.length > 0 && (
            <div className="mt-4 px-2">
              <div className="px-2.5 pb-1 text-[11.5px] font-medium text-muted">Recent agents</div>
              {agents.slice(0, 3).map((agent) => (
                <div
                  key={agent}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-ink"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-soft" />
                  <span className="truncate">{agent}</span>
                </div>
              ))}
            </div>
          )}

          {/* recent chats */}
          <div className="mt-4 flex items-center justify-between px-4 pb-1">
            <span className="text-[11.5px] font-medium text-muted">Recent chats</span>
            <button
              onClick={() => {
                setSearchOpen((open) => !open);
                if (searchOpen) setQuery("");
              }}
              title="Search chats"
              aria-label="Search chats"
              aria-pressed={searchOpen}
              className={cx(
                "rounded-md p-1 transition-colors hover:bg-hover hover:text-ink",
                searchOpen ? "text-ink" : "text-faint",
              )}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>

          {searchOpen && (
            <div className="px-3 pb-1 pt-1">
              <div className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5 transition-colors focus-within:ring-1 focus-within:ring-accent/40">
                <Search className="h-3.5 w-3.5 text-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chats"
                  className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint/70"
                />
              </div>
            </div>
          )}

          <div className="mt-1 flex-1 overflow-y-auto px-2 pb-3">
            {groups.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-faint">
                {query ? "No chats match that search." : "No chats yet. Start one above."}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint/70">
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
                            active ? "bg-hover text-ink" : "text-ink/80 hover:bg-hover/60 hover:text-ink",
                          )}
                        >
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
                              className="w-full rounded border border-accent/50 bg-field px-1.5 py-0.5 text-[13px] text-ink outline-none"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  store.selectChat(item.id);
                                  onClose?.();
                                }}
                                className="min-w-0 flex-1 truncate text-left text-[13px]"
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
                                  className="rounded p-1 text-faint hover:bg-hover hover:text-ink"
                                  aria-label="Rename chat"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => store.deleteChat(item.id)}
                                  className="rounded p-1 text-faint hover:bg-danger/15 hover:text-danger"
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
          <div className="flex items-center gap-2 px-3 pt-3">
            <button
              onClick={() => onSection("chats")}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-ink"
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

      {/* footer */}
      <div className="border-t border-line px-2 py-2">
        <a
          href={WHATS_NEW_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <Megaphone className="h-4 w-4 text-faint" />
          What&apos;s new
        </a>

        <div className="mt-0.5 flex items-center gap-1">
          <button
            onClick={onOpenAccount}
            title={displayName}
            aria-label={`Account: ${displayName}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-hover"
          >
            {/* Just the picture — the name and address live in the account dialog. */}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accent/20 text-[10px] font-semibold text-accent-pale">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsFor(displayName)
              )}
            </span>
          </button>
          <button
            onClick={() => void signOutUser()}
            className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-danger/15 hover:text-danger"
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
