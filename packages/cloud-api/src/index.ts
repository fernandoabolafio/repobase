import { Hono } from "hono"
import { cors } from "hono/cors"
import { bearerAuth } from "hono/bearer-auth"
import { searchRoutes } from "./routes/search"
import { reposRoutes } from "./routes/repos"
import { syncRoutes } from "./routes/sync"

export type Bindings = {
  R2_BUCKET: R2Bucket
  AUTH_SECRET: string
  R2_ACCESS_KEY: string
  R2_SECRET_KEY: string
  R2_ENDPOINT: string
}

export type Variables = {
  userId: string
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// CORS for all routes
app.use("/*", cors())

// Health check (public)
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }))

// Auth middleware for /v1/* routes
app.use("/v1/*", async (c, next) => {
  const auth = c.req.header("Authorization")
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  const token = auth.replace("Bearer ", "")
  
  // Simple token validation: token format is "userId:apiKey"
  // In production, use proper JWT validation or API key lookup
  const parts = token.split(":")
  if (parts.length !== 2) {
    return c.json({ error: "Invalid token format" }, 401)
  }

  const [userId, apiKey] = parts
  
  // TODO: Validate apiKey against stored keys
  // For now, just extract userId
  c.set("userId", userId)
  
  await next()
})

// Mount route groups
app.route("/v1", searchRoutes)
app.route("/v1", reposRoutes)
app.route("/v1", syncRoutes)

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404))

// Error handler
app.onError((err, c) => {
  console.error("Error:", err)
  return c.json({ error: err.message || "Internal server error" }, 500)
})

export default app

