#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { Effect, Layer, ManagedRuntime } from "effect"
import { NodeContext } from "@effect/platform-node"
import { 
  RepobaseEngine, 
  RepobaseEngineLayer,
  GitClientLayer,
  RepoStoreLayer,
  IndexerLayer,
  type SearchMode 
} from "@repobase/engine"

// Layer composition - same pattern as TUI
const EngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(GitClientLayer),
  Layer.provide(RepoStoreLayer),
  Layer.provide(IndexerLayer)
)

const MainLayer = EngineLive.pipe(
  Layer.provide(NodeContext.layer)
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
