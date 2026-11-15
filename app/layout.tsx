import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import { inter, instrumentSerif } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anu — AI Chat Workspace",
  description:
    "A purple-themed AI chat workspace: streaming chat, file attachments, skills, MCP connectors and a harness bridge. Built with Next.js and TypeScript.",
};

export const viewport: Viewport = {
  themeColor: "#07060b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
