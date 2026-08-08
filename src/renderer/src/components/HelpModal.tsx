import { Bot, Coffee, FolderOpen, Grid2X2, HeartPulse, Info, Keyboard, Radio, Search, Settings, TerminalSquare, X, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useModalClose } from '../hooks/useModalClose'
import { APP_VERSION, CHANGELOG, DEVELOPER } from '../appInfo'

interface HelpTopic {
  id: string
  category: string
  title: string
  summary: string
  steps: string[]
  notes?: string[]
}

const topics: HelpTopic[] = [
  { id: 'workspace', category: 'Getting started', title: 'Create and open a workspace', summary: 'A workspace keeps windows, terminals, snippets, providers, and developer settings together.', steps: ['Choose New Workspace in the sidebar.', 'Select the project folder and enter a workspace name.', 'Reopen the workspace from the sidebar whenever you return.'], notes: ['Workspace data is saved automatically.', 'Deleting a workspace removes its TermFlow windows, not the project folder on disk.'] },
  { id: 'ws-templates', category: 'Getting started', title: 'Workspace templates and clone', summary: 'Reuse a workspace setup as a template or duplicate it.', steps: ['Use the sidebar icons to save the current workspace as a template.', 'Apply a saved template to set up a new workspace.', 'Clone an existing workspace to duplicate its windows and settings.'] },
  { id: 'terminal', category: 'Terminals', title: 'Open a terminal', summary: 'Run CMD, PowerShell, PowerShell Core, WSL, Git Bash, SSH, or a custom command in a real PTY.', steps: ['Open the New Terminal menu.', 'Choose a shell type.', 'Click the terminal before typing so it becomes the active input target.'], notes: ['A green status means the PTY is running.', 'Restart and close controls are available from the window header.'] },
  { id: 'folder', category: 'Terminals', title: 'Open a terminal at any folder', summary: 'Start the selected shell with a working directory different from the workspace root.', steps: ['Open New Terminal > Open terminal at folder.', 'Choose CMD, PowerShell, WSL, or Git Bash.', 'Browse to a folder or enter its full path.', 'Choose Open terminal.'] },
  { id: 'more-actions', category: 'Terminals', title: 'More actions menu (⋯)', summary: 'Reach every per-window action from the ⋯ menu in the window header.', steps: ['Open the ⋯ menu in the window header.', 'Pick an action: split pane, broadcast, record start/stop, save recording, info panel, restart, or duplicate.', 'The header itself keeps only the close button.'], notes: ['Grouping actions under ⋯ keeps the header compact while every control stays one click away.'] },
  { id: 'row-actions', category: 'Profiles', title: 'Edit or remove a profile', summary: 'Manage command profiles directly from the New Terminal menu.', steps: ['Open the New Terminal menu.', 'Hover a profile row to reveal the edit and delete controls.', 'Edit the profile, or delete it to hide it from the menu.'], notes: ['Deleting a built-in profile first resets its override, then hides it.'] },
  { id: 'windows', category: 'Windows', title: 'Windows and the tab strip', summary: 'Every terminal lives in a window; the selected window fills the whole work area, like a tmux window.', steps: ['Use New Terminal to open a new window.', 'Click a tab in the strip above the terminal to switch windows.', 'Press Ctrl+Tab for the next window, Ctrl+Shift+Tab for the previous one.', 'With the tmux prefix: prefix c — new window, prefix n / p — next / previous window, prefix 0-9 — jump to a window by tab position.', 'prefix , renames the active window, prefix d detaches it, prefix x closes it.'], notes: ['Only the selected window is rendered; the others stay in the background with their processes running.', 'The active window is highlighted in the sidebar and the status bar.'] },
  { id: 'window-tabs', category: 'Windows', title: 'Rename, reorder, and close windows', summary: 'Manage windows entirely from the tab strip.', steps: ['Double-click a tab to rename the window; press Enter to confirm or Escape to cancel.', 'Drag a tab onto another tab to reorder the strip.', 'Middle-click a tab, or use its ×, to close the window.', 'Use + at the end of the strip to open another window.'], notes: ['Closing a window terminates its panes; the neighbouring window is selected afterwards.'] },
  { id: 'panes', category: 'Windows', title: 'Split a window into panes', summary: 'Panes divide the selected window, exactly like tmux panes.', steps: ['Press Ctrl+Shift+D to split right (side by side) or Ctrl+Shift+E to split down (stacked).', 'Or use Split pane from the ⋯ menu in the window header.', 'Drag the splitter between two panes to change their ratio.', 'Use the pane tabs in the header to switch or close panes.', 'With the tmux prefix: prefix % splits right (side by side), prefix " splits down (stacked).', 'prefix h/j/k/l or the arrow keys move to the pane in that direction; prefix o cycles to the next pane.', 'prefix z zooms the active pane to the full window; press it again to unzoom.', 'prefix x closes the active pane (the last pane asks how to close the window).'], notes: ['Pane ratios are saved with the workspace.', 'Zoom is not persisted, and any split or pane close drops it — exactly like tmux.'] },
  { id: 'providers', category: 'AI providers', title: 'Configure DeepSeek, Ollama, or another provider', summary: 'Provider profiles connect a terminal command to model and API endpoint environment variables.', steps: ['Open the New Terminal menu.', 'Choose Configure providers.', 'Enter the CLI command, model, base URL, and variable names.', 'Save the profile.', 'Open Settings > Developer > Workspace Environment / Credentials.', 'Fill in name, provider, the env variable name, and the secret value, then choose global or workspace-only and click Add credential.', 'Reopen the New Terminal menu and select the provider to launch it.'], notes: ['API keys are never stored inside provider profiles; they are encrypted with the operating system keychain and injected into new terminals.', 'Stored secrets are never displayed again — editing a credential requires entering the new value.', 'DeepSeek and Ollama starter profiles are included and may be edited.'] },
  { id: 'agents', category: 'Profiles', title: 'Launch CLI tools with profiles', summary: 'Run Claude Code, Codex, Ollama, or any other command-line tool from a saved profile, side by side with normal shells.', steps: ['Open the New Terminal menu and pick a profile.', 'Or define a new profile with a name, startup command, and working directory.', 'The profile launches in a real terminal like any other shell.'], notes: ['Auto-approve style flags grant broad CLI permissions; use them only in trusted folders.'] },
  { id: 'claude-config', category: 'Profiles', title: 'Claude Code config files', summary: 'Edit the Claude Code configuration files through a form instead of hand-editing JSON.', steps: ['Open the ⋯ menu in the toolbar and choose Profiles.', 'Switch to the Settings (.claude/settings.json) tab for model, environment variables, and co-authored-by.', 'Switch to the Config (.claude.json) tab for theme, notification channel, auto updates, and verbose output.', 'Click Save.'], notes: ['A .termflow-bak copy of the file is written before each save.', 'Restart your Claude Code terminals so the new configuration takes effect.'] },
  { id: 'copy-mode', category: 'Terminals', title: 'Copy mode: scrollback and clipboard', summary: 'Move through the scrollback with vi-style keys, select text, and copy it — without touching the mouse.', steps: ['Press the prefix, then [ to enter copy mode.', 'Move with h / j / k / l or the arrow keys; w / b jump a word, 0 / $ go to line start / end, g / G go to the buffer start / end.', 'Scroll with Ctrl+U / Ctrl+D (half page), Ctrl+B / Ctrl+F or PageUp / PageDown (full page).', 'Press Space or v to start the selection, then move to extend it.', 'Press Enter or y to copy the selection to the clipboard and leave copy mode.', 'Press / or ? to search forward or backward, then n / N to jump between matches.', 'Press Escape or q to leave copy mode without copying.'], notes: ['A COPY badge is shown in the status bar while copy mode is active, and no key reaches the shell.', 'Copy-mode bindings take precedence over the prefix, so Ctrl+B pages up even when it is the configured prefix key.', 'A selection that spans more than one row is copied line by line — full lines, not a character-exact block.'] },
  { id: 'broadcast', category: 'Workflows', title: 'Broadcast keyboard input', summary: 'Send the same keystrokes to multiple terminals at once.', steps: ['Use Add to broadcast group in the ⋯ menu of each window.', 'Open the ⋯ menu in the toolbar and choose Broadcast.', 'Type in the active terminal.', 'Choose Broadcast again before returning to single-terminal input.'], notes: ['Commands are executed independently by every terminal in the group.', 'Ctrl+Shift+B toggles broadcast without opening the menu.'] },
  { id: 'tiled', category: 'Windows', title: 'See all terminals at once (tiled mode)', summary: 'By default a new terminal is added as an extra pane of the current window, so every terminal stays visible in one tiled grid — like tmux.', steps: ['Open a new terminal as usual; it joins the current window as a pane and the layout is re-tiled automatically.', 'Press the prefix, then t to merge every window of the workspace into a single tiled window.', 'Or use Tile all windows into one from the ⋯ menu in the toolbar.', 'Press the prefix, then z to zoom one pane to full size and again to go back to the grid.'], notes: ['Window tabs are still there: switch with prefix n / p or the tab strip, and Duplicate into new window always opens a tab.', 'To go back to the old behaviour set Settings > Terminal > New terminal opens to "As a new window (tab)".', 'Tiling never kills a process; it only rearranges existing terminals.'] },
  { id: 'recording', category: 'Workflows', title: 'Record and save a terminal session', summary: 'Capture terminal output with timing information and export it as an asciinema-compatible .cast file.', steps: ['Choose Start recording from the ⋯ menu in the window header.', 'Use the terminal normally while recording is active.', 'Choose Stop recording from the same menu.', 'Choose Save Recording and select a destination for the .cast file.'], notes: ['Recording captures terminal output and timing, not a video file.', 'The .cast format can be replayed with asciinema-compatible tools.', 'Save Recording exports the last captured recording for that terminal.'] },
  { id: 'global-search', category: 'Workflows', title: 'Search across all terminals', summary: 'Find text in every open terminal buffer at once.', steps: ['Open the ⋯ menu in the toolbar and choose Global Search.', 'Type the text you are looking for.', 'Click a result; TermFlow switches to the window that owns the matching terminal.'], notes: ['Global search covers all open terminal buffers, not just the active one.', 'Ctrl+F searches inside the active terminal only.'] },
  { id: 'developer', category: 'Developer tools', title: 'Developer Center', summary: 'Check project health and launch workspace-aware tasks.', steps: ['Open the ⋯ menu in the toolbar and choose Developer Center.', 'Refresh Workspace Health to check path, Git, Node, npm, and manifest status.', 'Run project tasks declared by .termflow.json.', 'Use Export Diagnostics for a sanitized support report.'] },
  { id: 'triggers', category: 'Developer tools', title: 'Task triggers', summary: 'Run a command automatically when a process finishes or on a schedule.', steps: ['Open Developer Center.', 'Create a trigger that runs when a window’s process exits, optionally filtered by exit code.', 'Or create a timer-based trigger that runs a command on a schedule.'] },
  { id: 'credentials', category: 'Developer tools', title: 'Credential vault', summary: 'Store API keys encrypted by the operating system keychain and inject them into new terminals.', steps: ['Open Settings > Developer.', 'In Workspace Environment / Credentials, enter a name, a provider, and the environment variable name.', 'Enter the secret value.', 'Choose Global (all workspaces) or This workspace only.', 'Click Add credential.', 'Open a new terminal — the variable is present in its environment.'], notes: ['Values are encrypted with the OS keychain (safeStorage) and are never displayed again in the UI.', 'Editing a credential requires typing the new secret value; the stored one cannot be read back.', 'Credentials are injected into terminals started after they were added, not into already running ones.', 'Secrets are never written into provider profiles or workspace files in plain text.'] },
  { id: 'scripts', category: 'Developer tools', title: 'package.json scripts', summary: 'Detect and run workspace npm scripts without typing them.', steps: ['Open Developer Center.', 'Review the scripts detected from the workspace package.json.', 'Run any script in one click with npm, pnpm, or yarn.'] },
  { id: 'git-badge', category: 'Developer tools', title: 'Deep Git badge', summary: 'See live Git state on the terminal header and act on it.', steps: ['Watch the Git badge in the window header for branch, dirty state, and ahead/behind counts.', 'Click the badge to open Fetch, Refresh, and Copy branch.'], notes: ['The working directory is tracked live through OSC 7, so the badge follows cd changes.'] },
  { id: 'builtin-plugins', category: 'Developer tools', title: 'Built-in plugins', summary: 'Ship-with command plugins for common toolchains.', steps: ['Open the ⋯ menu in the toolbar and choose Plugins / Extensions.', 'Use Git Essentials, Node.js Dev, Docker Tools, and Windows System out of the box.'], notes: ['Built-in plugins cannot be deleted.', 'A user plugin that reuses a built-in id overrides it.'] },
  { id: 'workbench', category: 'Developer tools', title: 'Developer Workbench', summary: 'Browse project files, preview text, inspect command history, and complete Git operations without leaving TermFlow.', steps: ['Open the ⋯ menu in the toolbar and choose Workbench.', 'Use Files for workspace-scoped browsing and safe text preview.', 'Use Command history to copy previously executed commands.', 'Use Git to review the diff, select paths, stage or unstage, and commit.'] },
  { id: 'plugins', category: 'Developer tools', title: 'Plugins', summary: 'Install declarative command plugins.', steps: ['Open the ⋯ menu in the toolbar and choose Plugins / Extensions.', 'Install a versioned plugin JSON manifest.', 'Review every exposed command before running it.'], notes: ['Plugins cannot inject renderer JavaScript.'] },
  { id: 'persistent', category: 'Application', title: 'Persistent sessions and detach', summary: 'Terminals run in a separate session daemon, so they keep running when TermFlow is closed.', steps: ['Work in your terminals as usual — no setup is required.', 'Press the prefix, then d to detach the active window; its terminals keep running in the background.', 'Reopen detached terminals from the detached sessions panel in the status bar.', 'Quit TermFlow and start it again: persisted terminals are re-attached with their scrollback.'], notes: ['Detaching a window leaves the process alive; closing a window with the × terminates it.', 'If the daemon cannot start, the status bar shows a "no detach" warning and terminals close together with TermFlow.', 'After an unclean exit TermFlow asks whether to continue the restored session or start clean.'] },
  { id: 'tray', category: 'Application', title: 'Windows startup and system tray', summary: 'Keep terminals alive when the main window is closed.', steps: ['Open Settings > System.', 'Enable Start TermFlow with Windows if required.', 'Enable Keep running in the system tray when closed.', 'Close the window to hide it without stopping PTYs.', 'Double-click the tray icon to reopen, or choose Quit TermFlow to exit completely.'] },
  { id: 'attach-files', category: 'Terminals', title: 'Attach files with the + button', summary: 'Insert one or more file paths at the prompt without typing them.', steps: ['Click the + button in the top-right corner of any terminal.', 'Pick one or several files in the dialog.', 'Their paths are inserted at the cursor on a single line, space separated, ready to run.', 'Or drag files straight onto the terminal to do the same thing.'], notes: ['Paths that contain spaces or shell metacharacters are quoted automatically.', 'The + button sits in a fixed corner so it never overlaps the prompt, wherever a CLI puts its input.'] },
  { id: 'file-links', category: 'Developer tools', title: 'Clickable file paths', summary: 'Open a file straight from terminal output in your editor.', steps: ['Ctrl/Cmd-click a file path in the output to open it.', 'Paths with :line:col jump to that position.', 'Set the editor command in Settings > Terminal (default: code -g "{path}:{line}:{col}").'], notes: ['{path}, {line} and {col} are substituted into the command.', 'If no editor command is set, the file opens with the OS default handler.'] },
  { id: 'command-history', category: 'Workflows', title: 'Fuzzy command history', summary: 'Search everything you have run and re-use it, ranked by relevance.', steps: ['Press Ctrl+Shift+R, or run Command History from the palette (Ctrl+K).', 'Type to fuzzy-filter; commands from the current folder rank first.', 'Press Enter to insert a command, or Ctrl+Enter to run it immediately.', 'Press Escape to close.'], notes: ['History is de-duplicated and kept per workspace.'] },
  { id: 'command-blocks', category: 'Developer tools', title: 'Command blocks', summary: 'Browse each command as a Warp-style block with its exit code and duration.', steps: ['Enable Shell integration in Settings > Terminal so commands can be captured.', 'Open the ⋯ menu and choose Command blocks, or run Command Blocks from the palette (Ctrl+K).', 'Each block shows the command, its exit-code badge and how long it ran, newest first.', 'Per block: copy the command, copy its output, jump to it in the terminal, or re-run it.'], notes: ['Blocks are only captured while shell integration is on.'] },
  { id: 'agent-activity', category: 'Workflows', title: 'AI agent activity indicator', summary: 'See at a glance which pane an AI agent (claude, codex, opencode, …) is actively working in, and how long its turn has run.', steps: ['Run any CLI AI tool in a pane — no setup required.', 'Watch the dot next to the pane title and on each pane tab.', 'A pulsing accent dot means the agent is streaming output (working); a live m:ss timer next to it shows how long the current turn has run.', 'A dim, still dot means the pane is quiet (done / waiting for you).', 'When a long turn finishes in a background pane, its tab shows a steady amber dot until you open it.'], notes: ['Activity is read from output flow, so it works even for tools that run as one long-lived process where shell integration sees only a single command.', 'If TermFlow is not focused when a long turn finishes, a desktop notification is raised (gated on Settings > Notifications > long command).'] },
  { id: 'settings-layout', category: 'Application', title: 'Settings layout', summary: 'Find every preference through a categorized sidebar.', steps: ['Open Settings.', 'Use the left sidebar categories: Appearance, Terminal, Notifications, Behavior, System, Updates, Highlights, and Developer.'] },
  { id: 'bell', category: 'Application', title: 'Terminal bell and notifications', summary: 'Hear a short sound when a claude or codex task finishes.', steps: ['Open Settings > Notifications.', 'Toggle Terminal bell sound to play a short chime when a claude or codex task completes (BEL).'], notes: ['By default desktop notifications are shown only for application updates.', 'Enable terminal notifications from Settings if you want them.'] },
  { id: 'updates', category: 'Application', title: 'Stable and beta updates', summary: 'Check GitHub Releases and install a downloaded update after restart.', steps: ['Open Settings > Updates.', 'Choose the Stable or Beta channel.', 'Enable Automatic or use Check now.', 'Wait for the download status to reach Ready.', 'Choose Restart and install update.'], notes: ['Desktop notifications arrive only when a new version is found and when the update is ready to install.'] },
  { id: 'recovery', category: 'Troubleshooting', title: 'Recover after a crash', summary: 'TermFlow detects an unclean exit and rebuilds persisted workspace terminals on the next launch.', steps: ['Restart TermFlow after an unexpected exit.', 'Choose Continue restored session to keep recreated terminals.', 'Choose Start clean to terminate restored PTYs and close all windows.'] },
  { id: 'shortcuts', category: 'Reference', title: 'Keyboard shortcuts', summary: 'Reach common actions without leaving the terminal.', steps: ['Ctrl+K — command palette', 'Ctrl+F — search inside the active terminal', 'Ctrl+Alt+T — new window', 'Ctrl+Tab / Ctrl+Shift+Tab — next / previous window', 'Ctrl+Shift+D — split the window into panes to the right (side by side)', 'Ctrl+Shift+E — split the window into panes downwards (stacked)', 'Ctrl+Shift+B — toggle broadcast', 'Ctrl+Shift+R — fuzzy command history'] },
  { id: 'prefix', category: 'Reference', title: 'tmux prefix key', summary: 'Press the prefix (Ctrl+A by default), then a command key — exactly like tmux.', steps: ['prefix % — split the pane right (side by side)', 'prefix " — split the pane down (stacked)', 'prefix h / j / k / l or arrow keys — move to the pane in that direction', 'prefix o — next pane', 'prefix x — close the active pane (last pane: close the window)', 'prefix z — zoom the active pane / unzoom', 'prefix c — new window', 'prefix t — tile all windows into one', 'prefix n / p — next / previous window', 'prefix 0-9 — jump to a window by tab position', 'prefix , — rename the active window', 'prefix d — detach the active window', 'prefix [ — copy mode: hjkl or arrows move, w / b jump words, 0 / $ line start / end, g / G buffer start / end, Ctrl+U / Ctrl+D half page, Ctrl+B / Ctrl+F full page, Space or v starts the selection, Enter or y copies it to the clipboard, / and ? search, n / N jump between matches, q or Escape leaves', 'prefix ? — this shortcut list'], notes: ['While copy mode is active a COPY badge shows in the status bar and no key reaches the shell — copy-mode bindings take precedence over the prefix, so Ctrl+B pages up even when it is the configured prefix.', 'The prefix key is configurable in Settings > Terminal (Ctrl+A or Ctrl+B).', 'Pressing the prefix twice (e.g. Ctrl+A Ctrl+A) sends the key itself to the terminal, so readline’s Ctrl+A "beginning of line" still works.', 'A PREFIX badge appears in the status bar while the prefix waits; it clears after 2 seconds or on an unknown key, which is then delivered to the terminal.', 'The old shortcuts (Ctrl+Shift+D/E, Ctrl+Tab, ...) keep working alongside the prefix.'] },
  { id: 'errors', category: 'Troubleshooting', title: 'Terminal shows error or PID 0', summary: 'The requested shell or provider command could not start.', steps: ['Confirm the CLI is installed and available in PATH.', 'Confirm the selected working directory exists.', 'Check provider command and environment variable names.', 'Use Restart after correcting the configuration.', 'Open Developer Center to verify Node, npm, Git, and manifest health.'] }
]

