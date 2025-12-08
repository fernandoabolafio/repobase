#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { NodeContext } from "@effect/platform-node"
import { Effect, Layer, Logger, LogLevel } from "effect"
import {
  RepobaseEngine,
  RepobaseEngineLayer,
  GitClientLayer,
  RepoStoreLayer,
  IndexerLayer,
  type RepoConfig,
  type SearchMode,
  type SearchResult,
} from "@repobase/engine"
import { App } from "./App.js"

// Suppress logging in TUI mode to avoid interfering with the terminal UI
const SilentLogger = Logger.minimumLogLevel(LogLevel.None)

// Layer composition - same as CLI but with silent logging
const EngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(GitClientLayer),
  Layer.provide(RepoStoreLayer),
  Layer.provide(IndexerLayer)
)

const MainLayer = EngineLive.pipe(
  Layer.provide(NodeContext.layer),
  Layer.provide(SilentLogger)
)

// Helper to run Effect programs
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, RepobaseEngine>
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(MainLayer))) as Promise<A>

// Engine service functions
const { addRepo, removeRepo, listRepos, syncRepo, syncAll, search } =
  Effect.serviceFunctions(RepobaseEngine)

// Main entry point
const main = async () => {
  // Create the renderer
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Load initial repos
  const initialRepos = await runEffect(listRepos())

  // Render the app
  createRoot(renderer).render(
    <App
      initialRepos={initialRepos}
      onAddRepo={async (url: string) => {
        return await runEffect(addRepo(url))
      }}
      onRemoveRepo={async (id: string) => {
        await runEffect(removeRepo(id))
      }}
      onSyncRepo={async (id: string) => {
        const result = await runEffect(syncRepo(id))
        return { updated: result.updated }
      }}
      onSyncAll={async () => {
        const results = await runEffect(syncAll())
        return results.map((r) => ({ id: r.id, updated: r.updated }))
      }}
      onRefreshRepos={async () => {
        return await runEffect(listRepos())
      }}
      onSearch={async (query: string, mode: SearchMode) => {
        return await runEffect(search(query, mode))
      }}
      onQuit={() => {
        process.exit(0)
      }}
    />
  )
}

main().catch((error) => {
  console.error("Failed to start TUI:", error)
  process.exit(1)
})
