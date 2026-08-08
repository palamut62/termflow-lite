# TermFlow Lite

A minimal, fast and deeply customizable cross-platform terminal for developers.

TermFlow Lite opens straight into a terminal — no welcome screens, no setup wizards. It is built for people who live in the shell and want a terminal that gets out of the way.

## Features

- **Fast startup** - opens directly into your default shell profile; no welcome screen or onboarding
- **Tabs** - create, close, and switch between tabs with `Ctrl+Shift+T/W` and `Ctrl+Tab`
- **Cross-platform** - Windows (10/11 x64) and Linux (x64) support
- **8 themes** - Dark, Light, Dracula, Nord, Tokyo Night, Catppuccin Mocha, Gruvbox, plus a Custom theme editor for your own palette
- **Shell profiles** - PowerShell, CMD, WSL, and Git Bash out of the box, plus fully custom profiles
- **Keyboard shortcuts** - every action is bound to a key; rebind them in Settings
- **Terminal search** - find anything in the current buffer with `Ctrl+Shift+F`
- **Right-click menu & copy-paste** - context menu with copy/paste (or configure right-click to paste directly)
- **Live settings** - appearance and behavior changes apply instantly; no restart needed

## Installation

Download the latest release from [GitHub Releases](https://github.com/palamut62/termflow-lite/releases):

| Platform | Artifacts |
| --- | --- |
| Windows | `TermFlow-Lite-0.1.0-x64.exe` (installer) · `TermFlow-Lite-0.1.0-x64.zip` (portable) |
| Linux | `TermFlow-Lite-0.1.0-x86_64.AppImage` · `TermFlow-Lite-0.1.0-amd64.deb` |

## Keyboard Shortcuts

Defaults (rebindable in Settings > Keyboard):

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+T` | New tab |
| `Ctrl+Shift+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+Shift+F` | Search terminal |
| `Ctrl+,` | Open settings |
| `Ctrl+=` / `Ctrl+-` | Increase / decrease font size |
| `Ctrl+0` | Reset font size |

## Settings

All settings apply in real time and are stored locally:

- **Appearance** - theme, custom palette, font family, font size, line height, letter spacing, cursor style and color, opacity and blur, terminal padding
- **Terminal** - scrollback, bell, copy-on-select, right-click behavior, confirm on close, startup directory
- **Profiles** - default profile and custom shell profiles (command, arguments, working directory, environment)
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
