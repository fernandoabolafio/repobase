import { TextAttributes } from "@opentui/core"
import { colors } from "../theme/index.js"

interface StatusBarProps {
  mode: "list" | "add" | "syncing" | "search" | "results" | "adding"
  message?: string
}

export const StatusBar = ({ mode, message }: StatusBarProps) => {
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
    return "[a] Add  [d] Delete  [s] Sync  [S] Sync All  [/] Search  [q] Quit"
  }

  const getMessageColor = () => {
    if (!message) return colors.text.secondary
    if (message.startsWith("Error")) return colors.status.error.default
    if (message.startsWith("✓")) return colors.status.success.default
    return colors.status.warning.default
  }

  const helpText = getHelpText()

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
      <text
        content={message || ""}
        style={{
          fg: getMessageColor(),
          attributes: message ? TextAttributes.BOLD : undefined,
        }}
      />
      <text
        content={helpText}
        style={{
          fg: colors.text.secondary,
        }}
      />
    </box>
  )
}
