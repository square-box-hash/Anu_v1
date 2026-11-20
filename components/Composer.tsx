"use client";

import React, { useEffect, useRef, useState } from "react";
import { TRANSLATE_LANGUAGES, getAllModels } from "@/lib/models";
import { useStore } from "@/lib/store";
import { canExtract, extractText } from "@/lib/extract";
import type { Attachment } from "@/lib/types";
import { cx, formatBytes, uid } from "@/lib/utils";
import {
  Bolt,
  Chevron,
  Cpu,
  File,
  Image as ImageIcon,
  Languages,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Stop,
  Terminal,
  X,
} from "./Icons";
import { StatusDot } from "./ui";

export function focusComposer() {
  const el = document.getElementById("composer-input") as HTMLTextAreaElement | null;
  el?.focus();
  el?.setSelectionRange(el.value.length, el.value.length);
}

function isReadableTextFile(file: globalThis.File): boolean {
  if (file.type.startsWith("text/") || /json|xml|javascript|typescript|yaml|csv/i.test(file.type)) {
    return true;
  }
  return /\.(txt|md|markdown|json|csv|tsv|ts|tsx|js|jsx|py|rb|go|rs|java|c|cpp|h|css|html|yml|yaml|sql|sh|env|log)$/i.test(
    file.name,
  );
}

function int16ArrayToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

