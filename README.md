# Repobase

A local Git repository manager with search capabilities. Index repositories and search across them using keyword, semantic, or hybrid search.

## Packages

- **engine** - Core library for repository management and indexing
- **cli** - Command-line interface
- **tui** - Terminal UI
- **mcp-server** - MCP server for AI tool integration (Cursor, etc.)

## Installation

```bash
bun install
```

## Usage

### CLI

```bash
# Add a repository
bun run --filter @repobase/cli start add https://github.com/owner/repo

# List repositories
bun run --filter @repobase/cli start list

# Sync repositories
bun run --filter @repobase/cli start sync

# Remove a repository
bun run --filter @repobase/cli start remove <repo-id>
```

### TUI

```bash
bun run --filter @repobase/tui start
```

### MCP Server

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "repobase": {
      "command": "bun",
      "args": ["run", "--filter", "@repobase/mcp-server", "start"]
    }
  }
}
```

Available tools:
- `list_repos` - List all indexed repositories
- `search` - Search across repositories (keyword, semantic, or hybrid mode)
