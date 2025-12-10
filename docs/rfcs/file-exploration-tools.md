# RFC: File Exploration Tools for Repobase

## Overview

This RFC proposes adding file exploration capabilities to repobase, bringing feature parity with its predecessor (repogrep). These tools enable users and AI agents to navigate, read, and pattern-search within indexed repositories—capabilities essential for effective code exploration workflows.

## Goals

1. **List directory contents** - Browse files and directories within indexed repos
2. **Find files by pattern** - Glob-based file discovery across repositories
3. **Read file contents** - Access full or partial file content from indexed repos
4. **Pattern search (grep)** - Regex-based search with context lines
5. **CLI search command** - Expose search via CLI (currently MCP-only)
6. **MCP tool parity** - Expose all exploration tools via MCP server

## Non-Goals (v1)

- Real-time file watching for changes
- File editing/writing capabilities
- Fuzzy file search
- Code navigation (go-to-definition, find-references)

---

## Motivation

### Current Gap

Repobase currently supports:

- Adding/removing/syncing repositories ✓
- Keyword/semantic/hybrid search (via MCP) ✓
- Cloud sync ✓

Missing from repogrep:

- **`ls`** - List files and directories
- **`glob`** - Find files matching patterns
- **`read`** - Read file contents with line ranges
- **`grep`** - Pattern search with regex and context
- **`search`** CLI command

### Why These Matter

For AI coding assistants (the primary consumer via MCP):

1. **Exploration workflow**: Search finds relevant files → `ls` confirms structure → `read` examines implementation
2. **Pattern analysis**: `grep` finds all usages of a pattern with context
3. **Discovery**: `glob` locates configuration files, tests, or specific file types
4. **Context building**: Reading multiple files to understand a feature

---

## Architecture

### Hybrid Approach: Database for Discovery, Filesystem for Content

**Key insight**: This follows the same approach as repogrep. We query the database for file discovery (fast, already indexed) but read content from the filesystem (full content, always current).

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Operation Type                              │
├─────────────────────────────────────────────────────────────────────┤
│  Discovery (ls, glob):         │  Content (read, grep):             │
│  ─────────────────────────     │  ───────────────────────           │
│  Query LanceDB for paths       │  1. Verify path in LanceDB         │
│  Fast, indexed metadata        │  2. Read from ~/.repobase/repos/   │
│  Shows indexed state           │  Full content, current state       │
└─────────────────────────────────────────────────────────────────────┘
```

**Why not pure filesystem?**

- Filesystem traversal is slow for large repos with node_modules, etc.
- We want to show "what's indexed and searchable", not "what's on disk"
- Metadata (size, mtime) is already indexed

**Why not pure LanceDB?**

- Index truncates content at 64KB
- `grep` would miss matches in large files
- `read` needs full file content

**Trade-offs:**

- Discovery operations show indexed state (may be stale if repo changed but not synced)
- Content operations read current filesystem state (always fresh)
- This matches repogrep's behavior and user expectations

### Service Extension

Extend the existing `Indexer` service with new exploration methods:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          IndexerService                              │
├─────────────────────────────────────────────────────────────────────┤
│  Existing:                     │  New (this RFC):                    │
│  - indexRepo()                 │  - listFiles()      [DB query]      │
│  - indexChanges()              │  - globFiles()      [DB + micromatch│
│  - removeIndex()               │  - readFile()        [DB + FS read]  │
│  - searchKeyword()             │  - grepPattern()    [DB + FS read]  │
│  - searchSemantic()            │                                     │
│  - searchHybrid()              │                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
                  ┌─────────────────┐
                  │   CLI / TUI     │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │  MCP Server     │  ◄── AI Agents
                  └────────┬────────┘
                           │
              ┌────────────▼────────────┐
              │    RepobaseEngine       │
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Indexer     │  │   RepoStore   │  │   GitClient   │
│ (LanceDB +    │  │  (config.json)│  │   (git ops)   │
│  file ops)    │  └───────────────┘  └───────────────┘
└───────────────┘
        │
        ├── Discovery queries ──►  LanceDB (files table)
        │                          - repo, path, filename
        │                          - mtime_ms, size_bytes
        │
        └── Content reads ──────►  ~/.repobase/repos/<repo-id>/
                                   (cloned repository on disk)
```

