import { TextAttributes } from "@opentui/core"
import { colors } from "../theme/index.js"

interface StatusBarProps {
  mode: "list" | "add" | "syncing" | "search" | "results" | "adding"
  message?: string
  mcpServerRunning?: boolean
}

export const StatusBar = ({ mode, message, mcpServerRunning }: StatusBarProps) => {
  const getHelpText = () => {
    if (mode === "add" || mode === "search") {
      return "" // Help text shown in modal
    }
    if (mode === "syncing" || mode === "adding") {
      return "Processing..."
    }
    if (mode === "results") {
      return "[Esc] Back"
    }
    return "[a] Add  [d] Delete  [s] Sync  [S] Sync All  [/] Search  [m] MCP  [q] Quit"
  }

  const getMessageColor = () => {
    if (!message) return colors.text.secondary
    if (message.startsWith("Error")) return colors.status.error.default
    if (message.startsWith("✓")) return colors.status.success.default
    return colors.status.warning.default
  }

  const helpText = getHelpText()
  const mcpStatus = mcpServerRunning ? "MCP: ●" : "MCP: ○"
  const mcpColor = mcpServerRunning ? colors.status.success.default : colors.text.secondary

  return (
    <box
      style={{
        padding: 1,
        borderStyle: "single",
        borderColor: colors.border.default,
        border: true,
        flexDirection: "row",
        justifyContent: "space-between",
        height: 3,
      }}
    >
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text
          content={message || ""}
          style={{
            fg: getMessageColor(),
            attributes: message ? TextAttributes.BOLD : undefined,
          }}
        />
        <text
          content={mcpStatus}
          style={{
            fg: mcpColor,
          }}
        />
      </box>
      <text
        content={helpText}
        style={{
          fg: colors.text.secondary,
        }}
      />
    </box>
  )
}
