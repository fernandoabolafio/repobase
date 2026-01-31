---
title: Quick Start
description: Get up and running with Repobase in minutes
---

## Installation

Repobase requires Node.js (>=20). Install it globally:

```bash
# Install with npm
npm install -g repobase

```

## Quick Start

### Using the Terminal UI

Launch the TUI to manage your repositories:

```bash
repobase
```

Use these keyboard shortcuts to navigate:

| Key   | Action                     |
| ----- | -------------------------- |
| `a`   | Add a new repository       |
| `d`   | Delete selected repository |
| `s`   | Sync selected repository   |
| `S`   | Sync all repositories      |
| `/`   | Search across repositories |
| `j/k` | Navigate up/down           |
| `q`   | Quit                       |

### Using with AI Tools (MCP)

Add Repobase to your MCP configuration to enable AI tools to search your repositories.

For **Cursor**, add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "repobase": {
      "command": "repobase-mcp"
    }
  }
}
```

For **Claude Desktop**, add to your Claude configuration file.

## MCP Tools

When connected via MCP, AI tools can use these capabilities:

| Tool         | Description                                               |
| ------------ | --------------------------------------------------------- |
| `list_repos` | List all indexed repositories                             |
| `search`     | Search across repositories (keyword, semantic, or hybrid) |
| `list_files` | List files in a repository                                |
| `glob_files` | Find files matching a glob pattern                        |
| `read_file`  | Read file contents                                        |
| `grep`       | Search file contents with regex                           |

## How It Works

1. **Indexing** – When you add a repository, Repobase clones it locally and indexes the content using embeddings
2. **Storage** – All data is stored locally in `~/.repobase/` using LanceDB
3. **Search** – Queries are converted to embeddings and matched against indexed content
4. **Updates** – Sync repositories to pull latest changes and update the index

## Next Steps

- Add your first repository using `repobase`
- Configure MCP to use Repobase with your AI tools
- Explore semantic search to find code by meaning

