import React from "react";
import { cx } from "@/lib/utils";

export default function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // logo-mono.png is the mark already flattened to white with its
      // semi-transparent pixels strengthened: filtering the colour original
      // left the thin strokes washed out on the violet canvases.
      src="/logo-mono.png"
      alt="Anu"
      width={64}
      height={64}
      draggable={false}
      // Black on the paper canvas, untouched white on the dark ones.
      // Per-theme values live in globals.css (--logo-filter).
      style={{ filter: "var(--logo-filter)" }}
      className={cx("select-none", className ?? "h-7 w-7")}
    />
  );
}
