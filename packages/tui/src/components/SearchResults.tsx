import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { SearchResult, SearchMode } from "@repobase/engine"

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
            fg: "#00AAFF",
            attributes: TextAttributes.BOLD,
          }}
        />
        <text
          content={`${results.length} result${results.length !== 1 ? "s" : ""}`}
          style={{
            fg: "#888888",
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
            style={{ fg: "#888888" }}
          />
          <text
            content="Press [Esc] or [q] to go back."
            style={{ fg: "#666666", marginTop: 1 }}
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
                  backgroundColor: isSelected ? "#1a2a3a" : undefined,
                  padding: 0,
                  marginBottom: 1,
                }}
              >
                {/* File path line */}
                <box style={{ flexDirection: "row" }}>
                  <text
                    content={isSelected ? "> " : "  "}
                    style={{
                      fg: isSelected ? "#00AAFF" : "#666666",
                    }}
                  />
                  <text
                    content={result.repo}
                    style={{
                      fg: "#888888",
                    }}
                  />
                  <text
                    content="/"
                    style={{
                      fg: "#444444",
                    }}
                  />
                  <text
                    content={result.path}
                    style={{
                      fg: isSelected ? "#FFFFFF" : "#CCCCCC",
                      attributes: isSelected ? TextAttributes.BOLD : undefined,
                    }}
                  />
                  <text
                    content={`  ${scorePercent}%`}
                    style={{
                      fg: scorePercent > 80 ? "#55FF55" : scorePercent > 50 ? "#FFFF55" : "#FF8855",
                    }}
                  />
                </box>

                {/* Snippet line (if selected) */}
                {isSelected && result.snippet && (
                  <box style={{ marginLeft: 2, marginTop: 0 }}>
                    <text
                      content={result.snippet.replace(/\n/g, " ").slice(0, 120)}
                      style={{
                        fg: "#666666",
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
          borderColor: "#333333",
          border: true,
          padding: 0,
          marginTop: 1,
        }}
      >
        <text
          content="[↑/k] Up  [↓/j] Down  [Esc/q] Back to list"
          style={{
            fg: "#666666",
          }}
        />
      </box>
    </box>
  )
}
