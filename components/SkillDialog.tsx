"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RepoSkill } from "@/lib/types";
import { cx } from "@/lib/utils";
import Markdown from "./Markdown";
import { X } from "./Icons";
import { Toggle } from "./ui";

export default function SkillDialog({
  skill,
  enabled,
  onToggle,
  onClose,
}: {
  skill: RepoSkill;
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    setError(null);

    const query = new URLSearchParams({ slug: skill.slug });
    if (file) query.set("file", file);

    fetch(`/api/skills?${query.toString()}`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; body?: string; error?: string }) => {
        if (cancelled) return;
        if (data.ok) setBody(data.body ?? "");
        else setError(data.error ?? "Could not read this file.");
      })
      .catch(() => {
        if (!cancelled) setError("Could not read this file.");
      });

    return () => {
      cancelled = true;
    };
  }, [skill.slug, file]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} skill`}
        className="relative flex max-h-[90vh] w-full animate-rise flex-col overflow-hidden rounded-t-2xl border border-line bg-panel2 shadow-[0_-20px_80px_-20px_rgba(0,0,0,0.9)] sm:max-h-[85vh] sm:max-w-[760px] sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", enabled ? "bg-accent-soft" : "bg-faint/60")} />
              <h2 className="truncate font-mono text-[13.5px] text-ink">{skill.name}</h2>
              <span className="rounded border border-line px-1 font-mono text-[9px] uppercase tracking-wider text-faint">
                skill
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{skill.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Toggle checked={enabled} onChange={onToggle} label={skill.name} />
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-faint transition-colors hover:bg-hover hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2 no-scrollbar">
          <button
            onClick={() => setFile(null)}
            className={cx(
              "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10.5px] transition-colors",
              file === null ? "bg-accent/15 text-accent-pale" : "text-faint hover:bg-hover hover:text-ink",
            )}
          >
            SKILL.md
          </button>
          {skill.files.map((item) => (
            <button
              key={item}
              onClick={() => setFile(item)}
              className={cx(
                "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10.5px] transition-colors",
                file === item ? "bg-accent/15 text-accent-pale" : "text-faint hover:bg-hover hover:text-ink",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          ) : body === null ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="h-3 animate-pulse rounded bg-surface"
                  style={{ width: `${92 - row * 12}%` }}
                />
              ))}
            </div>
          ) : (
            <Markdown content={body} />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/70">
            {file ?? "SKILL.md"} · read-only
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:border-linestrong hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
