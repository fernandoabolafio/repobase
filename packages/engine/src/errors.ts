import { Data } from "effect"

/**
 * Error from git command execution
 */
export class GitError extends Data.TaggedError("GitError")<{
  readonly command: string
  readonly message: string
}> {}

/**
 * Error from store operations (load/save config)
 */
export class StoreError extends Data.TaggedError("StoreError")<{
  readonly operation: string
  readonly message: string
}> {}

/**
 * Repository not found in store
 */
export class RepoNotFoundError extends Data.TaggedError("RepoNotFoundError")<{
  readonly id: string
}> {}

/**
 * Repository already exists in store
 */
export class RepoAlreadyExistsError extends Data.TaggedError("RepoAlreadyExistsError")<{
  readonly id: string
}> {}

/**
 * Error from indexing operations
 */
export class IndexError extends Data.TaggedError("IndexError")<{
  readonly operation: string
  readonly message: string
}> {}

/**
 * Error from search operations
 */
export class SearchError extends Data.TaggedError("SearchError")<{
  readonly message: string
}> {}

/**
 * Error from cloud sync operations
 */
export class CloudError extends Data.TaggedError("CloudError")<{
  readonly operation: string
  readonly message: string
}> {}

/**
 * Cloud sync not configured
 */
export class CloudNotConfiguredError extends Data.TaggedError("CloudNotConfiguredError")<{}> {}

/**
 * File not found in index or on disk
 */
export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly repo: string
  readonly path: string
}> {}

/**
 * Invalid pattern (e.g., malformed regex or glob)
 */
export class InvalidPatternError extends Data.TaggedError("InvalidPatternError")<{
  readonly pattern: string
  readonly message: string
}> {}

/**
 * Union of all engine errors
 */
export type EngineError =
  | GitError
  | StoreError
  | RepoNotFoundError
  | RepoAlreadyExistsError
  | IndexError
  | SearchError
  | CloudError
  | CloudNotConfiguredError
  | FileNotFoundError
  | InvalidPatternError
