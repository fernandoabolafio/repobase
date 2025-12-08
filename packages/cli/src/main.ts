#!/usr/bin/env bun
import { Args, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer, Option } from "effect"
import {
  RepobaseEngine,
  RepobaseEngineLayer,
  GitClientLayer,
  RepoStoreLayer,
  IndexerLayer,
  trackingMode,
  pinnedMode,
  type RepoConfig
} from "@repobase/engine"

// ============================================================================
// Helper to access RepobaseEngine service functions
// ============================================================================
const { addRepo, removeRepo, listRepos, syncRepo, syncAll } =
  Effect.serviceFunctions(RepobaseEngine)

// ============================================================================
// Formatters
// ============================================================================
const formatDate = (date: Date): string =>
  date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })

const formatRepo = (repo: RepoConfig): string => {
  const mode =
    repo.mode._tag === "tracking"
      ? `tracking: ${repo.mode.branch}`
      : `pinned: ${repo.mode.ref}`
  const lastSync = Option.match(repo.lastSyncedAt, {
    onNone: () => "never",
    onSome: formatDate
  })
  const commit = Option.match(repo.lastSyncedCommit, {
    onNone: () => "none",
    onSome: (c) => c.slice(0, 8)
  })
  return `  ${repo.id}
    URL: ${repo.url}
    Mode: ${mode}
    Last sync: ${lastSync}
    Commit: ${commit}`
}

// ============================================================================
// Commands
// ============================================================================

// --- ADD COMMAND ---
const urlArg = Args.text({ name: "url" }).pipe(
  Args.withDescription("GitHub repository URL")
)

const branchOption = Options.text("branch").pipe(
  Options.withAlias("b"),
  Options.withDescription("Branch to track (default: main)"),
  Options.optional
)

const pinOption = Options.text("pin").pipe(
  Options.withAlias("p"),
  Options.withDescription("Pin to specific tag or commit SHA"),
  Options.optional
)

const addCommand = Command.make(
  "add",
  { url: urlArg, branch: branchOption, pin: pinOption },
  ({ url, branch, pin }) =>
    Effect.gen(function* () {
      // Determine mode from options
      const mode = Option.match(pin, {
        onSome: (ref) => pinnedMode(ref),
        onNone: () => trackingMode(Option.getOrElse(branch, () => "main"))
      })

      const repo = yield* addRepo(url, { mode })
      yield* Console.log(`✓ Added repository: ${repo.id}`)
      yield* Console.log(`  Path: ${repo.localPath}`)
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Add a GitHub repository"))

// --- LIST COMMAND ---
const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const repos = yield* listRepos()
    if (repos.length === 0) {
      yield* Console.log("No repositories configured.")
      yield* Console.log("Use 'repobase add <url>' to add one.")
      return
    }
    yield* Console.log(`Repositories (${repos.length}):\n`)
    for (const repo of repos) {
      yield* Console.log(formatRepo(repo))
      yield* Console.log("")
    }
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("List all repositories"))

// --- SYNC COMMAND ---
const repoIdArg = Args.text({ name: "id" }).pipe(
  Args.withDescription("Repository ID to sync"),
  Args.optional
)

const syncCommand = Command.make("sync", { id: repoIdArg }, ({ id }) =>
  Effect.gen(function* () {
    const results = yield* Option.match(id, {
      onSome: (repoId) => syncRepo(repoId).pipe(Effect.map((r) => [r])),
      onNone: () => syncAll()
    })

    if (results.length === 0) {
      yield* Console.log("No repositories to sync.")
      return
    }

    for (const result of results) {
      if (result.updated) {
        yield* Console.log(
          `✓ ${result.id}: updated to ${result.currentCommit.slice(0, 8)}`
        )
      } else {
        yield* Console.log(`  ${result.id}: already up to date`)
      }
    }
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("Sync repositories (all if no ID specified)"))

// --- REMOVE COMMAND ---
const removeIdArg = Args.text({ name: "id" }).pipe(
  Args.withDescription("Repository ID to remove")
)

const removeCommand = Command.make("remove", { id: removeIdArg }, ({ id }) =>
  Effect.gen(function* () {
    yield* removeRepo(id)
    yield* Console.log(`✓ Removed repository: ${id}`)
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("Remove a repository"))

// ============================================================================
// Root Command
// ============================================================================
const rootCommand = Command.make("repobase").pipe(
  Command.withDescription("Manage local GitHub repository cache"),
  Command.withSubcommands([addCommand, listCommand, syncCommand, removeCommand])
)

// ============================================================================
// CLI Setup and Run
// ============================================================================
const cli = Command.run(rootCommand, {
  name: "repobase",
  version: "0.1.0"
})

// Layer composition
// NodeContext.layer provides FileSystem, CommandExecutor, Terminal, etc.
// We compose the engine layers on top of it
const EngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(GitClientLayer),
  Layer.provide(RepoStoreLayer),
  Layer.provide(IndexerLayer)
)

const MainLayer = EngineLive.pipe(Layer.provide(NodeContext.layer))

// Run the CLI
Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(MainLayer),
  Effect.tapErrorCause(Effect.logError),
  NodeRuntime.runMain
)
