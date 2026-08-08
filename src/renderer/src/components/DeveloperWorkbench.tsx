import { ArrowLeft, Check, File, Folder, GitBranch, History, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GitWorkbenchState, WorkspaceFileEntry } from '../../../shared/types'
import { clearCommandHistory, readCommandHistory } from '../commandHistory'
import { useAppStore } from '../store/appStore'
import { useModalClose } from '../hooks/useModalClose'

type Tab = 'files' | 'history' | 'git'

export default function DeveloperWorkbench({ onClose }: { onClose: () => void }): React.JSX.Element {
  const workspaceId = useAppStore((s) => s.activeWorkspaceId)!
  const workspace = useAppStore((s) => s.workspaces.find((item) => item.id === workspaceId))!
  const [tab, setTab] = useState<Tab>('files')
  const [path, setPath] = useState(workspace.path)
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([])
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null)
  const [git, setGit] = useState<GitWorkbenchState | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const history = useMemo(() => readCommandHistory(workspaceId), [workspaceId, tab])

  const loadFiles = async (dir = path): Promise<void> => { try { setFiles(await window.termflow.files.list(workspaceId, dir)); setPath(dir); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Cannot list folder') } }
  const loadGit = async (): Promise<void> => { try { setGit(await window.termflow.git.workbench(workspace.path)); setSelected([]); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Git repository is unavailable') } }
  useEffect(() => { void loadFiles(workspace.path) }, [workspaceId])
  useEffect(() => { if (tab === 'git') void loadGit() }, [tab])
  const changedPaths = git?.status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean) ?? []
  useModalClose(onClose)

  return <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}><div className="modal workbench" onMouseDown={(e) => e.stopPropagation()}>
    <header className="workbench-head"><div><h3>Developer Workbench</h3><span>{workspace.path}</span></div><button className="hbtn" onClick={onClose}><X size={16} /></button></header>
    <nav className="workbench-tabs"><button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><Folder size={14} />Files</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={14} />Command history</button><button className={tab === 'git' ? 'active' : ''} onClick={() => setTab('git')}><GitBranch size={14} />Git</button></nav>
    {error && <div className="side-error">{error}</div>}
    {tab === 'files' && <div className="workbench-files"><aside><div className="file-path"><button className="hbtn" disabled={path === workspace.path} onClick={() => loadFiles(path.replace(/[\\/][^\\/]+$/, '') || workspace.path)}><ArrowLeft size={14} /></button><span>{path}</span></div>{files.map((item) => <button key={item.path} onClick={async () => { if (item.directory) void loadFiles(item.path); else try { setPreview({ path: item.path, text: await window.termflow.files.readText(workspaceId, item.path) }) } catch (e) { setError(e instanceof Error ? e.message : 'Cannot preview file') } }}>{item.directory ? <Folder size={14} /> : <File size={14} />}<span>{item.name}</span><em>{item.directory ? '' : `${Math.ceil(item.size / 1024)} KB`}</em></button>)}</aside><article>{preview ? <><header>{preview.path}</header><pre>{preview.text}</pre></> : <div className="workbench-empty">Select a text file to preview it.</div>}</article></div>}
    {tab === 'history' && <div className="history-pane"><div className="history-actions"><span>{history.length} captured commands</span><button className="btn" onClick={() => { clearCommandHistory(workspaceId); setTab('files'); queueMicrotask(() => setTab('history')) }}><Trash2 size={13} />Clear</button></div>{history.map((entry, index) => <button key={`${entry.createdAt}:${index}`} onClick={() => navigator.clipboard.writeText(entry.command)}><code>{entry.command}</code><span>{entry.cwd}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></button>)}</div>}
    {tab === 'git' && git && !git.isRepo && <div className="workbench-empty" style={{ padding: 24 }}>This folder is not a Git repository.<br /><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{workspace.path}</span><br /><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Set the workspace path to a git repository or run <code>git init</code> in this folder to use Git features.</span></div>}
    {tab === 'git' && git?.isRepo && <div className="git-workbench"><aside><div className="git-title"><strong>{git?.branch || 'Git'}</strong><button className="hbtn" onClick={loadGit}><RefreshCw size={14} /></button></div>{changedPaths.map((file) => <label key={file}><input type="checkbox" checked={selected.includes(file)} onChange={(e) => setSelected((items) => e.target.checked ? [...items, file] : items.filter((item) => item !== file))} /><span>{file}</span></label>)}<div className="git-actions"><button className="btn" disabled={!selected.length} onClick={async () => { await window.termflow.git.stage(workspace.path, selected); await loadGit() }}>Stage</button><button className="btn" disabled={!selected.length} onClick={async () => { await window.termflow.git.unstage(workspace.path, selected); await loadGit() }}>Unstage</button></div><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message" /><button className="btn primary" disabled={!message.trim()} onClick={async () => { const res = await window.termflow.git.commit(workspace.path, message); if (!res.ok) { setError(res.message); return } setMessage(''); await loadGit() }}><Check size={13} />Commit staged</button></aside><pre>{git?.diff || 'No unstaged diff.'}</pre></div>}
  </div></div>
}
