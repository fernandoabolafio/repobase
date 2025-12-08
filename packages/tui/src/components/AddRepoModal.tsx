import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"
import { colors } from "../theme/index.js"

interface PasteEvent {
  text: string
  preventDefault: () => void
}

interface AddRepoModalProps {
  onSubmit: (url: string) => void
  onCancel: () => void
  onInput: (value: string) => void
  value: string
}

export const AddRepoModal = ({ onSubmit, onCancel, onInput, value }: AddRepoModalProps) => {
  const renderer = useRenderer()
  const inputRef = useRef<InputRenderable | null>(null)

  // Listen for paste events on the renderer's keyInput
  useEffect(() => {
    const handlePaste = (event: PasteEvent) => {
      // Insert pasted text at cursor position using InputRenderable's insertText
      if (inputRef.current) {
        inputRef.current.insertText(event.text)
      }
    }

    renderer?.keyInput.on("paste", handlePaste)
    return () => {
      renderer?.keyInput.off("paste", handlePaste)
    }
  }, [renderer])

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
        borderColor: colors.accent.default,
        border: true,
        flexDirection: "column",
        padding: 1,
      }}
    >
      <text
        content="Add Repository"
        style={{
          fg: colors.accent.default,
          attributes: TextAttributes.BOLD,
          marginBottom: 1,
        }}
      />
      <box
        title="GitHub URL"
        style={{
          border: true,
          borderColor: colors.border.default,
          height: 3,
        }}
      >
        <input
          ref={(r: InputRenderable | null) => { inputRef.current = r }}
          placeholder="https://github.com/owner/repo"
          onInput={onInput}
          onSubmit={onSubmit}
          focused
          style={{
            focusedBackgroundColor: colors.bg.muted,
          }}
        />
      </box>
      <text
        content="[Enter] Confirm  [Esc] Cancel  (Paste supported)"
        style={{
          fg: colors.text.tertiary,
          marginTop: 1,
        }}
      />
    </box>
  )
}
