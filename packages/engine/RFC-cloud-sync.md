# RFC: Cloud Sync for Repobase

## Overview

Cloud sync enables users to synchronize their indexed repositories to a remote backend, allowing access from multiple devices (desktop, mobile) and providing a foundation for future AI-powered workflows.

## Goals

1. **Sync local index to cloud** - Upload indexed file records (metadata + embeddings) to a remote store
2. **Multi-device access** - Query the same context from any device
3. **Opt-in** - Cloud sync is optional; local-first remains the default
4. **Incremental sync** - Only upload changes, not full re-uploads
5. **Search via API** - Expose search capabilities via HTTP for mobile/web clients

## Non-Goals (v1)

- Real-time collaboration
- Syncing actual git repositories (only index data)
- Conflict resolution between devices (last-write-wins for v1)
- End-to-end encryption (relies on transport-level TLS)
- Private repo authentication (public repos only)

---

## Architecture

**Symmetric Design: LanceDB on Cloudflare R2**

The key insight is that LanceDB natively supports S3-compatible object storage. Each user gets their own "bucket" in the cloud that mirrors their local index structure exactly.

```
Local Device                              Cloud (Cloudflare R2)
~/.repobase/                              repobase-data/{userId}/
├── config.json       ─── sync ───▶       ├── config.json
├── cloud.json                            ├── manifest.json
├── index/                                └── index/
│   └── files.lance/  ─── sync ───▶           └── files.lance/
└── repos/                                        (same format!)

                         │
                         ▼
              ┌─────────────────────────┐
              │  Hono API (CF Worker)   │
              │                         │
              │  POST /v1/search        │ ◀── Mobile/Web clients
              │  GET  /v1/repos         │
              │  PUT  /v1/index/*       │
              │  GET  /v1/manifest      │
              └─────────────────────────┘
```

### Why Symmetric R2 Architecture?

| Aspect      | R2 + LanceDB     | Managed Vector DB  |
| ----------- | ---------------- | ------------------ |
| Cost        | ~$0.01/user/mo   | $0.10+/user/mo     |
| Data format | Same as local    | Vendor lock-in     |
| Complexity  | Simple file sync | API integration    |
| Portability | Full             | Requires migration |

---

## Data Model

### Extended RepoConfig (Local)

```typescript
// Add cloud sync metadata to existing RepoConfig
const CloudSyncMetadata = Schema.Struct({
  lastPushedAt: Schema.OptionFromNullOr(Schema.DateFromNumber),
  lastPushedCommit: Schema.OptionFromNullOr(Schema.String),
  cloudEnabled: Schema.Boolean, // Per-repo opt-in
});

// Extended config stored locally
const RepoConfigWithCloud = Schema.extend(RepoConfig, CloudSyncMetadata);
```

### Cloud File Record

```typescript
// What gets stored in the cloud vector DB
interface CloudFileRecord {
  id: string; // "{userId}:{repoId}:{path}"
  userId: string; // User identifier
  repoId: string; // Repository ID
  path: string; // File path
  filename: string;
  contents: string; // File contents (truncated)
  hash: string; // For deduplication
  vector: number[]; // Embedding (384 dims)
  pushedAt: number; // Timestamp
}
```

### User Config (Local)

```typescript
// New file: ~/.repobase/cloud.json
const CloudConfig = Schema.Struct({
  userId: Schema.String, // Unique user identifier
  apiKey: Schema.OptionFromNullOr(Schema.String),
  endpoint: Schema.String, // API base URL
  enabled: Schema.Boolean, // Global cloud sync toggle
});
```

---

## CloudSync Service

```typescript
export interface CloudSyncService {
  // Configuration
  readonly configure: (
    config: CloudConfigInput
  ) => Effect.Effect<void, CloudError>;
  readonly getConfig: () => Effect.Effect<CloudConfig, CloudError>;
  readonly isEnabled: () => Effect.Effect<boolean, CloudError>;

  // Sync operations
  readonly push: (repoId: string) => Effect.Effect<PushResult, CloudError>;
  readonly pushAll: () => Effect.Effect<PushResult[], CloudError>;
  readonly remove: (repoId: string) => Effect.Effect<void, CloudError>;

  // Status
  readonly getStatus: (repoId: string) => Effect.Effect<SyncStatus, CloudError>;
  readonly listSynced: () => Effect.Effect<SyncedRepo[], CloudError>;
}

interface PushResult {
  repoId: string;
  filesUploaded: number;
  filesSkipped: number; // Already in sync
  durationMs: number;
}

interface SyncStatus {
  repoId: string;
  inSync: boolean;
  localCommit: Option<string>;
  cloudCommit: Option<string>;
  lastPushedAt: Option<Date>;
}
```

---

## Sync Strategy

### Push Flow (Local → Cloud)

```
1. Check if cloud sync is enabled (global + per-repo)
2. Read local config to get lastPushedCommit
3. If lastPushedCommit matches lastSyncedCommit → already in sync, skip
4. Query local LanceDB for all file records for this repo
5. Batch upload to cloud API (chunks of 100 records)
6. Update local config with new lastPushedAt/lastPushedCommit
```

### Incremental Sync (Optimization)

```
1. Compare lastPushedCommit with lastSyncedCommit
2. If different, get changed files via git diff (already have this)
3. Only upload changed file records
4. Delete removed files from cloud
```

### Conflict Handling (v1: Last-Write-Wins)

