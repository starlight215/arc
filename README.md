# Arc Docs MCP

A lightweight, read-only MCP server that exposes [Arc blockchain](https://arc.network) documentation as searchable tools for MCP-compatible clients like Claude Code, Cursor, VS Code, ChatGPT, Gemini CLI, and Codex.

This project is a **docs-only server**. It does not interact with the Arc chain, sign transactions, or modify anything on the network.

## What this server does

The server loads the official Arc documentation bundle from Mintlify:

- `https://docs.arc.network/llms-full.txt`

It parses that bundle into sections and exposes:

- Searchable MCP tools for querying Arc documentation
- A browsable docs index resource
- Individual section resources

## Remote (Cloudflare Workers)

Connect to the hosted remote server without installing anything:

```
https://arc-docs-mcp.YOUR-ACCOUNT.workers.dev/mcp
```

Use this URL in any MCP client that supports remote connections (Claude Desktop via mcp-remote, Cursor, Cloudflare AI Playground, MCP Inspector, etc).

## Quickstart for Claude Code

```bash
claude mcp add --transport stdio arc-docs -- npx -y github:namedfarouk/arc-docs-mcp
```

Then start Claude Code:

```bash
claude
```

Inside Claude Code, run:

```
/mcp
```

You should see the `arc-docs` server and its tool endpoints listed.

## Quickstart for Cursor (per-project)

Add this to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "arc-docs": {
      "command": "npx",
      "args": ["-y", "github:namedfarouk/arc-docs-mcp"]
    }
  }
}
```

> **Tip:** If Cursor does not recognize `mcpServers` in your version, try `mcp_servers` as the top-level key instead.

## Quickstart for VS Code (per-workspace)

Add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "arc-docs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:namedfarouk/arc-docs-mcp"]
    }
  },
  "inputs": []
}
```

## Quickstart for Gemini CLI

```bash
gemini mcp add --scope user arc-docs npx -y github:namedfarouk/arc-docs-mcp
```

Confirm it is registered:

```bash
gemini mcp list
```

## Quickstart for Codex

Add this to your Codex MCP config:

```toml
[mcp_servers.arc-docs]
command = "npx"
args = ["-y", "github:namedfarouk/arc-docs-mcp"]
```

Then restart Codex so it reloads the MCP config.

## Quickstart from source

1. Clone the repo:

   ```bash
   git clone https://github.com/namedfarouk/arc-docs-mcp
   cd arc-docs-mcp
   ```

2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

3. Run the local stdio server:

   ```bash
   npm start
   ```

4. Or run the remote SSE server:

   ```bash
   npm run start:sse
   ```

## Deploy to Cloudflare Workers (recommended, free)

The fastest way to get the remote server live at zero cost.

1. Install Wrangler globally (if you haven't):

   ```bash
   npm install -g wrangler
   ```

2. Log in to Cloudflare:

   ```bash
   wrangler login
   ```

3. Clone and install:

   ```bash
   git clone https://github.com/namedfarouk/arc-docs-mcp
   cd arc-docs-mcp
   npm install
   ```

4. Test locally:

   ```bash
   npm run cf:dev
   ```

   Your MCP server will be running at `http://localhost:8787/mcp`.

5. Deploy to Cloudflare:

   ```bash
   npm run cf:deploy
   ```

   Your server will be live at `https://arc-docs-mcp.YOUR-ACCOUNT.workers.dev/mcp`.

### Connect to the remote server

From Claude Desktop (using mcp-remote proxy):

```json
{
  "mcpServers": {
    "arc-docs": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://arc-docs-mcp.YOUR-ACCOUNT.workers.dev/mcp"
      ]
    }
  }
}
```

From Cursor:

```json
{
  "mcpServers": {
    "arc-docs": {
      "url": "https://arc-docs-mcp.YOUR-ACCOUNT.workers.dev/mcp"
    }
  }
}
```

From MCP Inspector (for testing):

```bash
npx @modelcontextprotocol/inspector@latest
```

Then enter your Worker URL in the inspector UI.

## Deploy to Railway (alternative)

If you prefer Railway over Cloudflare Workers:

1. Push this repo to GitHub
2. Connect the repo in [Railway](https://railway.app)
3. Railway will auto-detect the `railway.json` config and deploy
4. Your SSE endpoint will be available at `https://YOUR-APP.up.railway.app/sse`

## Tool endpoints

| Tool | Description |
|------|-------------|
| `arc_search_docs` | Search documentation and return ranked matches with snippets |
| `arc_read_doc` | Read a section by slug, path, title, URL, or fuzzy query |
| `arc_get_doc_by_id` | Read a section by its exact ID from search results |
| `arc_search_examples` | Search for sections containing code examples and commands |
| `arc_get_related_docs` | Find related documentation pages for a given section |
| `arc_list_topics` | List top-level documentation topics with page counts |
| `arc_list_sections` | List all parsed sections with optional text filter |

## Resources

| Resource | Description |
|----------|-------------|
| `arc://docs/index` | JSON index of all parsed sections |
| `arc://docs/section/{id}` | Individual documentation section by ID |

## Project structure

| File/Folder | Purpose |
|-------------|---------|
| `src/arcDocs.ts` | Docs loading, caching, parsing, search, and formatting helpers |
| `src/server.ts` | MCP server setup, tool and resource registration (Node.js) |
| `src/worker.ts` | Cloudflare Workers entry point using McpAgent |
| `src/cli.ts` | Stdio entry point for local MCP clients |
| `src/sse.ts` | SSE entry point for Railway/Render deployment |
| `src/check.ts` | Health check that verifies docs can be fetched and parsed |
| `wrangler.jsonc` | Cloudflare Workers configuration |
| `Dockerfile` | Container build for Railway/Render |
| `railway.json` | Railway platform configuration |

## How it's built

- Built on [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- Uses `StdioServerTransport` for local MCP clients
- Uses `SSEServerTransport` with Express for Railway/Render deployment
- Uses [`McpAgent`](https://developers.cloudflare.com/agents/api-reference/mcp-agent-api/) from Cloudflare Agents SDK for Workers deployment (SSE + Streamable HTTP)
- Uses `zod` to validate tool arguments
- Fetches Arc docs from the official Mintlify `llms-full.txt` bundle
- Parses the bundle into section-level resources
- Uses deterministic keyword scoring over titles, slugs, paths, and body text
- Caches docs in memory with a configurable refresh interval

## Configuration

Optional environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ARC_DOCS_URL` | Alternate source URL for the docs bundle | `https://docs.arc.network/llms-full.txt` |
| `ARC_DOCS_TIMEOUT_MS` | HTTP timeout in milliseconds | `15000` |
| `ARC_DOCS_CACHE_HOURS` | Cache freshness window in hours | `24` |
| `PORT` | Port for the SSE server | `3000` |

## Local development

```bash
npm install
npm run build
npm run check
npm start
```

`npm run check` verifies that the server can fetch and parse the live Arc docs bundle.

## License

MIT
---

Built by FK [@NamedFarouk](https://x.com/NamedFarouk) For [Arc](https://x.com/Arc) Community.
