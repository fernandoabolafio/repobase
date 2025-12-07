import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { FileSystem } from "@effect/platform"
import { RepoStore } from "../src/services/RepoStore.js"
import { layer as RepoStoreLayer } from "../src/services/RepoStore.js"
import { RepoConfig, RepoStoreData, trackingMode } from "../src/schemas.js"
import * as os from "os"

/**
 * Create a mock FileSystem that stores data in memory
 */
const createMockFileSystem = (initialData: Record<string, string> = {}) => {
  const files = new Map<string, string>(Object.entries(initialData))
  const directories = new Set<string>()

  return FileSystem.FileSystem.of({
    exists: (path) => Effect.succeed(files.has(path) || directories.has(path)),
    readFileString: (path) => {
      const content = files.get(path)
      if (content === undefined) {
        return Effect.fail({
          _tag: "SystemError",
          reason: "NotFound",
          message: `File not found: ${path}`
        } as any)
      }
      return Effect.succeed(content)
    },
    writeFileString: (path, content) => {
      files.set(path, content)
      return Effect.succeed(void 0)
    },
    makeDirectory: (path, _options) => {
      directories.add(path)
      return Effect.succeed(void 0)
    },
    // Stub implementations for unused methods
    access: () => Effect.succeed(void 0),
    chmod: () => Effect.succeed(void 0),
    chown: () => Effect.succeed(void 0),
    copy: () => Effect.succeed(void 0),
    copyFile: () => Effect.succeed(void 0),
    link: () => Effect.succeed(void 0),
    makeTempDirectory: () => Effect.succeed("/tmp/test"),
    makeTempDirectoryScoped: () => Effect.succeed("/tmp/test"),
    makeTempFile: () => Effect.succeed("/tmp/test-file"),
    makeTempFileScoped: () => Effect.succeed("/tmp/test-file"),
    open: () => Effect.die("not implemented"),
    readDirectory: () => Effect.succeed([]),
    readFile: () => Effect.succeed(new Uint8Array()),
    readLink: () => Effect.succeed(""),
    realPath: (path) => Effect.succeed(path),
    remove: () => Effect.succeed(void 0),
    rename: () => Effect.succeed(void 0),
    sink: () => Effect.die("not implemented"),
    stat: () =>
      Effect.succeed({
        type: "File",
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date(),
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        dev: 0,
        ino: 0
      } as any),
    stream: () => Effect.die("not implemented"),
    symlink: () => Effect.succeed(void 0),
    truncate: () => Effect.succeed(void 0),
    utimes: () => Effect.succeed(void 0),
    watch: () => Effect.die("not implemented"),
    writeFile: () => Effect.succeed(void 0)
  })
}

/**
 * Create test layer with mock filesystem
 */
const createTestLayer = (initialData: Record<string, string> = {}) => {
  const mockFs = createMockFileSystem(initialData)
  const MockFileSystem = Layer.succeed(FileSystem.FileSystem, mockFs)
  return RepoStoreLayer.pipe(Layer.provide(MockFileSystem))
}

/**
 * Create a sample repo config for testing
 */
const createTestRepo = (id: string, overrides: Partial<RepoConfig> = {}): RepoConfig => ({
  id,
  url: `https://github.com/test/${id}`,
  localPath: `/home/user/.repobase/repos/${id}`,
  mode: trackingMode("main"),
  lastSyncedCommit: Option.none(),
  lastSyncedAt: Option.none(),
  addedAt: new Date(),
  ...overrides
})

const configPath = `${os.homedir()}/.repobase/config.json`

describe("RepoStore", () => {
  describe("load", () => {
    it.effect("returns empty store when config doesn't exist", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        const data = yield* store.load()

        expect(data.version).toBe(1)
        expect(data.repos).toHaveLength(0)
      }).pipe(Effect.provide(createTestLayer()))
    )

    it.effect("loads existing config", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        const data = yield* store.load()

        expect(data.version).toBe(1)
        expect(data.repos).toHaveLength(1)
        expect(data.repos[0].id).toBe("test-repo")
      }).pipe(
        Effect.provide(
          createTestLayer({
            [configPath]: JSON.stringify({
              version: 1,
              repos: [
                {
                  id: "test-repo",
                  url: "https://github.com/test/repo",
                  localPath: "/path/to/repo",
                  mode: { _tag: "tracking", branch: "main" },
                  lastSyncedCommit: null,
                  lastSyncedAt: null,
                  addedAt: Date.now()
                }
              ]
            })
          })
        )
      )
    )
  })

  describe("save", () => {
    it.effect("saves config data", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        const data: RepoStoreData = {
          version: 1,
          repos: []
        }

        yield* store.save(data)

        // Verify by loading
        const loaded = yield* store.load()
        expect(loaded.version).toBe(1)
      }).pipe(Effect.provide(createTestLayer()))
    )
  })

  describe("addRepo", () => {
    it.effect("adds a new repository", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        const repo = createTestRepo("new-repo")

        yield* store.addRepo(repo)

        const data = yield* store.load()
        expect(data.repos).toHaveLength(1)
        expect(data.repos[0].id).toBe("new-repo")
      }).pipe(Effect.provide(createTestLayer()))
    )

    it.effect("adds multiple repositories", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore

        yield* store.addRepo(createTestRepo("repo1"))
        yield* store.addRepo(createTestRepo("repo2"))

        const data = yield* store.load()
        expect(data.repos).toHaveLength(2)
      }).pipe(Effect.provide(createTestLayer()))
    )
  })

  describe("getRepo", () => {
    it.effect("returns None for non-existent repo", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        const result = yield* store.getRepo("non-existent")

        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(createTestLayer()))
    )

    it.effect("returns Some for existing repo", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        yield* store.addRepo(createTestRepo("my-repo"))

        const result = yield* store.getRepo("my-repo")

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value.id).toBe("my-repo")
        }
      }).pipe(Effect.provide(createTestLayer()))
    )
  })

  describe("updateRepo", () => {
    it.effect("updates existing repo", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        yield* store.addRepo(createTestRepo("update-me"))

        yield* store.updateRepo("update-me", {
          lastSyncedCommit: Option.some("abc123")
        })

        const result = yield* store.getRepo("update-me")
        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(Option.getOrNull(result.value.lastSyncedCommit)).toBe("abc123")
        }
      }).pipe(Effect.provide(createTestLayer()))
    )
  })

  describe("removeRepo", () => {
    it.effect("removes existing repo", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        yield* store.addRepo(createTestRepo("to-remove"))

        yield* store.removeRepo("to-remove")

        const result = yield* store.getRepo("to-remove")
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(createTestLayer()))
    )

    it.effect("does nothing for non-existent repo", () =>
      Effect.gen(function* () {
        const store = yield* RepoStore
        yield* store.addRepo(createTestRepo("keep-me"))

        yield* store.removeRepo("non-existent")

        const data = yield* store.load()
        expect(data.repos).toHaveLength(1)
      }).pipe(Effect.provide(createTestLayer()))
    )
  })
})
