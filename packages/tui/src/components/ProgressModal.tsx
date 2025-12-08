import { TextAttributes } from "@opentui/core"
import type { AddRepoProgress } from "@repobase/engine"

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
      return "#00BFFF" // Deep sky blue
    case "indexing":
      return "#FFD700" // Gold
    case "complete":
      return "#00FF00" // Green
    case "error":
      return "#FF4444" // Red
    default:
      return "#FFFFFF"
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
        backgroundColor: "#1a1a1a",
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
          fg: "#CCCCCC",
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
            fg: "#888888",
            marginLeft: 1,
          }}
        />
      </box>
      
      {progress.filesIndexed !== undefined && (
        <text
          content={`Files indexed: ${progress.filesIndexed}`}
          style={{
            fg: "#666666",
            marginTop: 1,
          }}
        />
      )}
      
      <text
        content={progress.stage === "complete" ? "[Enter] Continue" : "Please wait..."}
        style={{
          fg: "#666666",
          marginTop: 1,
        }}
      />
    </box>
  )
}
