// Schemas
export {
  type TrackingMode,
  type PinnedMode,
  type RepoMode,
  type RepoConfig,
  type RepoStoreData,
  TrackingMode as TrackingModeSchema,
  PinnedMode as PinnedModeSchema,
  RepoMode as RepoModeSchema,
  RepoConfig as RepoConfigSchema,
  RepoStoreData as RepoStoreDataSchema,
  deriveRepoId,
  trackingMode,
  pinnedMode
} from "./schemas.js"

// Errors
export {
  GitError,
  StoreError,
  IndexError,
  SearchError,
  RepoNotFoundError,
  RepoAlreadyExistsError,
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
  initialIndexingProgress
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

// Layers
export { layer as GitClientLayer } from "./services/GitClient.js"
export { layer as RepoStoreLayer } from "./services/RepoStore.js"
export { layer as IndexerLayer } from "./services/Indexer.js"
export { layer as RepobaseEngineLayer } from "./services/RepobaseEngine.js"

// Layer composition for Node.js
import { Layer } from "effect"
import { NodeFileSystem, NodeCommandExecutor } from "@effect/platform-node"
import { layer as GitClientLayer } from "./services/GitClient.js"
import { layer as RepoStoreLayer } from "./services/RepoStore.js"
import { layer as IndexerLayer } from "./services/Indexer.js"
import { layer as RepobaseEngineLayer } from "./services/RepobaseEngine.js"

/**
 * Platform dependencies for Node.js
 */
export const PlatformLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodeCommandExecutor.layer
)

/**
 * GitClient layer with Node.js platform
 */
export const GitClientLive = GitClientLayer.pipe(Layer.provide(PlatformLive))

/**
 * RepoStore layer with Node.js platform
 */
export const RepoStoreLive = RepoStoreLayer.pipe(Layer.provide(PlatformLive))

/**
 * Indexer layer with Node.js platform
 */
export const IndexerLive = IndexerLayer.pipe(Layer.provide(PlatformLive))

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
