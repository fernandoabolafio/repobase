#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { BunContext } from "@effect/platform-bun"
import { Effect, Layer, SubscriptionRef, Stream, Fiber } from "effect"
import {
  RepobaseEngine,
  RepobaseEngineLayer,
  GitClientLayer,
  RepoStoreLayer,
  IndexerLayer,
  initialProgress,
  type RepoConfig,
  type SearchMode,
  type SearchResult,
  type AddRepoProgress,
} from "@repobase/engine"
import { App } from "./App.js"
import { fileLoggerLayer, defaultLogPath } from "./file-logger.js"
import { featureFlags } from "./config.js"

// File logger for debugging - writes to ~/.repobase/tui.log
const FileLogger = fileLoggerLayer()

// Layer composition with file-based logging
const EngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(GitClientLayer),
  Layer.provide(RepoStoreLayer),
  Layer.provide(IndexerLayer)
)

const MainLayer = EngineLive.pipe(
  Layer.provide(BunContext.layer),
  Layer.provide(FileLogger)
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
  // Log startup to file
  await runEffect(Effect.log(`TUI starting - logs written to ${defaultLogPath}`))
  
  // Create the renderer - disable exitOnCtrlC so we can handle cleanup properly
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  })
  
  // Handle Ctrl+C (SIGINT) manually for clean shutdown
  process.on('SIGINT', () => {
    renderer.destroy()
    process.exit(0)
  })

  // Load initial repos
  const initialRepos = await runEffect(listRepos())
  
  // Cloud config is only checked when the feature is enabled
  const cloudConfigured = featureFlags.cloudSync ? false : false

  // Render the app
  createRoot(renderer).render(
    <App
      initialRepos={initialRepos}
      onAddRepo={async (url: string, onProgress: (p: AddRepoProgress) => void) => {
        // Create the effect that sets up progress tracking
        const addWithProgress = Effect.gen(function* () {
          // Create a SubscriptionRef for progress updates
          const progressRef = yield* SubscriptionRef.make<AddRepoProgress>(initialProgress)
          
          // Fork a fiber to listen for progress updates and call the callback
          const listenerFiber = yield* Stream.runForEach(
            progressRef.changes,
            (progress) => Effect.sync(() => onProgress(progress))
          ).pipe(Effect.fork)
          
          // Run addRepo with the progress ref
          const result = yield* addRepo(url, { progressRef })
          
          // Clean up the listener fiber
          yield* Fiber.interrupt(listenerFiber)
          
          return result
        })
        
        return await runEffect(addWithProgress)
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
        renderer.destroy()
        process.exit(0)
      }}
      cloudConfigured={cloudConfigured}
    />
  )
}

main().catch((error) => {
  console.error("Failed to start TUI:", error)
  process.exit(1)
})
