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
  Indexer,
  trackingMode,
  pinnedMode,
  type RepoConfig,
  type FileInfo,
  type GrepResult
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

const {
  searchKeyword,
  searchSemantic,
  searchHybrid,
  listFiles,
  globFiles,
  readFile,
  grepPattern
} = Effect.serviceFunctions(Indexer)

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
// File Exploration Commands
// ============================================================================

// --- SEARCH COMMAND ---
const searchQueryArg = Args.text({ name: "query" }).pipe(
  Args.withDescription("Search query")
)

const searchRepoOption = Options.text("repo").pipe(
  Options.withAlias("r"),
  Options.withDescription("Filter to specific repository"),
  Options.optional
)

const searchLimitOption = Options.integer("limit").pipe(
  Options.withAlias("l"),
  Options.withDescription("Maximum results (default: 20)"),
  Options.withDefault(20)
)

const semanticOption = Options.boolean("semantic").pipe(
  Options.withAlias("s"),
  Options.withDescription("Use semantic search"),
  Options.withDefault(false)
)

const hybridOption = Options.boolean("hybrid").pipe(
  Options.withAlias("H"),
  Options.withDescription("Use hybrid search (FTS + semantic)"),
  Options.withDefault(false)
)

const searchCommand = Command.make(
  "search",
  {
    query: searchQueryArg,
    repo: searchRepoOption,
    limit: searchLimitOption,
    semantic: semanticOption,
    hybrid: hybridOption
  },
  ({ query, repo, limit, semantic, hybrid }) =>
    Effect.gen(function* () {
      const options = {
        repo: Option.getOrUndefined(repo),
        limit
      }

      // Determine search mode
      const results = yield* (hybrid
        ? searchHybrid(query, options)
        : semantic
          ? searchSemantic(query, options)
          : searchKeyword(query, options))

      if (results.length === 0) {
        yield* Console.log("No results found.")
        return
      }

      yield* Console.log(`Found ${results.length} result(s):\n`)
      for (const result of results) {
        yield* Console.log(`${result.repo}/${result.path}`)
        yield* Console.log(`  Score: ${result.score.toFixed(3)}`)
        if (result.snippet) {
          const snippet = result.snippet.replace(/\n/g, " ").slice(0, 100)
          yield* Console.log(`  ${snippet}...`)
        }
        yield* Console.log("")
      }
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Search across indexed repositories"))

// --- LS COMMAND ---
const lsPathArg = Args.text({ name: "path" }).pipe(
  Args.withDescription("Repository or path (e.g., 'repo' or 'repo/src')"),
  Args.optional
)

const formatFileInfo = (file: FileInfo): string => {
  const icon = file.isDirectory ? "📁" : "📄"
  const size = file.size ? ` ${formatSize(file.size)}` : ""
  return `${icon} ${file.filename}${size}`
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

const lsCommand = Command.make("ls", { path: lsPathArg }, ({ path }) =>
  Effect.gen(function* () {
    // Parse path into repo and subpath
    const pathStr = Option.getOrElse(path, () => "")
    const parts = pathStr.split("/")
    const repo = parts[0] || undefined
    const subPath = parts.slice(1).join("/") || undefined

    const files = yield* listFiles({ repo, path: subPath })

    if (files.length === 0) {
      yield* Console.log("No files found.")
      return
    }

    if (!repo) {
      yield* Console.log(`Repositories (${files.length}):\n`)
    } else {
      const displayPath = subPath ? `${repo}/${subPath}` : repo
      yield* Console.log(`${displayPath} (${files.length} items):\n`)
    }

    for (const file of files) {
      yield* Console.log(formatFileInfo(file))
    }
  }).pipe(
    Effect.catchAll((error) =>
      Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
    )
  )
).pipe(Command.withDescription("List files and directories"))

// --- GLOB COMMAND ---
const globPatternArg = Args.text({ name: "pattern" }).pipe(
  Args.withDescription("Glob pattern (e.g., '*.ts', '**/test/**')")
)

const globRepoOption = Options.text("repo").pipe(
  Options.withAlias("r"),
  Options.withDescription("Filter to specific repository"),
  Options.optional
)

const globLimitOption = Options.integer("limit").pipe(
  Options.withAlias("l"),
  Options.withDescription("Maximum results (default: 50)"),
  Options.withDefault(50)
)

const globCommand = Command.make(
  "glob",
  { pattern: globPatternArg, repo: globRepoOption, limit: globLimitOption },
  ({ pattern, repo, limit }) =>
    Effect.gen(function* () {
      const files = yield* globFiles(pattern, {
        repo: Option.getOrUndefined(repo),
        limit
      })

      if (files.length === 0) {
        yield* Console.log("No files matched.")
        return
      }

      yield* Console.log(`Found ${files.length} file(s):\n`)
      for (const file of files) {
        yield* Console.log(`${file.repo}/${file.path}`)
      }
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Find files matching a glob pattern"))

// --- READ COMMAND ---
const readPathArg = Args.text({ name: "path" }).pipe(
  Args.withDescription("File path (e.g., 'repo/src/main.ts')")
)

const readOffsetOption = Options.integer("offset").pipe(
  Options.withAlias("o"),
  Options.withDescription("Start line (1-based)"),
  Options.withDefault(1)
)

const readLimitOption = Options.integer("lines").pipe(
  Options.withAlias("L"),
  Options.withDescription("Number of lines to read"),
  Options.optional
)

const noLineNumbersOption = Options.boolean("no-line-numbers").pipe(
  Options.withAlias("n"),
  Options.withDescription("Omit line numbers"),
  Options.withDefault(false)
)

const readCommand = Command.make(
  "read",
  {
    path: readPathArg,
    offset: readOffsetOption,
    lines: readLimitOption,
    noLineNumbers: noLineNumbersOption
  },
  ({ path, offset, lines, noLineNumbers }) =>
    Effect.gen(function* () {
      // Parse path into repo and file path
      const parts = path.split("/")
      if (parts.length < 2) {
        yield* Console.error("Path must be in format: repo/path/to/file")
        return
      }
      const repo = parts[0]
      const filePath = parts.slice(1).join("/")

      const result = yield* readFile(repo, filePath, {
        offset,
        limit: Option.getOrUndefined(lines),
        lineNumbers: !noLineNumbers
      })

      yield* Console.log(
        `File: ${result.repo}/${result.path} (lines ${result.startLine}-${result.endLine} of ${result.totalLines})\n`
      )
      yield* Console.log(result.content)
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Read file contents"))

// --- GREP COMMAND ---
const grepPatternArg = Args.text({ name: "pattern" }).pipe(
  Args.withDescription("Regular expression pattern")
)

const grepRepoOption = Options.text("repo").pipe(
  Options.withAlias("r"),
  Options.withDescription("Filter to specific repository"),
  Options.optional
)

const grepIgnoreCaseOption = Options.boolean("ignore-case").pipe(
  Options.withAlias("i"),
  Options.withDescription("Case insensitive search"),
  Options.withDefault(false)
)

const grepContextBeforeOption = Options.integer("before").pipe(
  Options.withAlias("B"),
  Options.withDescription("Lines before match"),
  Options.withDefault(0)
)

const grepContextAfterOption = Options.integer("after").pipe(
  Options.withAlias("A"),
  Options.withDescription("Lines after match"),
  Options.withDefault(0)
)

const grepContextOption = Options.integer("context").pipe(
  Options.withAlias("C"),
  Options.withDescription("Lines before and after match"),
  Options.optional
)

const grepFilesOnlyOption = Options.boolean("files-with-matches").pipe(
  Options.withAlias("l"),
  Options.withDescription("Only show filenames"),
  Options.withDefault(false)
)

const grepCountOption = Options.boolean("count").pipe(
  Options.withAlias("c"),
  Options.withDescription("Only show match counts"),
  Options.withDefault(false)
)

const grepTypeOption = Options.text("type").pipe(
  Options.withAlias("t"),
  Options.withDescription("Filter by file extension (e.g., 'ts')"),
  Options.optional
)

const grepLimitOption = Options.integer("limit").pipe(
  Options.withDescription("Limit output lines (default: 100)"),
  Options.withDefault(100)
)

const formatGrepResult = (result: GrepResult): string[] => {
  const lines: string[] = []
  lines.push(`\n${result.repo}/${result.path} (${result.matchCount} matches)`)

  for (const match of result.matches) {
    const prefix = match.isMatch ? ":" : "-"
    lines.push(`${String(match.lineNumber).padStart(4)}${prefix} ${match.content}`)
  }

  return lines
}

const grepCommand = Command.make(
  "grep",
  {
    pattern: grepPatternArg,
    repo: grepRepoOption,
    ignoreCase: grepIgnoreCaseOption,
    before: grepContextBeforeOption,
    after: grepContextAfterOption,
    context: grepContextOption,
    filesOnly: grepFilesOnlyOption,
    count: grepCountOption,
    type: grepTypeOption,
    limit: grepLimitOption
  },
  ({
    pattern,
    repo,
    ignoreCase,
    before,
    after,
    context,
    filesOnly,
    count,
    type,
    limit
  }) =>
    Effect.gen(function* () {
      // If -C is provided, use it for both before and after
      const contextVal = Option.getOrUndefined(context)
      const contextBefore = contextVal ?? before
      const contextAfter = contextVal ?? after

      const results = yield* grepPattern(pattern, {
        repo: Option.getOrUndefined(repo),
        ignoreCase,
        contextBefore,
        contextAfter,
        filesWithMatches: filesOnly,
        count,
        fileType: Option.getOrUndefined(type),
        limit
      })

      if (results.length === 0) {
        yield* Console.log("No matches found.")
        return
      }

      const totalMatches = results.reduce((sum, r) => sum + r.matchCount, 0)
      yield* Console.log(
        `Found ${totalMatches} match(es) in ${results.length} file(s):`
      )

      for (const result of results) {
        if (filesOnly || count) {
          yield* Console.log(`${result.repo}/${result.path}: ${result.matchCount}`)
        } else {
          const lines = formatGrepResult(result)
          for (const line of lines) {
            yield* Console.log(line)
          }
        }
      }
    }).pipe(
      Effect.catchAll((error) =>
        Console.error(`Error: ${error._tag} - ${JSON.stringify(error)}`)
      )
    )
).pipe(Command.withDescription("Search for regex pattern in file contents"))

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
    cloudCommand,
    searchCommand,
    lsCommand,
    globCommand,
    readCommand,
    grepCommand
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
const EngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(GitClientLayer),
  Layer.provide(RepoStoreLayer),
  Layer.provide(IndexerLayer)
)

const CloudSyncLive = CloudSyncLayer.pipe(Layer.provide(RepoStoreLayer))

// All application layers merged together
const AppLayer = Layer.mergeAll(EngineLive, CloudSyncLive, IndexerLayer)

// Run the CLI - provide AppLayer then NodeContext (platform layer)
cli(process.argv).pipe(
  Effect.provide(AppLayer),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain
)
