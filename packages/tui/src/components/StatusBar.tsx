import { TextAttributes } from "@opentui/core"

interface StatusBarProps {
  mode: "list" | "add" | "syncing"
  message?: string
}

export const StatusBar = ({ mode, message }: StatusBarProps) => {
  const getHelpText = () => {
    if (mode === "add") {
      return "[Enter] Confirm  [Esc] Cancel"
    }
    if (mode === "syncing") {
      return "Syncing..."
    }
    return "[a] Add  [d] Delete  [s] Sync  [S] Sync All  [q] Quit"
  }

  return (
    <box
      style={{
        padding: 1,
        borderStyle: "single",
        borderColor: "#4a4a4a",
        border: true,
        flexDirection: "column",
      }}
    >
      {message && (
        <text
          content={message}
          style={{
            fg: message.startsWith("Error") ? "#FF0000" : "#00FF00",
            marginBottom: 1,
          }}
        />
      )}
      <text
        content={getHelpText()}
        style={{
          fg: "#888888",
          attributes: TextAttributes.DIM,
        }}
      />
    </box>
  )
}
