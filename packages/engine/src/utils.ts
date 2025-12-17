import type { TrackingMode, PinnedMode } from "./schemas.js"

// Utility: derive repo ID from GitHub URL
// e.g., "https://github.com/Effect-TS/effect" -> "Effect-TS-effect"
export function deriveRepoId(url: string): string {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`)
  }
  return `${match[1]}-${match[2]}`
}

// Utility: create a default tracking mode
export function trackingMode(branch: string = "main"): TrackingMode {
  return { _tag: "tracking", branch }
}

// Utility: create a pinned mode
export function pinnedMode(ref: string): PinnedMode {
  return { _tag: "pinned", ref }
}
