# TermFlow Lite

A minimal, fast and deeply customizable cross-platform terminal for developers.

TermFlow Lite opens straight into a terminal — no welcome screens, no setup wizards. It is built for people who live in the shell and want a terminal that gets out of the way.

## Features

- **Fast startup** - opens directly into your default shell profile; no welcome screen or onboarding
- **Tabs** - create, close, and switch between tabs with `Ctrl+Shift+T/W` and `Ctrl+Tab`
- **Tab activity** - live process state at a glance: running, waiting for input, background output, completed, or failed
- **Cross-platform** - Windows (10/11 x64) and Linux (x64) support
- **8 themes** - Dark, Light, Dracula, Nord, Tokyo Night, Catppuccin Mocha, Gruvbox, plus a Custom theme editor for your own palette
- **Shell profiles** - PowerShell, CMD, WSL, and Git Bash out of the box, plus fully custom profiles
- **CLI agents and providers** - launch Claude Code, Codex, OpenCode, Ollama, DeepSeek, OpenRouter, or your own provider profile
- **Open at folder** - choose any shell, agent, custom profile, or provider and start it directly in a selected path
- **Explorer context menu** - the Windows installer adds “Open in TermFlow Lite” for folders, folder backgrounds, and drive backgrounds, opening a tab at the clicked path
- **Controlled full permissions** - command and provider profiles default to full access; permission mode and CLI-specific flags remain editable in Settings
- **Smart status bar** - see process activity, provider model, Git branch and changes, full-access state, current directory, and tab count without visual clutter
- **Command history** - search commands across folders and profiles, rerun them in the active terminal, or clear saved history with `Ctrl+Shift+H`
- **Task and command palette** - discover `package.json` scripts and run project, Git, npm, or Docker tasks with `Ctrl+Shift+P`
- **Agent work panel** - agent/provider, model, activity, permission mode, working directory, and live session duration below the terminal
- **Agent security profiles** - start Codex or Claude in Safe, Workspace, or Full Access mode with CLI-native permission flags pinned per tab
- **Agent Inbox and timeline** - review redacted, persistent agent activity, approval waits, tool work, completion, and failure events across tabs
- **Persistent agent event log** - keep a local JSONL audit trail without storing raw terminal input or API keys
- **Agent session browser** - search saved Claude Code, Codex, and OpenCode conversations and resume one in a new tab with the selected profile or provider
- **Project detection** - recognize Node.js, Python, Rust, Go, Docker, and Git projects and suggest matching tasks automatically
- **Split terminals** - tile multiple live terminals side by side or stacked, resize them by dragging dividers, and move focus by click or keyboard
- **GPU rendering** - WebGL renderer for fast-scrolling output, with an automatic fallback to the DOM renderer on context loss
- **Programming ligatures** - `=>`, `!==`, `->` and friends render as single glyphs with a ligature-capable font
- **Inline images** - Sixel and the iTerm2 inline image protocol
- **Session restore** - reopen your tabs, working directories, and split layout on the next launch
- **SSH connections** - save hosts and open them in a tab; the system OpenSSH client handles keys, `~/.ssh/config`, and host verification (no passwords are ever stored)
- **Broadcast input** - type once into every pane of a split with `Ctrl+Alt+B`
- **Quake mode** - drop the window down from the top of the screen with a global hotkey
- **Automatic updates** - the installed build checks for new releases and updates itself on your confirmation
- **Keyboard shortcuts** - every action is bound to a key; rebind them in Settings
- **Terminal search** - find anything in the current buffer with `Ctrl+Shift+F`
- **Right-click menu & copy-paste** - context menu with copy/paste (or configure right-click to paste directly)
- **Live settings** - appearance and behavior changes apply instantly; no restart needed

## Installation

Download the latest release from [GitHub Releases](https://github.com/palamut62/termflow-lite/releases):

| Platform | Artifacts |
| --- | --- |
| Windows | `TermFlow-Lite-1.3.0-x64.exe` (installer) · `TermFlow-Lite-1.3.0-x64.zip` (portable) |
| Linux | `TermFlow-Lite-1.3.0-x86_64.AppImage` · `TermFlow-Lite-1.3.0-amd64.deb` |

**Automatic updates:** the installed Windows build (`.exe`) and the Linux AppImage can update
themselves — see *Settings → About → Updates* (checking on startup can be turned off there).
The `.deb` package and the portable Windows zip must be updated manually.

## Keyboard Shortcuts

Defaults (rebindable in Settings > Keyboard):

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+T` | New tab |
| `Ctrl+Shift+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+Shift+H` | Command history |
| `Ctrl+Shift+P` | Task and command palette |
| `Ctrl+\\` | Split terminal right |
| `Ctrl+Shift+\\` | Split terminal down |
| `Ctrl+Shift+F` | Search terminal |
| `Ctrl+Alt+B` | Toggle broadcast input |
| `F12` | Toggle quake mode (when enabled) |
| `Ctrl+,` | Open settings |
| `Ctrl+=` / `Ctrl+-` | Increase / decrease font size |
| `Ctrl+0` | Reset font size |

## Settings

All settings apply in real time and are stored locally:

- **Appearance** - theme, custom palette, font family, font size, line height, letter spacing, cursor style and color, opacity and blur, terminal padding
- **Terminal** - scrollback, bell, copy-on-select, right-click behavior, confirm on close, startup directory
- **Profiles** - default profile and custom shell profiles (command, arguments, working directory, environment)
- **Providers** - current selectable models, CLI command, endpoint, environment-variable mapping, permission controls, and menu color; secret values remain in the OS environment
- **Keyboard** - rebind any shortcut
- **About** - version, product owner, links

## Development

```bash
npm install
npm run dev          # start in development mode
npm test             # unit tests
npm run test:e2e     # build + Playwright end-to-end tests
npm run verify       # tests + typecheck + production build
npm run build        # production build
```

## Building

```bash
npm run dist:win     # Windows installer + portable zip (dist/)
npm run dist:linux   # Linux AppImage + deb (dist/)
```

## Tech Stack

| Technology | Purpose |
| --- | --- |
| Electron 39 | Desktop shell |
| React 18 + TypeScript | UI and typed IPC contracts |
| xterm.js | Terminal rendering, search, Unicode, web links |
| `@lydell/node-pty` | Native PTY processes (Windows ConPTY) |
| Zustand | Application state |
| electron-vite | Development and production build pipeline |

## License

Distributed under the [MIT License](LICENSE).

---

Ürün sahibi / Product owner: Umut Çelik (palamut62) — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
