import { TextAttributes } from "@opentui/core"

interface HeaderProps {
  version: string
}

export const Header = ({ version }: HeaderProps) => {
  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 1,
        borderStyle: "single",
        borderColor: "#4a4a4a",
        border: true,
      }}
    >
      <text
        content="repobase"
        style={{
          fg: "#00FF00",
          attributes: TextAttributes.BOLD,
        }}
      />
      <text
        content={`v${version}`}
        style={{
          fg: "#888888",
        }}
      />
    </box>
  )
}
