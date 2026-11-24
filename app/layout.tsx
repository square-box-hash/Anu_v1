import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import { inter, instrumentSerif } from "@/lib/fonts";
import { themeInitScript } from "@/lib/theme";
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
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets data-theme before first paint, so there is no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* The Lumen theme's own type: a grotesque for the interface and a serif
            for reading. Other themes never reference these families. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
