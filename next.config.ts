import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Keep dev server build artifacts separate from `next build` (.next)
    // so live preview requests never collide with production builds.
    distDir: isDevServer ? ".next-dev" : ".next",
    output: "standalone",
    reactStrictMode: true,
    // Ship the skills folder with the server bundle so SKILL.md files are readable at runtime.
    outputFileTracingIncludes: {
      "/api/chat": ["./skills/**/*"],
      "/api/skills": ["./skills/**/*"],
    },
    webpack: (config, { dev }) => {
      // Avoid transient webpack .pack.gz_ filesystem temp files during dev snapshots.
      if (dev) {
        config.cache = false;
      }
      return config;
    },
  };
}
