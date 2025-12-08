import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { colors } from "../theme/index.js"

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({ message, onConfirm, onCancel }: ConfirmDialogProps) => {
  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel()
      return
    }
    
    if (key.name === "return" || key.name === "enter") {
      onConfirm()
      return
    }
  })

  return (
    <box
      style={{
        position: "absolute",
        top: "30%",
        left: "10%",
        width: "80%",
        height: 8,
        backgroundColor: colors.bg.elevated,
        borderStyle: "double",
        borderColor: colors.status.error.default,
        border: true,
        flexDirection: "column",
        padding: 1,
      }}
    >
      <text
        content="⚠ Confirm Delete"
        style={{
          fg: colors.status.error.default,
          attributes: TextAttributes.BOLD,
          marginBottom: 1,
        }}
      />
      <text
        content={message}
        style={{
          fg: colors.text.primary,
          marginBottom: 2,
        }}
      />
      <text
        content="[Enter] Confirm  [Esc] Cancel"
        style={{
          fg: colors.text.tertiary,
          marginTop: 1,
        }}
      />
    </box>
  )
}
