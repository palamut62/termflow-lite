import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, File, FileCode, Folder, FolderOpen, RefreshCw, X } from 'lucide-react'
import type { DirEntry, DirListing } from '../../../shared/ipc'
import { useFilePanelStore } from '../store/filePanelStore'
import { useTerminalStore } from '../store/terminalStore'
import { useToastStore } from '../store/toastStore'
import { folderName, matchesFilter, opensInEditor, quotePath } from './filePanelModel'

/** Opens a file: code and text in the editor, anything else in its default app (executables are only revealed). */
async function openFile(entry: DirEntry): Promise<void> {
  const ok = opensInEditor(entry.name)
    ? await window.termflow.system.openInEditor(entry.path, 1)
    : await window.termflow.system.openPath(entry.path)
  if (!ok) useToastStore.getState().show(`Could not open ${entry.name}.`, 'error')
}

interface MenuState {
  x: number
  y: number
  entry: DirEntry
}

/**
 * The files of the active tab's folder, docked on the right. It follows the
 * tab's working directory (shell integration reports every cd), reads one
 * folder level at a time and opens files on double click.
 */
export function FilePanel(): React.JSX.Element | null {
  const open = useFilePanelStore((s) => s.open)
  const showHidden = useFilePanelStore((s) => s.showHidden)
  const filter = useFilePanelStore((s) => s.filter)
  const cwd = useTerminalStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.cwd || tab?.launchCwd || ''
  })
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const [selected, setSelected] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  if (!open) return null
  const store = useFilePanelStore.getState()

  const menuAction = (action: () => void | Promise<unknown>): (() => void) => () => {
    setMenu(null)
    void action()
  }
  const copyPath = async (entry: DirEntry): Promise<void> => {
    if (await window.termflow.clipboard.writeText(entry.path)) useToastStore.getState().show('Path copied.', 'success')
  }
  // Typed into the terminal without Enter, so it works for a shell and an agent prompt alike.
  const insertPath = (entry: DirEntry): void => {
    if (activeTabId) window.termflow.pty.write(activeTabId, `${quotePath(entry.path)} `)
  }

  return (
    <aside className="file-panel" aria-label="Files">
      <header className="file-panel-head">
        <span className="file-panel-title" title={cwd}>{cwd ? folderName(cwd) : 'Files'}</span>
        <button className="file-panel-icon" onClick={() => store.setShowHidden(!showHidden)} title={showHidden ? 'Hide hidden files' : 'Show hidden files (.git, node_modules, dotfiles)'} aria-pressed={showHidden}>
          {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button className="file-panel-icon" onClick={() => store.refresh()} title="Refresh" aria-label="Refresh"><RefreshCw size={13} /></button>
        <button className="file-panel-icon" onClick={() => store.hide()} title="Close (Ctrl+Shift+E)" aria-label="Close files"><X size={13} /></button>
      </header>
      <input
        className="file-panel-filter"
        value={filter}
        placeholder="Filter files"
        aria-label="Filter files"
        spellCheck={false}
        onChange={(e) => store.setFilter(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') store.setFilter('') }}
      />
      <div className="file-panel-tree" role="tree" aria-label={cwd}>
        {cwd
          ? <FolderLevel path={cwd} depth={0} selected={selected} onSelect={setSelected} onMenu={setMenu} />
          : <div className="file-panel-note">This tab has no folder yet.</div>}
      </div>
      {menu && (
        <div className="ctx-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 170) }} onMouseDown={(e) => e.stopPropagation()}>
          {!menu.entry.isDirectory && <button className="ctx-menu-item" role="menuitem" onClick={menuAction(() => openFile(menu.entry))}>Open</button>}
          <button className="ctx-menu-item" role="menuitem" onClick={menuAction(() => window.termflow.system.revealInFolder(menu.entry.path))}>Reveal in Explorer</button>
          <button className="ctx-menu-item" role="menuitem" onClick={menuAction(() => copyPath(menu.entry))}>Copy path</button>
          <button className="ctx-menu-item" role="menuitem" disabled={!activeTabId} onClick={menuAction(() => insertPath(menu.entry))}>Insert path into terminal</button>
        </div>
      )}
    </aside>
  )
}

interface LevelProps {
  path: string
  depth: number
  selected: string
  onSelect(path: string): void
  onMenu(menu: MenuState): void
}

/** One folder's entries; expanded subfolders render their own level below their row. */
function FolderLevel({ path, depth, selected, onSelect, onMenu }: LevelProps): React.JSX.Element {
  const showHidden = useFilePanelStore((s) => s.showHidden)
  const revision = useFilePanelStore((s) => s.revision)
  const filter = useFilePanelStore((s) => s.filter)
  const expanded = useFilePanelStore((s) => s.expanded)
  const [listing, setListing] = useState<DirListing | null | undefined>(undefined)
  const latest = useRef(0)

  useEffect(() => {
    // Only the newest request may answer, so a quick cd never shows an old folder.
    const request = ++latest.current
    void window.termflow.files.list(path, showHidden).then((result) => {
      if (request === latest.current) setListing(result)
    })
  }, [path, showHidden, revision])

  const indent = { paddingLeft: 8 + depth * 14 }
  if (listing === undefined) return <div className="file-panel-note" style={indent}>Loading...</div>
  if (listing === null) return <div className="file-panel-note" style={indent}>Cannot read this folder.</div>
  const entries = listing.entries.filter((e) => matchesFilter(e.name, e.isDirectory, filter))
  if (entries.length === 0) return <div className="file-panel-note" style={indent}>{listing.entries.length ? 'No matches.' : 'Empty folder.'}</div>

  return (
    <>
      {entries.map((entry) => {
        const isOpen = entry.isDirectory && expanded.has(entry.path)
        const Icon = entry.isDirectory ? (isOpen ? FolderOpen : Folder) : opensInEditor(entry.name) ? FileCode : File
        const activate = (): void => {
          if (entry.isDirectory) useFilePanelStore.getState().toggleExpanded(entry.path)
          else void openFile(entry)
        }
        return (
          <div key={entry.path} role="none">
            <button
              className={`file-row${selected === entry.path ? ' file-row-selected' : ''}${entry.isDirectory ? ' file-row-dir' : ''}`}
              style={indent}
              role="treeitem"
              aria-expanded={entry.isDirectory ? isOpen : undefined}
              aria-selected={selected === entry.path}
              title={entry.path}
              onClick={() => {
                onSelect(entry.path)
                // A folder opens with one click; a file waits for the double click.
                if (entry.isDirectory) useFilePanelStore.getState().toggleExpanded(entry.path)
              }}
              onDoubleClick={() => { if (!entry.isDirectory) void openFile(entry) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); activate() } }}
              onContextMenu={(e) => {
                e.preventDefault()
                onSelect(entry.path)
                onMenu({ x: e.clientX, y: e.clientY, entry })
              }}
            >
              <span className="file-row-chevron">{entry.isDirectory ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
              <Icon size={14} className="file-row-icon" />
              <span className="file-row-name">{entry.name}</span>
            </button>
            {isOpen && <FolderLevel path={entry.path} depth={depth + 1} selected={selected} onSelect={onSelect} onMenu={onMenu} />}
          </div>
        )
      })}
      {listing.truncated && <div className="file-panel-note" style={indent}>Showing the first {listing.entries.length} entries.</div>}
    </>
  )
}
