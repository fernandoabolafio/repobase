# RFC: Repobase Engine - Repository Sync Daemon

## Overview

The Repobase Engine is a service that maintains a local cache of GitHub repositories, keeping them synchronized with their remotes, and providing full-text and semantic search capabilities. It provides both **embedded** and **remote** access modes for consumers.

## Goals (v1)

1. **Add repositories** - Clone GitHub repos to `~/.repobase/repos/<id>`
2. **Track or pin versions** - Support tracking a branch (auto-updates) or pinning to a tag/commit
3. **Background sync** - Periodically fetch and update tracking repositories
4. **Persistence** - Store repo metadata in a simple JSON config
5. **File indexing** - Index repository files for search (full-text and semantic)
6. **Search** - Keyword, semantic, and hybrid search across indexed files
7. **CLI consumer** - Provide a CLI for direct interaction
8. **Embeddable design** - Allow other packages to consume via Layer injection

## Non-Goals (v1)

- HTTP API (future package, will use RPC)
- Authentication/private repos (public repos only for now)
- Conflict resolution or merge strategies
- File chunking for large files (truncate at 64KB for v1)

---

## Architecture Overview

### Communication Methods

The engine supports two consumption patterns:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Consumer Packages                             │
├──────────────────────────────┬──────────────────────────────────────┤
│     CLI Package (v1)         │     HTTP API Package (future)        │
│  (Direct Layer injection)    │     (RPC over HTTP)                  │
├──────────────────────────────┴──────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────────┐      ┌────────────────────────────────┐  │
│   │  Embedded Mode       │      │  Daemon Mode (future)          │  │
│   │                      │      │                                │  │
│   │  CLI imports Layer   │      │  Engine runs as separate       │  │
│   │  directly, runs      │      │  process with RPC server.      │  │
│   │  in-process          │      │  Consumers use RPC client.     │  │
│   └──────────────────────┘      └────────────────────────────────┘  │
│              │                              │                        │
│              ▼                              ▼                        │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                    RepobaseEngine Service                     │  │
│   │                    (Core business logic)                      │  │
│   └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Mode Selection Rationale

| Mode | When to Use | Pros | Cons |
|------|------------|------|------|
| **Embedded** | CLI, scripts, tests | Simple, type-safe, no IPC | Engine stops when CLI exits |
| **Daemon/RPC** | Long-running services, HTTP API | Persistent, shared state | More complex, needs process management |

**For v1, we focus on Embedded mode** since the CLI is the primary consumer. The service design allows easy migration to RPC later.

---

