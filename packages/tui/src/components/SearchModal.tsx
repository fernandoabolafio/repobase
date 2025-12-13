import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useRenderer, useKeyboard } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import type { SearchMode } from "@repobase/engine"
import { colors } from "../theme/index.js"

interface PasteEvent {
  text: string
  preventDefault: () => void
}

interface SearchModalProps {
  onSubmit: (query: string, mode: SearchMode) => void
  onCancel: () => void
  onInput: (value: string) => void
  value: string
}

const SEARCH_MODES: { mode: SearchMode; label: string; description: string }[] = [
  { mode: "keyword", label: "Keyword", description: "Full-text search (BM25)" },
  { mode: "semantic", label: "Semantic", description: "AI-powered meaning search" },
  { mode: "hybrid", label: "Hybrid", description: "Combined keyword + semantic" },
]

export const SearchModal = ({ onSubmit, onCancel, onInput, value }: SearchModalProps) => {
  const renderer = useRenderer()
  const inputRef = useRef<InputRenderable | null>(null)
  const [selectedModeIndex, setSelectedModeIndex] = useState(2) // Default to hybrid
  const [inputFocused, setInputFocused] = useState(true)

  // Listen for paste events on the renderer's keyInput
  useEffect(() => {
    const handlePaste = (event: PasteEvent) => {
      if (inputRef.current && inputFocused) {
        inputRef.current.insertText(event.text)
      }
    }

    renderer?.keyInput.on("paste", handlePaste)
    return () => {
      renderer?.keyInput.off("paste", handlePaste)
    }
  }, [renderer, inputFocused])

  // Handle keyboard navigation for mode selection
  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel()
      return
    }

    if (key.name === "tab") {
      // Tab switches between input and mode selection
      setInputFocused(!inputFocused)
      return
    }

    if (!inputFocused) {
      // Mode selection navigation
      switch (key.name) {
        case "left":
        case "h":
          setSelectedModeIndex(Math.max(0, selectedModeIndex - 1))
          break
        case "right":
        case "l":
          setSelectedModeIndex(Math.min(SEARCH_MODES.length - 1, selectedModeIndex + 1))
          break
        case "return":
          if (value.trim()) {
            onSubmit(value, SEARCH_MODES[selectedModeIndex].mode)
          }
          break
      }
    }
  })

  const handleSubmit = (query: string) => {
    if (query.trim()) {
      onSubmit(query, SEARCH_MODES[selectedModeIndex].mode)
    }
  }

  return (
    <box
      style={{
        position: "absolute",
        top: "20%",
        left: "10%",
        width: "80%",
        height: 12,
        backgroundColor: colors.bg.elevated,
        borderStyle: "double",
        borderColor: colors.status.info.default,
        border: true,
        flexDirection: "column",
        padding: 1,
      }}
    >
      <text
        content="Search Repositories"
        style={{
          fg: colors.status.info.default,
          attributes: TextAttributes.BOLD,
          marginBottom: 1,
        }}
      />
      <box
        title="Search Query"
        style={{
          border: true,
          borderColor: inputFocused ? colors.status.info.default : colors.border.default,
          height: 3,
        }}
      >
        <input
          ref={(r: InputRenderable | null) => { inputRef.current = r }}
          placeholder="Enter search query..."
          onInput={onInput}
          onSubmit={handleSubmit}
          focused={inputFocused}
          style={{
            focusedBackgroundColor: colors.bg.muted,
          }}
        />
      </box>
      
      {/* Mode selection */}
      <box
        style={{
          flexDirection: "row",
          marginTop: 1,
          gap: 2,
        }}
      >
        <text
          content="Mode: "
          style={{ fg: colors.text.secondary }}
        />
        {SEARCH_MODES.map((item, index) => {
          const isSelected = index === selectedModeIndex
          return (
            <text
              key={item.mode}
              content={`[${isSelected ? "*" : "o"}] ${item.label}`}
              style={{
                fg: isSelected ? colors.status.info.default : colors.text.tertiary,
                attributes: isSelected ? TextAttributes.BOLD : undefined,
              }}
            />
          )
        })}
      </box>
      
      <text
        content={SEARCH_MODES[selectedModeIndex].description}
        style={{
          fg: colors.text.muted,
          marginTop: 0,
        }}
      />
      
      <text
        content="[Enter] Search  [Tab] Switch focus  [h/l] Change mode  [Esc] Cancel"
        style={{
          fg: colors.text.tertiary,
          marginTop: 1,
        }}
      />
    </box>
  )
}
