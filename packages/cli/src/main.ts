#!/usr/bin/env bun
import { Args, Command, Options, Prompt } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer, Option } from "effect"
import {
  RepobaseEngine,
  RepobaseEngineLayer,
  GitClientLayer,
  RepoStoreLayer,
  IndexerLayer,
  CloudSync,
  CloudSyncLayer,
  trackingMode,
  pinnedMode,
  type RepoConfig
} from "@repobase/engine"

// ============================================================================
// Helper to access RepobaseEngine service functions
// ============================================================================
const { addRepo, removeRepo, listRepos, syncRepo, syncAll } =
  Effect.serviceFunctions(RepobaseEngine)

const {
  configure: configureCloud,
  getConfig: getCloudConfig,
  clearConfig: clearCloudConfig,
  isConfigured: isCloudConfigured,
  enableRepo: enableCloudRepo,
  disableRepo: disableCloudRepo,
  push: pushToCloud,
  pushAll: pushAllToCloud,
  getStatus: getCloudStatus,
  listCloudEnabled
} = Effect.serviceFunctions(CloudSync)

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
  const cloudStatus = repo.cloudEnabled ? "☁️ enabled" : "local only"
  const lastPush = repo.lastPushedAt
    ? Option.match(repo.lastPushedAt, {
        onNone: () => "never",
        onSome: formatDate
      })
    : "never"
  return `  ${repo.id}
    URL: ${repo.url}
    Mode: ${mode}
    Last sync: ${lastSync}
    Commit: ${commit}
    Cloud: ${cloudStatus}${repo.cloudEnabled ? ` (last push: ${lastPush})` : ""}`
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
// Cloud Commands
// ============================================================================

// --- CLOUD LOGIN COMMAND ---
const endpointOption = Options.text("endpoint").pipe(
  Options.withAlias("e"),
  Options.withDescription("Cloud API endpoint"),
  Options.withDefault("https://repobase-api.workers.dev")
)

const userIdOption = Options.text("user").pipe(
  Options.withAlias("u"),
  Options.withDescription("User ID")
)

const apiKeyOption = Options.text("key").pipe(
  Options.withAlias("k"),
  Options.withDescription("API key")
)

const cloudLoginCommand = Command.make(
  "login",
  { endpoint: endpointOption, userId: userIdOption, apiKey: apiKeyOption },
  ({ endpoint, userId, apiKey }) =>
    Effect.gen(function* () {
      yield* configureCloud({ userId, apiKey, endpoint })
      yield* Console.log(`✓ Cloud sync configured`)
      yield* Console.log(`  User: ${userId}`)
      yield* Console.log(`  Endpoint: ${endpoint}`)
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Configure cloud sync credentials"))

// --- CLOUD LOGOUT COMMAND ---
const cloudLogoutCommand = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    yield* clearCloudConfig()
    yield* Console.log(`✓ Cloud sync configuration cleared`)
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("Clear cloud sync configuration"))

// --- CLOUD STATUS COMMAND ---
const cloudStatusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const configured = yield* isCloudConfigured()
    
    if (!configured) {
      yield* Console.log("Cloud sync is not configured.")
      yield* Console.log("Run 'repobase cloud login' to configure.")
      return
    }

    const config = yield* getCloudConfig()
    yield* Console.log(`Cloud sync configured:`)
    yield* Console.log(`  User: ${config.userId}`)
    yield* Console.log(`  Endpoint: ${config.endpoint}`)
    yield* Console.log("")

    const enabledRepos = yield* listCloudEnabled()
    if (enabledRepos.length === 0) {
      yield* Console.log("No repos have cloud sync enabled.")
      yield* Console.log("Use 'repobase cloud enable <repo-id>' to enable.")
    } else {
      yield* Console.log(`Cloud-enabled repos (${enabledRepos.length}):`)
      for (const repo of enabledRepos) {
        const status = yield* getCloudStatus(repo.id)
        const syncIcon = status.inSync ? "✓" : "⏳"
        yield* Console.log(`  ${syncIcon} ${repo.id}`)
      }
    }
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("Show cloud sync status"))

// --- CLOUD ENABLE COMMAND ---
const cloudEnableIdArg = Args.text({ name: "id" }).pipe(
  Args.withDescription("Repository ID to enable cloud sync for")
)

const cloudEnableCommand = Command.make(
  "enable",
  { id: cloudEnableIdArg },
  ({ id }) =>
    Effect.gen(function* () {
      yield* enableCloudRepo(id)
      yield* Console.log(`✓ Cloud sync enabled for: ${id}`)
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Enable cloud sync for a repository"))

// --- CLOUD DISABLE COMMAND ---
const cloudDisableIdArg = Args.text({ name: "id" }).pipe(
  Args.withDescription("Repository ID to disable cloud sync for")
)

const cloudDisableCommand = Command.make(
  "disable",
  { id: cloudDisableIdArg },
  ({ id }) =>
    Effect.gen(function* () {
      yield* disableCloudRepo(id)
      yield* Console.log(`✓ Cloud sync disabled for: ${id}`)
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Disable cloud sync for a repository"))

// --- CLOUD PUSH COMMAND ---
const cloudPushIdArg = Args.text({ name: "id" }).pipe(
  Args.withDescription("Repository ID to push (omit for all enabled repos)"),
  Args.optional
)

const cloudPushCommand = Command.make(
  "push",
  { id: cloudPushIdArg },
  ({ id }) =>
    Effect.gen(function* () {
      const results = yield* Option.match(id, {
        onSome: (repoId) => pushToCloud(repoId).pipe(Effect.map((r) => [r])),
        onNone: () => pushAllToCloud()
      })

      if (results.length === 0) {
        yield* Console.log("No repos to push.")
        yield* Console.log("Enable cloud sync for repos with 'repobase cloud enable <id>'")
        return
      }

      for (const result of results) {
        yield* Console.log(
          `✓ ${result.repoId}: pushed ${result.filesUploaded} files (${result.durationMs}ms)`
        )
      }
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Push repos to cloud"))

// --- CLOUD PULL COMMAND ---
const cloudPullCommand = Command.make("pull", {}, () =>
  Effect.gen(function* () {
    const result = yield* Effect.serviceFunctionEffect(CloudSync, (s) => s.pull)()
    yield* Console.log(
      `✓ Pulled ${result.filesDownloaded} files (${result.durationMs}ms)`
    )
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("Pull index from cloud (for new device setup)"))

// --- CLOUD PARENT COMMAND ---
const cloudCommand = Command.make("cloud").pipe(
  Command.withDescription("Manage cloud sync"),
  Command.withSubcommands([
    cloudLoginCommand,
    cloudLogoutCommand,
    cloudStatusCommand,
    cloudEnableCommand,
    cloudDisableCommand,
    cloudPushCommand,
    cloudPullCommand
  ])
)

// ============================================================================
// Root Command
// ============================================================================
const rootCommand = Command.make("repobase").pipe(
  Command.withDescription("Manage local GitHub repository cache"),
  Command.withSubcommands([
    addCommand,
    listCommand,
    syncCommand,
    removeCommand,
    cloudCommand
  ])
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

const CloudSyncLive = CloudSyncLayer.pipe(Layer.provide(RepoStoreLayer))

const MainLayer = Layer.mergeAll(EngineLive, CloudSyncLive).pipe(
  Layer.provide(NodeContext.layer)
)

// Run the CLI
Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(MainLayer),
  Effect.tapErrorCause(Effect.logError),
  NodeRuntime.runMain
)