## Services Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RepobaseEngine                               │
│  (Main service - orchestrates everything)                            │
├─────────────────────────────────────────────────────────────────────┤
│  Repo Management:           │  Search:                               │
│  - addRepo(url, options)    │  - search(query, mode, options)        │
│  - removeRepo(id)           │  - searchKeyword(query, options)       │
│  - listRepos()              │  - searchSemantic(query, options)      │
│  - getRepo(id)              │  - searchHybrid(query, options)        │
│  - syncRepo(id)             │                                        │
│  - syncAll()                │                                        │
└─────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐
│   RepoStore     │   │   GitClient     │   │       Indexer           │
│  (Repo config)  │   │ (Git commands)  │   │  (File indexing/search) │
├─────────────────┤   ├─────────────────┤   ├─────────────────────────┤
│ - load()        │   │ - clone()       │   │ - indexRepo()           │
│ - save()        │   │ - fetch()       │   │ - indexChanges()        │
│ - getRepo()     │   │ - resetHard()   │   │ - removeIndex()         │
│ - addRepo()     │   │ - diffNameStatus│   │ - searchKeyword()       │
│ - updateRepo()  │   │ - getCurrentCommit│ │ - searchSemantic()      │
│ - removeRepo()  │   │ - getRemoteHead()│  │ - searchHybrid()        │
└─────────────────┘   └─────────────────┘   └─────────────────────────┘
                                                       │
                                            ┌──────────┴──────────┐
                                            ▼                     ▼
                                    ┌────────────┐        ┌────────────┐
                                    │  LanceDB   │        │  Embedder  │
                                    │ (FTS+Vector│        │ (Local LLM)│
                                    └────────────┘        └────────────┘
```

---

## Data Model

### Repository Configuration (JSON)

```typescript
import { Schema } from "effect"

// Repository tracking mode
const TrackingMode = Schema.Struct({
  _tag: Schema.Literal("tracking"),
  branch: Schema.String  // e.g., "main", "master"
})

const PinnedMode = Schema.Struct({
  _tag: Schema.Literal("pinned"),
  ref: Schema.String  // tag or commit SHA
})

const RepoMode = Schema.Union(TrackingMode, PinnedMode)

// Repository metadata
const RepoConfig = Schema.Struct({
  id: Schema.String,              // unique identifier (derived from URL)
  url: Schema.String,             // GitHub URL
  localPath: Schema.String,       // ~/.repobase/repos/<id>
  mode: RepoMode,
  lastSyncedCommit: Schema.OptionFromNullOr(Schema.String),
  lastSyncedAt: Schema.OptionFromNullOr(Schema.DateFromNumber),
  addedAt: Schema.DateFromNumber
})

// Full store
const RepoStoreData = Schema.Struct({
  version: Schema.Literal(1),
  repos: Schema.Array(RepoConfig)
})

// Derive types
type RepoConfig = Schema.Schema.Type<typeof RepoConfig>
type RepoMode = Schema.Schema.Type<typeof RepoMode>
```

### File Index (LanceDB)

All indexed file data lives in a single LanceDB table, supporting both full-text search (FTS) and vector search.

```typescript
// Single table schema for LanceDB
interface FileRecord {
  id: string              // Composite key: "repo:path"
  repo: string            // Repository ID
  path: string            // Relative file path
  filename: string        // Just the filename
  contents: string        // File contents (truncated to 64KB)
  mtime_ms: number        // Last modified time
  size_bytes: number      // File size
  hash: string            // SHA-256 of contents (for change detection)
  vector: number[]        // Embedding vector (384 dimensions)
}

// Indexes created on the table:
// 1. FTS index on "contents" column - for keyword search
// 2. FTS index on "path" column - for file path search
// 3. Vector index on "vector" column - for semantic search
```

### Why Single Database (LanceDB Only)?

| Aspect | Dual DB (SQLite + LanceDB) | Single DB (LanceDB only) |
|--------|---------------------------|-------------------------|
| **Complexity** | Two sync points, two schemas | One schema, one source of truth |
| **Consistency** | Must keep in sync manually | Automatically consistent |
| **Dependencies** | `better-sqlite3` + `@lancedb/lancedb` | Just `@lancedb/lancedb` |
| **Hybrid Search** | Manual score merging | Native RRF reranker |
| **Storage** | Two directories | One directory |

LanceDB supports:
- **Full-text search** via built-in FTS with BM25 ranking
- **Vector search** for semantic similarity
- **Hybrid search** combining both with Reciprocal Rank Fusion (RRF)

### File Structure

```
~/.repobase/
├── config.json              # RepoStoreData - list of repos and metadata
├── index/                   # LanceDB database directory
│   └── files.lance/         # File index table
└── repos/
    ├── Effect-TS-effect/
    │   └── ... (cloned repo)
    ├── vercel-ai/
    │   └── ... (cloned repo)
    └── ...
```

---

## Service Definitions

### 1. GitClient Service

Wraps git commands using `@effect/platform` Command API.

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { Command } from "@effect/platform"

export interface FileChange {
  status: "A" | "M" | "D"  // Added, Modified, Deleted
  path: string
}

export interface GitClientService {
  readonly clone: (url: string, path: string) => Effect.Effect<void, GitError>
  readonly fetch: (path: string) => Effect.Effect<void, GitError>
  readonly resetHard: (path: string, ref: string) => Effect.Effect<void, GitError>
  readonly checkout: (path: string, ref: string) => Effect.Effect<void, GitError>
  readonly getCurrentCommit: (path: string) => Effect.Effect<string, GitError>
  readonly getRemoteHead: (path: string, branch: string) => Effect.Effect<string, GitError>
  readonly diffNameStatus: (path: string, fromCommit: string, toCommit: string) => Effect.Effect<FileChange[], GitError>
}

export const GitClient = Context.GenericTag<GitClientService>("@repobase/engine/GitClient")

export const make = Effect.succeed<GitClientService>({
  clone: (url, path) =>
    Command.make("git", "clone", "--depth", "1", url, path).pipe(
      Command.exitCode,
      Effect.asVoid,
      Effect.mapError(toGitError("clone"))
    ),
  
  fetch: (path) =>
    Command.make("git", "-C", path, "fetch", "origin").pipe(
      Command.exitCode,
      Effect.asVoid,
      Effect.mapError(toGitError("fetch"))
    ),
  
  getCurrentCommit: (path) =>
    Command.make("git", "-C", path, "rev-parse", "HEAD").pipe(
      Command.string,
      Effect.map((s) => s.trim()),
      Effect.mapError(toGitError("rev-parse"))
    ),
  
  getRemoteHead: (path, branch) =>
    Command.make("git", "-C", path, "rev-parse", `origin/${branch}`).pipe(
      Command.string,
      Effect.map((s) => s.trim()),
      Effect.mapError(toGitError("rev-parse"))
    ),
  
  resetHard: (path, ref) =>
    Command.make("git", "-C", path, "reset", "--hard", ref).pipe(
      Command.exitCode,
      Effect.asVoid,
      Effect.mapError(toGitError("reset"))
    ),
  
  checkout: (path, ref) =>
    Command.make("git", "-C", path, "checkout", ref).pipe(
      Command.exitCode,
      Effect.asVoid,
      Effect.mapError(toGitError("checkout"))
    ),
  
  // Get changed files between two commits
  diffNameStatus: (path, fromCommit, toCommit) =>
    Command.make("git", "-C", path, "diff", "--name-status", `${fromCommit}..${toCommit}`).pipe(
      Command.lines,
      Effect.map((lines) =>
        lines
          .filter((line) => line.trim().length > 0)
          .map((line) => {
            const [status, ...pathParts] = line.split("\t")
            return {
              status: status as "A" | "M" | "D",
              path: pathParts.join("\t")
            }
          })
      ),
      Effect.mapError(toGitError("diff"))
    )
})

export const layer = Layer.effect(GitClient, make)
```

### 2. RepoStore Service

Manages persistence of repository metadata.

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { FileSystem } from "@effect/platform"

export interface RepoStoreService {
  readonly load: () => Effect.Effect<RepoStoreData, StoreError>
  readonly save: (data: RepoStoreData) => Effect.Effect<void, StoreError>
  readonly getRepo: (id: string) => Effect.Effect<Option.Option<RepoConfig>, StoreError>
  readonly addRepo: (repo: RepoConfig) => Effect.Effect<void, StoreError>
  readonly updateRepo: (id: string, update: Partial<RepoConfig>) => Effect.Effect<void, StoreError>
  readonly removeRepo: (id: string) => Effect.Effect<void, StoreError>
}

export const RepoStore = Context.GenericTag<RepoStoreService>("@repobase/engine/RepoStore")

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const configPath = `${process.env.HOME}/.repobase/config.json`
  
  const load: RepoStoreService["load"] = Effect.gen(function* () {
    const exists = yield* fs.exists(configPath)
    if (!exists) {
      return { version: 1 as const, repos: [] }
    }
    const content = yield* fs.readFileString(configPath)
    return yield* Schema.decodeUnknown(RepoStoreData)(JSON.parse(content))
  }).pipe(Effect.mapError(toStoreError("load")))
  
  const save: RepoStoreService["save"] = (data) =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(RepoStoreData)(data)
      yield* fs.makeDirectory(`${process.env.HOME}/.repobase`, { recursive: true })
      yield* fs.writeFileString(configPath, JSON.stringify(encoded, null, 2))
    }).pipe(Effect.mapError(toStoreError("save")))
  
  // ... other methods similar pattern
  
  return RepoStore.of({ load, save, getRepo, addRepo, updateRepo, removeRepo })
})

