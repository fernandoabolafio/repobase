import { TextAttributes } from "@opentui/core"

interface AddRepoModalProps {
  onSubmit: (url: string) => void
  onCancel: () => void
  onInput: (value: string) => void
}

export const AddRepoModal = ({ onSubmit, onCancel, onInput }: AddRepoModalProps) => {
  return (
    <box
      style={{
        position: "absolute",
        top: "30%",
        left: "20%",
        width: "60%",
        height: 7,
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
          placeholder="https://github.com/owner/repo"
          onInput={onInput}
          onSubmit={onSubmit}
          focused
          style={{
            focusedBackgroundColor: "#000000",
          }}
        />
      </box>
    </box>
  )
}
