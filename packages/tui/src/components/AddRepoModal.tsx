import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"

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
        backgroundColor: "#1a1a1a",
        borderStyle: "double",
        borderColor: "#00FF00",
        border: true,
        flexDirection: "column",
        padding: 1,
      }}
    >
      <text
        content="Add Repository"
        style={{
          fg: "#00FF00",
          attributes: TextAttributes.BOLD,
          marginBottom: 1,
        }}
      />
      <box
        title="GitHub URL"
        style={{
          border: true,
          borderColor: "#4a4a4a",
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
            focusedBackgroundColor: "#000000",
          }}
        />
      </box>
      <text
        content="[Enter] Confirm  [Esc] Cancel  (Paste supported)"
        style={{
          fg: "#666666",
          marginTop: 1,
        }}
      />
    </box>
  )
}
