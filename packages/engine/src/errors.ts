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
 * Union of all Phase 1 engine errors
 */
export type EngineError =
  | GitError
  | StoreError
  | RepoNotFoundError
  | RepoAlreadyExistsError