- No merge logic for v1
- Each device can push independently
- Cloud stores the latest version
- Future: track device IDs and implement proper sync

---

## API Design

### Authentication

```
Authorization: Bearer <api_key>
X-User-ID: <user_id>
```

Simple API key auth for v1. Future: OAuth with proper user accounts.

### Endpoints

```http
# Configure/verify connection
GET /v1/whoami
Response: { userId, plan, quotaUsed, quotaLimit }

# Push file records for a repo
POST /v1/repos/:repoId/sync
Body: {
  commit: string,
  records: CloudFileRecord[],
  deletedPaths?: string[]
}
Response: { uploaded: number, deleted: number }

# Search across all synced repos
GET /v1/search?q=<query>&mode=<keyword|semantic|hybrid>&limit=20
Response: { results: SearchResult[] }

# List synced repos
GET /v1/repos
Response: { repos: [{ id, fileCount, lastSyncedAt }] }

# Remove repo from cloud
DELETE /v1/repos/:repoId
Response: { deleted: true }

# Get specific file content
GET /v1/repos/:repoId/files/:path
Response: { contents, path, ... }
```

---

## Cloud Backend: Cloudflare R2 + Hono

**Chosen approach:** Symmetric LanceDB files on Cloudflare R2 with a Hono API for querying.

### Why This Approach?

1. **Same format** - LanceDB files are identical locally and in cloud
2. **Very cheap** - R2 is $0.015/GB/month with free egress to Workers
3. **Simple sync** - Just upload/download files, no schema translation
4. **Portable** - Can switch providers, data is standard Lance format
5. **Hono familiarity** - Fast, TypeScript-native, works great on CF Workers

### Project Structure

```
packages/cloud-api/
├── src/
│   ├── index.ts           # Main Hono app
│   ├── routes/
│   │   ├── search.ts      # POST /v1/search
│   │   ├── repos.ts       # GET /v1/repos, DELETE /v1/repos/:id
│   │   └── sync.ts        # PUT/DELETE /v1/index/*, GET /v1/manifest
│   └── middleware/
│       └── auth.ts        # Bearer token validation
├── wrangler.toml
└── package.json
```

---

## Security Considerations

1. **API Keys** - Stored locally in `~/.repobase/cloud.json`, never committed
2. **Transport** - HTTPS only
3. **Data at rest** - Rely on cloud provider encryption
4. **User isolation** - All records prefixed with userId, queries filtered by userId
5. **Rate limiting** - Cloud API should rate limit per userId
6. **Content filtering** - Consider filtering sensitive files before upload (future)

---

## Implementation Plan

### Phase 1: Local Foundation (DONE)

1. [x] Add `cloudEnabled`, `lastPushedAt`, `lastPushedCommit` to RepoConfig schema
2. [x] Add CloudConfig and SyncManifest schemas
3. [x] Implement CloudSync service with push/pull/status/enableRepo/disableRepo

### Phase 2: Cloud API (DONE)

4. [x] Create `packages/cloud-api/` with Hono
5. [x] Implement routes: /search, /repos, /manifest, /index/\*, /config
6. [x] Add wrangler.toml for Cloudflare Workers deployment

### Phase 3: Client Integration (DONE)

7. [x] Add CLI commands: `repobase cloud login/logout/status/enable/disable/push/pull`
8. [x] Integrate into TUI with cloud status indicator in StatusBar
9. [x] Show cloud sync icon per repo in RepoList

### Phase 4: Incremental Sync (TODO)

10. [ ] Implement manifest-based incremental sync (checksum comparison)
11. [ ] Wire up actual HTTP calls in CloudSync service
12. [ ] Add LanceDB query support in cloud-api Worker

### Phase 5: Mobile Client (Future)

13. [ ] React Native or web app with search UI
14. [ ] Chat interface with RAG
15. [ ] Push notifications for agent task results

---

## CLI / TUI Integration

### CLI Commands

```bash
# Configure cloud sync
repobase cloud login
repobase cloud logout
repobase cloud status

# Push to cloud
repobase push <repo-id>     # Push specific repo
repobase push --all         # Push all enabled repos

# Enable/disable per repo
repobase cloud enable <repo-id>
repobase cloud disable <repo-id>
```

### TUI Additions

```
Status bar: "☁️ Synced" or "☁️ 2 pending" indicator
Repo list: Cloud sync icon per repo
New modal: Cloud settings (API key, enable/disable)
```

---

## Open Questions

1. **User identity** - How do users sign up/get API keys?

   - Option A: Simple API key generation on website
   - Option B: GitHub OAuth (reuse existing GitHub login)
   - _Recommendation_: Start with GitHub OAuth since we're GitHub-focused

2. **Quota/pricing** - How much storage per user?

   - Start generous (e.g., 10 repos, 100k files)
   - Add paid tiers later

3. **Embedding recomputation** - Do we recompute embeddings on cloud or trust local?

   - _Recommendation_: Trust local embeddings (same model), saves compute costs

4. **Private repos** - When to add support?

   - Requires OAuth flow with GitHub for token
   - Add in Phase 5 with mobile client

5. **Offline mobile** - Cache subset of index on device?
   - Complex, punt to future version

---

## Success Metrics

- Users with cloud sync enabled
- Repos synced to cloud
- Search queries from mobile/web
- Sync latency (time from local change to cloud availability)
- API error rates
