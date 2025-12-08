import { TextAttributes } from "@opentui/core"

interface StatusBarProps {
  mode: "list" | "add" | "syncing"
  message?: string
}

export const StatusBar = ({ mode, message }: StatusBarProps) => {
  const getHelpText = () => {
    if (mode === "add") {
      return "" // Help text shown in modal
    }
    if (mode === "syncing") {
      return "Processing..."
    }
    return "[a] Add  [d] Delete  [s] Sync  [S] Sync All  [q] Quit"
  }

  const getMessageColor = () => {
    if (!message) return "#888888"
    if (message.startsWith("Error")) return "#FF5555"
    if (message.startsWith("✓")) return "#55FF55"
    return "#FFFF55"
  }

  const helpText = getHelpText()

  return (
    <box
      style={{
        padding: 1,
        borderStyle: "single",
        borderColor: "#4a4a4a",
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
          fg: "#888888",
        }}
      />
    </box>
  )
}
