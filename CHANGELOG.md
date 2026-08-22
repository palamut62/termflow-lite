# Changelog

## 1.6.1 - 2026-08-22

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
