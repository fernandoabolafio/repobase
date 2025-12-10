import { FileSystem } from "@effect/platform"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { CloudError, CloudNotConfiguredError, StoreError } from "../errors.js"
import { CloudConfig, RepoConfig, SyncManifest } from "../schemas.js"
import { RepoStore } from "./RepoStore.js"
import * as os from "os"
import * as crypto from "crypto"
import * as path from "path"

/**
 * Result of a push operation
 */
export interface PushResult {
  repoId: string
  filesUploaded: number
  filesSkipped: number
  durationMs: number
}

/**
 * Result of a pull operation
 */
export interface PullResult {
  filesDownloaded: number
  durationMs: number
}

/**
 * Sync status for a repo
 */
export interface SyncStatus {
  repoId: string
  inSync: boolean
  localCommit: Option.Option<string>
  cloudCommit: Option.Option<string>
  lastPushedAt: Option.Option<Date>
}

/**
 * Input for configuring cloud sync
 */
export interface CloudConfigInput {
  userId: string
  apiKey: string
  endpoint: string
}

/**
 * CloudSync service interface
 */
export interface CloudSyncService {
  // Configuration
  readonly configure: (config: CloudConfigInput) => Effect.Effect<void, CloudError>
  readonly getConfig: () => Effect.Effect<CloudConfig, CloudError | CloudNotConfiguredError>
  readonly clearConfig: () => Effect.Effect<void, CloudError>
  readonly isConfigured: () => Effect.Effect<boolean, CloudError>

  // Per-repo cloud enable/disable
  readonly enableRepo: (repoId: string) => Effect.Effect<void, CloudError | StoreError>
  readonly disableRepo: (repoId: string) => Effect.Effect<void, CloudError | StoreError>

  // Sync operations
  readonly push: (repoId: string) => Effect.Effect<PushResult, CloudError | CloudNotConfiguredError | StoreError>
  readonly pushAll: () => Effect.Effect<PushResult[], CloudError | CloudNotConfiguredError | StoreError>
  readonly pull: () => Effect.Effect<PullResult, CloudError | CloudNotConfiguredError>

  // Status
  readonly getStatus: (repoId: string) => Effect.Effect<SyncStatus, CloudError | StoreError>
  readonly listCloudEnabled: () => Effect.Effect<RepoConfig[], StoreError>
}

/**
 * CloudSync service tag
 */
export class CloudSync extends Context.Tag("@repobase/engine/CloudSync")<
  CloudSync,
  CloudSyncService
>() {}

/**
 * Get the cloud config file path
 */
const getCloudConfigPath = () => `${os.homedir()}/.repobase/cloud.json`

/**
 * Get the index directory path
 */
const getIndexDir = () => `${os.homedir()}/.repobase/index`

/**
 * Helper to convert errors to CloudError
 */
const toCloudError =
  (operation: string) =>
  (error: unknown): CloudError =>
    new CloudError({
      operation,
      message: error instanceof Error ? error.message : String(error)
    })

/**
 * Compute SHA-256 hash of a buffer
 */
