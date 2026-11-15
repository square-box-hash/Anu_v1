import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ship the skills folder with the server bundle so SKILL.md files are readable at runtime.
  outputFileTracingIncludes: {
    "/api/chat": ["./skills/**/*"],
    "/api/skills": ["./skills/**/*"],
  },
};

export default nextConfig;