---

## Error Types

Add new error types to `packages/engine/src/errors.ts`:

```typescript
import { Data } from "effect";

/**
 * File not found in index or on disk
 */
export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly repo: string;
  readonly path: string;
}> {}

/**
 * Invalid pattern (e.g., malformed regex or glob)
 */
export class InvalidPatternError extends Data.TaggedError(
  "InvalidPatternError"
)<{
  readonly pattern: string;
  readonly message: string;
}> {}
```

Update `EngineError` union:

```typescript
export type EngineError =
  | GitError
  | StoreError
  | RepoNotFoundError
  | RepoAlreadyExistsError
  | IndexError
  | SearchError
  | CloudError
  | CloudNotConfiguredError
  | FileNotFoundError
  | InvalidPatternError;
```

---

## API Design

### New Types (in `packages/engine/src/services/Indexer.ts`)

Following the existing pattern of plain interfaces (not Schema-based):

```typescript
/**
 * Information about a file or directory in the index
 */
export interface FileInfo {
  readonly repo: string;
  readonly path: string;
  readonly filename: string;
  readonly isDirectory: boolean;
  readonly size?: number;
  readonly mtime?: Date;
}

/**
 * File content with line range metadata
 */
export interface FileContent {
  readonly repo: string;
  readonly path: string;
  readonly content: string;
  readonly totalLines: number;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * A single grep match within a file (repo/path are in GrepResult)
 */
export interface GrepMatch {
  readonly lineNumber: number;
  readonly content: string;
  readonly isMatch: boolean; // true for match lines, false for context lines
}

/**
 * Grep results for a single file
 */
export interface GrepResult {
  readonly repo: string;
  readonly path: string;
  readonly matches: readonly GrepMatch[];
  readonly matchCount: number;
}

/**
 * Options for listing files
 */
export interface ListFilesOptions {
  readonly repo?: string;
  readonly path?: string;
  readonly ignore?: readonly string[];
}

/**
 * Options for glob file search
 */
export interface GlobOptions {
  readonly repo?: string;
  readonly limit?: number;
}

/**
 * Options for reading files
 */
export interface ReadFileOptions {
  readonly offset?: number; // Start line (1-based, default: 1)
  readonly limit?: number; // Number of lines to read
  readonly lineNumbers?: boolean; // Include line numbers (default: true)
}

/**
 * Options for grep pattern search
 */
export interface GrepOptions {
  readonly repo?: string;
  readonly ignoreCase?: boolean;
  readonly contextBefore?: number; // Lines before match (-B)
  readonly contextAfter?: number; // Lines after match (-A)
  readonly filesWithMatches?: boolean; // Only show filenames
  readonly count?: boolean; // Only show match counts
  readonly fileType?: string; // Filter by extension (e.g., "ts")
  readonly limit?: number; // Limit output lines
}
```

### Extended IndexerService Interface

```typescript
export interface IndexerService {
  // ... existing methods ...

  // File exploration - Discovery (DB queries)
  readonly listFiles: (
    options: ListFilesOptions
  ) => Effect.Effect<readonly FileInfo[], IndexError>;

  readonly globFiles: (
    pattern: string,
    options?: GlobOptions
  ) => Effect.Effect<readonly FileInfo[], IndexError | InvalidPatternError>;

  // File exploration - Content (DB verify + FS read)
  readonly readFile: (
    repo: string,
    filePath: string,
    options?: ReadFileOptions
  ) => Effect.Effect<FileContent, IndexError | FileNotFoundError>;

  readonly grepPattern: (
    pattern: string,
    options?: GrepOptions
  ) => Effect.Effect<readonly GrepResult[], IndexError | InvalidPatternError>;
}
```

---

## Implementation Details

### Helper: Path Validation

Add a helper to prevent path traversal attacks:

```typescript
/**
 * Validate that a file path doesn't escape the repo directory
 */
function validatePath(filePath: string): Effect.Effect<void, IndexError> {
  if (filePath.includes("..") || filePath.startsWith("/")) {
    return Effect.fail(
      new IndexError({
        operation: "validatePath",
        message: `Invalid path: ${filePath}`,
      })
    );
  }
  return Effect.void;
}
```

