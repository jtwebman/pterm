# pterm

A cross-platform terminal multiplexer organized around projects. Each project points to a folder, has its own environment variables and configurable commands, and can have multiple terminal sessions running simultaneously.

## Status

**Alpha** — actively under development. See [plan.md](plan.md) for the roadmap.

## Features

- **Project-based terminal organization** — group terminals by project, not random tabs
- **Branch-aware sidebar tree** — terminals grouped by git branch/worktree with live branch detection
- **Git integration** — sidebar shows current branch per folder, updates in real time via `.git/HEAD` watcher
- **Configurable commands** per project (shell, dev server, build, codex, claude, etc.)
- **Branch support** — run terminals in isolated git worktree copies for parallel work
- **Branch management** — switch branches on main folder, delete worktree branches with cleanup
- **Terminal color themes** — 10 built-in themes (Dracula, Nord, Catppuccin Mocha, Solarized, Gruvbox, Tokyo Night, Monokai, VS Code) plus custom theme editor
- **Per-project themes** — set a different terminal color theme for each project
- **Custom theme editor** — create named themes with color pickers, hex inputs, and live preview
- **Activity detection** — smart busy/idle/waiting indicators for shell, Claude, and Codex sessions
- **Session persistence** — terminals survive app restart with scrollback and ordering preserved
- **Per-project env vars** — injected into all terminals for that project
- **Ctrl+wheel font zoom** (terminal and sidebar)
- **Draggable, resizable sidebar**
- **Copy/paste keybindings** (Ctrl+C/V on Windows/Linux, Cmd+C/V on Mac)
- **Terminal search** (Ctrl+F)
- **Clickable URLs** in terminal output
- **Drag-and-drop tab reordering** — order persists across restarts
- **Cross-platform** — Linux, macOS, Windows (with WSL2 support)

## Development

```
npm install
npm run dev
```

## License

[MIT](LICENSE)
