import { describe, it, expect } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import {
  TrackingMode,
  PinnedMode,
  RepoMode,
  RepoConfig,
  RepoStoreData
} from "../src/schemas.js"
import { deriveRepoId, trackingMode, pinnedMode } from "../src/utils.js"

describe("schemas", () => {
  describe("deriveRepoId", () => {
    it("derives ID from GitHub URL", () => {
      expect(deriveRepoId("https://github.com/Effect-TS/effect")).toBe("Effect-TS-effect")
    })

    it("handles .git suffix", () => {
      expect(deriveRepoId("https://github.com/Effect-TS/effect.git")).toBe("Effect-TS-effect")
    })

    it("throws for invalid URLs", () => {
      expect(() => deriveRepoId("not-a-url")).toThrow("Invalid GitHub URL")
    })
  })

  describe("trackingMode helper", () => {
    it("creates tracking mode with default branch", () => {
      const mode = trackingMode()
      expect(mode).toEqual({ _tag: "tracking", branch: "main" })
    })

    it("creates tracking mode with custom branch", () => {
      const mode = trackingMode("develop")
      expect(mode).toEqual({ _tag: "tracking", branch: "develop" })
    })
  })

  describe("pinnedMode helper", () => {
    it("creates pinned mode with ref", () => {
      const mode = pinnedMode("v1.0.0")
      expect(mode).toEqual({ _tag: "pinned", ref: "v1.0.0" })
    })
  })

  describe("TrackingMode schema", () => {
    it.effect("decodes valid tracking mode", () =>
      Effect.gen(function* () {
        const input = { _tag: "tracking", branch: "main" }
        const result = yield* Schema.decodeUnknown(TrackingMode)(input)
        expect(result).toEqual({ _tag: "tracking", branch: "main" })
      })
    )

    it.effect("fails on invalid tracking mode", () =>
      Effect.gen(function* () {
        const input = { _tag: "tracking" } // missing branch
        const result = yield* Effect.exit(Schema.decodeUnknown(TrackingMode)(input))
        expect(result._tag).toBe("Failure")
      })
    )
  })

  describe("PinnedMode schema", () => {
    it.effect("decodes valid pinned mode", () =>
      Effect.gen(function* () {
        const input = { _tag: "pinned", ref: "abc123" }
        const result = yield* Schema.decodeUnknown(PinnedMode)(input)
        expect(result).toEqual({ _tag: "pinned", ref: "abc123" })
      })
    )
  })

  describe("RepoMode schema", () => {
    it.effect("decodes tracking mode", () =>
      Effect.gen(function* () {
        const input = { _tag: "tracking", branch: "main" }
        const result = yield* Schema.decodeUnknown(RepoMode)(input)
        expect(result._tag).toBe("tracking")
      })
    )

    it.effect("decodes pinned mode", () =>
      Effect.gen(function* () {
        const input = { _tag: "pinned", ref: "v1.0.0" }
        const result = yield* Schema.decodeUnknown(RepoMode)(input)
        expect(result._tag).toBe("pinned")
      })
    )
  })

  describe("RepoConfig schema", () => {
    it.effect("decodes and encodes full config", () =>
      Effect.gen(function* () {
        const now = Date.now()
        const input = {
          id: "Effect-TS-effect",
          url: "https://github.com/Effect-TS/effect",
          localPath: "/home/user/.repobase/repos/Effect-TS-effect",
          mode: { _tag: "tracking", branch: "main" },
          lastSyncedCommit: "abc123",
          lastSyncedAt: now,
          addedAt: now,
          lastPushedAt: null,
          lastPushedCommit: null
        }

        const decoded = yield* Schema.decodeUnknown(RepoConfig)(input)
        expect(decoded.id).toBe("Effect-TS-effect")
        expect(Option.isSome(decoded.lastSyncedCommit)).toBe(true)
        expect(Option.getOrNull(decoded.lastSyncedCommit)).toBe("abc123")

        const encoded = yield* Schema.encode(RepoConfig)(decoded)
        expect(encoded.id).toBe("Effect-TS-effect")
        expect(encoded.lastSyncedCommit).toBe("abc123")
      })
    )

    it.effect("handles null optional fields", () =>
      Effect.gen(function* () {
        const now = Date.now()
        const input = {
          id: "test-repo",
          url: "https://github.com/test/repo",
          localPath: "/path/to/repo",
          mode: { _tag: "pinned", ref: "v1.0.0" },
          lastSyncedCommit: null,
          lastSyncedAt: null,
          addedAt: now,
          lastPushedAt: null,
          lastPushedCommit: null
        }

        const decoded = yield* Schema.decodeUnknown(RepoConfig)(input)
        expect(Option.isNone(decoded.lastSyncedCommit)).toBe(true)
        expect(Option.isNone(decoded.lastSyncedAt)).toBe(true)
      })
    )
  })

  describe("RepoStoreData schema", () => {
    it.effect("decodes empty store", () =>
      Effect.gen(function* () {
        const input = { version: 1, repos: [] }
        const result = yield* Schema.decodeUnknown(RepoStoreData)(input)
        expect(result.version).toBe(1)
        expect(result.repos).toHaveLength(0)
      })
    )

    it.effect("decodes store with repos", () =>
      Effect.gen(function* () {
        const now = Date.now()
        const input = {
          version: 1,
          repos: [
            {
              id: "repo1",
              url: "https://github.com/test/repo1",
              localPath: "/path/repo1",
              mode: { _tag: "tracking", branch: "main" },
              lastSyncedCommit: null,
              lastSyncedAt: null,
              addedAt: now,
              lastPushedAt: null,
              lastPushedCommit: null
            }
          ]
        }

        const result = yield* Schema.decodeUnknown(RepoStoreData)(input)
        expect(result.repos).toHaveLength(1)
        expect(result.repos[0].id).toBe("repo1")
      })
    )
  })
})