### Helper: Get Repos Directory

```typescript
const getReposDir = () => `${os.homedir()}/.repobase/repos`;
```

### 1. listFiles Implementation

Query LanceDB to extract directory structure from indexed paths:

```typescript
const listFiles: IndexerService["listFiles"] = (options) =>
  Effect.gen(function* () {
    const tbl = yield* getTable;
    const { repo, path: dirPath = "" } = options;

    if (!repo) {
      // List all repositories - get unique repo names
      const results = yield* Effect.tryPromise({
        try: () =>
          tbl.query().select(["repo"]).toArray() as Promise<
            Array<{ repo: string }>
          >,
        catch: (e) =>
          new IndexError({ operation: "listFiles", message: `${e}` }),
      });

      const uniqueRepos = [...new Set(results.map((r) => r.repo))];
      return uniqueRepos.map(
        (r): FileInfo => ({
          repo: r,
          path: "",
          filename: r,
          isDirectory: true,
        })
      );
    }

    // Validate directory path
    if (dirPath) {
      yield* validatePath(dirPath);
    }

    // Query files in this repo starting with the path prefix
    const searchPath = dirPath ? `${dirPath}/` : "";
    const results = yield* Effect.tryPromise({
      try: () =>
        tbl
          .query()
          .where(`repo = '${repo}' AND path LIKE '${searchPath}%'`)
          .select(["path", "filename", "size_bytes", "mtime_ms"])
          .toArray() as Promise<
          Array<{
            path: string;
            filename: string;
            size_bytes: number;
            mtime_ms: number;
          }>
        >,
      catch: (e) => new IndexError({ operation: "listFiles", message: `${e}` }),
    });

    // Extract immediate children (files and subdirectories)
    const entries = new Map<string, FileInfo>();

    for (const file of results) {
      let relativePath = file.path;
      if (dirPath && file.path.startsWith(searchPath)) {
        relativePath = file.path.slice(searchPath.length);
      }

      const slashIndex = relativePath.indexOf("/");
      if (slashIndex === -1) {
        // Direct file in this directory
        entries.set(relativePath, {
          repo,
          path: file.path,
          filename: relativePath,
          isDirectory: false,
          size: file.size_bytes,
          mtime: new Date(file.mtime_ms),
        });
      } else {
        // Subdirectory - only add if not already present
        const subdir = relativePath.slice(0, slashIndex);
        if (!entries.has(subdir)) {
          entries.set(subdir, {
            repo,
            path: dirPath ? `${dirPath}/${subdir}` : subdir,
            filename: subdir,
            isDirectory: true,
          });
        }
      }
    }

    // Sort: directories first, then alphabetically
    return [...entries.values()].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.filename.localeCompare(b.filename);
    });
  });
```

### 2. globFiles Implementation

Use `micromatch` for proper glob pattern matching (SQL LIKE is too limited):

```typescript
const globFiles: IndexerService["globFiles"] = (pattern, options) =>
  Effect.gen(function* () {
    const tbl = yield* getTable;
    const limit = options?.limit ?? 100;

    // Import micromatch for proper glob matching
    const micromatch = yield* Effect.tryPromise({
      try: () => import("micromatch"),
      catch: (e) =>
        new InvalidPatternError({
          pattern,
          message: `Failed to import micromatch: ${e}`,
        }),
    });

    // Query all files (or filtered by repo)
    let query = tbl.query();

    if (options?.repo) {
      query = query.where(`repo = '${options.repo}'`);
    }

    const allFiles = yield* Effect.tryPromise({
      try: () =>
        query
          .select(["repo", "path", "filename", "size_bytes", "mtime_ms"])
          .toArray() as Promise<
          Array<{
            repo: string;
            path: string;
            filename: string;
            size_bytes: number;
            mtime_ms: number;
          }>
        >,
      catch: (e) => new IndexError({ operation: "globFiles", message: `${e}` }),
    });

    // Apply glob pattern matching
    const matched = allFiles.filter((file) => {
      return (
        micromatch.isMatch(file.path, pattern) ||
        micromatch.isMatch(file.filename, pattern)
      );
    });

    // Limit results
    const limited = matched.slice(0, limit);

    return limited.map(
      (r): FileInfo => ({
        repo: r.repo,
        path: r.path,
        filename: r.filename,
        isDirectory: false,
        size: r.size_bytes,
        mtime: new Date(r.mtime_ms),
      })
    );
  });
```

