import { spawn, ChildProcess } from "child_process"
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// PID file location for tracking the MCP server process
const PID_FILE = join(homedir(), ".repobase", "mcp-server.pid")

// Path to the MCP server entry point
const MCP_SERVER_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "mcp-server",
  "src",
  "main.ts"
)

let mcpProcess: ChildProcess | null = null

/**
 * Check if a process with the given PID is running
 */
const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Read the PID from the PID file
 */
const readPid = (): number | null => {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
      return isNaN(pid) ? null : pid
    }
  } catch {
    // Ignore errors
  }
  return null
}

/**
 * Write PID to the PID file
 */
const writePid = (pid: number): void => {
  writeFileSync(PID_FILE, pid.toString(), "utf-8")
}

/**
 * Remove the PID file
 */
const removePid = (): void => {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE)
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Check if the MCP server is currently running
 */
export const isMcpServerRunning = (): boolean => {
  // First check our local process reference
  if (mcpProcess && !mcpProcess.killed) {
    return true
  }

  // Check if there's a PID file with a running process
  const pid = readPid()
  if (pid && isProcessRunning(pid)) {
    return true
  }

  // Clean up stale PID file
  removePid()
  return false
}

/**
 * Start the MCP server as a background process
 * @returns true if server was started, false if already running
 */
export const startMcpServer = (): boolean => {
  if (isMcpServerRunning()) {
    return false
  }

  // Spawn the MCP server using bun/tsx
  mcpProcess = spawn("bun", ["run", MCP_SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    env: { ...process.env }
  })

  if (mcpProcess.pid) {
    writePid(mcpProcess.pid)
    
    // Allow the TUI to exit without killing the server
    mcpProcess.unref()
  }

  // Handle process exit
  mcpProcess.on("exit", () => {
    mcpProcess = null
    removePid()
  })

  mcpProcess.on("error", () => {
    mcpProcess = null
    removePid()
  })

  return true
}

/**
 * Stop the MCP server
 * @returns true if server was stopped, false if not running
 */
export const stopMcpServer = (): boolean => {
  // Try to stop our local process reference first
  if (mcpProcess && !mcpProcess.killed) {
    mcpProcess.kill("SIGTERM")
    mcpProcess = null
    removePid()
    return true
  }

  // Check for a running process from PID file
  const pid = readPid()
  if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, "SIGTERM")
      removePid()
      return true
    } catch {
      // Process might have died between check and kill
    }
  }

  removePid()
  return false
}

/**
 * Get the PID of the running MCP server (if any)
 */
export const getMcpServerPid = (): number | null => {
  if (mcpProcess?.pid && !mcpProcess.killed) {
    return mcpProcess.pid
  }
  
  const pid = readPid()
  if (pid && isProcessRunning(pid)) {
    return pid
  }
  
  return null
}
