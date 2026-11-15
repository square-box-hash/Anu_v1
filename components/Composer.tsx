"use client";

import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { MODELS } from "@/lib/types";
import type { Attachment } from "@/lib/types";
import { cx, formatBytes, uid } from "@/lib/utils";
import { Bolt, Chevron, File, Image as ImageIcon, Paperclip, Send, Stop, Terminal, X } from "./Icons";
import { StatusDot } from "./ui";

export default function Composer() {
  const store = useStore();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const next: Attachment[] = Array.from(list).map((f) => ({
      id: uid(),
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    }));
    setFiles((prev) => [...prev, ...next].slice(0, 8));
  };

  const submit = () => {
    if (store.streaming) {
      store.stop();
      return;
    }
    if (!text.trim() && files.length === 0) return;
    void store.send(text, files);
    setText("");
    setFiles([]);
  };

  const activeModel = MODELS.find((m) => m.id === store.settings.model) ?? MODELS[0];
  const enabledSkills = store.skills.filter((s) => s.enabled).length;
  const enabledServers = store.servers.filter((s) => s.enabled).length;

  return (
    <div className="px-4 pb-4 pt-1 sm:px-6">
      <div className="mx-auto w-full max-w-[820px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cx(
            "rounded-2xl border bg-panel/80 shadow-[0_-10px_40px_-30px_rgba(139,92,246,0.8)] backdrop-blur transition-colors",
            dragging ? "border-accent/70 bg-accent/[0.06]" : "border-line focus-within:border-accent/40",
          )}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
              {files.map((f) => (
                <span
                  key={f.id}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-line bg-black/30 px-2 py-1 text-[11px] text-muted"
                >
                  {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3 text-accent-soft" /> : <File className="h-3 w-3 text-accent-soft" />}
                  <span className="max-w-[160px] truncate text-ink/85">{f.name}</span>
                  <span className="text-faint">{formatBytes(f.size)}</span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                    className="rounded p-0.5 text-faint hover:bg-white/10 hover:text-rose-300"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={dragging ? "Drop files to attach…" : "Message Anu — Shift + Enter for a new line"}
            className="max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint/80"
          />

          <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
              title="Attach files"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-ink/85 transition-colors hover:border-linestrong"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />
                {activeModel.label}
                <Chevron className={cx("h-3 w-3 text-faint transition-transform", menu && "rotate-180")} />
              </button>
              {menu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 w-[236px] animate-rise overflow-hidden rounded-xl border border-line bg-panel2 shadow-2xl shadow-black/60">
                  <div className="border-b border-line px-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">
                    Model
                  </div>
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        store.updateSettings({ model: m.id });
                        setMenu(false);
                      }}
                      className={cx(
                        "flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/[0.05]",
                        m.id === store.settings.model && "bg-accent/10",
                      )}
                    >
                      <span>
                        <span className="block text-[12.5px] text-ink">{m.label}</span>
                        <span className="block text-[10px] text-faint">{m.hint}</span>
                      </span>
                      {m.id === store.settings.model && <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1 h-4 w-px bg-line" />

            <span className="hidden items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-muted sm:inline-flex" title="Active skills">
              <Bolt className="h-3 w-3 text-accent-soft" />
              {enabledSkills}
            </span>
            <span className="hidden items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-muted sm:inline-flex" title="Connected MCP servers">
              <Terminal className="h-3 w-3 text-accent-soft" />
              {enabledServers}
            </span>
            <button
              onClick={() => store.updateHarness({ enabled: !store.harness.enabled })}
              className={cx(
                "hidden items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors sm:inline-flex",
                store.harness.enabled
                  ? "border-accent/40 bg-accent/10 text-accent-pale"
                  : "border-line bg-white/[0.02] text-muted hover:text-ink",
              )}
              title="Toggle harness agent bridge"
            >
              <StatusDot status={store.harness.enabled ? store.harness.status : "disconnected"} />
              harness
            </button>

            <div className="ml-auto flex items-center gap-1.5">
              <span className="hidden font-mono text-[10px] text-faint md:inline">↵ to send</span>
              <button
                onClick={submit}
                disabled={!store.streaming && !text.trim() && files.length === 0}
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                  store.streaming
                    ? "bg-white/10 text-ink hover:bg-white/15"
                    : "bg-accent text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.9)] hover:bg-accent-soft disabled:bg-white/[0.06] disabled:text-faint disabled:shadow-none",
                )}
                aria-label={store.streaming ? "Stop generating" : "Send message"}
              >
                {store.streaming ? <Stop className="h-3.5 w-3.5" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[10.5px] leading-relaxed text-faint/80">
          Anu can make mistakes — double-check important details.
        </p>
      </div>
    </div>
  );
}
