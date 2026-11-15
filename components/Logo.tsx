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
      className={cx("select-none", className ?? "h-7 w-7")}
    />
  );
}
