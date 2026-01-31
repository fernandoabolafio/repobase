// Schemas
export {
  type TrackingMode,
  type PinnedMode,
  type RepoMode,
  type RepoConfig,
  type RepoStoreData,
  type CloudConfig,
  type SyncManifestFile,
  type SyncManifest,
  TrackingMode as TrackingModeSchema,
  PinnedMode as PinnedModeSchema,
  RepoMode as RepoModeSchema,
  RepoConfig as RepoConfigSchema,
  RepoStoreData as RepoStoreDataSchema,
  CloudConfig as CloudConfigSchema,
  SyncManifestFile as SyncManifestFileSchema,
  SyncManifest as SyncManifestSchema
} from "./schemas.js"

// Utils
export { deriveRepoId, trackingMode, pinnedMode } from "./utils.js"

// Errors
export {
  GitError,
  StoreError,
  IndexError,
  SearchError,
  CloudError,
  CloudNotConfiguredError,
  RepoNotFoundError,
  RepoAlreadyExistsError,
  FileNotFoundError,
  InvalidPatternError,
  type EngineError
} from "./errors.js"

// Services
export { GitClient, type GitClientService, type FileChange } from "./services/GitClient.js"
export { RepoStore, type RepoStoreService } from "./services/RepoStore.js"
export {
  Indexer,
  type IndexerService,
  type IndexSummary,
  type SearchResult,
  type SearchOptions,
  type SearchMode,
  type IndexOptions,
  type IndexingProgress,
  initialIndexingProgress,
  type FileInfo,
  type FileContent,
  type GrepMatch,
  type GrepResult,
  type ListFilesOptions,
  type GlobOptions,
  type ReadFileOptions,
  type GrepOptions
} from "./services/Indexer.js"
export {
  RepobaseEngine,
  type RepobaseEngineService,
  type AddRepoOptions,
  type AddRepoProgress,
  type AddRepoStage,
  type SyncResult,
  initialProgress
} from "./services/RepobaseEngine.js"
export {
  CloudSync,
  type CloudSyncService,
  type PushResult,
  type PullResult,
  type SyncStatus,
  type CloudConfigInput
} from "./services/CloudSync.js"

// Layers
export { layer as GitClientLayer } from "./services/GitClient.js"
export { layer as RepoStoreLayer } from "./services/RepoStore.js"
export { layer as IndexerLayer } from "./services/Indexer.js"
export { layer as RepobaseEngineLayer } from "./services/RepobaseEngine.js"
export { layer as CloudSyncLayer } from "./services/CloudSync.js"

// Layer composition for Node
import { Layer } from "effect"
import { NodeFileSystem, NodeCommandExecutor } from "@effect/platform-node"
import { layer as GitClientLayer } from "./services/GitClient.js"
import { layer as RepoStoreLayer } from "./services/RepoStore.js"
import { layer as IndexerLayer } from "./services/Indexer.js"
import { layer as RepobaseEngineLayer } from "./services/RepobaseEngine.js"
import { layer as CloudSyncLayer } from "./services/CloudSync.js"

/**
 * Platform dependencies for Node
 */
export const PlatformLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodeCommandExecutor.layer
)

/**
 * GitClient layer with Node platform
 */
export const GitClientLive = GitClientLayer.pipe(Layer.provide(PlatformLive))

/**
 * RepoStore layer with Node platform
 */
export const RepoStoreLive = RepoStoreLayer.pipe(Layer.provide(PlatformLive))

/**
 * Indexer layer with Node platform
 */
export const IndexerLive = IndexerLayer.pipe(Layer.provide(PlatformLive))

/**
 * CloudSync layer with Node platform and RepoStore
 */
export const CloudSyncLive = CloudSyncLayer.pipe(
  Layer.provide(Layer.mergeAll(RepoStoreLayer, PlatformLive))
)

/**
 * RepobaseEngine layer with all dependencies
 * Composes all required layers and provides the platform at the end
 */
export const RepobaseEngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      GitClientLayer,
      RepoStoreLayer,
      IndexerLayer,
      PlatformLive
    )
  )
)
