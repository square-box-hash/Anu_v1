import React from "react";
import { cx } from "@/lib/utils";

export default function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Anu"
      width={64}
      height={64}
      draggable={false}
      // The mark is a raster PNG, so its colour is a filter rather than
      // currentColor: black on the paper canvas, white on the dark ones.
      // Per-theme values live in globals.css (--logo-filter).
      style={{ filter: "var(--logo-filter)" }}
      className={cx("select-none", className ?? "h-7 w-7")}
    />
  );
}
