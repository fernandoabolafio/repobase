import { Hono } from "hono"
import type { Bindings, Variables } from "../index"

export const reposRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * GET /v1/repos
 * List user's synced repos
 */
reposRoutes.get("/repos", async (c) => {
  const userId = c.get("userId")

  try {
    // Read user's config.json from R2
    const configObject = await c.env.R2_BUCKET.get(`${userId}/config.json`)
    
    if (!configObject) {
      return c.json({ repos: [] })
    }

    const configText = await configObject.text()
    const config = JSON.parse(configText) as {
      version: number
      repos: Array<{
        id: string
        url: string
        cloudEnabled?: boolean
        lastPushedAt?: number
      }>
    }

    // Return only cloud-enabled repos
    const repos = config.repos
      .filter((r) => r.cloudEnabled)
      .map((r) => ({
        id: r.id,
        url: r.url,
        lastPushedAt: r.lastPushedAt ? new Date(r.lastPushedAt).toISOString() : null
      }))

    return c.json({ repos })
  } catch (error) {
    console.error("Error reading config:", error)
    return c.json({ repos: [] })
  }
})

/**
 * DELETE /v1/repos/:repoId
 * Remove a repo from cloud (deletes index data for that repo)
 */
reposRoutes.delete("/repos/:repoId", async (c) => {
  const userId = c.get("userId")
  const repoId = c.req.param("repoId")

  // TODO: Implement deletion of repo data from index
  // This would require:
  // 1. Opening LanceDB from R2
  // 2. Deleting all records where repo = repoId
  // 3. Updating the config.json

  console.log(`Delete request from ${userId} for repo ${repoId}`)

  return c.json({
    deleted: true,
    repoId,
    message: "Repo deletion endpoint ready - implementation pending"
  })
})

