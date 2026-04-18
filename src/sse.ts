/**
 * sse.ts — Remote SSE entry point
 *
 * Deploys as a remote MCP server on Railway (or any Node.js host).
 * Exposes /sse for SSE connections and /messages for client POST messages.
 */

import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

// Railway health checks
app.get("/", (_req, res) => {
  res.json({
    name: "arc-docs-mcp",
    version: "1.0.0",
    description:
      "Arc blockchain documentation MCP server. Connect via /sse endpoint.",
    endpoints: {
      sse: "/sse",
      messages: "/messages",
      health: "/health",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Track active transports by session (capped to prevent resource exhaustion)
const MAX_SESSIONS = 100;
const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  if (transports.size >= MAX_SESSIONS) {
    res.status(503).json({ error: "Too many active sessions. Try again later." });
    return;
  }

  const server = createServer();
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  res.on("close", () => {
    transports.delete(sessionId);
  });

  await server.connect(transport);
});

app.post("/messages", express.raw({ type: "*/*" }), async (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing sessionId" });
    return;
  }

  const transport = transports.get(sessionId)!;

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error("Error handling message:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`arc-docs-mcp SSE server running on port ${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Messages:     http://localhost:${PORT}/messages`);
  console.log(`  Health:       http://localhost:${PORT}/health`);
});
