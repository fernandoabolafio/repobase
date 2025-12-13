import { FileSystem } from "@effect/platform"
import { Context, Effect, Fiber, Layer, Option, Stream, SubscriptionRef } from "effect"
import {
  GitError,
  IndexError,
  RepoAlreadyExistsError,
  RepoNotFoundError,
  SearchError,
  StoreError
} from "../errors.js"
import {
  deriveRepoId,
  RepoConfig,
  RepoMode,
  trackingMode
} from "../schemas.js"
import { GitClient } from "./GitClient.js"
import { RepoStore } from "./RepoStore.js"
import {
  Indexer,
  type IndexSummary,
  type IndexingProgress,
  type SearchMode,
  type SearchOptions,
  type SearchResult,
  initialIndexingProgress
} from "./Indexer.js"
import * as os from "os"

/**
 * Progress state for adding a repository
 */
export type AddRepoStage = "cloning" | "indexing" | "complete" | "error"

export interface AddRepoProgress {
  readonly stage: AddRepoStage
  readonly progress: number // 0-100
  readonly message: string
  readonly filesIndexed?: number
  readonly totalFiles?: number
  readonly currentFile?: string
}

/**
 * Initial progress state
 */
export const initialProgress: AddRepoProgress = {
  stage: "cloning",
  progress: 0,
  message: "Starting..."
}

/**
 * Calculate overall progress from indexing progress (50-95% range)
 */
const calcIndexingProgress = (indexing: IndexingProgress): number => {
  if (indexing.totalFiles === 0) return 50
  const pct = (indexing.filesProcessed / indexing.totalFiles) * 45 // 45% range for indexing
  return Math.min(95, 50 + pct)
}

/**
 * Options for adding a repository
 */
export interface AddRepoOptions {
  readonly mode?: RepoMode
  readonly progressRef?: SubscriptionRef.SubscriptionRef<AddRepoProgress>
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  readonly id: string
  readonly updated: boolean
  readonly previousCommit: Option.Option<string>
  readonly currentCommit: string
  readonly indexSummary?: IndexSummary
}

/**
 * All possible engine errors
 */
export type EngineError =
  | GitError
  | StoreError
  | IndexError
  | SearchError
  | RepoNotFoundError
  | RepoAlreadyExistsError

/**
 * RepobaseEngine service interface
 */
export interface RepobaseEngineService {
  readonly addRepo: (
    url: string,
    options?: AddRepoOptions
  ) => Effect.Effect<RepoConfig, EngineError>
  readonly removeRepo: (id: string) => Effect.Effect<void, EngineError>
  readonly listRepos: () => Effect.Effect<Array<RepoConfig>, EngineError>
  readonly getRepo: (
    id: string
  ) => Effect.Effect<Option.Option<RepoConfig>, EngineError>
  readonly syncRepo: (id: string) => Effect.Effect<SyncResult, EngineError>
  readonly syncAll: () => Effect.Effect<Array<SyncResult>, EngineError>
  readonly search: (
    query: string,
    mode: SearchMode,
    options?: SearchOptions
  ) => Effect.Effect<SearchResult[], EngineError>
}

/**
 * RepobaseEngine service tag
 */
export class RepobaseEngine extends Context.Tag(
  "@repobase/engine/RepobaseEngine"
)<RepobaseEngine, RepobaseEngineService>() {}

/**
 * Get the repos directory path
 */
const getReposDir = () => `${os.homedir()}/.repobase/repos`

/**
 * Create the RepobaseEngine service implementation
 */
