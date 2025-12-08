import { FileSystem } from "@effect/platform"
import { Context, Effect, Layer, Option } from "effect"
import { IndexError, SearchError } from "../errors.js"
import type { FileChange } from "./GitClient.js"
import * as os from "os"
import * as crypto from "crypto"

// Configuration
const INDEX_DIR = `${os.homedir()}/.repobase/index`
const FILES_TABLE = "files"
const MAX_FILE_SIZE = 64 * 1024 // 64KB
const EMBEDDING_DIMENSION = 384
const MODEL_ID = "Xenova/all-MiniLM-L6-v2"

// Default ignore patterns (node_modules, .git, binaries, etc.)
const DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  "**/target/**",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.png",
  "**/*.gif",
  "**/*.ico",
  "**/*.svg",
  "**/*.webp",
  "**/*.mp4",
  "**/*.mp3",
  "**/*.wav",
  "**/*.ogg",
  "**/*.zip",
  "**/*.tar",
  "**/*.tar.gz",
  "**/*.rar",
  "**/*.7z",
  "**/*.wasm",
  "**/*.exe",
  "**/*.dll",
  "**/*.so",
  "**/*.dylib",
  "**/*.bin",
  "**/*.pdf",
  "**/*.doc",
  "**/*.docx",
  "**/*.lock",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map"
]

/**
 * Summary of an indexing operation
 */
export interface IndexSummary {
  repo: string
  filesIndexed: number
  filesDeleted: number
  filesSkipped: number
  durationMs: number
}

/**
 * A single search result
 */
export interface SearchResult {
  repo: string
  path: string
  filename: string
  score: number
  snippet?: string
}

/**
 * Options for search operations
 */
export interface SearchOptions {
  repo?: string // Filter to specific repo
  limit?: number // Max results (default: 20)
}

/**
 * Search mode
 */
export type SearchMode = "keyword" | "semantic" | "hybrid"

/**
 * Options for indexing operations
 */
export interface IndexOptions {
  force?: boolean // Force full re-index even if files haven't changed
}

/**
 * Indexer service interface
 */
export interface IndexerService {
  // Indexing
  readonly indexRepo: (
    repoId: string,
    repoPath: string,
    options?: IndexOptions
  ) => Effect.Effect<IndexSummary, IndexError>
  readonly indexChanges: (
    repoId: string,
    repoPath: string,
    changes: FileChange[]
  ) => Effect.Effect<IndexSummary, IndexError>
  readonly removeIndex: (repoId: string) => Effect.Effect<void, IndexError>

  // Search
  readonly searchKeyword: (
    query: string,
    options?: SearchOptions
  ) => Effect.Effect<SearchResult[], SearchError>
  readonly searchSemantic: (
    query: string,
    options?: SearchOptions
  ) => Effect.Effect<SearchResult[], SearchError>
  readonly searchHybrid: (
    query: string,
    options?: SearchOptions
  ) => Effect.Effect<SearchResult[], SearchError>
}

/**
 * Indexer service tag
 */
export class Indexer extends Context.Tag("@repobase/engine/Indexer")<
  Indexer,
  IndexerService
>() {}

/**
 * Check if a buffer contains binary data
 */
function isBinary(buffer: Uint8Array): boolean {
  const sample = buffer.slice(0, Math.min(buffer.length, 1024))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 255) suspicious++
  }
  return suspicious / sample.length > 0.3
}

/**
 * Compute SHA-256 hash of a buffer
 */
function hashBuffer(buffer: Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

/**
 * Check if a path should be ignored based on patterns
 */
function shouldIgnore(path: string): boolean {
  return DEFAULT_IGNORE_PATTERNS.some((pattern) => {
    // Convert glob pattern to regex
    const regexStr = pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\./g, "\\.")
    return new RegExp(regexStr).test(path)
  })
}

/**
 * Extract a snippet around the query match
 */
function extractSnippet(
  contents: string,
  query: string,
  contextChars = 100
): string {
  const lower = contents.toLowerCase()
  const queryLower = query.toLowerCase()
  const idx = lower.indexOf(queryLower)
  if (idx === -1) return contents.slice(0, contextChars * 2) + "..."
  const start = Math.max(0, idx - contextChars)
  const end = Math.min(contents.length, idx + query.length + contextChars)
  return (
    (start > 0 ? "..." : "") +
    contents.slice(start, end) +
    (end < contents.length ? "..." : "")
  )
}

