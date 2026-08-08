import { useEffect, useMemo, useState } from 'react'
import { Blocks, Check, Clipboard, CornerDownLeft, Play, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { getActiveTerminalId } from '../paneUtils'
import { useModalClose } from '../hooks/useModalClose'
import {
  getCommandBlocks,
  getCommandOutput,
  onCommandBlocksChanged,
  scrollToCommandBlock,
  type CommandBlock
} from '../shellIntegration'

interface Props {
  open: boolean
  onClose: () => void
}

// A command with no reported exit code and no run flag is simply unknown.
function badge(block: CommandBlock): { text: string; color: string } {
  if (block.running) return { text: '…', color: 'var(--text-muted)' }
  if (block.exitCode === undefined) return { text: '·', color: 'var(--text-muted)' }
  if (block.exitCode === 0) return { text: '0', color: 'var(--ok, #3fb950)' }
  return { text: String(block.exitCode), color: 'var(--error, #f85149)' }
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 22,
  height: 22,
  padding: '0 4px',
  background: 'transparent',
  border: '1px solid var(--border-soft)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  cursor: 'pointer'
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  const secs = ms / 1000
  if (secs < 60) return `${secs.toFixed(secs < 10 ? 1 : 0)}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${Math.round(secs % 60)}s`
}

/**
 * Warp-style command blocks. Lists the commands the shell told us
 * about (needs shell integration), newest first, with per-block actions: copy
 * command, copy output, jump to it in the buffer, or re-run it.
 */
export default function CommandBlocksPanel({ open, onClose }: Props): React.JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const nodes = useAppStore((s) => s.nodes)
  const activeNodeId = useAppStore((s) => s.activeNodeId)

  const activeNode = nodes.find((node) => node.id === activeNodeId)
  const terminalId = activeNode
    ? getActiveTerminalId(activeNode.activePaneId, activeNode.panes, activeNode.terminalId)
    : undefined

  const [blocks, setBlocks] = useState<CommandBlock[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  // Re-read on every command boundary; the list is small so a full refresh is fine.
  useEffect(() => {
    if (!open || !terminalId) {
      setBlocks([])
      return
    }
    const refresh = (): void => setBlocks(getCommandBlocks(terminalId))
    refresh()
    return onCommandBlocksChanged(terminalId, refresh)
  }, [open, terminalId])

  useModalClose(() => { if (open) onClose() })

  const flash = (key: string): void => {
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }

  const copyCommand = (block: CommandBlock): void => {
    void navigator.clipboard.writeText(block.command)
    flash(`cmd-${block.id}`)
  }
  const copyOutput = (block: CommandBlock): void => {
    if (!terminalId) return
    const out = getCommandOutput(terminalId, block.id)
    if (out) void navigator.clipboard.writeText(out)
    flash(`out-${block.id}`)
  }
  const rerun = (block: CommandBlock): void => {
    if (!terminalId) return
    window.termflow.pty.write(terminalId, `${block.command}\r`)
    onClose()
  }
  const jumpTo = (block: CommandBlock): void => {
    if (!terminalId) return
    scrollToCommandBlock(terminalId, block.id)
    onClose()
  }

  const body = useMemo(() => {
    if (!terminalId) {
      return <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No active terminal.</div>
    }
    if (!settings.shellIntegration) {
      return (
        <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>
          Shell integration is off. Enable it in Settings → Terminal to capture command blocks.
        </div>
      )
    }
    if (blocks.length === 0) {
      return <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No commands captured yet.</div>
    }
    return (
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {blocks.map((block) => {
          const b = badge(block)
          return (
            <div
              key={block.id}
              className="menu-item"
              style={{ justifyContent: 'space-between', gap: 10, alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  title={block.running ? 'running' : `exit ${block.exitCode ?? 'unknown'}`}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 20,
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: b.color,
                    border: `1px solid ${b.color}`,
                    borderRadius: 4,
                    padding: '0 4px'
                  }}
                >
                  {b.text}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono, monospace)',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={block.command}
                >
                  {block.command}
                </span>
              </span>
              <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>
                  {formatDuration(block.durationMs)}
                </span>
                <button style={iconBtn} title="Copy command" onClick={() => copyCommand(block)}>
                  {copied === `cmd-${block.id}` ? <Check size={13} /> : <Clipboard size={13} />}
                </button>
                <button style={iconBtn} title="Copy output" onClick={() => copyOutput(block)}>
                  {copied === `out-${block.id}` ? <Check size={13} /> : <span style={{ fontSize: 11 }}>out</span>}
                </button>
                <button style={iconBtn} title="Jump to in terminal" onClick={() => jumpTo(block)}>
                  <CornerDownLeft size={13} />
                </button>
                <button style={iconBtn} title="Re-run" onClick={() => rerun(block)}>
                  <Play size={13} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    )
  }, [blocks, terminalId, settings.shellIntegration, copied])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose} style={{ alignItems: 'flex-start', paddingTop: 100 }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 680, padding: 10 }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <Blocks size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Command blocks
          </span>
          <button style={iconBtn} title="Close" onClick={onClose}><X size={15} /></button>
        </h3>
        {body}
      </div>
    </div>
  )
}