### 3. readFile Implementation

Read file contents from disk (not from index, to avoid 64KB truncation):

```typescript
const readFile: IndexerService["readFile"] = (repo, filePath, options) =>
  Effect.gen(function* () {
    const tbl = yield* getTable;

    // Validate path
    yield* validatePath(filePath);

    // Verify file exists in index
    const indexed = yield* Effect.tryPromise({
      try: () =>
        tbl
          .query()
          .where(`repo = '${repo}' AND path = '${filePath}'`)
          .select(["path"])
          .limit(1)
          .toArray() as Promise<Array<{ path: string }>>,
      catch: (e) => new IndexError({ operation: "readFile", message: `${e}` }),
    });

    if (indexed.length === 0) {
      return yield* Effect.fail(
        new FileNotFoundError({
          repo,
          path: filePath,
        })
      );
    }

    // Read from disk
    const absolutePath = `${getReposDir()}/${repo}/${filePath}`;
    const content = yield* fs.readFileString(absolutePath).pipe(
      Effect.mapError(
        (e) =>
          new FileNotFoundError({
            repo,
            path: filePath,
          })
      )
    );

    const lines = content.split("\n");
    const totalLines = lines.length;
    const offset = Math.max(1, options?.offset ?? 1);
    const limit = options?.limit ?? totalLines;

    const startLine = offset;
    const endLine = Math.min(totalLines, offset + limit - 1);

    // Extract requested lines
    const selectedLines = lines.slice(startLine - 1, endLine);

    // Optionally format with line numbers
    const outputContent =
      options?.lineNumbers !== false
        ? selectedLines
            .map((line, i) => `${String(startLine + i).padStart(6)}|${line}`)
            .join("\n")
        : selectedLines.join("\n");

    return {
      repo,
      path: filePath,
      content: outputContent,
      totalLines,
      startLine,
      endLine,
    };
  });
```

### 4. grepPattern Implementation

Full regex search with context support:

```typescript
const grepPattern: IndexerService["grepPattern"] = (pattern, options) =>
  Effect.gen(function* () {
    const tbl = yield* getTable;

    // Build regex - validate pattern first
    const flags = options?.ignoreCase ? "gi" : "g";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      return yield* Effect.fail(
        new InvalidPatternError({
          pattern,
          message: e instanceof Error ? e.message : String(e),
        })
      );
    }

    // Query indexed files
    let query = tbl.query();

    if (options?.repo) {
      query = query.where(`repo = '${options.repo}'`);
    }

    if (options?.fileType) {
      query = query.where(`filename LIKE '%.${options.fileType}'`);
    }

    const files = yield* Effect.tryPromise({
      try: () =>
        query.select(["repo", "path", "filename"]).toArray() as Promise<
          Array<{ repo: string; path: string; filename: string }>
        >,
      catch: (e) =>
        new IndexError({ operation: "grepPattern", message: `${e}` }),
    });

    const results: GrepResult[] = [];
    let outputCount = 0;
    const limit = options?.limit ?? Number.MAX_SAFE_INTEGER;

    const contextBefore = options?.contextBefore ?? 0;
    const contextAfter = options?.contextAfter ?? 0;

    for (const file of files) {
      if (outputCount >= limit) break;

      const absolutePath = `${getReposDir()}/${file.repo}/${file.path}`;
      const content = yield* fs.readFileString(absolutePath).pipe(
        Effect.option,
        Effect.catchAll(() => Effect.succeed(Option.none()))
      );

      if (Option.isNone(content)) continue;

      const lines = content.value.split("\n");
      const matchingLineNums = new Set<number>();

      // Find all matching lines
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matchingLineNums.add(i);
        }
        regex.lastIndex = 0; // Reset for global regex
      }

      if (matchingLineNums.size === 0) continue;

      if (options?.filesWithMatches) {
        results.push({
          repo: file.repo,
          path: file.path,
          matches: [],
          matchCount: matchingLineNums.size,
        });
        outputCount++;
        continue;
      }

      if (options?.count) {
        results.push({
          repo: file.repo,
          path: file.path,
          matches: [],
          matchCount: matchingLineNums.size,
        });
        continue;
      }

      // Build matches with context
      const linesToShow = new Set<number>();
      for (const matchLine of matchingLineNums) {
        for (
          let i = Math.max(0, matchLine - contextBefore);
          i <= Math.min(lines.length - 1, matchLine + contextAfter);
          i++
        ) {
          linesToShow.add(i);
        }
      }

      const matches: GrepMatch[] = [];
      const sortedLines = [...linesToShow].sort((a, b) => a - b);

      for (const lineNum of sortedLines) {
        matches.push({
          lineNumber: lineNum + 1,
          content: lines[lineNum],
          isMatch: matchingLineNums.has(lineNum),
        });
        outputCount++;
        if (outputCount >= limit) break;
      }

      results.push({
        repo: file.repo,
        path: file.path,
        matches,
        matchCount: matchingLineNums.size,
      });
    }

    return results;
  });
```

