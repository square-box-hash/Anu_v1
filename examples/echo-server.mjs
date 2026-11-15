import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "test-echo", version: "1.0.0" });

server.tool(
  "echo",
  "Echo text back with a prefix",
  { text: z.string().describe("text to echo") },
  async ({ text }) => ({ content: [{ type: "text", text: `echo: ${text}` }] }),
);

server.tool(
  "add",
  "Add two numbers",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
);

await server.connect(new StdioServerTransport());
