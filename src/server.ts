/**
 * server.ts
 *
 * Creates and configures the Arc docs MCP server.
 * Shared between the stdio (cli.ts) and SSE (sse.ts) entry points.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function createServer(): McpServer {
  const server = new McpServer({
    name: "arc-docs-mcp",
    version: "1.0.0",
  });

  // ── Tools ──────────────────────────────────────────────────────

  server.tool(
    "arc_search_docs",
    "Search the Arc blockchain documentation and return ranked matches with snippets.",
    {
      query: z.string().describe("Search query (keywords or natural language question)"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of results to return (default: 8)"),
    },
    async ({ query, max_results }) => {
      await loadDocs();
      const results = searchDocs(query, max_results ?? 8);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for "${query}". Try different keywords.`,
            },
          ],
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title}\n    ID: ${r.id}\n    URL: ${r.url}\n    Score: ${r.score}\n    Snippet: ${r.snippet}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} result(s) for "${query}":\n\n${formatted}`,
          },
        ],
      };
    }
  );

  server.tool(
    "arc_read_doc",
    "Read a documentation section by slug, path, title, URL, or fuzzy query.",
    {
      query: z
        .string()
        .describe("Section slug, path, title, URL, or fuzzy search query"),
    },
    async ({ query }) => {
      await loadDocs();
      const section = getSectionBySlug(query);

      if (!section) {
        // Fall back to search
        const results = searchDocs(query, 1);
        if (results.length > 0) {
          const fallback = getSectionById(results[0].id);
          if (fallback) {
            return {
              content: [
                {
                  type: "text",
                  text: `# ${fallback.title}\n\nURL: ${fallback.url}\nPath: ${fallback.path}\n\n${fallback.body}`,
                },
              ],
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `No section found for "${query}". Use arc_search_docs to find available sections.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `# ${section.title}\n\nURL: ${section.url}\nPath: ${section.path}\n\n${section.body}`,
          },
        ],
      };
    }
  );

  server.tool(
    "arc_get_doc_by_id",
    "Read a specific documentation section by its exact ID (returned from search results).",
    {
      id: z.string().describe("The section ID from search results"),
    },
    async ({ id }) => {
      await loadDocs();
      const section = getSectionById(id);

      if (!section) {
        return {
          content: [
            {
              type: "text",
              text: `No section found with ID "${id}". Use arc_search_docs to find valid IDs.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `# ${section.title}\n\nURL: ${section.url}\nPath: ${section.path}\n\n${section.body}`,
          },
        ],
      };
    }
  );

  server.tool(
    "arc_search_examples",
    "Search for sections that contain code examples, commands, SDK snippets, or configuration samples.",
    {
      query: z.string().describe("Search query for code examples"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of results (default: 5)"),
    },
    async ({ query, max_results }) => {
      await loadDocs();
      const results = searchExamples(query, max_results ?? 5);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No code examples found for "${query}".`,
            },
          ],
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title}\n    ID: ${r.id}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} example(s) for "${query}":\n\n${formatted}`,
          },
        ],
      };
    }
  );

  server.tool(
    "arc_get_related_docs",
    "Find related documentation pages based on a given section.",
    {
      section_id: z.string().describe("The section ID to find related pages for"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of related pages (default: 5)"),
    },
    async ({ section_id, max_results }) => {
      await loadDocs();
      const related = getRelatedDocs(section_id, max_results ?? 5);

      if (related.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No related sections found for "${section_id}".`,
            },
          ],
        };
      }

      const formatted = related
        .map(
          (s, i) =>
            `[${i + 1}] ${s.title}\n    ID: ${s.id}\n    URL: ${s.url}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Related pages for "${section_id}":\n\n${formatted}`,
          },
        ],
      };
    }
  );

  server.tool(
    "arc_list_topics",
    "List top-level Arc documentation topics with page counts and example pages.",
    {},
    async () => {
      await loadDocs();
      const topics = listTopics();

      const formatted = topics
        .map(
          (t) =>
            `${t.topic} (${t.count} pages)\n    Examples: ${t.pages.join(", ")}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Arc documentation topics:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  server.tool(
    "arc_list_sections",
    "List all available parsed documentation sections, optionally filtered by a prefix.",
    {
      filter: z
        .string()
        .optional()
        .describe("Optional filter text to match against section titles or paths"),
    },
    async ({ filter }) => {
      await loadDocs();
      let allSections = getSections();

      if (filter) {
        const f = filter.toLowerCase();
        allSections = allSections.filter(
          (s) =>
            s.title.toLowerCase().includes(f) ||
            s.path.toLowerCase().includes(f)
        );
      }

      const lines = allSections.map(
        (s) => `- ${s.title} [${s.id}] ${s.url}`
      );

      return {
        content: [
          {
            type: "text",
            text: `${allSections.length} section(s)${filter ? ` matching "${filter}"` : ""}:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── Resources ──────────────────────────────────────────────────

  server.resource(
    "arc-docs-index",
    "arc://docs/index",
    { description: "JSON index of all parsed Arc documentation sections" },
    async (uri) => {
      await loadDocs();
      const index = getSections().map((s) => ({
        id: s.id,
        title: s.title,
        path: s.path,
        url: s.url,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(index, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "arc-doc-section",
    new ResourceTemplate("arc://docs/section/{id}", { list: undefined }),
    { description: "Individual Arc documentation section by ID" },
    async (uri, variables) => {
      await loadDocs();
      const id = String(variables.id);
      const section = getSectionById(id);

      if (!section) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Section "${id}" not found.`,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: `# ${section.title}\n\n${section.body}`,
          },
        ],
      };
    }
  );

  return server;
}
