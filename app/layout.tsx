import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula — AI Chat Workspace",
  description:
    "A purple-themed AI chat workspace: streaming chat, file attachments, skills, MCP connectors and a harness bridge. Built with Next.js and TypeScript.",
};

export const viewport: Viewport = {
  themeColor: "#07060b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
