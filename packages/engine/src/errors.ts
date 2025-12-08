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
 * Union of all engine errors
 */
export type EngineError =
  | GitError
  | StoreError
  | RepoNotFoundError
  | RepoAlreadyExistsError
  | IndexError
  | SearchError
