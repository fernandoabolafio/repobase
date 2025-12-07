import { Schema } from "effect"

// Repository tracking mode - tracks a branch (auto-updates on sync)
export const TrackingMode = Schema.Struct({
  _tag: Schema.Literal("tracking"),
  branch: Schema.String // e.g., "main", "master"
})

// Pinned mode - pinned to a specific tag or commit SHA
export const PinnedMode = Schema.Struct({
  _tag: Schema.Literal("pinned"),
  ref: Schema.String // tag or commit SHA
})

// Union of tracking modes
export const RepoMode = Schema.Union(TrackingMode, PinnedMode)

// Repository metadata
export const RepoConfig = Schema.Struct({
  id: Schema.String, // unique identifier (derived from URL)
  url: Schema.String, // GitHub URL
  localPath: Schema.String, // ~/.repobase/repos/<id>
  mode: RepoMode,
  lastSyncedCommit: Schema.OptionFromNullOr(Schema.String),
  lastSyncedAt: Schema.OptionFromNullOr(Schema.DateFromNumber),
  addedAt: Schema.DateFromNumber
})

// Full store configuration
export const RepoStoreData = Schema.Struct({
  version: Schema.Literal(1),
  repos: Schema.Array(RepoConfig)
})

// Derive types from schemas
export type TrackingMode = Schema.Schema.Type<typeof TrackingMode>
export type PinnedMode = Schema.Schema.Type<typeof PinnedMode>
export type RepoMode = Schema.Schema.Type<typeof RepoMode>
export type RepoConfig = Schema.Schema.Type<typeof RepoConfig>
export type RepoStoreData = Schema.Schema.Type<typeof RepoStoreData>

// Utility: derive repo ID from GitHub URL
// e.g., "https://github.com/Effect-TS/effect" -> "Effect-TS-effect"
export function deriveRepoId(url: string): string {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`)
  }
  return `${match[1]}-${match[2]}`
}

// Utility: create a default tracking mode
export function trackingMode(branch: string = "main"): TrackingMode {
  return { _tag: "tracking", branch }
}

// Utility: create a pinned mode
export function pinnedMode(ref: string): PinnedMode {
  return { _tag: "pinned", ref }
}
