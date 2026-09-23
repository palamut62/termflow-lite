# Changelog

## 1.8.0 - 2026-09-23

- The new tab menu has a filter box: start typing to narrow shells, agents, providers and SSH connections, and press Enter to open the first match. The Settings entry at the bottom of the menu is no longer cut off.
- Settings can now be searched: type a word such as "tmux", "font" or "tray" and the matching section opens.
- "New worktree session..." now lists the worktrees TermFlow created earlier for the chosen repository, so you can reopen or remove them. A checkout with uncommitted changes is never removed silently, and branches are kept.
- The GitHub panel now shows why loading failed (network, login) instead of an empty list, asks for a repository before listing pull requests, and no longer calls `gh` on every keystroke.
- Security: SSH connections reject host, user or jump host values that start with "-" and extra arguments that would run local commands (ProxyCommand, LocalCommand, ...). Git and GitHub calls validate branch start points and repository names.
- Fixed menu and settings headings rendering as "PROFİLES" / "LİCENSE" on Turkish-locale systems.
- Settings text is now consistently English, and every text field in Settings uses the same style and width.
- The Agent Inbox closes with Esc, and the worktree dialog shows a correct example path.

## 1.7.0 - 2026-09-06

- SSH connections can now keep a persistent remote session: the connection attaches to a tmux (or screen) session on the host, so agents and long builds keep running when the link drops or the window closes, and reconnecting returns to the same session.
- Fixed SSH connections with a remote directory or command not allocating a remote TTY, which left the remote shell without a prompt.
- Added a GitHub panel: browse your repositories, list a repository's open pull requests, and open any pull request directly in its own worktree with the agent of your choice. It uses your existing GitHub CLI (`gh`) session — TermFlow never asks for or stores a token.
- Panes can now be rearranged by dragging: grab a pane by its grip and drop it on another pane's edge to re-tile the split, or on its center to swap the two.
- Added a session rail: an optional left sidebar that lists terminals as a repository -> session tree with live activity, worktree branches, collapsible groups and a drag-to-resize edge. Toggle it from the tab bar; the tab bar stays available.
- Added per-agent git worktrees: "New worktree session..." starts an agent or shell in its own isolated checkout of a repository, so several agents can work on the same project in parallel without overwriting each other. Closing the last tab of a worktree offers to remove the checkout, optionally with its branch; nothing is deleted without confirmation.

## 1.6.1 - 2026-09-01

- Added provider-independent agent handover: Claude Code, Codex, OpenCode, and compatible provider profiles can continue one another's work from the status bar.
- Resuming a saved session now defaults to the profile/provider that created it, while still allowing an explicit compatible profile choice.
- Added clickable terminal file and folder paths with working-directory resolution, context-menu actions, paths containing spaces, and safe reveal-only handling for executable files.
- Fixed the native profile selector popup using unreadable light colors on dark themes.
- Replaced the app icon with the MausCrew Workspace Core 6.1A set across the window, taskbar, shortcut, installer, and Linux package.
- The icon now has a transparent background, so it no longer shows a grey box on dark taskbars.

## 1.6.0 - 2026-08-21

- Fixed scheduled saved commands never running while a split layout was active: background tabs now start their terminals even when they are not part of the visible split tree.
- Clicking a background tab while a split layout is active now swaps it into the split instead of highlighting an unreachable terminal.
- The Explorer context menu is no longer re-registered on every settings change; it syncs only when profiles or shells actually change.
- Provider profiles now start approval-gated by default instead of with full access. Existing saved providers keep their current setting.
- Added a Reset button for edited built-in command profiles to restore their defaults.
- The persistent agent event log is now trimmed automatically instead of growing without bound.
- The status bar Git status refreshes every 30 seconds and pauses while the window is hidden, instead of polling every 5 seconds.
- Corrected the theme list and artifact versions in the README.

## 1.5.0 - 2026-08-20

- Closing the window now keeps TermFlow Lite running in the system tray, so terminals and agent sessions stay alive.
- Added a tray icon with Show/Hide and Quit; quitting from the tray menu really exits the app.
- Added a "Close to Tray" toggle in Settings > Terminal (on by default) that applies immediately.

## 1.4.3 - 2026-08-19

- Removed the empty gap between the session info strip and the status bar; the strip is no longer pushed up by the terminal padding setting and now spans the full width.
- Tightened the strip's own height so the information sits closer to the status bar.

## 1.4.2 - 2026-08-19

- Toned down the session info strip below the terminal: dimmer text, a fainter divider, and softer status colours so it no longer competes with the terminal.
- Moved the strip closer to the status bar by trimming its height and spacing.
- Hovering the strip (or focusing the folder button) restores full contrast.

## 1.4.1 - 2026-08-18

- Added an update indicator to the right side of the status bar: download a new version or restart to install without opening Settings.
- The indicator can be dismissed per version and shows live download progress.
- Refreshed the app icon with the Sade 2 Sunset set across window, taskbar, shortcut, and installer.

## 1.4.0 - 2026-08-18

- Added schedules to saved commands: run daily at a set time, weekly on a chosen day, or every N minutes.
- Added catch-up execution so a schedule missed while the app was closed runs as soon as the app starts.
- Scheduled commands open in a background tab so they never steal focus.
- Saved command list now shows the schedule summary and the next run time.

## 1.3.0 - 2026-08-16

- Added per-agent Safe, Workspace, and Full Access permission modes.
- Added a persistent, redacted agent event log with an Inbox and execution timeline.
- Added provider-aware Codex, Claude Code, and OpenCode launch adapters.
- Added approval, completion, failure, and security event notifications.
- Added Agent Security settings and permission controls to agent launch flows.
