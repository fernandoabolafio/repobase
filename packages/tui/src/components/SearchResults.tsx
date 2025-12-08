import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { SearchResult, SearchMode } from "@repobase/engine"
import { colors } from "../theme/index.js"

interface SearchResultsProps {
  query: string
  mode: SearchMode
  results: SearchResult[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  onClose: () => void
}

const getModeLabel = (mode: SearchMode): string => {
  switch (mode) {
    case "keyword": return "Keyword"
    case "semantic": return "Semantic"
    case "hybrid": return "Hybrid"
  }
}

const getScoreColor = (score: number): string => {
  const scorePercent = score * 100
  if (scorePercent > 80) return colors.score.high
  if (scorePercent > 50) return colors.score.medium
  return colors.score.low
}

export const SearchResults = ({
  query,
  mode,
  results,
  selectedIndex,
  onSelectIndex,
  onClose,
}: SearchResultsProps) => {
  useKeyboard((key) => {
    switch (key.name) {
      case "escape":
      case "q":
        onClose()
        break
      case "up":
      case "k":
        onSelectIndex(Math.max(0, selectedIndex - 1))
        break
      case "down":
      case "j":
        onSelectIndex(Math.min(results.length - 1, selectedIndex + 1))
        break
    }
  })

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
      }}
    >
      {/* Header */}
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 1,
        }}
      >
        <text
          content={`Search Results: "${query}" (${getModeLabel(mode)})`}
          style={{
            fg: colors.status.info.default,
            attributes: TextAttributes.BOLD,
          }}
        />
        <text
          content={`${results.length} result${results.length !== 1 ? "s" : ""}`}
          style={{
            fg: colors.text.secondary,
          }}
        />
      </box>

      {results.length === 0 ? (
        <box
          style={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <text
            content="No results found."
            style={{ fg: colors.text.secondary }}
          />
          <text
            content="Press [Esc] or [q] to go back."
            style={{ fg: colors.text.tertiary, marginTop: 1 }}
          />
        </box>
      ) : (
        <scrollbox
          focused
          style={{
            flexGrow: 1,
          }}
        >
          {results.map((result, index) => {
            const isSelected = index === selectedIndex
            const scorePercent = Math.round(result.score * 100)

            return (
              <box
                key={`${result.repo}:${result.path}`}
                style={{
                  flexDirection: "column",
                  backgroundColor: isSelected ? colors.accent.muted : undefined,
                  padding: 0,
                  marginBottom: 1,
                }}
              >
                {/* File path line */}
                <box style={{ flexDirection: "row" }}>
                  <text
                    content={isSelected ? "> " : "  "}
                    style={{
                      fg: isSelected ? colors.status.info.default : colors.text.tertiary,
                    }}
                  />
                  <text
                    content={result.repo}
                    style={{
                      fg: colors.text.secondary,
                    }}
                  />
                  <text
                    content="/"
                    style={{
                      fg: colors.text.muted,
                    }}
                  />
                  <text
                    content={result.path}
                    style={{
                      fg: isSelected ? colors.text.primary : colors.interactive.default,
                      attributes: isSelected ? TextAttributes.BOLD : undefined,
                    }}
                  />
                  <text
                    content={`  ${scorePercent}%`}
                    style={{
                      fg: getScoreColor(result.score),
                    }}
                  />
                </box>

                {/* Snippet line (if selected) */}
                {isSelected && result.snippet && (
                  <box style={{ marginLeft: 2, marginTop: 0 }}>
                    <text
                      content={result.snippet.replace(/\n/g, " ").slice(0, 120)}
                      style={{
                        fg: colors.text.tertiary,
                      }}
                    />
                  </box>
                )}
              </box>
            )
          })}
        </scrollbox>
      )}

      {/* Footer help */}
      <box
        style={{
          borderStyle: "single",
          borderColor: colors.border.muted,
          border: true,
          padding: 0,
          marginTop: 1,
        }}
      >
        <text
          content="[↑/k] Up  [↓/j] Down  [Esc/q] Back to list"
          style={{
            fg: colors.text.tertiary,
          }}
        />
      </box>
    </box>
  )
}
