import { TextAttributes } from "@opentui/core"
import type { AddRepoProgress } from "@repobase/engine"
import { colors } from "../theme/index.js"

interface ProgressModalProps {
  progress: AddRepoProgress
}

/**
 * Creates a progress bar string using Unicode block characters
 */
const createProgressBar = (progress: number, width: number): string => {
  const filledWidth = Math.floor((progress / 100) * width)
  const emptyWidth = width - filledWidth
  
  // Use block characters for smooth rendering
  const filled = "█".repeat(filledWidth)
  const empty = "░".repeat(emptyWidth)
  
  return filled + empty
}

/**
 * Get color based on stage
 */
const getStageColor = (stage: AddRepoProgress["stage"]): string => {
  switch (stage) {
    case "cloning":
      return colors.progress.cloning
    case "indexing":
      return colors.progress.indexing
    case "complete":
      return colors.progress.complete
    case "error":
      return colors.progress.error
    default:
      return colors.text.primary
  }
}

/**
 * Get stage icon
 */
const getStageIcon = (stage: AddRepoProgress["stage"]): string => {
  switch (stage) {
    case "cloning":
      return "⬇"
    case "indexing":
      return "⚡"
    case "complete":
      return "✓"
    case "error":
      return "✗"
    default:
      return "•"
  }
}

export const ProgressModal = ({ progress }: ProgressModalProps) => {
  const barWidth = 40
  const progressBar = createProgressBar(progress.progress, barWidth)
  const stageColor = getStageColor(progress.stage)
  const stageIcon = getStageIcon(progress.stage)

  return (
    <box
      style={{
        position: "absolute",
        top: "30%",
        left: "10%",
        width: "80%",
        height: 10,
        backgroundColor: colors.bg.elevated,
        borderStyle: "double",
        borderColor: stageColor,
        border: true,
        flexDirection: "column",
        padding: 1,
      }}
    >
      <text
        content={`${stageIcon} Adding Repository`}
        style={{
          fg: stageColor,
          attributes: TextAttributes.BOLD,
          marginBottom: 1,
        }}
      />
      
      <text
        content={progress.message}
        style={{
          fg: colors.interactive.default,
          marginBottom: 1,
        }}
      />
      
      <box
        style={{
          flexDirection: "row",
          height: 1,
        }}
      >
        <text
          content={progressBar}
          style={{
            fg: stageColor,
          }}
        />
        <text
          content={` ${progress.progress}%`}
          style={{
            fg: colors.text.secondary,
            marginLeft: 1,
          }}
        />
      </box>
      
      {progress.filesIndexed !== undefined && (
        <text
          content={`Files indexed: ${progress.filesIndexed}`}
          style={{
            fg: colors.text.tertiary,
            marginTop: 1,
          }}
        />
      )}
      
      <text
        content={progress.stage === "complete" ? "[Enter] Continue" : "Please wait..."}
        style={{
          fg: colors.text.tertiary,
          marginTop: 1,
        }}
      />
    </box>
  )
}
