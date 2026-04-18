/**
 * worker.ts — Cloudflare Workers entry point
 *
 * Uses the raw MCP SDK with WebStandardStreamableHTTPServerTransport.
 * No agents package needed. Works on free tier.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  loadDocs,
  getSections,
  getSectionById,
  getSectionBySlug,
  searchDocs,
  searchExamples,
  listTopics,
  getRelatedDocs,
} from "./arcDocs.js";

function buildServer(): McpServer {
  const server = new McpServer({ name: "arc-docs-mcp", version: "1.0.0" });

  server.tool(
    "arc_search_docs",
    "Search Arc blockchain documentation. Returns ranked matches with snippets.",
    {
      query: z.string().describe("Search query"),
      max_results: z.number().int().min(1).max(20).optional().describe("Max results (default: 8)"),
    },
    async ({ query, max_results }) => {
      await loadDocs();
      const results = searchDocs(query, max_results ?? 8);
      if (results.length === 0) return { content: [{ type: "text" as const, text: `No results for "${query}".` }] };
      const fmt = results.map((r, i) => `[${i+1}] ${r.title}\n    ID: ${r.id}\n    URL: ${r.url}\n    Score: ${r.score}\n    ${r.snippet}`).join("\n\n");
      return { content: [{ type: "text" as const, text: `Found ${results.length} result(s):\n\n${fmt}` }] };
    }
  );

  server.tool(
    "arc_read_doc",
    "Read a doc section by slug, path, title, URL, or fuzzy query.",
    { query: z.string().describe("Section identifier or search query") },
    async ({ query }) => {
      await loadDocs();
      let section = getSectionBySlug(query);
      if (!section) { const r = searchDocs(query, 1); if (r.length) section = getSectionById(r[0].id) ?? undefined; }
      if (!section) return { content: [{ type: "text" as const, text: `Not found: "${query}". Use arc_search_docs first.` }] };
      return { content: [{ type: "text" as const, text: `# ${section.title}\nURL: ${section.url}\n\n${section.body}` }] };
    }
  );

  server.tool(
    "arc_get_doc_by_id",
    "Read a doc section by exact ID from search results.",
    { id: z.string().describe("Section ID") },
    async ({ id }) => {
      await loadDocs();
      const section = getSectionById(id);
      if (!section) return { content: [{ type: "text" as const, text: `No section with ID "${id}".` }] };
      return { content: [{ type: "text" as const, text: `# ${section.title}\nURL: ${section.url}\n\n${section.body}` }] };
    }
  );

  server.tool(
    "arc_search_examples",
    "Search for sections containing code examples, commands, or SDK snippets.",
    {
      query: z.string().describe("Search query"),
      max_results: z.number().int().min(1).max(10).optional().describe("Max results (default: 5)"),
    },
    async ({ query, max_results }) => {
      await loadDocs();
      const results = searchExamples(query, max_results ?? 5);
      if (results.length === 0) return { content: [{ type: "text" as const, text: `No examples for "${query}".` }] };
      const fmt = results.map((r, i) => `[${i+1}] ${r.title}\n    ID: ${r.id}\n    URL: ${r.url}\n    ${r.snippet}`).join("\n\n");
      return { content: [{ type: "text" as const, text: `Found ${results.length} example(s):\n\n${fmt}` }] };
    }
  );

  server.tool(
    "arc_get_related_docs",
    "Find related documentation pages.",
    {
      section_id: z.string().describe("Section ID to find related pages for"),
      max_results: z.number().int().min(1).max(10).optional().describe("Max results (default: 5)"),
    },
    async ({ section_id, max_results }) => {
      await loadDocs();
      const related = getRelatedDocs(section_id, max_results ?? 5);
      if (related.length === 0) return { content: [{ type: "text" as const, text: `No related sections for "${section_id}".` }] };
      const fmt = related.map((s, i) => `[${i+1}] ${s.title} [${s.id}] ${s.url}`).join("\n");
      return { content: [{ type: "text" as const, text: `Related:\n${fmt}` }] };
    }
  );

  server.tool("arc_list_topics", "List top-level Arc doc topics with page counts.", {}, async () => {
    await loadDocs();
    const topics = listTopics();
    const fmt = topics.map((t) => `${t.topic} (${t.count} pages): ${t.pages.join(", ")}`).join("\n");
    return { content: [{ type: "text" as const, text: `Topics:\n${fmt}` }] };
  });

  server.tool(
    "arc_list_sections",
    "List all parsed doc sections, optionally filtered.",
    { filter: z.string().optional().describe("Optional filter text") },
    async ({ filter }) => {
      await loadDocs();
      let all = getSections();
      if (filter) { const f = filter.toLowerCase(); all = all.filter((s) => s.title.toLowerCase().includes(f) || s.path.toLowerCase().includes(f)); }
      const lines = all.map((s) => `- ${s.title} [${s.id}] ${s.url}`);
      return { content: [{ type: "text" as const, text: `${all.length} section(s):\n${lines.join("\n")}` }] };
    }
  );

  return server;
}

// ── Worker fetch handler ─────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      const server = buildServer();
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined as unknown as (() => string) });
      await server.connect(transport);
      return transport.handleRequest(request);
    }

    if (url.pathname === "/" || url.pathname === "") {
      return Response.json({
        name: "arc-docs-mcp",
        version: "1.0.0",
        description: "Arc blockchain documentation MCP server",
        mcp: url.origin + "/mcp",
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