const categoryIcons: Record<string, LucideIcon> = {
  'Getting started': Grid2X2, Terminals: TerminalSquare, Windows: Grid2X2,
  Profiles: Bot, 'AI providers': Bot, Workflows: Radio, 'Developer tools': HeartPulse,
  Application: Settings, Reference: Keyboard, Troubleshooting: HeartPulse, About: Info
}

function AboutPanel(): React.JSX.Element {
  return (
    <article className="help-article about-article">
      <span className="help-kicker">About</span>
      <h2>TermFlow</h2>
      <p className="about-version">Version {APP_VERSION}</p>
      <p>{DEVELOPER.bio}</p>

      <h4>Developer</h4>
      <p className="about-dev">
        <strong>{DEVELOPER.name}</strong> · {DEVELOPER.role}
      </p>
      <div className="about-links">
        {DEVELOPER.links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ))}
      </div>
      <a className="about-coffee" href="https://buymeacoffee.com/palamut62" target="_blank" rel="noopener noreferrer">
        <Coffee size={16} /> Buy Me a Coffee
      </a>

      <h4>Changelog</h4>
      {CHANGELOG.map((entry) => (
        <div className="about-release" key={entry.version}>
          <div className="about-release-head">
            <strong>v{entry.version}</strong>
            <em>{entry.date}</em>
          </div>
          <ul>
            {entry.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      ))}
    </article>
  )
}

