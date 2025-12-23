/**
 * TUI Feature Flags and Configuration
 * 
 * These flags control which features are enabled in the TUI.
 * Disabled features will hide their UI elements.
 */

export const featureFlags = {
  /**
   * Cloud sync is still in development.
   * When disabled, hides all cloud-related UI elements.
   */
  cloudSync: false,

  /**
   * MCP server toggle in the TUI.
   * Disabled because MCP config handles server initialization directly.
   * The TUI doesn't need to manage the MCP server lifecycle.
   */
  mcpServerToggle: false,
} as const

export type FeatureFlags = typeof featureFlags



