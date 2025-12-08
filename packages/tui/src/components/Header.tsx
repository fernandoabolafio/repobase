import { TextAttributes } from "@opentui/core"
import { colors } from "../theme/index.js"

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
        borderColor: colors.border.default,
        border: true,
      }}
    >
      <text
        content="repobase"
        style={{
          fg: colors.accent.default,
          attributes: TextAttributes.BOLD,
        }}
      />
      <text
        content={`v${version}`}
        style={{
          fg: colors.text.secondary,
        }}
      />
    </box>
  )
}
