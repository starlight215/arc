#!/usr/bin/env node

/**
 * check.ts — Verifies the server can fetch and parse Arc docs.
 */

import { loadDocs, getSections, searchDocs } from "./arcDocs.js";

async function main() {
  console.log("Checking arc-docs-mcp...\n");

  console.log("1. Fetching Arc documentation...");
  const sections = await loadDocs();
  console.log(`   Loaded ${sections.length} sections.\n`);

  if (sections.length === 0) {
    console.error("   ERROR: No sections parsed. Check the docs URL.");
    process.exit(1);
  }

  console.log("2. Sample sections:");
  for (const s of sections.slice(0, 5)) {
    console.log(`   - ${s.title} [${s.id}]`);
  }
  console.log();

  console.log('3. Test search for "CCTP"...');
  const results = searchDocs("CCTP", 3);
  for (const r of results) {
    console.log(`   - ${r.title} (score: ${r.score})`);
  }
  console.log();

  console.log("All checks passed.");
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
