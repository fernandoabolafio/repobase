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