/**
 * Create the Indexer service implementation
 */
export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem

  // Initialize LanceDB connection lazily
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let table: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let embedder: any = null

  const getDb = Effect.gen(function* () {
    if (db) return db
    yield* fs.makeDirectory(INDEX_DIR, { recursive: true }).pipe(Effect.ignore)
    
    const lancedb = yield* Effect.tryPromise({
      try: () => import("@lancedb/lancedb"),
      catch: (e) => new IndexError({ operation: "init", message: `Failed to import lancedb: ${e}` })
    })
    
    db = yield* Effect.tryPromise({
      try: () => lancedb.connect(INDEX_DIR),
      catch: (e) => new IndexError({ operation: "init", message: `Failed to connect to LanceDB: ${e}` })
    })
    return db
  })

  const getTable = Effect.gen(function* () {
    if (table) return table

    const database = yield* getDb
    const tableNames = yield* Effect.tryPromise({
      try: () => database.tableNames() as Promise<string[]>,
      catch: (e) => new IndexError({ operation: "init", message: `Failed to list tables: ${e}` })
    })

    if (tableNames.includes(FILES_TABLE)) {
      table = yield* Effect.tryPromise({
        try: () => database.openTable(FILES_TABLE),
        catch: (e) => new IndexError({ operation: "init", message: `Failed to open table: ${e}` })
      })
    } else {
      // Create with schema using a template record
      table = yield* Effect.tryPromise({
        try: async () => {
          const newTable = await database.createTable(FILES_TABLE, [
            {
              id: "__template__",
              repo: "",
              path: "",
              filename: "",
              contents: "",
              mtime_ms: 0,
              size_bytes: 0,
              hash: "",
              vector: Array(EMBEDDING_DIMENSION).fill(0)
            }
          ])
          await newTable.delete("id = '__template__'")
          return newTable
        },
        catch: (e) => new IndexError({ operation: "init", message: `Failed to create table: ${e}` })
      })
    }
    return table
  })

  // Initialize embedding model lazily
  const getEmbedder = Effect.gen(function* () {
    if (embedder) return embedder

    const transformers = yield* Effect.tryPromise({
      try: () => import("@xenova/transformers"),
      catch: (e) => new IndexError({ operation: "embed", message: `Failed to import transformers: ${e}` })
    })

    embedder = yield* Effect.tryPromise({
      try: () => transformers.pipeline("feature-extraction", MODEL_ID),
      catch: (e) => new IndexError({ operation: "embed", message: `Failed to load embedding model: ${e}` })
    })

    return embedder
  })

  const embedText = (text: string): Effect.Effect<number[], IndexError> =>
    Effect.gen(function* () {
      const model = yield* getEmbedder
      const output = yield* Effect.tryPromise({
        try: () => model(text.trim() || " ", { pooling: "mean", normalize: true }),
        catch: (e) => new IndexError({ operation: "embed", message: `Failed to embed text: ${e}` })
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Array.from((output as any).data as Float32Array)
    })

  // Full repository indexing
  const indexRepo: IndexerService["indexRepo"] = (repoId, repoPath, options) =>
    Effect.gen(function* () {
      const startTime = Date.now()
      const tbl = yield* getTable
      const force = options?.force ?? false

      // Get existing records for this repo
      const existing = yield* Effect.tryPromise({
        try: () =>
          tbl
            .query()
            .where(`repo = '${repoId}'`)
            .select(["path", "hash"])
            .toArray() as Promise<Array<{ path: string; hash: string }>>,
        catch: (e) => new IndexError({ operation: "indexRepo", message: `Failed to query existing: ${e}` })
      })
      const existingByPath = new Map(
        existing.map((r) => [r.path, r.hash])
      )

      // Find all files using glob
      const glob = yield* Effect.tryPromise({
        try: () => import("fast-glob"),
        catch: (e) => new IndexError({ operation: "indexRepo", message: `Failed to import fast-glob: ${e}` })
      })

      const files = yield* Effect.tryPromise({
        try: () =>
          glob.default("**/*", {
            cwd: repoPath,
            ignore: DEFAULT_IGNORE_PATTERNS,
            onlyFiles: true,
            dot: true
          }),
        catch: (e) => new IndexError({ operation: "indexRepo", message: `Failed to glob files: ${e}` })
      })

      const seenPaths = new Set<string>()
      const toIndex: Array<{ path: string; contents: string; hash: string }> = []
      let skipped = 0

      for (const filePath of files) {
        seenPaths.add(filePath)
        const fullPath = `${repoPath}/${filePath}`

        // Read file
        const bufferResult = yield* fs.readFile(fullPath).pipe(
          Effect.option,
          Effect.catchAll(() => Effect.succeed({ _tag: "None" as const }))
        )

        if (bufferResult._tag === "None") {
          skipped++
          continue
        }
        const buffer = bufferResult.value

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
          yield* Effect.tryPromise({
            try: () => tbl.delete(`id = '${repoId}:${path}'`),
            catch: (e) => new IndexError({ operation: "indexRepo", message: `Failed to delete: ${e}` })
          })
        }
      }

      // Index new/changed files
      if (toIndex.length > 0) {
        // Delete existing records for files being re-indexed
        for (const file of toIndex) {
          yield* Effect.tryPromise({
            try: () => tbl.delete(`id = '${repoId}:${file.path}'`),
            catch: () => void 0 // Ignore delete errors for non-existent records
          }).pipe(Effect.ignore)
        }

        // Generate embeddings and insert
        const records = yield* Effect.forEach(
          toIndex,
          (file) =>
            Effect.gen(function* () {
              const vector = yield* embedText(file.contents)
              const stat = yield* fs.stat(`${repoPath}/${file.path}`).pipe(
                Effect.catchAll(() => Effect.succeed({ mtime: Option.none<Date>(), size: BigInt(0) }))
              )

              const mtimeMs = Option.match(stat.mtime as Option.Option<Date>, {
                onNone: () => Date.now(),
                onSome: (d) => d.getTime()
              })
              return {
                id: `${repoId}:${file.path}`,
                repo: repoId,
                path: file.path,
                filename: file.path.split("/").pop() ?? file.path,
                contents: file.contents,
                mtime_ms: Math.trunc(mtimeMs),
                size_bytes: Number(stat.size),
                hash: file.hash,
                vector
              }
            }),
          { concurrency: 1 } // Process sequentially to avoid overwhelming the embedder
        )

        yield* Effect.tryPromise({
          try: () => tbl.add(records),
          catch: (e) => new IndexError({ operation: "indexRepo", message: `Failed to add records: ${e}` })
        })
      }

      // Create/update FTS index (ignore errors for small tables)
      yield* Effect.tryPromise({
        try: async () => {
          const lancedb = await import("@lancedb/lancedb")
          await tbl.createIndex("contents", {
            config: lancedb.Index.fts(),
            replace: true
          })
        },
        catch: () => void 0
      }).pipe(Effect.ignore)

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
      const tbl = yield* getTable

      const deleted = changes.filter((c) => c.status === "D")
      const addedOrModified = changes.filter(
        (c) => c.status === "A" || c.status === "M"
      )

      // Delete removed files
      for (const change of deleted) {
        yield* Effect.tryPromise({
          try: () => tbl.delete(`id = '${repoId}:${change.path}'`),
          catch: () => void 0
        }).pipe(Effect.ignore)
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

        const exists = yield* fs.exists(fullPath).pipe(
          Effect.catchAll(() => Effect.succeed(false))
        )

        if (!exists) {
          skipped++
          continue
        }

        const bufferResult = yield* fs.readFile(fullPath).pipe(
          Effect.option,
          Effect.catchAll(() => Effect.succeed({ _tag: "None" as const }))
        )

        if (bufferResult._tag === "None") {
          skipped++
          continue
        }
        const buffer = bufferResult.value

        if (isBinary(buffer)) {
          skipped++
          continue
        }

        // Delete existing record
        yield* Effect.tryPromise({
          try: () => tbl.delete(`id = '${repoId}:${change.path}'`),
          catch: () => void 0
        }).pipe(Effect.ignore)

        // Insert new record
        const contents = new TextDecoder().decode(buffer).slice(0, MAX_FILE_SIZE)
        const vector = yield* embedText(contents)
        
        const stat = yield* fs.stat(fullPath).pipe(
          Effect.catchAll(() => Effect.succeed({ mtime: Option.none<Date>(), size: BigInt(0) }))
        )

        const mtimeMs = Option.match(stat.mtime as Option.Option<Date>, {
          onNone: () => Date.now(),
          onSome: (d) => d.getTime()
        })

        yield* Effect.tryPromise({
          try: () =>
            tbl.add([
              {
                id: `${repoId}:${change.path}`,
                repo: repoId,
                path: change.path,
                filename: change.path.split("/").pop() ?? change.path,
                contents,
                mtime_ms: Math.trunc(mtimeMs),
                size_bytes: Number(stat.size),
                hash: hashBuffer(buffer),
                vector
              }
            ]),
          catch: (e) => new IndexError({ operation: "indexChanges", message: `Failed to add: ${e}` })
        })

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
      const tbl = yield* getTable
      yield* Effect.tryPromise({
        try: () => tbl.delete(`repo = '${repoId}'`),
        catch: (e) => new IndexError({ operation: "removeIndex", message: `Failed to delete: ${e}` })
      })
    })

  // Keyword search (FTS only)
  const searchKeyword: IndexerService["searchKeyword"] = (query, options) =>
    Effect.gen(function* () {
      const tbl = yield* getTable.pipe(
        Effect.mapError((e) => new SearchError({ message: e.message }))
      )
      const limit = options?.limit ?? 20

      let search = tbl.query().fullTextSearch(query)

      if (options?.repo) {
        search = search.where(`repo = '${options.repo}'`)
      }

      const results = yield* Effect.tryPromise({
        try: () =>
          search
            .select(["repo", "path", "filename", "contents"])
            .limit(limit)
            .toArray(),
        catch: (e) => new SearchError({ message: `Keyword search failed: ${e}` })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (results as Array<any>).map((r) => ({
        repo: r.repo as string,
        path: r.path as string,
        filename: r.filename as string,
        score: (r._score ?? 1) as number,
        snippet: extractSnippet(r.contents as string, query)
      }))
    })

  // Semantic search (vector only)
  const searchSemantic: IndexerService["searchSemantic"] = (query, options) =>
    Effect.gen(function* () {
      const tbl = yield* getTable.pipe(
        Effect.mapError((e) => new SearchError({ message: e.message }))
      )
      const limit = options?.limit ?? 20
      const queryVector = yield* embedText(query).pipe(
        Effect.mapError((e) => new SearchError({ message: e.message }))
      )

      let search = tbl.search(queryVector).column("vector")

      if (options?.repo) {
        search = search.where(`repo = '${options.repo}'`)
      }

      const results = yield* Effect.tryPromise({
        try: () =>
          search
            .select(["repo", "path", "filename", "contents"])
            .limit(limit)
            .toArray(),
        catch: (e) => new SearchError({ message: `Semantic search failed: ${e}` })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (results as Array<any>).map((r) => ({
        repo: r.repo as string,
        path: r.path as string,
        filename: r.filename as string,
        score: 1 / (1 + ((r._distance ?? 0) as number)),
        snippet: extractSnippet(r.contents as string, query)
      }))
    })

  // Hybrid search (FTS + vector with RRF reranking)
  const searchHybrid: IndexerService["searchHybrid"] = (query, options) =>
    Effect.gen(function* () {
      const tbl = yield* getTable.pipe(
        Effect.mapError((e) => new SearchError({ message: e.message }))
      )
      const limit = options?.limit ?? 20
      const queryVector = yield* embedText(query).pipe(
        Effect.mapError((e) => new SearchError({ message: e.message }))
      )

      const lancedb = yield* Effect.tryPromise({
        try: () => import("@lancedb/lancedb"),
        catch: (e) => new SearchError({ message: `Failed to import lancedb: ${e}` })
      })

      const reranker = yield* Effect.tryPromise({
        try: () => lancedb.rerankers.RRFReranker.create(),
        catch: (e) => new SearchError({ message: `Failed to create reranker: ${e}` })
      })

      let search = tbl
        .query()
        .fullTextSearch(query)
        .nearestTo(queryVector)
        .rerank(reranker)

      if (options?.repo) {
        search = search.where(`repo = '${options.repo}'`)
      }

      const results = yield* Effect.tryPromise({
        try: () =>
          search
            .select(["repo", "path", "filename", "contents"])
            .limit(limit)
            .toArray(),
        catch: (e) => new SearchError({ message: `Hybrid search failed: ${e}` })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (results as Array<any>).map((r) => ({
        repo: r.repo as string,
        path: r.path as string,
        filename: r.filename as string,
        score: (r._relevanceScore ?? 1) as number,
        snippet: extractSnippet(r.contents as string, query)
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

/**
 * Indexer layer - requires FileSystem
 */
export const layer = Layer.effect(Indexer, make)
