## [1.3.0](https://github.com/fernandoabolafio/repobase/compare/v1.2.0...v1.3.0) (2025-12-25)

### Features

* **website:** add SEO optimization and social media sharing support ([0ee9c47](https://github.com/fernandoabolafio/repobase/commit/0ee9c47b6cfcc9fa2d67b82c9fa1dcc7df08f7d5))

## [1.2.0](https://github.com/fernandoabolafio/repobase/compare/v1.1.0...v1.2.0) (2025-12-25)

### Features

* **website:** add demo video to homepage ([a69984d](https://github.com/fernandoabolafio/repobase/commit/a69984d17a8be24cd46206dfaa29f66c44030368))

## [1.1.0](https://github.com/fernandoabolafio/repobase/compare/v1.0.3...v1.1.0) (2025-12-25)

### Features

* add website package with Astro and Starlight ([9e4a757](https://github.com/fernandoabolafio/repobase/commit/9e4a757c25cce505186c52c951719c8736c06da5))

### Bug Fixes

* **tui:** prevent errors on Ctrl+C exit by properly destroying renderer ([3c5f219](https://github.com/fernandoabolafio/repobase/commit/3c5f219a86711d15038d28b44fc755ed37f92649))
* **website:** correct docs routing paths to fix 404 errors ([1df7ee5](https://github.com/fernandoabolafio/repobase/commit/1df7ee52c18f414bca103aab25b2c5fa27f9c76b))

## [1.0.3](https://github.com/fernandoabolafio/repobase/compare/v1.0.2...v1.0.3) (2025-12-23)

### Bug Fixes

* resolve Bun + Effect + Vitest test suite detection issue ([3bc60fd](https://github.com/fernandoabolafio/repobase/commit/3bc60fd7497e783e775b7997fcc53028077c0dc7))

## [1.0.2](https://github.com/fernandoabolafio/repobase/compare/v1.0.1...v1.0.2) (2025-12-17)

### Refactoring

* move utility functions to utils module ([42214c5](https://github.com/fernandoabolafio/repobase/commit/42214c5eb23809af8f6e2926515bb40dbc022a3f))

## [1.0.1](https://github.com/fernandoabolafio/repobase/compare/v1.0.0...v1.0.1) (2025-12-13)

### Bug Fixes

* **ci:** add missing permissions and remove branches override ([716c7fb](https://github.com/fernandoabolafio/repobase/commit/716c7fb18e6abf8ec11b6b3e126e81124291b9d5))
* **ci:** simplify semantic-release config for main branch releases ([df68f90](https://github.com/fernandoabolafio/repobase/commit/df68f90d29b57757a73d8b9f642245ea9c524741))

## 1.0.0 (2025-12-13)

### Features

* add file exploration tools (Phase 1 & 2) ([8479c65](https://github.com/fernandoabolafio/repobase/commit/8479c658a7f0a39b687373cef8bb8721068a7748))
* add file-based logging for TUI and initialize cloud sync fields ([82ba183](https://github.com/fernandoabolafio/repobase/commit/82ba183558b715643c01eec021bcb875fc9930db))
* implement cloud sync with Cloudflare R2 and Workers API ([44f9da5](https://github.com/fernandoabolafio/repobase/commit/44f9da5ff06731b0c591c4ad697af0a3041f1fc7))
* implement distribution strategy for npm package ([92d49b9](https://github.com/fernandoabolafio/repobase/commit/92d49b92055b0655a941ffe65cd850e55310a6aa))
* **mcp-server:** add file exploration tools ([53e4e6e](https://github.com/fernandoabolafio/repobase/commit/53e4e6ead1e76c82ad7fe3ec38b6845df9627ea4))
* **tui:** add clipboard functionality to copy MCP configuration ([e652954](https://github.com/fernandoabolafio/repobase/commit/e652954f212103474f3721fde76c9f6433cd205e))

### Bug Fixes

* add limit to listFiles query to return all repositories ([83f7637](https://github.com/fernandoabolafio/repobase/commit/83f76376ee92967a3a59985263ba0db397c54ed7))
* **ci:** use 'bun run test' to invoke vitest instead of Bun's native test runner ([c4c4af2](https://github.com/fernandoabolafio/repobase/commit/c4c4af21ded6f027cd8f2d30a42aec84c5a3a6d8))
* **tui:** ensure log directory exists before writing logs ([9255aed](https://github.com/fernandoabolafio/repobase/commit/9255aed82c1d216436040ab3806f582d0233672c))
* **tui:** replace Unicode characters with ASCII-safe alternatives ([deebc7e](https://github.com/fernandoabolafio/repobase/commit/deebc7e3b5f6be71fb69f41bf3c08602024771b1))
