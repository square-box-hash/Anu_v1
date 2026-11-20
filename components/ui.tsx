"use client";

import React from "react";
import { cx } from "@/lib/utils";

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[20px] w-[36px] shrink-0 rounded-full border transition-colors duration-200",
        checked ? "border-accent/60 bg-accent/80" : "border-line bg-surface",
      )}
    >
      <span
        className={cx(
          "absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export function Pill({
  children,
  active,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  const cls = cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight transition-colors",
        active
          ? "border-accent/50 bg-accent/15 text-accent-pale"
          : "border-line bg-surface text-muted hover:border-linestrong hover:text-ink",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={cls}>
        {children}
      </button>
    );
  }

  return (
    <div title={title} className={cls}>
      {children}
    </div>
  );
}

export function StatusDot({ status }: { status: "connected" | "connecting" | "disconnected" | "error" | "idle" }) {
  const color =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-300"
        : status === "error"
          ? "bg-rose-400"
          : "bg-faint";
  return (
    <span className="relative flex h-1.5 w-1.5">
      {(status === "connected" || status === "connecting") && (
        <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} />
      )}
      <span className={cx("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{label}</span>
        {hint ? <span className="text-[10px] text-faint/80">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-sunken px-2.5 py-2 text-[12.5px] text-ink placeholder:text-faint/70 outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/20";

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">{children}</h3>
      {right}
    </div>
  );
}
