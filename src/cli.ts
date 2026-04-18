#!/usr/bin/env node

/**
 * cli.ts — stdio entry point
 *
 * Run locally with Claude Code, Cursor, VS Code, Gemini CLI, or Codex.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting arc-docs-mcp:", err);
  process.exit(1);
});