export const layer = Layer.effect(RepoStore, make)
```

### 3. Indexer Service

Handles file indexing and search using LanceDB.

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as lancedb from "@lancedb/lancedb"

// Configuration
const INDEX_DIR = `${process.env.HOME}/.repobase/index`
const FILES_TABLE = "files"
const MAX_FILE_SIZE = 64 * 1024  // 64KB
const EMBEDDING_DIMENSION = 384
const MODEL_ID = "Xenova/all-MiniLM-L6-v2"

// Default ignore patterns (node_modules, .git, binaries, etc.)
const DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/*.jpg", "**/*.png", "**/*.gif",  // images
  "**/*.mp4", "**/*.mp3",               // media
  "**/*.zip", "**/*.tar.gz",            // archives
  "**/*.wasm", "**/*.exe",              // binaries
  // ... more patterns
]

export interface IndexSummary {
  repo: string
  filesIndexed: number
  filesDeleted: number
  filesSkipped: number
  durationMs: number
}

export interface SearchResult {
  repo: string
  path: string
  filename: string
  score: number
  snippet?: string
}

export interface SearchOptions {
  repo?: string        // Filter to specific repo
  limit?: number       // Max results (default: 20)
}

export type SearchMode = "keyword" | "semantic" | "hybrid"

export interface IndexerService {
  // Indexing
  readonly indexRepo: (repoId: string, repoPath: string, options?: { force?: boolean }) => Effect.Effect<IndexSummary, IndexError>
  readonly indexChanges: (repoId: string, repoPath: string, changes: FileChange[]) => Effect.Effect<IndexSummary, IndexError>
  readonly removeIndex: (repoId: string) => Effect.Effect<void, IndexError>
  
  // Search
  readonly searchKeyword: (query: string, options?: SearchOptions) => Effect.Effect<SearchResult[], SearchError>
  readonly searchSemantic: (query: string, options?: SearchOptions) => Effect.Effect<SearchResult[], SearchError>
  readonly searchHybrid: (query: string, options?: SearchOptions) => Effect.Effect<SearchResult[], SearchError>
}

export const Indexer = Context.GenericTag<IndexerService>("@repobase/engine/Indexer")

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  
  // Initialize LanceDB connection
  yield* fs.makeDirectory(INDEX_DIR, { recursive: true })
  const db = yield* Effect.tryPromise(() => lancedb.connect(INDEX_DIR))
  
  // Get or create files table
  const getTable = Effect.tryPromise(async () => {
    const tables = await db.tableNames()
    if (tables.includes(FILES_TABLE)) {
      return db.openTable(FILES_TABLE)
    }
    // Create with schema
    return db.createTable(FILES_TABLE, [{
      id: "__template__",
      repo: "",
      path: "",
      filename: "",
      contents: "",
      mtime_ms: 0,
      size_bytes: 0,
      hash: "",
      vector: Array(EMBEDDING_DIMENSION).fill(0)
    }]).then(async (table) => {
      await table.delete("id = '__template__'")
      return table
    })
  })
  
  // Initialize embedding model (lazy)
  let embedder: any = null
  const getEmbedder = Effect.tryPromise(async () => {
    if (!embedder) {
      const { pipeline } = await import("@xenova/transformers")
      embedder = await pipeline("feature-extraction", MODEL_ID)
    }
    return embedder
  })
  
  const embedText = (text: string) =>
    Effect.gen(function* () {
      const model = yield* getEmbedder
      const output = yield* Effect.tryPromise(() =>
        model(text.trim() || " ", { pooling: "mean", normalize: true })
      )
      return Array.from(output.data as Float32Array)
    })
  
  // Full repository indexing
  const indexRepo: IndexerService["indexRepo"] = (repoId, repoPath, options) =>
    Effect.gen(function* () {
      const startTime = Date.now()
      const table = yield* getTable
      const force = options?.force ?? false
      
      // Get existing records for this repo
      const existing = yield* Effect.tryPromise(() =>
        table.query().where(`repo = '${repoId}'`).select(["path", "hash"]).toArray()
      )
      const existingByPath = new Map(existing.map((r: any) => [r.path, r.hash]))
      
      // Find all files using glob
      const { glob } = yield* Effect.tryPromise(() => import("fast-glob"))
      const files = yield* Effect.tryPromise(() =>
        glob("**/*", {
          cwd: repoPath,
          ignore: DEFAULT_IGNORE_PATTERNS,
          onlyFiles: true,
          dot: true
        })
      )
      
      const seenPaths = new Set<string>()
      const toIndex: Array<{ path: string; contents: string; hash: string }> = []
      let skipped = 0
      
      for (const filePath of files) {
        seenPaths.add(filePath)
        const fullPath = `${repoPath}/${filePath}`
        
        // Read file
        const buffer = yield* fs.readFile(fullPath)
        
        // Skip binary files
        if (isBinary(buffer)) {
          skipped++
          continue
        }
        
        // Check hash for changes
        const hash = hashBuffer(buffer)
        if (!force && existingByPath.get(filePath) === hash) {
          skipped++
          continue
        }
        
        const contents = new TextDecoder().decode(buffer).slice(0, MAX_FILE_SIZE)
        toIndex.push({ path: filePath, contents, hash })
      }
      
      // Find deleted files
      const toDelete = [...existingByPath.keys()].filter((p) => !seenPaths.has(p))
      
      // Delete removed files from index
      if (toDelete.length > 0) {
        for (const path of toDelete) {
          yield* Effect.tryPromise(() =>
            table.delete(`id = '${repoId}:${path}'`)
          )
        }
      }
      
      // Index new/changed files
      if (toIndex.length > 0) {
        // Delete existing records for files being re-indexed
        for (const file of toIndex) {
          yield* Effect.tryPromise(() =>
            table.delete(`id = '${repoId}:${file.path}'`)
          )
        }
        
        // Generate embeddings and insert
        const records = yield* Effect.forEach(toIndex, (file) =>
          Effect.gen(function* () {
            const vector = yield* embedText(file.contents)
            const stats = yield* fs.stat(`${repoPath}/${file.path}`)
            return {
              id: `${repoId}:${file.path}`,
              repo: repoId,
              path: file.path,
              filename: file.path.split("/").pop() ?? file.path,
              contents: file.contents,
              mtime_ms: Math.trunc(stats.mtime?.getTime() ?? Date.now()),
              size_bytes: Number(stats.size),
              hash: file.hash,
              vector
            }
          })
        )
        
        yield* Effect.tryPromise(() => table.add(records))
      }
      
      // Create/update indexes
      yield* Effect.tryPromise(async () => {
        await table.createIndex("contents", { config: lancedb.Index.fts(), replace: true })
        await table.createIndex("vector", { 
          config: lancedb.Index.ivfFlat({ numPartitions: Math.max(1, Math.floor(files.length / 100)) }),
          replace: true 
        })
      }).pipe(Effect.ignore)  // Ignore index errors for small tables
      
      return {
        repo: repoId,
        filesIndexed: toIndex.length,
        filesDeleted: toDelete.length,
        filesSkipped: skipped,
        durationMs: Date.now() - startTime
      }
    })
  
  // Incremental indexing based on git diff
  const indexChanges: IndexerService["indexChanges"] = (repoId, repoPath, changes) =>
    Effect.gen(function* () {
      const startTime = Date.now()
      const table = yield* getTable
      
      const deleted = changes.filter((c) => c.status === "D")
      const addedOrModified = changes.filter((c) => c.status === "A" || c.status === "M")
      
      // Delete removed files
      for (const change of deleted) {
        yield* Effect.tryPromise(() =>
          table.delete(`id = '${repoId}:${change.path}'`)
        )
      }
      
      // Index added/modified files
      let indexed = 0
      let skipped = 0
      
      for (const change of addedOrModified) {
        const fullPath = `${repoPath}/${change.path}`
        
        // Check if file should be ignored
        if (shouldIgnore(change.path)) {
          skipped++
          continue
        }
        
        const exists = yield* fs.exists(fullPath)
        if (!exists) {
          skipped++
          continue
        }
        
        const buffer = yield* fs.readFile(fullPath)
        if (isBinary(buffer)) {
          skipped++
          continue
        }
        
        // Delete existing record
        yield* Effect.tryPromise(() =>
          table.delete(`id = '${repoId}:${change.path}'`)
        )
        
        // Insert new record
        const contents = new TextDecoder().decode(buffer).slice(0, MAX_FILE_SIZE)
        const vector = yield* embedText(contents)
        const stats = yield* fs.stat(fullPath)
        
        yield* Effect.tryPromise(() =>
          table.add([{
            id: `${repoId}:${change.path}`,
            repo: repoId,
            path: change.path,
            filename: change.path.split("/").pop() ?? change.path,
            contents,
            mtime_ms: Math.trunc(stats.mtime?.getTime() ?? Date.now()),
            size_bytes: Number(stats.size),
            hash: hashBuffer(buffer),
            vector
          }])
        )
        
        indexed++
      }
      
      return {
        repo: repoId,
        filesIndexed: indexed,
        filesDeleted: deleted.length,
        filesSkipped: skipped,
        durationMs: Date.now() - startTime
      }
    })
  
  // Remove all index data for a repo
  const removeIndex: IndexerService["removeIndex"] = (repoId) =>
    Effect.gen(function* () {
      const table = yield* getTable
      yield* Effect.tryPromise(() =>
        table.delete(`repo = '${repoId}'`)
      )
    })
  
  // Keyword search (FTS only)
  const searchKeyword: IndexerService["searchKeyword"] = (query, options) =>
    Effect.gen(function* () {
      const table = yield* getTable
      const limit = options?.limit ?? 20
      
      let search = table.query().nearestToText(query)
      
      if (options?.repo) {
        search = search.where(`repo = '${options.repo}'`)
      }
      
      const results = yield* Effect.tryPromise(() =>
        search.select(["repo", "path", "filename", "contents"]).limit(limit).toArray()
      )
      
      return results.map((r: any) => ({
        repo: r.repo,
        path: r.path,
        filename: r.filename,
        score: r._score ?? 1,
        snippet: extractSnippet(r.contents, query)
      }))
    })
  
  // Semantic search (vector only)
  const searchSemantic: IndexerService["searchSemantic"] = (query, options) =>
    Effect.gen(function* () {
      const table = yield* getTable
      const limit = options?.limit ?? 20
      const queryVector = yield* embedText(query)
      
      let search = table.search(queryVector).column("vector")
      
      if (options?.repo) {
        search = search.where(`repo = '${options.repo}'`)
      }
      
      const results = yield* Effect.tryPromise(() =>
        search.select(["repo", "path", "filename", "contents"]).limit(limit).toArray()
      )
      
      return results.map((r: any) => ({
        repo: r.repo,
        path: r.path,
        filename: r.filename,
        score: 1 / (1 + (r._distance ?? 0)),
        snippet: extractSnippet(r.contents, query)
      }))
    })
  
  // Hybrid search (FTS + vector with RRF reranking)
  const searchHybrid: IndexerService["searchHybrid"] = (query, options) =>
    Effect.gen(function* () {
      const table = yield* getTable
      const limit = options?.limit ?? 20
      const queryVector = yield* embedText(query)
      
      const reranker = yield* Effect.tryPromise(() =>
        lancedb.rerankers.RRFReranker.create()
      )
      
      let search = table
        .query()
        .fullTextSearch(query)
        .nearestTo(queryVector)
        .rerank(reranker)
      
      if (options?.repo) {
        search = search.where(`repo = '${options.repo}'`)
      }
      
      const results = yield* Effect.tryPromise(() =>
        search.select(["repo", "path", "filename", "contents"]).limit(limit).toArray()
      )
      
      return results.map((r: any) => ({
        repo: r.repo,
        path: r.path,
        filename: r.filename,
        score: r._relevanceScore ?? 1,
        snippet: extractSnippet(r.contents, query)
      }))
    })
  
  return Indexer.of({
    indexRepo,
    indexChanges,
    removeIndex,
    searchKeyword,
    searchSemantic,
    searchHybrid
  })
})

export const layer = Layer.scoped(Indexer, make)

// Utility functions
function isBinary(buffer: Uint8Array): boolean {
  const sample = buffer.slice(0, Math.min(buffer.length, 1024))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 255) suspicious++
  }
  return suspicious / sample.length > 0.3
}

function hashBuffer(buffer: Uint8Array): string {
  // Use Web Crypto API or Node crypto
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

function shouldIgnore(path: string): boolean {
  return DEFAULT_IGNORE_PATTERNS.some((pattern) =>
    new RegExp(pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")).test(path)
  )
}

function extractSnippet(contents: string, query: string, contextChars = 100): string {
  const lower = contents.toLowerCase()
  const queryLower = query.toLowerCase()
  const idx = lower.indexOf(queryLower)
  if (idx === -1) return contents.slice(0, contextChars * 2) + "..."
  const start = Math.max(0, idx - contextChars)
  const end = Math.min(contents.length, idx + query.length + contextChars)
  return (start > 0 ? "..." : "") + contents.slice(start, end) + (end < contents.length ? "..." : "")
}
```

