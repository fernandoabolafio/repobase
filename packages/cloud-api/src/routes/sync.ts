import { Hono } from "hono"
import type { Bindings, Variables } from "../index"

export const syncRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * GET /v1/manifest
 * Get sync manifest for incremental sync
 */
syncRoutes.get("/manifest", async (c) => {
  const userId = c.get("userId")

  try {
    const manifestObject = await c.env.R2_BUCKET.get(`${userId}/manifest.json`)
    
    if (!manifestObject) {
      return c.json({
        version: 1,
        lastUpdated: null,
        files: {}
      })
    }

    const manifest = await manifestObject.json()
    return c.json(manifest)
  } catch (error) {
    console.error("Error reading manifest:", error)
    return c.json({
      version: 1,
      lastUpdated: null,
      files: {}
    })
  }
})

/**
 * PUT /v1/manifest
 * Update sync manifest
 */
syncRoutes.put("/manifest", async (c) => {
  const userId = c.get("userId")
  const body = await c.req.json()

  try {
    await c.env.R2_BUCKET.put(
      `${userId}/manifest.json`,
      JSON.stringify(body, null, 2),
      { httpMetadata: { contentType: "application/json" } }
    )

    return c.json({ updated: true })
  } catch (error) {
    console.error("Error writing manifest:", error)
    return c.json({ error: "Failed to update manifest" }, 500)
  }
})

/**
 * PUT /v1/index/*
 * Upload index files (LanceDB data files)
 */
syncRoutes.put("/index/*", async (c) => {
  const userId = c.get("userId")
  const path = c.req.path.replace("/v1/index/", "")
  
  if (!path) {
    return c.json({ error: "Path is required" }, 400)
  }

  try {
    const body = await c.req.arrayBuffer()
    
    await c.env.R2_BUCKET.put(
      `${userId}/index/${path}`,
      body,
      { httpMetadata: { contentType: "application/octet-stream" } }
    )

    return c.json({
      uploaded: true,
      path: `${userId}/index/${path}`,
      size: body.byteLength
    })
  } catch (error) {
    console.error("Error uploading file:", error)
    return c.json({ error: "Failed to upload file" }, 500)
  }
})

/**
 * DELETE /v1/index/*
 * Delete index files
 */
syncRoutes.delete("/index/*", async (c) => {
  const userId = c.get("userId")
  const path = c.req.path.replace("/v1/index/", "")
  
  if (!path) {
    return c.json({ error: "Path is required" }, 400)
  }

  try {
    await c.env.R2_BUCKET.delete(`${userId}/index/${path}`)

    return c.json({
      deleted: true,
      path: `${userId}/index/${path}`
    })
  } catch (error) {
    console.error("Error deleting file:", error)
    return c.json({ error: "Failed to delete file" }, 500)
  }
})

/**
 * GET /v1/index/*
 * Download index files
 */
syncRoutes.get("/index/*", async (c) => {
  const userId = c.get("userId")
  const path = c.req.path.replace("/v1/index/", "")
  
  if (!path) {
    return c.json({ error: "Path is required" }, 400)
  }

  try {
    const object = await c.env.R2_BUCKET.get(`${userId}/index/${path}`)
    
    if (!object) {
      return c.json({ error: "File not found" }, 404)
    }

    const body = await object.arrayBuffer()
    
    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": body.byteLength.toString()
      }
    })
  } catch (error) {
    console.error("Error downloading file:", error)
    return c.json({ error: "Failed to download file" }, 500)
  }
})

/**
 * PUT /v1/config
 * Upload user config
 */
syncRoutes.put("/config", async (c) => {
  const userId = c.get("userId")
  const body = await c.req.json()

  try {
    await c.env.R2_BUCKET.put(
      `${userId}/config.json`,
      JSON.stringify(body, null, 2),
      { httpMetadata: { contentType: "application/json" } }
    )

    return c.json({ updated: true })
  } catch (error) {
    console.error("Error writing config:", error)
    return c.json({ error: "Failed to update config" }, 500)
  }
})

/**
 * GET /v1/config
 * Get user config
 */
syncRoutes.get("/config", async (c) => {
  const userId = c.get("userId")

  try {
    const configObject = await c.env.R2_BUCKET.get(`${userId}/config.json`)
    
    if (!configObject) {
      return c.json({ version: 1, repos: [] })
    }

    const config = await configObject.json()
    return c.json(config)
  } catch (error) {
    console.error("Error reading config:", error)
    return c.json({ version: 1, repos: [] })
  }
})


