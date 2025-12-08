import { useKeyboard } from "@opentui/react"
import type { RepoConfig, SearchMode, SearchResult, AddRepoProgress } from "@repobase/engine"
import { initialProgress } from "@repobase/engine"
import { useCallback, useState } from "react"
import { Header, RepoList, StatusBar, AddRepoModal, SearchModal, SearchResults, ProgressModal } from "./components/index.js"

type AppMode = "list" | "add" | "syncing" | "search" | "results" | "adding"

interface AppProps {
  initialRepos: RepoConfig[]
  onAddRepo: (url: string, onProgress: (progress: AddRepoProgress) => void) => Promise<RepoConfig>
  onRemoveRepo: (id: string) => Promise<void>
  onSyncRepo: (id: string) => Promise<{ updated: boolean }>
  onSyncAll: () => Promise<Array<{ id: string; updated: boolean }>>
  onRefreshRepos: () => Promise<RepoConfig[]>
  onSearch: (query: string, mode: SearchMode) => Promise<SearchResult[]>
  onQuit: () => void
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
        showMessage(`✓ Added repository`)
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

  const handleDeleteRepo = useCallback(async () => {
    if (repos.length === 0) return
    
    const repo = repos[selectedIndex]
    setMode("syncing")
    setMessage(`Removing ${repo.id}...`)
    
    try {
      await onRemoveRepo(repo.id)
      const updatedRepos = await onRefreshRepos()
      setRepos(updatedRepos)
      setSelectedIndex(Math.max(0, selectedIndex - 1))
      showMessage(`✓ Removed ${repo.id}`)
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : "Failed to remove"}`)
    }
    
    setMode("list")
  }, [repos, selectedIndex, onRemoveRepo, onRefreshRepos, showMessage])

  const handleSyncRepo = useCallback(async () => {
    if (repos.length === 0) return
    
    const repo = repos[selectedIndex]
    setMode("syncing")
    setMessage(`Syncing ${repo.id}...`)
    
    try {
      const result = await onSyncRepo(repo.id)
      const updatedRepos = await onRefreshRepos()
      setRepos(updatedRepos)
      showMessage(result.updated ? `✓ ${repo.id} updated` : `${repo.id} already up to date`)
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
      showMessage(`✓ Synced ${results.length} repos (${updatedCount} updated)`)
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

  useKeyboard((key) => {
    // Handle escape/quit in any mode
    if (key.name === "escape" || (key.name === "q" && mode === "list")) {
      if (mode === "add" || mode === "search") {
        setMode("list")
        setInputValue("")
      } else if (mode === "results") {
        handleCloseResults()
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
        handleDeleteRepo()
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
          backgroundColor: "#0d0d0d",
        }}
      >
        <Header version="0.1.0" />
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
        backgroundColor: "#0d0d0d",
      }}
    >
      <Header version="0.1.0" />
      <RepoList repos={repos} selectedIndex={selectedIndex} />
      <StatusBar mode={mode} message={message} />
      
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
    </box>
  )
}
