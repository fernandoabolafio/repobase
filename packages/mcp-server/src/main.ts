#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { Effect, Layer, ManagedRuntime } from "effect"
import { BunContext } from "@effect/platform-bun"
import { 
  RepobaseEngine, 
  RepobaseEngineLayer,
  GitClientLayer,
  RepoStoreLayer,
  IndexerLayer,
  Indexer,
  type SearchMode 
} from "@repobase/engine"

// Layer composition - same pattern as TUI
const EngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(GitClientLayer),
  Layer.provide(RepoStoreLayer),
  Layer.provide(IndexerLayer)
)

const MainLayer = Layer.mergeAll(
  EngineLive,
  IndexerLayer
).pipe(
  Layer.provide(BunContext.layer)
)

// Create a managed runtime with the engine layer
const runtime = ManagedRuntime.make(MainLayer)

// Create MCP server
const server = new McpServer({
  name: "repobase-mcp",
  version: "0.1.0"
})

// Register list_repos tool
server.registerTool(
  "list_repos",
  {
    description: "List all indexed repositories in repobase",
  },
  async () => {
    const program = Effect.gen(function* () {
      const engine = yield* RepobaseEngine
      const repos = yield* engine.listRepos()
      
      return repos.map((repo) => ({
        id: repo.id,
        url: repo.url,
        localPath: repo.localPath,
        lastSyncedAt: repo.lastSyncedAt._tag === "Some" 
          ? repo.lastSyncedAt.value.toISOString() 
          : null,
        addedAt: repo.addedAt.toISOString()
      }))
    })

    const result = await runtime.runPromise(program)
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }
)

// Register search tool
server.registerTool(
  "search",
  {
    description: "Search across all indexed repositories using keyword, semantic, or hybrid search",
    inputSchema: {
      query: z.string().describe("The search query"),
      mode: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid").describe("Search mode: keyword (fast text search), semantic (meaning-based), or hybrid (combines both)"),
      limit: z.number().optional().default(20).describe("Maximum number of results to return"),
      repo: z.string().optional().describe("Optional: limit search to a specific repository ID")
    }
  },
  async ({ query, mode, limit, repo }) => {
    const program = Effect.gen(function* () {
      const engine = yield* RepobaseEngine
      const results = yield* engine.search(query, mode as SearchMode, { 
        limit: limit ?? 20,
        repo 
      })
      
      return results.map((result) => ({
        repo: result.repo,
        path: result.path,
        filename: result.filename,
        score: result.score,
        snippet: result.snippet
      }))
    })

    const results = await runtime.runPromise(program)
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results, null, 2)
        }
      ]
    }
  }
)

// Register list_files tool
server.registerTool(
  "list_files",
  {
    description: "List files and directories in a repository or directory",
    inputSchema: {
      repo: z.string().optional().describe("Repository ID to list files from (omit to list all repos)"),
      path: z.string().optional().describe("Directory path within the repository (e.g., 'src' or 'src/components')")
    }
  },
  async ({ repo, path }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer
      const files = yield* indexer.listFiles({ repo, path })
      
      return files.map((file) => ({
        repo: file.repo,
        path: file.path,
        filename: file.filename,
        isDirectory: file.isDirectory,
        size: file.size ?? null,
        mtime: file.mtime?.toISOString() ?? null
      }))
    })

    const result = await runtime.runPromise(program)
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }
)

// Register glob_files tool
server.registerTool(
  "glob_files",
  {
    description: "Find files matching a glob pattern across repositories",
    inputSchema: {
      pattern: z.string().describe("Glob pattern (e.g., '*.ts', '**/test/**', 'src/**/*.tsx')"),
      repo: z.string().optional().describe("Optional: limit search to a specific repository ID"),
      limit: z.number().optional().default(50).describe("Maximum number of results to return")
    }
  },
  async ({ pattern, repo, limit }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer
      const files = yield* indexer.globFiles(pattern, {
        repo,
        limit: limit ?? 50
      })
      
      return files.map((file) => ({
        repo: file.repo,
        path: file.path,
        filename: file.filename,
        isDirectory: file.isDirectory,
        size: file.size ?? null,
        mtime: file.mtime?.toISOString() ?? null
      }))
    })

    const result = await runtime.runPromise(program)
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }
)

// Register read_file tool
server.registerTool(
  "read_file",
  {
    description: "Read file contents from a repository",
    inputSchema: {
      repo: z.string().describe("Repository ID"),
      path: z.string().describe("File path within the repository (e.g., 'src/main.ts')"),
      offset: z.number().optional().default(1).describe("Start line number (1-based, default: 1)"),
      limit: z.number().optional().describe("Number of lines to read (omit to read entire file)"),
      lineNumbers: z.boolean().optional().default(true).describe("Include line numbers in output")
    }
  },
  async ({ repo, path, offset, limit, lineNumbers }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer
      const content = yield* indexer.readFile(repo, path, {
        offset: offset ?? 1,
        limit,
        lineNumbers: lineNumbers ?? true
      })
      
      return {
        repo: content.repo,
        path: content.path,
        content: content.content,
        totalLines: content.totalLines,
        startLine: content.startLine,
        endLine: content.endLine
      }
    })

    const result = await runtime.runPromise(program)
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }
)

// Register grep tool
server.registerTool(
  "grep",
  {
    description: "Search for a regex pattern in file contents across repositories",
    inputSchema: {
      pattern: z.string().describe("Regular expression pattern to search for"),
      repo: z.string().optional().describe("Optional: limit search to a specific repository ID"),
      ignoreCase: z.boolean().optional().default(false).describe("Case insensitive search"),
      contextBefore: z.number().optional().default(0).describe("Number of lines to show before each match"),
      contextAfter: z.number().optional().default(0).describe("Number of lines to show after each match"),
      context: z.number().optional().describe("Number of lines to show before and after each match (overrides contextBefore and contextAfter)"),
      filesWithMatches: z.boolean().optional().default(false).describe("Only return filenames that contain matches"),
      count: z.boolean().optional().default(false).describe("Only return match counts per file"),
      fileType: z.string().optional().describe("Filter by file extension (e.g., 'ts' for TypeScript files)"),
      limit: z.number().optional().default(100).describe("Maximum number of output lines")
    }
  },
  async ({ 
    pattern, 
    repo, 
    ignoreCase, 
    contextBefore, 
    contextAfter, 
    context,
    filesWithMatches,
    count,
    fileType,
    limit 
  }) => {
    const program = Effect.gen(function* () {
      const indexer = yield* Indexer
      
      // If context is provided, use it for both before and after
      const contextVal = context ?? undefined
      const before = contextVal ?? (contextBefore ?? 0)
      const after = contextVal ?? (contextAfter ?? 0)
      
      const results = yield* indexer.grepPattern(pattern, {
        repo,
        ignoreCase: ignoreCase ?? false,
        contextBefore: before,
        contextAfter: after,
        filesWithMatches: filesWithMatches ?? false,
        count: count ?? false,
        fileType,
        limit: limit ?? 100
      })
      
      return results.map((result) => ({
        repo: result.repo,
        path: result.path,
        matchCount: result.matchCount,
        matches: result.matches.map((match) => ({
          lineNumber: match.lineNumber,
          content: match.content,
          isMatch: match.isMatch
        }))
      }))
    })

    const result = await runtime.runPromise(program)
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }
)

// Connect to stdio transport
const transport = new StdioServerTransport()
await server.connect(transport)

// Handle graceful shutdown
const shutdown = async () => {
  await server.close()
  await runtime.dispose()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