export const make = Effect.gen(function* () {
  const git = yield* GitClient
  const store = yield* RepoStore
  const indexer = yield* Indexer
  const fs = yield* FileSystem.FileSystem

  const reposDir = getReposDir()

  const addRepo: RepobaseEngineService["addRepo"] = (url, options) =>
    Effect.gen(function* () {
      const progressRef = options?.progressRef
      
      // Helper to update progress
      const updateProgress = (update: Partial<AddRepoProgress>) =>
        progressRef
          ? SubscriptionRef.update(progressRef, (prev) => ({ ...prev, ...update }))
          : Effect.void

      const id = deriveRepoId(url)
      const localPath = `${reposDir}/${id}`

      // Check if already exists
      const existing = yield* store.getRepo(id)
      if (Option.isSome(existing)) {
        yield* updateProgress({ stage: "error", message: `Repository ${id} already exists` })
        return yield* Effect.fail(new RepoAlreadyExistsError({ id }))
      }

      // Ensure repos directory exists
      yield* fs.makeDirectory(reposDir, { recursive: true }).pipe(
        Effect.mapError(
          (e) => new StoreError({ operation: "makeDirectory", message: e.message })
        )
      )

      // Clone the repository
      yield* updateProgress({ 
        stage: "cloning", 
        progress: 10, 
        message: `Cloning ${url}...` 
      })
      yield* Effect.log(`Cloning ${url}...`)
      yield* git.clone(url, localPath)

      yield* updateProgress({ 
        stage: "cloning", 
        progress: 40, 
        message: "Clone complete, preparing..." 
      })

      // Get current commit
      const currentCommit = yield* git.getCurrentCommit(localPath)

      // Build config
      const mode = options?.mode ?? trackingMode("main")
      const repo: RepoConfig = {
        id,
        url,
        localPath,
        mode,
        lastSyncedCommit: Option.some(currentCommit),
        lastSyncedAt: Option.some(new Date()),
        addedAt: new Date(),
        // Cloud sync fields - disabled by default
        cloudEnabled: false,
        lastPushedAt: Option.none(),
        lastPushedCommit: Option.none()
      }

      // Save config
      yield* store.addRepo(repo)

      yield* updateProgress({ 
        stage: "indexing", 
        progress: 50, 
        message: `Indexing ${id}...`,
        filesIndexed: 0,
        totalFiles: 0
      })

      // Create indexing progress ref for granular updates
      const indexingProgressRef = yield* SubscriptionRef.make<IndexingProgress>(initialIndexingProgress)

      // Subscribe to indexing progress changes and forward them
      const forwarderFiber = yield* Effect.fork(
        Stream.runForEach(indexingProgressRef.changes, (indexingState) => 
          Effect.gen(function* () {
            if (!progressRef) return
            
            const overallProgress = calcIndexingProgress(indexingState)
            const phaseMessage = indexingState.phase === "scanning" 
              ? "Scanning files..."
              : indexingState.phase === "finalizing"
                ? "Finalizing index..."
                : `Indexing: ${indexingState.currentFile ?? "..."}`
            
            yield* SubscriptionRef.update(progressRef, (prev) => ({
              ...prev,
              progress: overallProgress,
              message: phaseMessage,
              filesIndexed: indexingState.filesProcessed,
              totalFiles: indexingState.totalFiles,
              currentFile: indexingState.currentFile
            }))
          })
        ).pipe(Effect.catchAll(() => Effect.void))
      )

      // Index the repository with progress tracking
      yield* Effect.log(`Indexing ${id}...`)
      const indexResult = yield* indexer.indexRepo(id, localPath, { progressRef: indexingProgressRef })
      yield* Effect.log(
        `Indexed ${indexResult.filesIndexed} files in ${indexResult.durationMs}ms`
      )

      // Clean up forwarder
      yield* Fiber.interrupt(forwarderFiber)

      yield* updateProgress({ 
        stage: "complete", 
        progress: 100, 
        message: `Added ${id}`,
        filesIndexed: indexResult.filesIndexed,
        totalFiles: indexResult.filesIndexed
      })

      yield* Effect.log(`Added repository: ${id}`)

      return repo
    })

  const removeRepo: RepobaseEngineService["removeRepo"] = (id) =>
    Effect.gen(function* () {
      const repoOpt = yield* store.getRepo(id)
      const repo = yield* Option.match(repoOpt, {
        onNone: () => Effect.fail(new RepoNotFoundError({ id })),
        onSome: Effect.succeed
      })

      // Remove from index first
      yield* Effect.log(`Removing index for ${id}...`)
      yield* indexer.removeIndex(id)

      // Remove files
      yield* fs.remove(repo.localPath, { recursive: true }).pipe(
        Effect.catchAll(() => Effect.void) // Ignore if already deleted
      )

      // Remove from store
      yield* store.removeRepo(id)
      yield* Effect.log(`Removed repository: ${id}`)
    })

  const listRepos: RepobaseEngineService["listRepos"] = () =>
    store.load().pipe(Effect.map((d) => [...d.repos]))

  const getRepo: RepobaseEngineService["getRepo"] = (id) => store.getRepo(id)

  const syncRepo: RepobaseEngineService["syncRepo"] = (id) =>
    Effect.gen(function* () {
      const repoOpt = yield* store.getRepo(id)
      const repo = yield* Option.match(repoOpt, {
        onNone: () => Effect.fail(new RepoNotFoundError({ id })),
        onSome: Effect.succeed
      })

      // Pinned repos don't sync
      if (repo.mode._tag === "pinned") {
        yield* Effect.log(`${id}: pinned to ${repo.mode.ref}, skipping sync`)
        return {
          id,
          updated: false,
          previousCommit: repo.lastSyncedCommit,
          currentCommit: Option.getOrElse(
            repo.lastSyncedCommit,
            () => "unknown"
          )
        }
      }

      // Fetch from remote
      yield* Effect.log(`Fetching ${id}...`)
      yield* git.fetch(repo.localPath)

      // Check if update needed
      const remoteHead = yield* git.getRemoteHead(repo.localPath, repo.mode.branch)
      const previousCommit = repo.lastSyncedCommit
      const needsUpdate = Option.match(previousCommit, {
        onNone: () => true,
        onSome: (prev) => prev !== remoteHead
      })

      if (!needsUpdate) {
        yield* Effect.log(`${id}: already up to date`)
        return {
          id,
          updated: false,
          previousCommit,
          currentCommit: remoteHead
        }
      }

      // Get changed files via git diff (if we have a previous commit)
      const changes = yield* Option.match(previousCommit, {
        onNone: () => Effect.succeed([]),
        onSome: (prev) => git.diffNameStatus(repo.localPath, prev, remoteHead)
      })

      // Update working tree - use origin/<branch> for shallow clones
      yield* git.resetHard(repo.localPath, `origin/${repo.mode.branch}`)

      // Update index
      let indexSummary: IndexSummary
      if (changes.length > 0) {
        // Incremental indexing
        yield* Effect.log(`Incrementally indexing ${changes.length} changed files...`)
        indexSummary = yield* indexer.indexChanges(id, repo.localPath, changes)
      } else {
        // Full re-index (first sync or no previous commit)
        yield* Effect.log(`Full re-indexing ${id}...`)
        indexSummary = yield* indexer.indexRepo(id, repo.localPath)
      }

      yield* Effect.log(
        `Indexed ${indexSummary.filesIndexed} files, deleted ${indexSummary.filesDeleted} in ${indexSummary.durationMs}ms`
      )

      // Update store
      yield* store.updateRepo(id, {
        lastSyncedCommit: Option.some(remoteHead),
        lastSyncedAt: Option.some(new Date())
      })

      yield* Effect.log(
        `${id}: updated to ${remoteHead.slice(0, 8)}`
      )

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
      if (data.repos.length === 0) {
        yield* Effect.log("No repositories to sync")
        return []
      }
      yield* Effect.log(`Syncing ${data.repos.length} repositories...`)
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
    listRepos,
    getRepo,
    syncRepo,
    syncAll,
    search
  })
})

/**
 * RepobaseEngine layer - requires GitClient, RepoStore, Indexer, and FileSystem
 */
export const layer = Layer.effect(RepobaseEngine, make)
