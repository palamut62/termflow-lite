# Changelog

## 1.13.0 - 2026-10-03

- New agent characters from the TermFlow ASCII motion kit: Ember (flame), Miso (ear-tuft spirit) and Piko (robot), each with its own desk, props and colors. Settings > Appearance > Character picks one, or Auto: Claude Code Ember, Codex Miso, OpenCode Piko.
- Real facial expressions instead of frame swaps: eyes, pupils, brows, mouth and hands are separate layers that ease toward each state, with blinking and gaze.
  - Working: types at the keyboard (fingers and lit keys match), pauses, then reads the screen.
  - Thinking, Needs you (approval or question), Done (jump and confetti), Error (flinch), Idle.
  - Time rules, never guessed from output: after 20 minutes of steady work it keeps working with a tired face (heavy lids, slower typing, the odd yawn, coffee); waiting on you for 5 minutes makes it tired; 3 idle minutes put it to sleep, and it wakes up rested; a second error within 10 minutes makes it grumpy.
- ASCII and Pixel styles now draw the same character, over a faint full-panel ASCII field (slow wave plus drifting code glyphs) that never covers the character.
- Larger ASCII glyphs (one per 5x7.5 scene pixels, area-averaged so thin lines like the mouth and brows still show), so the character clearly reads as ASCII.
- The caption names the real work ("Editing widget.ts"); screen readers hear only the state label.
- Painting is batched per row and the background is cached, so a frame costs a few milliseconds.

## 1.12.0 - 2026-10-03

- The agent animation now follows what the agent is really doing, read from the tool lines Claude Code (`⏺ Read(...)`, `⏺ Update(...)`, `⏺ Bash(...)`) and Codex (`• Ran ...`, `• Edited ...`) print:
  - editing or writing a file: the critter types at a keyboard while code appears on its monitor,
  - running a command: it watches the output scroll past on the monitor,
  - running tests: it hops nervously next to an erupting volcano,
  - reading or searching: it digs, and files pop out of the ground,
  - otherwise: it sits and thinks under a flickering light bulb.
- The speech bubble says what is going on, naming the file or command ("Editing widget.ts", "Running npm test"), with an occasional short quip once an action has been going for a while.
- The ASCII style now shows the very same scenes and speech bubble, drawn in ASCII.
- Removed the garden and brick-wall scenes, which did not reflect the agent's work.

## 1.11.0 - 2026-10-03

- A new pixel-art critter for agent animations, drawn with proper shading: a hue-shifted five-tone ramp in the agent's own color (Claude Code orange, Codex blue), a selective outline, and walk, breathing, hop, cheer and sit poses.
- The ASCII style now shows the same critter, rendered as shaded ASCII glyphs over a moving ASCII field. Its pose and eyes show what the agent is doing: walking and scanning while it works, tired after a long run, sitting and watching the terminal while it waits, hopping with wide eyes at new output, cheering when it is done, red with X eyes on an error, and asleep when the session ends.
- The critter reacts to you and the agent: it turns to the terminal and says "Listening..." while you type, and it moves faster when output pours in.
- Eyes now move toward where the critter is looking.

## 1.10.0 - 2026-10-02

- New widget view: the window turns into a compact 640 x 260 status widget in the top-right corner, with one terminal-style line per session (running, done, needs you, failed, idle), a sweeping character meter and the elapsed time. Drag it anywhere, keep it on top or not, collapse it to a single line, and click a line to jump back to that terminal. Running commands and agents keep going through the switch, and the full window comes back exactly where it was. Open it from the tab bar or the command palette.
- Agent tabs get an optional animation panel on the right, drawn in the agent's own color (Claude Code orange, Codex blue). Choose the style in Settings > Appearance > Animation Style:
  - ASCII face: one shaded ASCII character whose glowing eyes show what the agent is doing: focused, tired after a long run, waiting for you, surprised by new output, proud when done, angry on an error, asleep when the session ends.
  - Pixel scenes: a pixel-art critter acts it out: a volcano erupting while tests run, laying bricks while it edits, digging while it explores, a flag and confetti when it is done, a storm on errors.
  Turn it off in Settings or with the x on the panel.
- Fixed idle shells showing as "Running" forever when shell integration is on. The status bar and widget now switch to "Waiting for input" when the prompt is back.
- Fixed the CRT overlay drawing a second frame inside the terminal.
- The built-in Codex profile color is now blue.

## 1.9.0 - 2026-10-02

- Shell integration for PowerShell, pwsh, Git Bash, bash and zsh: every command gets a status line (running, passed, failed, cancelled) and slow or failed commands show their duration and exit code. `Ctrl+Up` / `Ctrl+Down` jumps between commands. Nothing is written to your profile or dotfiles; CMD and WSL are unchanged.
- Right-click a command to copy the command, copy only its output, rerun it, or copy it formatted for an AI agent.
- Inline suggestions from your command history while typing; `→` or `End` accepts. Off when PSReadLine already shows its own prediction.
- Compiler and test locations such as `src/app.ts:42:7` and `app.ts(42,7)` are now clickable and open the file at that line in VS Code, Cursor or Windsurf. Previously they were not linked at all.
- A command that runs longer than 10 seconds in a background tab sends a system notification; clicking it brings the tab forward. Tabs flash green or red when a command finishes.
- New Motion setting (Off / Subtle / Full) with tab, split, menu, dialog and theme crossfade animations. The system "reduce motion" preference always turns them off.
- Windows 11 Mica, Acrylic and Mica Alt backdrops with an adjustable tint. The old Blur toggle carries over as Acrylic.
- Optional cursor trail and blaze effects, a scanline or CRT overlay, a live output sparkline in the status bar, synthesized key sounds and confetti when a test or build passes.
- Wrapped: local command stats and badges you can save as a PNG. Only counters and tool names are stored, never arguments or output.
- A dismissible tip card on first launch.
- Fixed PowerShell reporting a failed cmdlet with a stale native exit code, and Git Bash directories now resolve to Windows paths.

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
