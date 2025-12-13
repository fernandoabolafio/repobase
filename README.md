# Repobase

Index and search your Git repositories with AI. Includes a terminal UI and MCP server for AI tool integration.

## Installation

Requires [Bun](https://bun.sh) runtime.

```bash
# Install globally
npm install -g repobase

# Or with bun
bun install -g repobase
```

## Usage

### Terminal UI

```bash
repobase
```

**Keyboard shortcuts:**

- `a` - Add repository
- `d` - Delete repository
- `s` - Sync selected repository
- `S` - Sync all repositories
- `/` - Search
- `q` - Quit

### MCP Server (Cursor, Claude, etc.)

Add to your MCP configuration (`~/.cursor/mcp.json` or Claude config):

```json
{
  "mcpServers": {
    "repobase": {
      "command": "repobase-mcp"
    }
  }
}
```

**Available tools:**

- `list_repos` - List all indexed repositories
- `search` - Search across repositories (keyword, semantic, or hybrid mode)
- `list_files` - List files in a repository
- `glob_files` - Find files by glob pattern
- `read_file` - Read file contents
- `grep` - Search file contents with regex

## Development

```bash
# Install dependencies
bun install

# Run TUI in dev mode
bun run dev:tui

# Run MCP server in dev mode
bun run dev:mcp

# Run tests
bun run test

# Build for distribution
bun run build
```

## Architecture

```
repobase/
├── packages/
│   ├── engine/      # Core library (indexing, search, git operations)
│   ├── tui/         # Terminal UI
│   └── mcp-server/  # MCP server for AI tools
└── dist/            # Built distribution (after bun run build)
```

## License

MIT
