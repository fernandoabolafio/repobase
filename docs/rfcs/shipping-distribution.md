# RFC: Shipping & Distribution Strategy

## Status

Implemented (Option A)

## Summary

Define a distribution strategy for repobase v0.1 that bundles the TUI, Engine, and MCP Server into a single installable package for end users.

## Goals

1. Single command installation (`npm install -g repobase` or similar)
2. MCP server works out of the box with standard MCP configuration
3. TUI manages repos locally without needing separate setup
4. No manual dependency management for users

## Non-Goals (v0.1)

- Cloud sync (feature-flagged off)
- Web interface
- npm publishing automation

## Architecture

```
repobase (npm package)
├── bin/
│   ├── repobase          # TUI entry point
│   └── repobase-mcp      # MCP server entry point (stdio)
├── engine/               # Bundled engine code
└── package.json
```

## Distribution Options

### Option A: Single npm Package (Recommended)

Bundle everything into one `repobase` package published to npm.

**Pros:**

- Simple installation: `npm install -g repobase`
- Single version to track
- MCP config just references `repobase-mcp`

**Cons:**

- Larger package size
- Need build step to bundle workspace packages

**MCP Config:**

```json
{
  "mcpServers": {
    "repobase": {
      "command": "repobase-mcp"
    }
  }
}
```

### Option B: Bun Compile (Binary)

Use `bun build --compile` to create standalone executables.

**Pros:**

- No runtime dependency (no Node/Bun needed)
- Fastest startup time
- Single binary distribution

**Cons:**

- Platform-specific builds (macOS, Linux, Windows)
- Larger binary size (~50-100MB)
- Need CI/CD for multi-platform builds

**MCP Config:**

```json
{
  "mcpServers": {
    "repobase": {
      "command": "/usr/local/bin/repobase-mcp"
    }
  }
}
```

### Option C: Homebrew (macOS)

Distribute via Homebrew tap for macOS users.

**Pros:**

- Native macOS experience
- Automatic updates via `brew upgrade`
- Can depend on system bun/node

**Cons:**

- macOS only
- Additional maintenance (tap repo)

## Recommendation

**Phase 1 (MVP):** Option A - npm package

- Fastest to implement
- Works across all platforms with Node.js
- Users can install with `npm install -g repobase`

**Phase 2 (Later):** Option B - Binary releases

- Add GitHub releases with compiled binaries
- Better UX for users without Node.js

## Implementation Plan

### 1. Build Setup

Create a build script that:

- Compiles TypeScript
- Bundles workspace packages into `dist/`
- Generates proper `bin` entries in package.json

### 2. Package Structure

```json
{
  "name": "repobase",
  "version": "0.1.0",
  "bin": {
    "repobase": "./dist/tui/main.js",
    "repobase-mcp": "./dist/mcp-server/main.js"
  },
  "files": ["dist"],
  "dependencies": {
    "@opentui/core": "...",
    "@opentui/react": "...",
    "@modelcontextprotocol/sdk": "...",
    "effect": "...",
    "@lancedb/lancedb": "...",
    "@xenova/transformers": "..."
  }
}
```

### 3. Build Script

```bash
# scripts/build.sh
bun run tsc --build
# Bundle engine, tui, mcp-server into dist/
```

### 4. Testing

- Test global install locally: `npm link`
- Verify MCP server works with Claude/Cursor
- Verify TUI starts correctly

## Open Questions

1. Should we use `bun` or `node` as the runtime requirement?
   - bun: faster, but less installed
   - node: more universal
2. How to handle native dependencies (@lancedb/lancedb)?
   - May need platform-specific packages or prebuild binaries

## References

- [MCP Server Distribution](https://modelcontextprotocol.io/docs/servers)
- [Bun Compile](https://bun.sh/docs/bundler/executables)
- [npm bin scripts](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#bin)