### 4. RepobaseEngine Service (Main)

Orchestrates repository operations and integrates indexing.

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

export interface AddRepoOptions {
  readonly mode?: RepoMode
}

export interface SyncResult {
  readonly id: string
  readonly updated: boolean
  readonly previousCommit: Option.Option<string>
  readonly currentCommit: string
  readonly indexSummary?: IndexSummary
}

export interface RepobaseEngineService {
  // Repo management
  readonly addRepo: (url: string, options?: AddRepoOptions) => Effect.Effect<RepoConfig, EngineError>
  readonly removeRepo: (id: string) => Effect.Effect<void, EngineError>
  readonly listRepos: () => Effect.Effect<Array<RepoConfig>, EngineError>
  readonly getRepo: (id: string) => Effect.Effect<Option.Option<RepoConfig>, EngineError>
  readonly syncRepo: (id: string) => Effect.Effect<SyncResult, EngineError>
  readonly syncAll: () => Effect.Effect<Array<SyncResult>, EngineError>
  
  // Search (delegates to Indexer)
  readonly search: (query: string, mode: SearchMode, options?: SearchOptions) => Effect.Effect<SearchResult[], EngineError>
}

export const RepobaseEngine = Context.GenericTag<RepobaseEngineService>("@repobase/engine/RepobaseEngine")

