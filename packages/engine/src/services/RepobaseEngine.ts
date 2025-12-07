import { FileSystem } from "@effect/platform"
import { Context, Effect, Layer, Option } from "effect"
import {
  GitError,
  RepoAlreadyExistsError,
  RepoNotFoundError,
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
import * as os from "os"

/**
 * Options for adding a repository
 */
export interface AddRepoOptions {
  readonly mode?: RepoMode
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  readonly id: string
  readonly updated: boolean
  readonly previousCommit: Option.Option<string>
  readonly currentCommit: string
}

/**
 * All possible engine errors
 */
export type EngineError =
  | GitError
  | StoreError
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
  const fs = yield* FileSystem.FileSystem

  const reposDir = getReposDir()

  const addRepo: RepobaseEngineService["addRepo"] = (url, options) =>
    Effect.gen(function* () {
      const id = deriveRepoId(url)
      const localPath = `${reposDir}/${id}`

      // Check if already exists
      const existing = yield* store.getRepo(id)
      if (Option.isSome(existing)) {
        return yield* Effect.fail(new RepoAlreadyExistsError({ id }))
      }

      // Ensure repos directory exists
      yield* fs.makeDirectory(reposDir, { recursive: true })

      // Clone the repository
      yield* Effect.log(`Cloning ${url}...`)
      yield* git.clone(url, localPath)

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
        addedAt: new Date()
      }

      // Save config
      yield* store.addRepo(repo)
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

      // Remove files
      yield* fs.remove(repo.localPath, { recursive: true }).pipe(
        Effect.catchAll(() => Effect.void) // Ignore if already deleted
      )

      // Remove from store
      yield* store.removeRepo(id)
      yield* Effect.log(`Removed repository: ${id}`)
    })

  const listRepos: RepobaseEngineService["listRepos"] = () =>
    store.load().pipe(Effect.map((d) => d.repos))

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

      // Update working tree - use origin/<branch> for shallow clones
      yield* git.resetHard(repo.localPath, `origin/${repo.mode.branch}`)

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
        currentCommit: remoteHead
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

  return RepobaseEngine.of({
    addRepo,
    removeRepo,
    listRepos,
    getRepo,
    syncRepo,
    syncAll
  })
})

/**
 * RepobaseEngine layer - requires GitClient, RepoStore, and FileSystem
 */
export const layer = Layer.effect(RepobaseEngine, make)
