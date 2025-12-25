import { useKeyboard } from "@opentui/react"
import type { RepoConfig, SearchMode, SearchResult, AddRepoProgress } from "@repobase/engine"
import { initialProgress } from "@repobase/engine"
import { useCallback, useState } from "react"
import { Header, RepoList, StatusBar, AddRepoModal, SearchModal, SearchResults, ProgressModal, ConfirmDialog } from "./components/index.js"
import { colors } from "./theme/index.js"
import { featureFlags } from "./config.js"

type AppMode = "list" | "add" | "syncing" | "search" | "results" | "adding" | "confirmDelete"

interface AppProps {
  initialRepos: RepoConfig[]
  onAddRepo: (url: string, onProgress: (progress: AddRepoProgress) => void) => Promise<RepoConfig>
  onRemoveRepo: (id: string) => Promise<void>
  onSyncRepo: (id: string) => Promise<{ updated: boolean }>
  onSyncAll: () => Promise<Array<{ id: string; updated: boolean }>>
  onRefreshRepos: () => Promise<RepoConfig[]>
  onSearch: (query: string, mode: SearchMode) => Promise<SearchResult[]>
  onQuit: () => void
  cloudConfigured?: boolean
}

export const App = ({
  initialRepos,
  onAddRepo,
  onRemoveRepo,
  onSyncRepo,
  onSyncAll,
  onRefreshRepos,
  onSearch,
  onQuit,
  cloudConfigured = false,
}: AppProps) => {
  const [repos, setRepos] = useState<RepoConfig[]>(initialRepos)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<AppMode>("list")
  const [message, setMessage] = useState<string | undefined>()
  const [inputValue, setInputValue] = useState("")
  
  // Progress state for adding repos
  const [addProgress, setAddProgress] = useState<AddRepoProgress>(initialProgress)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  
  // Delete confirmation state
  const [repoToDelete, setRepoToDelete] = useState<RepoConfig | null>(null)

  const showMessage = useCallback((msg: string, duration = 3000) => {
    setMessage(msg)
    setTimeout(() => setMessage(undefined), duration)
  }, [])

  const handleAddRepo = useCallback(async (url: string) => {
    if (!url.trim()) {
      setMode("list")
      return
    }
    
    // Reset progress and show progress modal
    setAddProgress(initialProgress)
    setMode("adding")
    
    try {
      await onAddRepo(url, (progress) => {
        setAddProgress(progress)
      })
      const updatedRepos = await onRefreshRepos()
      setRepos(updatedRepos)
      // Keep showing progress modal with complete state for a moment
      setTimeout(() => {
        showMessage(`[OK] Added repository`)
        setMode("list")
      }, 500)
    } catch (error) {
      setAddProgress({
        stage: "error",
        progress: 0,
        message: error instanceof Error ? error.message : "Failed to add"
      })
      // Show error state briefly then return to list
      setTimeout(() => {
        showMessage(`Error: ${error instanceof Error ? error.message : "Failed to add"}`)
        setMode("list")
      }, 2000)
    }
    
    setInputValue("")
  }, [onAddRepo, onRefreshRepos, showMessage])

  const handleRequestDelete = useCallback(() => {
    if (repos.length === 0) return
    
    const repo = repos[selectedIndex]
    setRepoToDelete(repo)
    setMode("confirmDelete")
  }, [repos, selectedIndex])

  const handleConfirmDelete = useCallback(async () => {
    if (!repoToDelete) return
    
    setMode("syncing")
    setMessage(`Removing ${repoToDelete.id}...`)
    
    try {
      await onRemoveRepo(repoToDelete.id)
      const updatedRepos = await onRefreshRepos()
      setRepos(updatedRepos)
      setSelectedIndex(Math.max(0, selectedIndex - 1))
      showMessage(`[OK] Removed ${repoToDelete.id}`)
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : "Failed to remove"}`)
    }
    
    setRepoToDelete(null)
    setMode("list")
  }, [repoToDelete, onRemoveRepo, onRefreshRepos, showMessage, selectedIndex])

  const handleCancelDelete = useCallback(() => {
    setRepoToDelete(null)
    setMode("list")
  }, [])

  const handleSyncRepo = useCallback(async () => {
    if (repos.length === 0) return
    
    const repo = repos[selectedIndex]
    setMode("syncing")
    setMessage(`Syncing ${repo.id}...`)
    
    try {
      const result = await onSyncRepo(repo.id)
      const updatedRepos = await onRefreshRepos()
      setRepos(updatedRepos)
      showMessage(result.updated ? `[OK] ${repo.id} updated` : `${repo.id} already up to date`)
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : "Failed to sync"}`)
    }
    
    setMode("list")
  }, [repos, selectedIndex, onSyncRepo, onRefreshRepos, showMessage])

  const handleSyncAll = useCallback(async () => {
    setMode("syncing")
    setMessage("Syncing all repositories...")
    
    try {
      const results = await onSyncAll()
      const updatedRepos = await onRefreshRepos()
      setRepos(updatedRepos)
      const updatedCount = results.filter(r => r.updated).length
      showMessage(`[OK] Synced ${results.length} repos (${updatedCount} updated)`)
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : "Failed to sync"}`)
    }
    
    setMode("list")
  }, [onSyncAll, onRefreshRepos, showMessage])

  const handleSearch = useCallback(async (query: string, searchModeParam: SearchMode) => {
    if (!query.trim()) {
      setMode("list")
      return
    }
    
    setMode("syncing")
    setMessage(`Searching: "${query}"...`)
    setSearchQuery(query)
    setSearchMode(searchModeParam)
    
    try {
      const results = await onSearch(query, searchModeParam)
      setSearchResults(results)
      setSearchResultIndex(0)
      setMessage(undefined)
      setMode("results")
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : "Search failed"}`)
      setMode("list")
    }
    
    setInputValue("")
  }, [onSearch, showMessage])

  const handleCloseResults = useCallback(() => {
    setMode("list")
    setSearchResults([])
    setSearchQuery("")
    setSearchResultIndex(0)
  }, [])

  const handleCopyMcpConfig = useCallback(async () => {
    const mcpConfig = `{
  "mcpServers": {
    "repobase": {
      "command": "repobase-mcp"
    }
  }
}`
    
    try {
      // Use platform-specific clipboard command
      const platform = process.platform
      let command: string
      let args: string[]
      
      if (platform === "darwin") {
        // macOS
        command = "pbcopy"
        args = []
      } else if (platform === "linux") {
        // Linux - try xclip first, fallback to xsel
        command = "xclip"
        args = ["-selection", "clipboard"]
      } else if (platform === "win32") {
        // Windows
        command = "clip"
        args = []
      } else {
        throw new Error("Unsupported platform for clipboard")
      }
      
      const proc = Bun.spawn([command, ...args], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      })
      
      await proc.stdin.write(mcpConfig)
      proc.stdin.end()
      
      await proc.exited
      
      if (proc.exitCode !== 0) {
        // Try xsel on Linux if xclip failed
        if (platform === "linux") {
          const proc2 = Bun.spawn(["xsel", "--clipboard", "--input"], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
          })
          await proc2.stdin.write(mcpConfig)
          proc2.stdin.end()
          await proc2.exited
          
          if (proc2.exitCode !== 0) {
            throw new Error("Failed to copy to clipboard")
          }
        } else {
          throw new Error("Failed to copy to clipboard")
        }
      }
      
      showMessage("[OK] MCP configuration copied to clipboard")
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : "Failed to copy to clipboard"}`)
    }
  }, [showMessage])

  useKeyboard((key) => {
    // Handle escape/quit in any mode
    if (key.name === "escape" || (key.name === "q" && mode === "list")) {
      if (mode === "add" || mode === "search") {
        setMode("list")
        setInputValue("")
      } else if (mode === "results") {
        handleCloseResults()
      } else if (mode === "confirmDelete") {
        handleCancelDelete()
      } else if (mode === "list") {
        onQuit()
      }
      return
    }

    // Only handle navigation in list mode
    if (mode !== "list") return

    switch (key.name) {
      case "up":
      case "k":
        setSelectedIndex(Math.max(0, selectedIndex - 1))
        break
      case "down":
      case "j":
        setSelectedIndex(Math.min(repos.length - 1, selectedIndex + 1))
        break
      case "a":
        setMode("add")
        break
      case "d":
        handleRequestDelete()
        break
      case "s":
        if (key.shift) {
          handleSyncAll()
        } else {
          handleSyncRepo()
        }
        break
      case "/":
        setMode("search")
        break
      case "c":
        handleCopyMcpConfig()
        break
    }
  })

  // Render search results view
  if (mode === "results") {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: colors.bg.base,
        }}
      >
        <Header version="1.0.3" />
        <SearchResults
          query={searchQuery}
          mode={searchMode}
          results={searchResults}
          selectedIndex={searchResultIndex}
          onSelectIndex={setSearchResultIndex}
          onClose={handleCloseResults}
        />
      </box>
    )
  }

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: colors.bg.base,
      }}
    >
      <Header version="1.0.3" />
      <RepoList repos={repos} selectedIndex={selectedIndex} />
      <StatusBar 
        mode={mode} 
        message={message} 
        mcpServerRunning={false}
        cloudConfigured={featureFlags.cloudSync ? cloudConfigured : false}
        cloudPendingCount={featureFlags.cloudSync ? repos.filter(r => {
          if (!r.cloudEnabled) return false
          const localCommit = r.lastSyncedCommit ? r.lastSyncedCommit : null
          const cloudCommit = r.lastPushedCommit ? r.lastPushedCommit : null
          // Pending if cloud enabled but commits don't match
          if (localCommit === null) return false
          if (cloudCommit === null) return true
          return localCommit !== cloudCommit
        }).length : 0}
      />
      
      {mode === "add" && (
        <AddRepoModal
          onSubmit={handleAddRepo}
          onCancel={() => {
            setMode("list")
            setInputValue("")
          }}
          onInput={setInputValue}
          value={inputValue}
        />
      )}
      
      {mode === "search" && (
        <SearchModal
          onSubmit={handleSearch}
          onCancel={() => {
            setMode("list")
            setInputValue("")
          }}
          onInput={setInputValue}
          value={inputValue}
        />
      )}
      
      {mode === "adding" && (
        <ProgressModal progress={addProgress} />
      )}
      
      {mode === "confirmDelete" && repoToDelete && (
        <ConfirmDialog
          message={`Are you sure you want to delete "${repoToDelete.id}"? This action cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </box>
  )
}