export const make = Effect.gen(function* () {
  const git = yield* GitClient
  const store = yield* RepoStore
  const indexer = yield* Indexer
  const fs = yield* FileSystem.FileSystem
  
  const addRepo: RepobaseEngineService["addRepo"] = (url, options) =>
    Effect.gen(function* () {
      const id = deriveRepoId(url)
      const localPath = `${process.env.HOME}/.repobase/repos/${id}`
      
      // Check if already exists
      const existing = yield* store.getRepo(id)
      if (Option.isSome(existing)) {
        return yield* Effect.fail(new RepoAlreadyExistsError({ id }))
      }
      
      // Clone
      yield* Effect.log(`Cloning ${url}...`)
      yield* git.clone(url, localPath)
      
      // Get current commit
      const currentCommit = yield* git.getCurrentCommit(localPath)
      
      // Build config
      const mode = options?.mode ?? { _tag: "tracking" as const, branch: "main" }
      const repo: RepoConfig = {
        id,
        url,
        localPath,
        mode,
        lastSyncedCommit: Option.some(currentCommit),
        lastSyncedAt: Option.some(new Date()),
        addedAt: new Date()
      }
      
      // Save config
      yield* store.addRepo(repo)
      
      // Index the repository
      yield* Effect.log(`Indexing ${id}...`)
      const indexResult = yield* indexer.indexRepo(id, localPath)
      yield* Effect.log(`Indexed ${indexResult.filesIndexed} files in ${indexResult.durationMs}ms`)
      
      return repo
    })
  
  const removeRepo: RepobaseEngineService["removeRepo"] = (id) =>
    Effect.gen(function* () {
      const repoOpt = yield* store.getRepo(id)
      const repo = yield* Option.match(repoOpt, {
        onNone: () => Effect.fail(new RepoNotFoundError({ id })),
        onSome: Effect.succeed
      })
      
      // Remove from index
      yield* indexer.removeIndex(id)
      
      // Remove files
      yield* fs.remove(repo.localPath, { recursive: true })
      
      // Remove from store
      yield* store.removeRepo(id)
    })
  
  const syncRepo: RepobaseEngineService["syncRepo"] = (id) =>
    Effect.gen(function* () {
      const repoOpt = yield* store.getRepo(id)
      const repo = yield* Option.match(repoOpt, {
        onNone: () => Effect.fail(new RepoNotFoundError({ id })),
        onSome: Effect.succeed
      })
      
      // Pinned repos don't sync
      if (repo.mode._tag === "pinned") {
        return {
          id,
          updated: false,
          previousCommit: repo.lastSyncedCommit,
          currentCommit: Option.getOrElse(repo.lastSyncedCommit, () => "unknown")
        }
      }
      
      // Fetch
      yield* git.fetch(repo.localPath)
      
      // Check if update needed
      const remoteHead = yield* git.getRemoteHead(repo.localPath, repo.mode.branch)
      const previousCommit = repo.lastSyncedCommit
      const needsUpdate = Option.match(previousCommit, {
        onNone: () => true,
        onSome: (prev) => prev !== remoteHead
      })
      
      if (!needsUpdate) {
        return {
          id,
          updated: false,
          previousCommit,
          currentCommit: remoteHead
        }
      }
      
      // Get changed files via git diff
      const changes = yield* Option.match(previousCommit, {
        onNone: () => Effect.succeed([] as FileChange[]),
        onSome: (prev) => git.diffNameStatus(repo.localPath, prev, remoteHead)
      })
      
      // Update working tree
      yield* git.resetHard(repo.localPath, remoteHead)
      
      // Update index
      let indexSummary: IndexSummary
      if (changes.length > 0) {
        // Incremental indexing
        indexSummary = yield* indexer.indexChanges(id, repo.localPath, changes)
      } else {
        // Full re-index (first sync or no previous commit)
        indexSummary = yield* indexer.indexRepo(id, repo.localPath)
      }
      
      // Update store
      yield* store.updateRepo(id, {
        lastSyncedCommit: Option.some(remoteHead),
        lastSyncedAt: Option.some(new Date())
      })
      
      return {
        id,
        updated: true,
        previousCommit,
        currentCommit: remoteHead,
        indexSummary
      }
    })
  
  const syncAll: RepobaseEngineService["syncAll"] = () =>
    Effect.gen(function* () {
      const data = yield* store.load()
      return yield* Effect.forEach(data.repos, (repo) => syncRepo(repo.id))
    })
  
  const search: RepobaseEngineService["search"] = (query, mode, options) => {
    switch (mode) {
      case "keyword":
        return indexer.searchKeyword(query, options)
      case "semantic":
        return indexer.searchSemantic(query, options)
      case "hybrid":
        return indexer.searchHybrid(query, options)
    }
  }
  
  return RepobaseEngine.of({
    addRepo,
    removeRepo,
    listRepos: () => store.load().pipe(Effect.map((d) => d.repos)),
    getRepo: store.getRepo,
    syncRepo,
    syncAll,
    search
  })
})