### Update Indexer.of() Return

```typescript
return Indexer.of({
  indexRepo,
  indexChanges,
  removeIndex,
  searchKeyword,
  searchSemantic,
  searchHybrid,
  listFiles,
  globFiles,
  readFile,
  grepPattern,
});
```

---

## CLI Commands

### Search Command

```bash
# Keyword search (default)
repobase search "authentication middleware"
repobase search "user login" --repo Effect-TS-effect

# Semantic search
repobase search "how to handle errors" --semantic

# Hybrid search
repobase search "database connection pooling" --hybrid

# Options
repobase search <query> [--semantic] [--hybrid] [-r, --repo <id>] [-l, --limit <n>]
```

### ls Command

```bash
# List all repositories
repobase ls

# List root of a repository
repobase ls Effect-TS-effect

# List specific directory
repobase ls Effect-TS-effect/packages/effect/src

# Ignore patterns (future enhancement)
repobase ls myrepo/src --ignore "*.test.js" --ignore "node_modules"
```

### glob Command

```bash
# Find all TypeScript files
repobase glob "*.ts"

# Find test files
repobase glob "**/test/**/*.js"

# Find config files in specific repo
repobase glob "**/*config*" --repo Effect-TS-effect --limit 20
```

### read Command

```bash
# Read entire file
repobase read Effect-TS-effect/packages/effect/src/Effect.ts

# Read specific line range
repobase read myrepo/src/utils.ts --offset 50 --limit 30

# Without line numbers
repobase read myrepo/README.md --no-line-numbers
```

### grep Command

```bash
# Find all function declarations
repobase grep "function \\w+\\(" --type ts

# Case-insensitive search with context
repobase grep "todo" -i -C 3 --repo myproject

# Count matches per file
repobase grep "console\\.log" --type js -c

# Just show filenames
repobase grep "deprecated" -l

# Full options
repobase grep <pattern> [-r, --repo <name>] [-i, --ignore-case]
  [-A <num>] [-B <num>] [-C <num>]
  [-l, --files-with-matches] [-c, --count]
  [--type <ext>] [--limit <number>]
```

---

## MCP Tools

Register the following tools in `packages/mcp-server/src/main.ts`:

### list_files

```typescript
server.registerTool(
  "list_files",
  {
    description:
      "List files and directories in a repository path. Similar to 'ls' command.",
    inputSchema: {
      repo: z
        .string()
        .optional()
        .describe("Repository ID (omit to list all repos)"),
      path: z.string().optional().describe("Directory path within repo"),
      ignore: z
        .array(z.string())
        .optional()
        .describe("Glob patterns to ignore (future enhancement)"),
    },
  },
  async ({ repo, path, ignore }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer;
      const results = yield* indexer.listFiles({ repo, path, ignore });
      return results.map((r) => ({
        repo: r.repo,
        path: r.path,
        filename: r.filename,
        isDirectory: r.isDirectory,
        size: r.size,
        mtime: r.mtime?.toISOString(),
      }));
    });

    const result = await runtime.runPromise(program);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);
```

