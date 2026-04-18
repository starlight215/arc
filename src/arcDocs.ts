/**
 * arcDocs.ts
 *
 * Fetches the Arc blockchain documentation bundle from Mintlify,
 * parses it into searchable sections, and provides search/retrieval helpers.
 */

const DEFAULT_DOCS_URL = "https://docs.arc.network/llms-full.txt";
const TIMEOUT_MS = Number(process.env.ARC_DOCS_TIMEOUT_MS ?? 15_000);
const CACHE_TTL_MS =
  Number(process.env.ARC_DOCS_CACHE_HOURS ?? 24) * 60 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────

export interface DocSection {
  id: string;          // deterministic slug used as a stable reference
  title: string;       // human-readable title
  path: string;        // original path or URL fragment
  body: string;        // full markdown body
  url: string;         // reconstructed docs URL
}

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  url: string;
  score: number;
  snippet: string;
}

// ── State ──────────────────────────────────────────────────────────

let sections: DocSection[] = [];
let lastFetchedAt = 0;

// ── Public API ─────────────────────────────────────────────────────

export async function loadDocs(): Promise<DocSection[]> {
  const now = Date.now();
  if (sections.length > 0 && now - lastFetchedAt < CACHE_TTL_MS) {
    return sections;
  }

  const source = process.env.ARC_DOCS_URL ?? DEFAULT_DOCS_URL;

  // Support local file paths for offline dev and testing
  if (source.startsWith("file://") || source.startsWith("/")) {
    const { readFile } = await import("node:fs/promises");
    const path = source.startsWith("file://") ? source.slice(7) : source;
    const text = await readFile(path, "utf-8");
    sections = parseSections(text);
    lastFetchedAt = Date.now();
    return sections;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(source, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch docs: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    const parsed = parseSections(text);
    if (parsed.length > 0) {
      sections = parsed;
      lastFetchedAt = Date.now();
    }
    return sections;
  } catch (err) {
    // If we have stale data, serve it instead of crashing
    if (sections.length > 0) {
      console.error("Failed to refresh docs, serving stale cache:", err);
      return sections;
    }
    // No cached data at all, must throw
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function getSections(): DocSection[] {
  return sections;
}

export function getSectionById(id: string): DocSection | undefined {
  return sections.find((s) => s.id === id);
}

export function getSectionBySlug(query: string): DocSection | undefined {
  const q = query.toLowerCase().trim();

  // Exact match on id, path, or url
  const exact = sections.find(
    (s) =>
      s.id === q ||
      s.path.toLowerCase() === q ||
      s.url.toLowerCase() === q ||
      s.title.toLowerCase() === q
  );
  if (exact) return exact;

  // Partial match
  return sections.find(
    (s) =>
      s.path.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q)
  );
}

export function searchDocs(
  query: string,
  maxResults = 8
): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const scored: SearchResult[] = sections.map((s) => {
    const score = scoreSection(s, terms);
    return {
      id: s.id,
      title: s.title,
      path: s.path,
      url: s.url,
      score,
      snippet: extractSnippet(s.body, terms),
    };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function searchExamples(
  query: string,
  maxResults = 5
): SearchResult[] {
  const codeIndicators = [
    "```",
    "npx ",
    "npm ",
    "yarn ",
    "forge ",
    "cast ",
    "curl ",
    "import ",
    "const ",
    "function ",
    "contract ",
    "pragma ",
    "0x",
  ];

  const codeSections = sections.filter((s) =>
    codeIndicators.some((ind) => s.body.includes(ind))
  );

  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const scored: SearchResult[] = codeSections.map((s) => {
    const score = scoreSection(s, terms);
    return {
      id: s.id,
      title: s.title,
      path: s.path,
      url: s.url,
      score,
      snippet: extractSnippet(s.body, terms),
    };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function listTopics(): { topic: string; count: number; pages: string[] }[] {
  const topicMap = new Map<string, string[]>();

  for (const s of sections) {
    const parts = s.path.split("/").filter(Boolean);
    const topic = parts[0] ?? "root";
    if (!topicMap.has(topic)) topicMap.set(topic, []);
    topicMap.get(topic)!.push(s.title);
  }

  return Array.from(topicMap.entries())
    .map(([topic, pages]) => ({
      topic,
      count: pages.length,
      pages: pages.slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);
}

export function getRelatedDocs(
  sectionId: string,
  maxResults = 5
): DocSection[] {
  const target = getSectionById(sectionId);
  if (!target) return [];

  const targetTerms = tokenize(`${target.title} ${target.path}`);

  return sections
    .filter((s) => s.id !== sectionId)
    .map((s) => ({
      section: s,
      score: scoreSection(s, targetTerms),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((r) => r.section);
}

// ── Parsing ────────────────────────────────────────────────────────

function parseSections(raw: string): DocSection[] {
  const results: DocSection[] = [];

  // Mintlify llms-full.txt uses "# Title" or "## Title" as section boundaries
  // Try splitting on top-level headings first
  const chunks = raw.split(/^(?=# [^\n]+)/m).filter((c) => c.trim().length > 0);

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const headingLine = lines[0]?.trim() ?? "";

    // Extract title from heading
    const titleMatch = headingLine.match(/^#+\s+(.+)/);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const body = lines.slice(1).join("\n").trim();

    // Try to extract a path from the title or body
    const pathMatch = title.match(/\(([^)]+)\)/) || title.match(/\[([^\]]+)\]/);
    const path = pathMatch
      ? pathMatch[1]
      : "/" + slugify(title);

    const id = slugify(title);
    const url = buildUrl(path, title);

    if (body.length > 0) {
      results.push({ id, title, path, body, url });
    }
  }

  // If the above didn't produce many results, try an alternative parse
  // for Mintlify's format which may use different heading levels
  if (results.length < 5) {
    return parseMintlifyFull(raw);
  }

  return results;
}

function parseMintlifyFull(raw: string): DocSection[] {
  const results: DocSection[] = [];

  // Mintlify llms-full.txt can also have sections delimited by "---" or
  // double newlines with headings at ## level
  const chunks = raw.split(/^(?=## [^\n]+)/m).filter((c) => c.trim().length > 0);

  // Only use heading-based chunks. Do not fall back to blank-line splitting,
  // as that can merge unrelated pages into a single section.
  if (chunks.length < 2) {
    // Last resort: try splitting on "---" dividers
    const dividerChunks = raw.split(/^---+$/m).filter((c) => c.trim().length > 30);
    for (let i = 0; i < dividerChunks.length; i++) {
      const chunk = dividerChunks[i].trim();
      const lines = chunk.split("\n");
      const headingLine = lines[0] ?? "";
      const titleMatch = headingLine.match(/^#+\s+(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : `Section ${i + 1}`;
      const body = titleMatch ? lines.slice(1).join("\n").trim() : chunk;
      const id = slugify(title);
      if (body.length > 20) {
        results.push({ id, title, path: "/" + id, body, url: buildUrl("/" + id, title) });
      }
    }
    return results;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    const lines = chunk.split("\n");
    const headingLine = lines[0] ?? "";

    const titleMatch = headingLine.match(/^#+\s+(.+)/);
    const title = titleMatch
      ? titleMatch[1].trim()
      : `Section ${i + 1}`;

    const body = titleMatch ? lines.slice(1).join("\n").trim() : chunk;
    const id = slugify(title);
    const path = "/" + id;
    const url = buildUrl(path, title);

    if (body.length > 20) {
      results.push({ id, title, path, body, url });
    }
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildUrl(path: string, title: string): string {
  // If the path looks like a full URL already, return it
  if (path.startsWith("http")) return path;

  // Build a docs.arc.network URL from the path
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `https://docs.arc.network${cleanPath}`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function scoreSection(section: DocSection, terms: string[]): number {
  let score = 0;
  const titleLower = section.title.toLowerCase();
  const pathLower = section.path.toLowerCase();
  const bodyLower = section.body.toLowerCase();

  for (const term of terms) {
    // Title matches are weighted highest
    if (titleLower.includes(term)) score += 10;
    // Path matches are strong signals
    if (pathLower.includes(term)) score += 6;
    // Body matches
    if (bodyLower.includes(term)) {
      score += 2;
      // Bonus for multiple occurrences
      const count = (bodyLower.match(new RegExp(term, "g")) ?? []).length;
      score += Math.min(count, 5);
    }
  }

  return score;
}

function extractSnippet(body: string, terms: string[], maxLen = 300): string {
  const lower = body.toLowerCase();

  // Find the first occurrence of any term
  let bestPos = -1;
  for (const term of terms) {
    const pos = lower.indexOf(term);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  if (bestPos === -1) {
    return body.slice(0, maxLen).trim() + (body.length > maxLen ? "..." : "");
  }

  const start = Math.max(0, bestPos - 80);
  const end = Math.min(body.length, start + maxLen);
  const snippet = body.slice(start, end).trim();

  return (start > 0 ? "..." : "") + snippet + (end < body.length ? "..." : "");
}
