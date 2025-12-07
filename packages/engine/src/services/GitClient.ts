import { Command, CommandExecutor } from "@effect/platform"
import { Context, Effect, Layer } from "effect"
import { GitError } from "../errors.js"

/**
 * Represents a file change from git diff
 */
export interface FileChange {
  status: "A" | "M" | "D" // Added, Modified, Deleted
  path: string
}

/**
 * Git client service interface
 */
export interface GitClientService {
  readonly clone: (url: string, path: string) => Effect.Effect<void, GitError>
  readonly fetch: (path: string) => Effect.Effect<void, GitError>
  readonly resetHard: (path: string, ref: string) => Effect.Effect<void, GitError>
  readonly checkout: (path: string, ref: string) => Effect.Effect<void, GitError>
  readonly getCurrentCommit: (path: string) => Effect.Effect<string, GitError>
  readonly getRemoteHead: (path: string, branch: string) => Effect.Effect<string, GitError>
  readonly diffNameStatus: (
    path: string,
    fromCommit: string,
    toCommit: string
  ) => Effect.Effect<FileChange[], GitError>
}

/**
 * GitClient service tag
 */
export class GitClient extends Context.Tag("@repobase/engine/GitClient")<
  GitClient,
  GitClientService
>() {}

/**
 * Helper to convert platform errors to GitError
 */
const toGitError =
  (command: string) =>
  (error: unknown): GitError =>
    new GitError({
      command,
      message: error instanceof Error ? error.message : String(error)
    })

/**
 * Create the GitClient service implementation
 */
export const make = Effect.gen(function* () {
  const executor = yield* CommandExecutor.CommandExecutor

  const runCommand = (cmd: Command.Command) =>
    Effect.provideService(Command.exitCode(cmd), CommandExecutor.CommandExecutor, executor)

  const runString = (cmd: Command.Command) =>
    Effect.provideService(Command.string(cmd), CommandExecutor.CommandExecutor, executor)

  const runLines = (cmd: Command.Command) =>
    Effect.provideService(Command.lines(cmd), CommandExecutor.CommandExecutor, executor)

  return GitClient.of({
    clone: (url, path) =>
      runCommand(Command.make("git", "clone", "--depth", "1", url, path)).pipe(
        Effect.asVoid,
        Effect.mapError(toGitError("clone"))
      ),

    fetch: (path) =>
      runCommand(Command.make("git", "-C", path, "fetch", "origin")).pipe(
        Effect.asVoid,
        Effect.mapError(toGitError("fetch"))
      ),

    getCurrentCommit: (path) =>
      runString(Command.make("git", "-C", path, "rev-parse", "HEAD")).pipe(
        Effect.map((s) => s.trim()),
        Effect.mapError(toGitError("rev-parse"))
      ),

    getRemoteHead: (path, branch) =>
      runString(Command.make("git", "-C", path, "rev-parse", `origin/${branch}`)).pipe(
        Effect.map((s) => s.trim()),
        Effect.mapError(toGitError("rev-parse"))
      ),

    resetHard: (path, ref) =>
      runCommand(Command.make("git", "-C", path, "reset", "--hard", ref)).pipe(
        Effect.asVoid,
        Effect.mapError(toGitError("reset"))
      ),

    checkout: (path, ref) =>
      runCommand(Command.make("git", "-C", path, "checkout", ref)).pipe(
        Effect.asVoid,
        Effect.mapError(toGitError("checkout"))
      ),

    diffNameStatus: (path, fromCommit, toCommit) =>
      runLines(
        Command.make("git", "-C", path, "diff", "--name-status", `${fromCommit}..${toCommit}`)
      ).pipe(
        Effect.map((lines) =>
          lines
            .filter((line) => line.trim().length > 0)
            .map((line) => {
              const [status, ...pathParts] = line.split("\t")
              return {
                status: status as "A" | "M" | "D",
                path: pathParts.join("\t")
              }
            })
        ),
        Effect.mapError(toGitError("diff"))
      )
  })
})

/**
 * GitClient layer - requires CommandExecutor
 */
export const layer = Layer.effect(GitClient, make)