export const layer = Layer.effect(RepobaseEngine, make)
```

---

## Layer Composition

```typescript
import { Layer } from "effect"
import { NodeFileSystem, NodeCommandExecutor } from "@effect/platform-node"

// Platform dependencies
const PlatformLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodeCommandExecutor.layer
)

// Engine layers
const GitClientLive = GitClient.layer.pipe(Layer.provide(PlatformLive))
const RepoStoreLive = RepoStore.layer.pipe(Layer.provide(PlatformLive))
const IndexerLive = Indexer.layer.pipe(Layer.provide(PlatformLive))

// Full engine
export const RepobaseEngineLive = RepobaseEngine.layer.pipe(
  Layer.provide(GitClientLive),
  Layer.provide(RepoStoreLive),
  Layer.provide(IndexerLive),
  Layer.provide(PlatformLive)
)
```

---

## CLI Package (Primary Consumer)

### CLI Structure

```
packages/cli/
├── src/
│   ├── commands/
│   │   ├── add.ts
│   │   ├── remove.ts
│   │   ├── list.ts
│   │   ├── sync.ts
│   │   ├── search.ts
│   │   └── index.ts
│   ├── main.ts
│   └── index.ts
└── package.json
```

### CLI Implementation

```typescript
// packages/cli/src/main.ts
import { Args, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer, Option } from "effect"
import { RepobaseEngine, RepobaseEngineLive, SearchMode } from "@repobase/engine"

