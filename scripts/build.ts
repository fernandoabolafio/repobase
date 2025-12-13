#!/usr/bin/env bun
/**
 * Build script for repobase distribution package.
 * 
 * Bundles TUI and MCP server into dist/ for npm publishing.
 */

import { $ } from "bun"
import { rm, mkdir, chmod } from "fs/promises"
import { join } from "path"

const ROOT = join(import.meta.dirname, "..")
const DIST = join(ROOT, "dist")

async function clean() {
  console.log("🧹 Cleaning dist/...")
  await rm(DIST, { recursive: true, force: true })
  await mkdir(DIST, { recursive: true })
}

async function buildTUI() {
  console.log("📦 Building TUI...")
  
  await Bun.build({
    entrypoints: [join(ROOT, "packages/tui/src/main.tsx")],
    outdir: join(DIST, "tui"),
    target: "node",
    format: "esm",
    splitting: false,
    sourcemap: "external",
    external: [
      // Keep native modules external - they'll be installed as deps
      "@lancedb/lancedb",
      "@xenova/transformers",
      // Keep React and opentui external
      "react",
      "@opentui/core",
      "@opentui/react",
      // Keep effect ecosystem external
      "effect",
      "@effect/platform",
      "@effect/platform-node",
    ],
  })
  
  console.log("  ✓ TUI built to dist/tui/main.js")
}

async function buildMCP() {
  console.log("📦 Building MCP server...")
  
  await Bun.build({
    entrypoints: [join(ROOT, "packages/mcp-server/src/main.ts")],
    outdir: join(DIST, "mcp-server"),
    target: "node",
    format: "esm",
    splitting: false,
    sourcemap: "external",
    external: [
      // Keep native modules external
      "@lancedb/lancedb",
      "@xenova/transformers",
      // Keep MCP SDK external
      "@modelcontextprotocol/sdk",
      // Keep effect ecosystem external
      "effect",
      "@effect/platform",
      "@effect/platform-node",
      // Zod
      "zod",
    ],
  })
  
  console.log("  ✓ MCP server built to dist/mcp-server/main.js")
}

async function createBinWrappers() {
  console.log("📝 Creating bin wrappers...")
  
  await mkdir(join(DIST, "bin"), { recursive: true })
  
  // TUI wrapper - uses bun for @opentui compatibility
  const tuiBin = `#!/usr/bin/env bun
import "../tui/main.js"
`
  await Bun.write(join(DIST, "bin/repobase.js"), tuiBin)
  
  // MCP wrapper - uses bun for consistency
  const mcpBin = `#!/usr/bin/env bun
import "../mcp-server/main.js"
`
  await Bun.write(join(DIST, "bin/repobase-mcp.js"), mcpBin)
  
  // Make bin files executable
  await chmod(join(DIST, "bin/repobase.js"), 0o755)
  await chmod(join(DIST, "bin/repobase-mcp.js"), 0o755)
  
  console.log("  ✓ Created dist/bin/repobase.js")
  console.log("  ✓ Created dist/bin/repobase-mcp.js")
}

async function main() {
  console.log("🚀 Building repobase for distribution...\n")
  
  await clean()
  await buildTUI()
  await buildMCP()
  await createBinWrappers()
  
  console.log("\n✅ Build complete!")
  console.log("\nTo test locally:")
  console.log("  npm link")
  console.log("  repobase      # Start TUI")
  console.log("  repobase-mcp  # Start MCP server")
}

main().catch((err) => {
  console.error("Build failed:", err)
  process.exit(1)
})