### glob_files

```typescript
server.registerTool(
  "glob_files",
  {
    description:
      "Find files matching a glob pattern across indexed repositories.",
    inputSchema: {
      pattern: z.string().describe("Glob pattern (e.g., '*.ts', '**/test/**')"),
      repo: z.string().optional().describe("Filter to specific repository"),
      limit: z.number().optional().default(50).describe("Maximum results"),
    },
  },
  async ({ pattern, repo, limit }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer;
      const results = yield* indexer.globFiles(pattern, { repo, limit });
      return results.map((r) => ({
        repo: r.repo,
        path: r.path,
        filename: r.filename,
        size: r.size,
        mtime: r.mtime?.toISOString(),
      }));
    });

    const result = await runtime.runPromise(program);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);
```

### read_file

```typescript
server.registerTool(
  "read_file",
  {
    description: "Read contents of a file from an indexed repository.",
    inputSchema: {
      repo: z.string().describe("Repository ID"),
      path: z.string().describe("File path within repository"),
      offset: z.number().optional().default(1).describe("Start line (1-based)"),
      limit: z.number().optional().describe("Number of lines to read"),
      lineNumbers: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include line numbers"),
    },
  },
  async ({ repo, path, offset, limit, lineNumbers }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer;
      const result = yield* indexer.readFile(repo, path, {
        offset,
        limit,
        lineNumbers,
      });
      return {
        repo: result.repo,
        path: result.path,
        content: result.content,
        totalLines: result.totalLines,
        startLine: result.startLine,
        endLine: result.endLine,
      };
    });

    const result = await runtime.runPromise(program);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);
```

### grep

```typescript
server.registerTool(
  "grep",
  {
    description:
      "Search for regex pattern in file contents. Returns matches with context.",
    inputSchema: {
      pattern: z.string().describe("Regular expression pattern"),
      repo: z.string().optional().describe("Filter to specific repository"),
      ignoreCase: z
        .boolean()
        .optional()
        .default(false)
        .describe("Case insensitive"),
      contextBefore: z
        .number()
        .optional()
        .default(0)
        .describe("Lines before match"),
      contextAfter: z
        .number()
        .optional()
        .default(0)
        .describe("Lines after match"),
      filesWithMatches: z
        .boolean()
        .optional()
        .default(false)
        .describe("Only show filenames"),
      count: z
        .boolean()
        .optional()
        .default(false)
        .describe("Only show match counts"),
      fileType: z
        .string()
        .optional()
        .describe("Filter by extension (e.g., 'ts')"),
      limit: z.number().optional().default(100).describe("Limit output lines"),
    },
  },
  async (options) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer;
      const results = yield* indexer.grepPattern(options.pattern, options);
      return results.map((r) => ({
        repo: r.repo,
        path: r.path,
        matches: r.matches.map((m) => ({
          lineNumber: m.lineNumber,
          content: m.content,
          isMatch: m.isMatch,
        })),
        matchCount: r.matchCount,
      }));
    });

    const result = await runtime.runPromise(program);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);
```

---

## TUI Integration

Add keyboard shortcuts and menu items:

| Key     | Action                  | Notes                           |
| ------- | ----------------------- | ------------------------------- |
| `/`     | Open search modal       | Already exists                  |
| `g`     | Open grep modal         | New - regex search              |
| `f`     | Open file finder (glob) | New - glob search               |
| `Enter` | Browse repo contents    | Opens ls view for selected repo |

### File Browser View

New component for browsing repository contents:

```
┌─ repobase ────────────────────────────────────────────┐
│  File Browser: Effect-TS-effect/packages/effect/src  │
├───────────────────────────────────────────────────────┤
│  📁 internal/                                        │
│  📁 utils/                                           │
│  📄 Brand.ts                           12.3 KB       │
│  📄 Context.ts                          8.7 KB       │
│  📄 Effect.ts                          45.2 KB  ←    │
│  📄 Layer.ts                           18.9 KB       │
│  📄 Schema.ts                          22.1 KB       │
├───────────────────────────────────────────────────────┤
│  [Enter] Open  [Backspace] Up  [/] Search  [q] Quit │
└───────────────────────────────────────────────────────┘
```

