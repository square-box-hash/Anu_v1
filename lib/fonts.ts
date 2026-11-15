import localFont from "next/font/local";

/** Display serif used by the landing hero and markdown headings. */
export const instrumentSerif = localFont({
  src: [
    { path: "../app/fonts/InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

/** UI sans. */
export const inter = localFont({
  src: [{ path: "../app/fonts/InterVar.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
