import { TextAttributes } from "@opentui/core"
import type { RepoConfig } from "@repobase/engine"
import { Option } from "effect"
import { colors } from "../theme/index.js"

interface RepoListProps {
  repos: RepoConfig[]
  selectedIndex: number
}

const formatMode = (repo: RepoConfig): string => {
  if (repo.mode._tag === "tracking") {
    return `tracking: ${repo.mode.branch}`
  }
  return `pinned: ${repo.mode.ref}`
}

const formatStatus = (repo: RepoConfig): { text: string; color: string } => {
  if (repo.mode._tag === "pinned") {
    return { text: "○ pinned", color: colors.text.secondary }
  }
  return Option.isSome(repo.lastSyncedCommit)
    ? { text: "✓ synced", color: colors.status.success.default }
    : { text: "○ pending", color: colors.status.warning.default }
}

export const RepoList = ({ repos, selectedIndex }: RepoListProps) => {
  if (repos.length === 0) {
    return (
      <box
        style={{
          flexGrow: 1,
          padding: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <text
          content="No repositories configured."
          style={{ fg: colors.text.secondary }}
        />
        <text
          content="Press [a] to add one."
          style={{ fg: colors.text.tertiary, marginTop: 1 }}
        />
      </box>
    )
  }

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
      }}
    >
      <text
        content={`Repositories (${repos.length})`}
        style={{
          fg: colors.text.primary,
          attributes: TextAttributes.BOLD,
          marginBottom: 1,
        }}
      />
      <scrollbox
        focused
        style={{
          flexGrow: 1,
        }}
      >
        {repos.map((repo, index) => {
          const isSelected = index === selectedIndex
          const status = formatStatus(repo)
          const mode = formatMode(repo)
          const prefix = isSelected ? "> " : "  "

          return (
            <box
              key={repo.id}
              style={{
                flexDirection: "row",
                backgroundColor: isSelected ? colors.bg.selected : undefined,
                padding: 0,
              }}
            >
              <text
                content={`${prefix}${repo.id.padEnd(24)} ${mode.padEnd(18)} ${status.text}`}
                style={{
                  fg: isSelected ? colors.text.primary : colors.interactive.default,
                  attributes: isSelected ? TextAttributes.BOLD : undefined,
                }}
              />
            </box>
          )
        })}
      </scrollbox>
    </box>
  )
}