function hashBuffer(buffer: Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

/**
 * Create the CloudSync service implementation
 */
export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const store = yield* RepoStore
  const cloudConfigPath = getCloudConfigPath()
  const indexDir = getIndexDir()

  /**
   * Load cloud config from disk
   */
  const loadConfig = Effect.gen(function* () {
    const exists = yield* fs.exists(cloudConfigPath)
    if (!exists) {
      return yield* Effect.fail(new CloudNotConfiguredError())
    }
    const content = yield* fs.readFileString(cloudConfigPath)
    return yield* Schema.decodeUnknown(CloudConfig)(JSON.parse(content))
  }).pipe(Effect.mapError((e) => 
    e instanceof CloudNotConfiguredError ? e : toCloudError("loadConfig")(e)
  ))

  /**
   * Save cloud config to disk
   */
  const saveConfig = (config: CloudConfig) =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(CloudConfig)(config)
      const dir = path.dirname(cloudConfigPath)
      yield* fs.makeDirectory(dir, { recursive: true })
      yield* fs.writeFileString(cloudConfigPath, JSON.stringify(encoded, null, 2))
    }).pipe(Effect.mapError(toCloudError("saveConfig")))

  /**
   * List all files in a directory recursively
   */
  const listFilesRecursive = (dir: string): Effect.Effect<string[], CloudError> =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(dir)
      if (!exists) return []

      const entries = yield* fs.readDirectory(dir)
      const files: string[] = []

      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = yield* fs.stat(fullPath)
        if (stat.type === "Directory") {
          const subFiles = yield* listFilesRecursive(fullPath)
          files.push(...subFiles)
        } else {
          files.push(fullPath)
        }
      }

      return files
    }).pipe(Effect.mapError(toCloudError("listFiles")))

  /**
   * Build manifest from local index files
   */
  const buildLocalManifest = Effect.gen(function* () {
    const files = yield* listFilesRecursive(indexDir)
    const manifest: Record<string, { checksum: string; size: number }> = {}

    for (const file of files) {
      const relativePath = path.relative(indexDir, file)
      const content = yield* fs.readFile(file).pipe(
        Effect.mapError(toCloudError("readFile"))
      )
      manifest[relativePath] = {
        checksum: hashBuffer(content),
        size: content.length
      }
    }

    return manifest
  })

  // Service implementation
  const configure: CloudSyncService["configure"] = (input) =>
    Effect.gen(function* () {
      const config: CloudConfig = {
        userId: input.userId,
        apiKey: Option.some(input.apiKey),
        endpoint: input.endpoint
      }
      yield* saveConfig(config)
    })

  const getConfig: CloudSyncService["getConfig"] = () => loadConfig

  const clearConfig: CloudSyncService["clearConfig"] = () =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(cloudConfigPath)
      if (exists) {
        yield* fs.remove(cloudConfigPath)
      }
    }).pipe(Effect.mapError(toCloudError("clearConfig")))

  const isConfigured: CloudSyncService["isConfigured"] = () =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(cloudConfigPath)
      return exists
    }).pipe(Effect.mapError(toCloudError("isConfigured")))

  const enableRepo: CloudSyncService["enableRepo"] = (repoId) =>
    store.updateRepo(repoId, { cloudEnabled: true })

  const disableRepo: CloudSyncService["disableRepo"] = (repoId) =>
    store.updateRepo(repoId, { cloudEnabled: false })

  const push: CloudSyncService["push"] = (repoId) =>
    Effect.gen(function* () {
      const startTime = Date.now()
      const config = yield* loadConfig

      // Build local manifest for this repo's files
      const localManifest = yield* buildLocalManifest

      // Filter to files that belong to this repo (files starting with repo id or global files)
      const repoFiles = Object.entries(localManifest).filter(([filePath]) => {
        // LanceDB stores all data together, so we push everything
        // In a more sophisticated implementation, we could filter by repo
        return true
      })

      // TODO: Implement actual HTTP upload to cloud API
      // For now, we just simulate the operation
      yield* Effect.log(`Would push ${repoFiles.length} files to ${config.endpoint}`)

      // Update repo's lastPushedAt and lastPushedCommit
      const repoOpt = yield* store.getRepo(repoId)
      if (Option.isSome(repoOpt)) {
        const repo = repoOpt.value
        yield* store.updateRepo(repoId, {
          lastPushedAt: Option.some(new Date()),
          lastPushedCommit: repo.lastSyncedCommit
        })
      }

      return {
        repoId,
        filesUploaded: repoFiles.length,
        filesSkipped: 0,
        durationMs: Date.now() - startTime
      }
    })

  const pushAll: CloudSyncService["pushAll"] = () =>
    Effect.gen(function* () {
      const config = yield* loadConfig
      const data = yield* store.load()

      // Filter to repos with cloudEnabled
      const enabledRepos = data.repos.filter((r) => r.cloudEnabled === true)

      if (enabledRepos.length === 0) {
        yield* Effect.log("No repos have cloud sync enabled")
        return []
      }

      yield* Effect.log(`Pushing ${enabledRepos.length} cloud-enabled repos...`)

      // Push each enabled repo
      const results = yield* Effect.forEach(
        enabledRepos,
        (repo) => push(repo.id),
        { concurrency: 1 }
      )

      return results
    })

  const pull: CloudSyncService["pull"] = () =>
    Effect.gen(function* () {
      const startTime = Date.now()
      const config = yield* loadConfig

      // TODO: Implement actual HTTP download from cloud API
      // For now, we just simulate the operation
      yield* Effect.log(`Would pull index files from ${config.endpoint}`)

      return {
        filesDownloaded: 0,
        durationMs: Date.now() - startTime
      }
    })

  const getStatus: CloudSyncService["getStatus"] = (repoId) =>
    Effect.gen(function* () {
      const repoOpt = yield* store.getRepo(repoId)

      if (Option.isNone(repoOpt)) {
        return {
          repoId,
          inSync: false,
          localCommit: Option.none(),
          cloudCommit: Option.none(),
          lastPushedAt: Option.none()
        }
      }

      const repo = repoOpt.value
      const localCommit = repo.lastSyncedCommit
      const cloudCommit = repo.lastPushedCommit ?? Option.none()
      const lastPushedAt = repo.lastPushedAt ?? Option.none()

      // In sync if both commits match
      const inSync = Option.isSome(localCommit) && 
                     Option.isSome(cloudCommit) && 
                     localCommit.value === cloudCommit.value

      return {
        repoId,
        inSync,
        localCommit,
        cloudCommit,
        lastPushedAt
      }
    })

  const listCloudEnabled: CloudSyncService["listCloudEnabled"] = () =>
    Effect.gen(function* () {
      const data = yield* store.load()
      return data.repos.filter((r) => r.cloudEnabled === true)
    })

  return CloudSync.of({
    configure,
    getConfig,
    clearConfig,
    isConfigured,
    enableRepo,
    disableRepo,
    push,
    pushAll,
    pull,
    getStatus,
    listCloudEnabled
  })
})

/**
 * CloudSync layer - requires FileSystem and RepoStore
 */
export const layer = Layer.effect(CloudSync, make)