export default function Composer() {
  const store = useStore();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micChunksRef = useRef<Int16Array[]>([]);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);

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

  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      void micCtxRef.current?.close();
      void playbackCtxRef.current?.close();
    };
  }, []);

  const addFiles = async (list: FileList | globalThis.File[] | null) => {
    if (!list) return;
    const rawFiles = Array.from(list).slice(0, 8 - files.length);
    const notes: string[] = [];
    const next: Attachment[] = await Promise.all(
      rawFiles.map(async (f) => {
        let textContent: string | undefined;
        if (canExtract(f)) {
          const extracted = await extractText(f);
          textContent = extracted.text;
          if (!extracted.text && extracted.note) notes.push(extracted.note);
        } else if (f.size > 0) {
          notes.push(`${f.name}: this file type can't be read as text yet.`);
        }
        return {
          id: uid(),
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
          textContent,
        };
      }),
    );
    setFileNote(notes.length ? notes.join("  ·  ") : null);
    setFiles((prev) => [...prev, ...next].slice(0, 8));
  };

  const playAudioChunk24k = (base64Pcm24k: string) => {
    try {
      if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
        playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
        nextStartTimeRef.current = 0;
      }
      const ctx = playbackCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const floats = base64ToFloat32(base64Pcm24k);
      if (!floats.length) return;
      const buffer = ctx.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(new Float32Array(floats), 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
      src.start(startAt);
      nextStartTimeRef.current = startAt + buffer.duration;
    } catch {
      /* ignore audio playback glitch */
    }
  };

  const toggleRecording = async () => {
    setMicError(null);
    if (recording) {
      setRecording(false);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      await micCtxRef.current?.close().catch(() => {});
      micCtxRef.current = null;

      const chunks = micChunksRef.current;
      micChunksRef.current = [];
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      if (!totalLen) return;
      const merged = new Int16Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const mode = store.settings.model === "gemini-3.5-live-translate-preview" ? "translate" : "voice";
      await store.sendLiveAudio(int16ArrayToBase64(merged), mode, playAudioChunk24k);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      micChunksRef.current = [];
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        micChunksRef.current.push(pcm);
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      micStreamRef.current = stream;
      micCtxRef.current = ctx;
      setRecording(true);
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "Microphone access unavailable.");
    }
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

  const allModels = getAllModels(store.settings.customModels);
  const activeModel = allModels.find((m) => m.id === store.settings.model) ?? allModels[1] ?? allModels[0];
  const isLiveTranslate = store.settings.model === "gemini-3.5-live-translate-preview";
  const enabledSkills = store.skills.filter((s) => s.enabled).length;
  const enabledServers = store.servers.filter((s) => s.enabled).length;

  return (
    <div className="px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-1 sm:px-6 sm:pb-4">
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
            void addFiles(e.dataTransfer.files);
          }}
          className={cx(
            "rounded-2xl border bg-panel/80 shadow-[0_-10px_40px_-30px_rgba(139,92,246,0.8)] backdrop-blur transition-colors",
            dragging ? "border-accent/70 bg-accent/[0.06]" : "border-line focus-within:border-accent/40",
          )}
        >
          {store.pendingQuote && (
            <div className="flex items-start gap-2 border-b border-line px-3 py-2">
              <span className="mt-[3px] h-3 w-[2px] shrink-0 rounded-full bg-accent-soft" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint/80">
                  replying to {store.pendingQuote.role === "user" ? "your message" : "the reply"}
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-muted">
                  {store.pendingQuote.text}
                </p>
              </div>
              <button
                onClick={() => store.setQuote(null)}
                className="shrink-0 rounded p-0.5 text-faint transition-colors hover:bg-hover hover:text-ink"
                aria-label="Remove quoted text"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
              {files.map((f) => (
                <span
                  key={f.id}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-line bg-sunken px-2 py-1 text-[11px] text-muted"
                >
                  {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3 text-accent-soft" /> : <File className="h-3 w-3 text-accent-soft" />}
                  <span className="max-w-[160px] truncate text-ink/85">{f.name}</span>
                  <span className="text-faint">{formatBytes(f.size)}</span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                    className="rounded p-0.5 text-faint hover:bg-hover hover:text-danger"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {fileNote && (
            <div className="border-b border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] leading-relaxed text-warn">
              {fileNote}
            </div>
          )}

          {micError && (
            <div className="border-b border-rose-500/25 bg-danger/10 px-3 py-1.5 text-[11px] text-danger">
              {micError}
            </div>
          )}

          <textarea
            id="composer-input"
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
            placeholder={
              recording
                ? isLiveTranslate
                  ? "Listening for live speech translation… click mic to send"
                  : "Listening via Gemini 3.8 Live… click mic to send"
                : dragging
                  ? "Drop files to attach…"
                  : "Message Anu — Shift + Enter for a new line"
            }
            className="max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint/80"
          />

          <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-hover hover:text-ink"
              title="Attach files"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void toggleRecording()}
              disabled={store.streaming}
              className={cx(
                "rounded-lg p-2 transition-colors disabled:opacity-40",
                recording
                  ? "bg-rose-500/20 text-danger ring-1 ring-rose-400/50 animate-pulse"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
              title={
                recording
                  ? "Stop recording & send audio"
                  : isLiveTranslate
                    ? "Speak for Gemini 3.5 Live Translate"
                    : "Speak with Gemini 3.8 Live"
              }
              aria-label={recording ? "Stop voice recording" : "Start voice recording"}
            >
              {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink/85 transition-colors hover:border-linestrong"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />
                <span className="max-w-[140px] truncate">{activeModel.label}</span>
                <Chevron className={cx("h-3 w-3 text-faint transition-transform", menu && "rotate-180")} />
              </button>
              {menu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-[340px] w-[290px] animate-rise overflow-y-auto rounded-xl border border-line bg-panel2 shadow-2xl shadow-black/60">
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel2/95 px-3 py-2 backdrop-blur">
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">
                      Model & Orchestrator
                    </span>
                    <span className="font-mono text-[9px] text-faint">{allModels.length} ready</span>
                  </div>
                  {allModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        store.updateSettings({
                          model: m.id,
                          autoRoute: m.id === "auto" ? true : store.settings.autoRoute,
                        });
                        setMenu(false);
                      }}
                      className={cx(
                        "flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-hover",
                        m.id === store.settings.model && "bg-accent/10",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[12px] text-ink">
                          <span className="truncate">{m.label}</span>
                          {m.badge && (
                            <span className="shrink-0 rounded border border-line bg-sunken px-1 py-[0.5px] font-mono text-[8.5px] uppercase tracking-wider text-accent-pale">
                              {m.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block line-clamp-1 text-[10px] text-faint">{m.hint}</span>
                      </span>
                      {m.id === store.settings.model && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-soft" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {store.settings.model !== "auto" && (
              <button
                type="button"
                onClick={() => store.updateSettings({ autoRoute: !store.settings.autoRoute })}
                className={cx(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors",
                  store.settings.autoRoute
                    ? "border-accent/45 bg-accent/15 text-accent-pale"
                    : "border-line bg-surface text-muted hover:text-ink",
                )}
                title="Enable 4-step smart prompt routing (Decisions 1 → Context → Planner → Subagents)"
              >
                <Cpu className="h-3 w-3" />
                auto
              </button>
            )}

            {isLiveTranslate && (
              <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] text-muted">
                <Languages className="h-3 w-3 text-accent-soft" />
                <select
                  value={store.settings.orchestration.translateTargetLanguage}
                  onChange={(e) => store.updateOrchestration({ translateTargetLanguage: e.target.value })}
                  className="bg-transparent text-[11px] text-ink outline-none"
                  aria-label="Target translation language"
                >
                  {TRANSLATE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-[#120e1e] text-ink">
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mx-1 hidden h-4 w-px bg-line sm:block" />

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
                  : "border-line bg-surface text-muted hover:text-ink",
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
                    ? "bg-surface text-ink hover:bg-hover"
                    : "bg-accent text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.9)] hover:bg-accent-soft disabled:bg-surface disabled:text-faint disabled:shadow-none",
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
