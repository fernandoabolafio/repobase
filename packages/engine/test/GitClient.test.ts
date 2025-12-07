import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { CommandExecutor } from "@effect/platform"
import { GitClient, GitError } from "../src/index.js"
import { layer as GitClientLayer } from "../src/services/GitClient.js"

/**
 * Mock CommandExecutor that simulates git command responses
 */
const mockCommands: Record<string, { stdout?: string; exitCode?: number; error?: string }> = {
  "git clone --depth 1 https://github.com/test/repo /tmp/repo": { exitCode: 0 },
  "git -C /tmp/repo fetch origin": { exitCode: 0 },
  "git -C /tmp/repo rev-parse HEAD": { stdout: "abc123def456\n" },
  "git -C /tmp/repo rev-parse origin/main": { stdout: "xyz789abc\n" },
  "git -C /tmp/repo reset --hard abc123": { exitCode: 0 },
  "git -C /tmp/repo checkout v1.0.0": { exitCode: 0 },
  "git -C /tmp/repo diff --name-status abc..xyz": {
    stdout: "A\tnew-file.ts\nM\tmodified.ts\nD\tdeleted.ts\n"
  },
  // Failure cases
  "git clone --depth 1 https://github.com/invalid/repo /tmp/invalid": {
    error: "Repository not found"
  }
}

const MockCommandExecutor = Layer.succeed(
  CommandExecutor.CommandExecutor,
  CommandExecutor.CommandExecutor.of({
    start: () => Effect.die("start not implemented in mock"),
    exitCode: (command) => {
      const cmd = [command.command, ...command.args].join(" ")
      const mock = mockCommands[cmd]
      if (!mock) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "Unknown",
          message: `Unknown command: ${cmd}`
        } as any)
      }
      if (mock.error) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "Unknown",
          message: mock.error
        } as any)
      }
      return Effect.succeed(mock.exitCode ?? 0)
    },
    string: (command) => {
      const cmd = [command.command, ...command.args].join(" ")
      const mock = mockCommands[cmd]
      if (!mock) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "Unknown",
          message: `Unknown command: ${cmd}`
        } as any)
      }
      if (mock.error) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "Unknown",
          message: mock.error
        } as any)
      }
      return Effect.succeed(mock.stdout ?? "")
    },
    lines: (command) => {
      const cmd = [command.command, ...command.args].join(" ")
      const mock = mockCommands[cmd]
      if (!mock) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "Unknown",
          message: `Unknown command: ${cmd}`
        } as any)
      }
      if (mock.error) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "Unknown",
          message: mock.error
        } as any)
      }
      const lines = (mock.stdout ?? "").split("\n").filter((l) => l.length > 0)
      return Effect.succeed(lines)
    },
    stream: () => Effect.die("stream not implemented in mock"),
    streamLines: () => Effect.die("streamLines not implemented in mock")
  })
)

const TestGitClientLayer = GitClientLayer.pipe(Layer.provide(MockCommandExecutor))

describe("GitClient", () => {
  describe("clone", () => {
    it.effect("clones repository successfully", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        yield* git.clone("https://github.com/test/repo", "/tmp/repo")
        // If we get here without error, the test passes
      }).pipe(Effect.provide(TestGitClientLayer))
    )

    it.effect("returns GitError on clone failure", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        const result = yield* Effect.exit(
          git.clone("https://github.com/invalid/repo", "/tmp/invalid")
        )
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          const error = result.cause
          // Check it's a GitError
          expect(error._tag).toBe("Fail")
        }
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })

  describe("fetch", () => {
    it.effect("fetches from origin", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        yield* git.fetch("/tmp/repo")
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })

  describe("getCurrentCommit", () => {
    it.effect("returns current commit hash trimmed", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        const commit = yield* git.getCurrentCommit("/tmp/repo")
        expect(commit).toBe("abc123def456")
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })

  describe("getRemoteHead", () => {
    it.effect("returns remote head commit", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        const commit = yield* git.getRemoteHead("/tmp/repo", "main")
        expect(commit).toBe("xyz789abc")
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })

  describe("resetHard", () => {
    it.effect("resets to specified ref", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        yield* git.resetHard("/tmp/repo", "abc123")
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })

  describe("checkout", () => {
    it.effect("checks out specified ref", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        yield* git.checkout("/tmp/repo", "v1.0.0")
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })

  describe("diffNameStatus", () => {
    it.effect("parses file changes correctly", () =>
      Effect.gen(function* () {
        const git = yield* GitClient
        const changes = yield* git.diffNameStatus("/tmp/repo", "abc", "xyz")

        expect(changes).toHaveLength(3)
        expect(changes[0]).toEqual({ status: "A", path: "new-file.ts" })
        expect(changes[1]).toEqual({ status: "M", path: "modified.ts" })
        expect(changes[2]).toEqual({ status: "D", path: "deleted.ts" })
      }).pipe(Effect.provide(TestGitClientLayer))
    )
  })
})