const { addRepo, removeRepo, listRepos, syncRepo, syncAll, search } = Effect.serviceFunctions(RepobaseEngine)

// ... existing commands (add, list, sync, remove) ...

// repobase search <query> [--semantic] [--hybrid] [--repo <id>] [--limit <n>]
const queryArg = Args.text({ name: "query" }).pipe(
  Args.withDescription("Search query")
)
const semanticOption = Options.boolean("semantic").pipe(
  Options.withAlias("s"),
  Options.withDescription("Use semantic search"),
  Options.withDefault(false)
)
const hybridOption = Options.boolean("hybrid").pipe(
  Options.withAlias("H"),
  Options.withDescription("Use hybrid search (keyword + semantic)"),
  Options.withDefault(false)
)
const repoOption = Options.text("repo").pipe(
  Options.withAlias("r"),
  Options.withDescription("Filter to specific repository"),
  Options.optional
)
const limitOption = Options.integer("limit").pipe(
  Options.withAlias("l"),
  Options.withDescription("Maximum results"),
  Options.withDefault(20)
)

const searchCommand = Command.make(
  "search",
  { query: queryArg, semantic: semanticOption, hybrid: hybridOption, repo: repoOption, limit: limitOption },
  ({ query, semantic, hybrid, repo, limit }) =>
    Effect.gen(function* () {
      const mode: SearchMode = hybrid ? "hybrid" : semantic ? "semantic" : "keyword"
      const options = {
        repo: Option.getOrUndefined(repo),
        limit
      }
      
      yield* Console.log(`Searching (${mode}): "${query}"`)
      const results = yield* search(query, mode, options)
      
      if (results.length === 0) {
        yield* Console.log("No results found.")
        return
      }
      
      yield* Console.log(`\nFound ${results.length} results:\n`)
      for (const result of results) {
        yield* Console.log(`${result.repo}/${result.path}`)
        if (result.snippet) {
          yield* Console.log(`  ${result.snippet.replace(/\n/g, " ").slice(0, 100)}...`)
        }
        yield* Console.log("")
      }
    })
).pipe(Command.withDescription("Search across indexed repositories"))