---

## Dependencies

Add to `packages/engine/package.json`:

```json
{
  "dependencies": {
    "micromatch": "^4.0.5"
  }
}
```

---

## Implementation Plan

### Phase 1: Core Engine Extensions

1. [ ] Add `FileNotFoundError` and `InvalidPatternError` to `errors.ts`
2. [ ] Add `FileInfo`, `FileContent`, `GrepMatch`, `GrepResult` types to `Indexer.ts`
3. [ ] Add `ListFilesOptions`, `GlobOptions`, `ReadFileOptions`, `GrepOptions` types
4. [ ] Implement `validatePath()` helper
5. [ ] Implement `listFiles()` in Indexer service
6. [ ] Implement `globFiles()` in Indexer service (using micromatch)
7. [ ] Implement `readFile()` in Indexer service
8. [ ] Implement `grepPattern()` in Indexer service
9. [ ] Update `Indexer.of()` to include new methods
10. [ ] Export new types from `packages/engine/src/index.ts`

### Phase 2: CLI Commands

11. [ ] Add `search` command to CLI
12. [ ] Add `ls` command to CLI
13. [ ] Add `glob` command to CLI
14. [ ] Add `read` command to CLI
15. [ ] Add `grep` command to CLI

### Phase 3: MCP Tools

16. [ ] Register `list_files` tool in MCP server
17. [ ] Register `glob_files` tool in MCP server
18. [ ] Register `read_file` tool in MCP server
19. [ ] Register `grep` tool in MCP server

### Phase 4: TUI Integration

20. [ ] Add file browser component
21. [ ] Add grep modal component
22. [ ] Wire up keyboard shortcuts

### Phase 5: Cloud API Extensions (Future)

23. [ ] Expose file exploration endpoints in cloud-api
24. [ ] Enable mobile/web clients to browse and read files

---

## Performance Considerations

1. **Large directories**: `listFiles` queries all files with prefix - consider pagination for 1000+ entries
2. **Big files**: `readFile` supports chunked reading (offset/limit) - good for large files
3. **Grep on large repos**: Early termination when `limit` reached - stops processing files
4. **Glob matching**: Query all files then filter - acceptable for typical repo sizes, could optimize later
5. **Caching**: Consider caching directory listings for repeated `ls` operations (future enhancement)

---

## Security Considerations

1. **Path traversal**: `validatePath()` prevents `..` and absolute paths
2. **Regex DoS**: No timeout currently - consider adding timeout for grep operations (future)
3. **File size limits**: No cap currently - consider max file size for read/grep (e.g., 10MB)
4. **Sensitive files**: No filtering - consider filtering `.env`, secrets, etc. (configurable, future)

---

## Testing Strategy

1. **Unit tests**: For each new Indexer method in `packages/engine/test/`
2. **Integration tests**: End-to-end CLI command tests
3. **Edge cases**:
   - Empty directories
   - Binary files (should be skipped in grep)
   - Symlinks (follow or skip? - currently follows)
   - Very deep directory structures
   - Files with special characters in names
   - Large files (> 1MB)
   - Unicode content
   - Invalid regex patterns
   - Path traversal attempts

---

## Success Metrics

- All 4 exploration tools available via MCP
- CLI parity with repogrep for ls, glob, read, grep
- Response times < 100ms for typical operations (ls, glob on small repos)
- Response times < 1s for grep on medium repos (< 1000 files)
- Zero security vulnerabilities in path handling

---

## Open Questions

1. **Symlink handling**: Should `ls`/`read` follow symlinks?

   - _Recommendation_: Follow symlinks but detect cycles (future enhancement)

2. **Binary file preview**: Should `read` support hex dump for binaries?

   - _Recommendation_: Return error for binary files in v1, add hex mode later

3. **Grep multiline**: Should grep support multiline patterns?

   - _Recommendation_: Single-line only for v1, add `-U` flag later

4. **File content from cloud**: Should cloud-synced repos support file reading?

   - _Recommendation_: Punt to Phase 5, requires storing full contents or on-demand fetch

5. **Ignore patterns in ls**: Should we implement ignore pattern filtering?
   - _Recommendation_: Future enhancement, not critical for v1
