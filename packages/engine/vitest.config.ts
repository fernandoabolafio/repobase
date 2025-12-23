import * as path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Bun may install peer deps nested under the dependent package, which can cause
    // `@effect/vitest` to import a *different* Vitest instance than the runner.
    // Forcing a single Vitest instance fixes "Vitest failed to access its internal state"
    // and the resulting "No test suite found" failures.
    alias: [
      {
        find: /^vitest$/,
        replacement: path.resolve(__dirname, "../../node_modules/vitest/dist/index.js")
      }
    ]
  },
  test: {
    include: ["test/**/*.test.ts"],
    deps: {
      // Ensure @effect/vitest is processed by Vite so our `resolve.alias` applies.
      // Otherwise it may be loaded directly by Node from its nested node_modules,
      // causing a second Vitest instance and "No test suite found".
      inline: ["@effect/vitest"]
    },
    fakeTimers: {
      toFake: undefined
    },
    sequence: {
      concurrent: true
    }
  }
})