// Root command
const rootCommand = Command.make("repobase").pipe(
  Command.withDescription("Manage local GitHub repository cache with search"),
  Command.withSubcommands([addCommand, listCommand, syncCommand, removeCommand, searchCommand])
)

// CLI setup
const cli = Command.run(rootCommand, {
  name: "repobase",
  version: "0.1.0"
})

// Layer composition for CLI
const MainLayer = Layer.mergeAll(
  RepobaseEngineLive,
  NodeContext.layer
)

// Run
Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(MainLayer),
  Effect.tapErrorCause(Effect.logError),
  NodeRuntime.runMain
)
```

### CLI Usage Examples

```bash
# Add a repository (clones and indexes)
repobase add https://github.com/Effect-TS/effect
# Output: ✓ Added repository: Effect-TS-effect
#         Indexed 1822 files in 45230ms

# Keyword search
repobase search "Context.Tag"
# Output: Found 15 results...

# Semantic search
repobase search "how to handle errors in effect" --semantic
# Output: Found 20 results...

# Hybrid search (best of both)
repobase search "retry with exponential backoff" --hybrid
# Output: Found 12 results...

# Search in specific repo
repobase search "Schema.Struct" --repo Effect-TS-effect

# Sync and re-index
repobase sync Effect-TS-effect
# Output: ✓ Effect-TS-effect: updated to a1b2c3d4
#         Re-indexed 23 files, deleted 5
```

---

## Error Handling

```typescript
import { Data } from "effect"

export class GitError extends Data.TaggedError("GitError")<{
  readonly command: string
  readonly message: string
}> {}

export class StoreError extends Data.TaggedError("StoreError")<{
  readonly operation: string
  readonly message: string
}> {}

export class IndexError extends Data.TaggedError("IndexError")<{
  readonly operation: string
  readonly message: string
}> {}

export class SearchError extends Data.TaggedError("SearchError")<{
  readonly message: string
}> {}

export class RepoNotFoundError extends Data.TaggedError("RepoNotFoundError")<{
  readonly id: string
}> {}

export class RepoAlreadyExistsError extends Data.TaggedError("RepoAlreadyExistsError")<{
  readonly id: string
}> {}

export type EngineError = 
  | GitError 
  | StoreError 
  | IndexError 
  | SearchError 
  | RepoNotFoundError 
  | RepoAlreadyExistsError
```

---

## Implementation Plan

### Phase 1: Core Engine
1. [ ] Set up project structure (engine package)
2. [ ] Define schemas (RepoConfig, RepoStoreData, RepoMode)
3. [ ] Implement GitClient service (including diffNameStatus)
4. [ ] Implement RepoStore service

### Phase 2: Indexing
5. [ ] Set up LanceDB connection and table schema
6. [ ] Implement embedding with @xenova/transformers
7. [ ] Implement Indexer.indexRepo (full indexing)
8. [ ] Implement Indexer.indexChanges (incremental)
9. [ ] Implement Indexer.removeIndex

### Phase 3: Search
10. [ ] Implement Indexer.searchKeyword (FTS)
11. [ ] Implement Indexer.searchSemantic (vector)
12. [ ] Implement Indexer.searchHybrid (RRF reranking)

### Phase 4: Engine Integration
13. [ ] Implement RepobaseEngine with indexing integration
14. [ ] Wire up addRepo → clone + index
15. [ ] Wire up syncRepo → fetch + incremental index
16. [ ] Wire up removeRepo → remove index + files

### Phase 5: CLI Package
17. [ ] Set up CLI package structure
18. [ ] Implement `add`, `list`, `sync`, `remove` commands
19. [ ] Implement `search` command with mode options

### Phase 6: Testing & Polish
20. [ ] Unit tests for each service
21. [ ] Integration tests for full flow
22. [ ] Documentation

---

## Dependencies

### Engine Package
```json
{
  "name": "@repobase/engine",
  "dependencies": {
    "effect": "^3.x",
    "@effect/platform": "^0.x",
    "@effect/platform-node": "^0.x",
    "@lancedb/lancedb": "^0.x",
    "@xenova/transformers": "^2.x",
    "fast-glob": "^3.x"
  }
}
```

### CLI Package
```json
{
  "name": "@repobase/cli",
  "dependencies": {
    "@repobase/engine": "workspace:*",
    "effect": "^3.x",
    "@effect/cli": "^0.x",
    "@effect/platform-node": "^0.x"
  }
}
```

---

## Open Questions

1. **Shallow vs full clones**: Should we use `--depth 1` for smaller footprint?
   - *Recommendation*: Start with shallow clones (`--depth 1`)

2. **Default branch detection**: How to determine default branch if not "main"?
   - *Recommendation*: Use `git remote show origin | grep 'HEAD branch'` or let user specify

3. **Embedding batch size**: Should we batch embeddings for performance?
   - *Recommendation*: Process one at a time for v1, batch later if needed

4. **Index rebuilding**: When should we force a full re-index?
   - *Recommendation*: On first add, and with explicit `--force` flag on sync

5. **Snippet extraction**: LanceDB FTS doesn't provide snippets like SQLite.
   - *Resolution*: Implement simple snippet extraction by finding query terms in content
