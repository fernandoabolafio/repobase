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
  RepoNotFoundError,
  RepoAlreadyExistsError,
  type EngineError
} from "./errors.js"

// Services
export { GitClient, type GitClientService, type FileChange } from "./services/GitClient.js"
export { RepoStore, type RepoStoreService } from "./services/RepoStore.js"
export {
  RepobaseEngine,
  type RepobaseEngineService,
  type AddRepoOptions,
  type SyncResult
} from "./services/RepobaseEngine.js"

// Layers
export { layer as GitClientLayer } from "./services/GitClient.js"
export { layer as RepoStoreLayer } from "./services/RepoStore.js"
export { layer as RepobaseEngineLayer } from "./services/RepobaseEngine.js"

// Layer composition for Node.js
import { Layer } from "effect"
import { FileSystem } from "@effect/platform"
import { NodeFileSystem, NodeCommandExecutor } from "@effect/platform-node"
import { layer as GitClientLayer } from "./services/GitClient.js"
import { layer as RepoStoreLayer } from "./services/RepoStore.js"
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
 * RepobaseEngine layer with all dependencies
 * Composes all required layers and provides the platform at the end
 */
export const RepobaseEngineLive = RepobaseEngineLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      GitClientLayer,
      RepoStoreLayer,
      PlatformLive
    )
  )
)