export default function HelpModal({ onClose, initialTopicId }: { onClose: () => void; initialTopicId?: string }): React.JSX.Element {
  const categories = [...new Set(topics.map((topic) => topic.category)), 'About']
  const initialTopic = topics.find((topic) => topic.id === initialTopicId) ?? topics[0]
  const [category, setCategory] = useState(initialTopic.category)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState(initialTopic.id)
  const filtered = useMemo(() => topics.filter((topic) => {
    const matchesQuery = `${topic.title} ${topic.summary} ${topic.steps.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (!query || topic.category === category || query.length > 0)
  }), [category, query])
  const isAbout = category === 'About' && !query
  const visible = query ? filtered : topics.filter((topic) => topic.category === category)
  const active = visible.find((topic) => topic.id === activeId) ?? visible[0]
  useModalClose(onClose)

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal help-center" onMouseDown={(event) => event.stopPropagation()}>
        <header className="help-head"><div><h3>TermFlow Help Center</h3><p>Features, setup guides, workflows, and troubleshooting.</p></div><button className="hbtn" aria-label="Close help" onClick={onClose}><X size={16} /></button></header>
        <div className="help-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics..." /></div>
        <div className="help-layout">
          <nav className="help-categories">
            {categories.map((item) => { const Icon = categoryIcons[item] ?? FolderOpen; return <button className={category === item && !query ? 'active' : ''} key={item} onClick={() => { setQuery(''); setCategory(item); const first = topics.find((topic) => topic.category === item); if (first) setActiveId(first.id) }}><Icon size={14} /><span>{item}</span></button> })}
          </nav>
          <div className="help-topics">
            {isAbout ? (
              <button className="active"><strong>About TermFlow</strong><span>Version, changelog and developer.</span></button>
            ) : (
              <>
                {visible.length === 0 && <div className="help-empty">No matching help topic.</div>}
                {visible.map((topic) => <button className={active?.id === topic.id ? 'active' : ''} key={topic.id} onClick={() => setActiveId(topic.id)}><strong>{topic.title}</strong><span>{topic.summary}</span></button>)}
              </>
            )}
          </div>
          {isAbout ? (
            <AboutPanel />
          ) : (
            <article className="help-article">
              {active && <><span className="help-kicker">{active.category}</span><h2>{active.title}</h2><p>{active.summary}</p><h4>How to use it</h4><ol>{active.steps.map((step) => <li key={step}>{step}</li>)}</ol>{active.notes?.length && <><h4>Important notes</h4><ul>{active.notes.map((note) => <li key={note}>{note}</li>)}</ul></>}</>}
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
