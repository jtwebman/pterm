# pterm — Project Terminal Multiplexer

## Context

A cross-platform desktop app — a terminal multiplexer organized around **projects**. Each project points to a folder, has its own env vars and configurable commands, and can have multiple terminal sessions. Users run CLI tools (codex, claude, shells, etc.) directly in real terminal panes.

**Project branches** — full-copy clones of a project folder so you can work on multiple things in parallel without conflicts (preserves `.env`, `node_modules`, everything git worktrees would ignore).

## Requirements

1. **Sidebar with projects** — tree view, expand to see terminals
2. **Terminals under projects** — click to switch, real PTY terminals
3. **Cross-platform**: Mac (zsh/bash), Windows (cmd, PowerShell, WSL2), Linux (bash/zsh)
4. **Easy command launching** — `+` button opens modal to pick command + branch
5. **Extensible commands** — users add any command (codex, claude, npm run dev, etc.)
6. **Per-project env vars** — injected into all terminals for that project
7. **Project branches** — full folder copy to a separate path for parallel work

## Tech Stack

- **Electron 41** — cross-platform desktop shell
- **Node 24** — native TypeScript (`--experimental-strip-types`)
- **React 19 + Vite** — frontend renderer
- **@xterm/xterm + @xterm/addon-fit + @xterm/addon-search + @xterm/addon-web-links** — terminal rendering
- **node-pty 1.1** — cross-platform PTY spawning (in Electron main process), requires `@electron/rebuild`
- **tsdown** — bundles main + preload TypeScript
- **Electron IPC** — communication between main and renderer (no WebSocket, no separate server)
- **React context + useReducer** — state management (no external library)
- **TailwindCSS v4** — styling (via `@tailwindcss/postcss`)
- **JSON file** — config persistence (`~/.pterm/config.json`)
- **crypto.randomUUID()** — ID generation (no nanoid dependency)

No Effect.ts, no schema validation libraries, no WebSocket server, no Zustand, no nanoid. Plain TypeScript + async/await + Electron IPC + React built-ins.

### Why Electron IPC instead of WebSocket?

This is a simple desktop app, not a web app. Electron IPC is built-in, zero-config, and avoids the complexity of:
- Spawning a separate server process
- Managing ports and auth tokens
- WebSocket reconnection logic
- Process lifecycle management

node-pty runs directly in the Electron main process. The renderer calls `ipcRenderer.invoke()` / `ipcRenderer.send()`, main process handles PTY operations and streams data back. VS Code uses this same pattern.

## Data Model

```typescript
// Persisted in ~/.pterm/config.json
interface Config {
  projects: Project[];
  settings: {
    theme: "system" | "dark" | "light";
    terminalTheme?: string;           // default terminal color theme ID
    sidebarWidth: number;
    defaultShell?: ShellType;
    fontSize: number;
    defaultProjectCommands: Command[];
    customThemes?: CustomTerminalTheme[];
  };
}

interface CustomTerminalTheme {
  id: string;
  name: string;
  variant: "dark" | "light";
  colors: { background, foreground, cursor, cursorAccent, selectionBackground,
            selectionForeground, black, red, green, yellow, blue, magenta,
            cyan, white, brightBlack..brightWhite: string };
}

interface Project {
  id: string;           // crypto.randomUUID()
  name: string;
  folder: string;       // absolute path
  envVars: Record<string, string>;
  commands: Command[];
  branches: ProjectBranch[];
  terminalTheme?: string;  // per-project theme override
}

type CommandType = "shell" | "claude" | "codex";

interface Command {
  id: string;
  name: string;         // "Shell", "Codex", "Claude", "npm run dev"
  command: string;      // "" (empty = default shell), "codex", "claude", etc.
  type: CommandType;    // drives activity detection strategy
  shell?: ShellType;    // override shell for this command
}

type ShellType = "default" | "bash" | "zsh" | "cmd" | "powershell" | "wsl";

interface ProjectBranch {
  id: string;
  name: string;         // user-given label like "feature-auth"
  folder: string;       // path to the copied folder
  createdAt: string;    // ISO date
}

type Activity = "idle" | "busy" | "working" | "waiting";

// Client-side only (React context + useReducer)
interface TerminalSession {
  key: string;          // "projectId:terminalId"
  projectId: string;
  branchId?: string;    // if running in a branch copy
  terminalId: string;
  commandId?: string;   // which command was used to launch
  commandName: string;
  commandType: CommandType;
  status: "running" | "exited";
  activity: Activity;   // idle/busy/working/waiting — driven by activity-detector
  activityText: string; // human-readable status ("Running", "Using tools", etc.)
  exitCode?: number;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process                              │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ node-pty    │  │ config-store │  │ branch-   │  │
│  │ terminals   │  │ (JSON file)  │  │ manager   │  │
│  └──────┬──────┘  └──────────────┘  └───────────┘  │
│         │                                           │
│         │ ipcMain.handle / webContents.send         │
│─────────┼───────────────────────────────────────────│
│         │ preload.ts (contextBridge)                │
│         ▼                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │  Renderer (React + Vite)                    │    │
│  │  - xterm.js terminals                       │    │
│  │  - React context + useReducer                │    │
│  │  - Sidebar + Terminal Panes                 │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
pterm/
├── package.json
├── postcss.config.js                      # TailwindCSS v4 via @tailwindcss/postcss
├── tsdown.main.config.ts                  # bundles main process
├── tsdown.preload.config.ts               # bundles preload script
├── vite.config.ts                         # React renderer
├── index.html                             # Vite entry
│
├── scripts/
│   └── dev.js                             # dev server: vite + tsdown + electron
│
├── src/
│   ├── main/                              # Electron main process
│   │   ├── index.ts                       # app lifecycle, BrowserWindow, menus
│   │   ├── ipc.ts                         # ipcMain handlers (terminal, project, branch, settings)
│   │   ├── terminal-manager.ts            # PTY lifecycle, activity polling, events
│   │   ├── shell-resolver.ts              # cross-platform shell fallback chains
│   │   ├── config-store.ts                # JSON file CRUD for projects + settings
│   │   ├── branch-manager.ts              # folder copy/delete
│   │   ├── env-filter.ts                  # strip Electron/Node/npm vars, merge project env
│   │   ├── activity-detector.ts           # per-command-type activity detection (shell/claude/codex)
│   │   ├── claude-hooks.ts                # generates Claude CLI hooks for activity fast-path
│   │   └── command-detector.ts            # detects available CLI tools (claude, codex) on PATH
│   │
│   ├── preload/
│   │   └── index.ts                       # contextBridge: ptermBridge
│   │
│   ├── renderer/                          # React app
│   │   ├── main.tsx                       # React entry
│   │   ├── App.tsx                        # layout: sidebar (draggable) | terminal pane
│   │   ├── index.css                      # tailwind
│   │   ├── bridge.ts                      # ptermBridge type + accessor
│   │   ├── store.ts                       # React context + useReducer: projects, terminals, settings
│   │   ├── themes.ts                      # 10 built-in themes + custom theme support + resolver
│   │   └── components/
│   │       ├── Sidebar.tsx                # project list, Ctrl+wheel zoom, theme selectors
│   │       ├── ProjectItem.tsx            # collapsible project with branch-grouped terminals
│   │       ├── BranchGroup.tsx            # branch/folder node with git branch label, scoped [+]
│   │       ├── BranchManager.tsx          # branch management dialog (checkout, delete worktrees)
│   │       ├── TerminalTab.tsx            # terminal entry with status dot + close
│   │       ├── TerminalPane.tsx           # xterm.js viewport, copy/paste, Ctrl+wheel zoom, padding
│   │       ├── CommandPicker.tsx          # modal: pick command + branch (main/existing/new)
│   │       ├── ProjectConfigDialog.tsx    # edit name, folder, env, commands, terminal theme
│   │       ├── ThemeEditor.tsx            # custom theme creator/editor with live preview
│   │       ├── EmptyState.tsx             # first-run welcome
│   │       └── SearchBar.tsx              # terminal search UI (Ctrl+F)
│   │
│   └── shared/
│       └── types.ts                       # all shared types + IPC input shapes + bridge interface
```

## IPC Channels

All communication uses Electron's built-in IPC. No WebSocket needed.

### Request/Response (ipcRenderer.invoke → ipcMain.handle)

| Channel | Purpose |
|---------|---------|
| `terminal:open` | Spawn PTY (projectId, terminalId, commandId?, branchId?, cols, rows) |
| `terminal:write` | Send keystrokes to PTY |
| `terminal:resize` | Resize PTY dimensions |
| `terminal:close` | Kill PTY session |
| `terminal:restart` | Kill + respawn |
| `project:list` | Get all projects |
| `project:create` | Add project |
| `project:update` | Edit project (name, folder, env, commands) |
| `project:delete` | Remove project |
| `branch:create` | Full folder copy → new branch |
| `branch:delete` | Delete branch folder + config |
| `settings:get` | Get current settings (fontSize, sidebarWidth, etc.) |
| `settings:update` | Update settings (persisted to config.json) |
| `dialog:pick-folder` | Open native folder picker |
| `shell:open-external` | Open URL in browser |
| `shell:detect-wsl` | List available WSL distros |
| `shell:detect-commands` | Check PATH for claude, codex, shell |
| `theme:get-native` | Get system dark/light preference |
| `terminal:set-order` | Save terminal key order (JSON array in meta) |
| `terminal:get-order` | Load saved terminal key order |
| `git:get-branch` | Run `git rev-parse --abbrev-ref HEAD` in folder |
| `git:checkout` | Run `git checkout <branch>` in folder |
| `git:watch-branch` | Start `fs.watch` on `.git/HEAD` for live branch detection |
| `git:unwatch-branch` | Stop watching `.git/HEAD` |

### Push Events (webContents.send → ipcRenderer.on)

Per-terminal scoped channels — no dispatch/filtering needed in renderer:

| Channel | Purpose |
|---------|---------|
| `terminal:data:{terminalId}` | PTY output chunk |
| `terminal:exit:{terminalId}` | PTY process exited (exitCode, signal) |
| `terminal:activity:{terminalId}` | Activity state changed (activity + activityText) |
| `theme:native-changed` | System dark/light preference changed |
| `git:branch-changed` | Git branch changed in watched folder (folder, branch) |

## Key Implementation Details

### Shell Resolution (cross-platform)
- **macOS/Linux**: `$SHELL` → `/bin/zsh` → `/bin/bash` → `/bin/sh`
- **Windows**: `ComSpec` → `powershell.exe` → `cmd.exe`
- **WSL**: `wsl.exe -d <distro> -- bash -l` (detect distros via `wsl.exe -l -q`)

### PTY Management
- node-pty in Electron main process
- `xterm-256color` terminal name
- Graceful kill: SIGTERM → wait 1s → SIGKILL
- Env filtering: strip `ELECTRON_*`, `VITE_*`, `PTERM_*`, `NODE_*`, `npm_*` vars before PTY spawn
- Merge project env vars on top
- Stream data to renderer via `webContents.send(`terminal:data:${terminalId}`, data)`

### Copy/Paste
- **Mac**: Cmd+C/V handled natively by browser
- **Windows/Linux**: Ctrl+C copies if selection exists, otherwise passes through as SIGINT. Ctrl+V pastes (with `preventDefault()` to avoid double paste). Ctrl+Shift+C/V also work.

### Font Zoom + Sidebar Resize
- Ctrl+wheel in terminal or sidebar changes font size (6–32px range), persisted
- Sidebar width draggable (150–500px range), persisted
- Both restored from `~/.pterm/config.json` on launch

### Menus
- **Mac**: minimal app menu (About, Hide, Quit) + Edit (Copy, Paste, Select All) + Window (Minimize, Zoom, Close)
- **Windows/Linux**: no menu bar
- **Dev only**: Ctrl+Shift+I toggles DevTools (only when `VITE_DEV_SERVER_URL` is set)

### Activity Detection
- Poll every 2.5s per terminal, strategy depends on `CommandType`
- **Shell strategy**: `pgrep -P <pid>` (Unix), PowerShell WMI (Windows) — detects child processes
- **Claude strategy**: walks process tree to find Claude CLI, reads JSONL transcript from `~/.claude/sessions/` to determine state (idle → busy → working → waiting). Fast-path via `PTERM_ACTIVITY_FILE` written by Claude hooks.
- **Codex strategy**: similar transcript-based detection from `~/.codex/sessions/`
- 30s stale guard on activity files to detect crashed sessions
- **Claude hooks** (`claude-hooks.ts`): generates temp hook config injected via env, writes activity state to per-terminal file on `UserPromptSubmit`, `PreToolUse`, `Stop` events
- **Status dot colors**: green (working/busy), yellow (waiting for input), gray (idle/exited)
- **Activity text**: shown as sub-text in sidebar terminal tabs ("Running", "Using tools", "Waiting for input", etc.)

### Close Confirmation
- Intercept `BrowserWindow.on('close')` event
- Count terminals, show native dialog if any are open
- Kill all PTYs before allowing window close
- `before-quit` also cleans up terminals + flushes config

### Window Chrome
- Native window frames on all platforms (no custom title bar)
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

## Implementation Sequence

### Phase 1: Scaffold + Main Process ✅
1. Init repo, package.json, tsconfig, vite config, tsdown config
2. `src/shared/types.ts` — data model types
3. `src/main/shell-resolver.ts` — cross-platform shell resolution
4. `src/main/env-filter.ts` — env var filtering
5. `src/main/terminal-manager.ts` — PTY lifecycle (node-pty)
6. `src/main/config-store.ts` — JSON file persistence
7. `src/main/branch-manager.ts` — folder copy/delete
8. `src/main/ipc.ts` — register all ipcMain handlers
9. `src/main/index.ts` — app lifecycle, BrowserWindow
10. `src/preload/index.ts` — contextBridge

### Phase 2: React Frontend ✅
1. `src/renderer/bridge.ts` — typed ptermBridge accessor
2. `src/renderer/store.ts` — React context + useReducer (projects, terminals, fontSize, sidebarWidth)
3. `src/renderer/components/TerminalPane.tsx` — xterm.js with copy/paste + Ctrl+wheel zoom
4. `src/renderer/components/TerminalTab.tsx` — sidebar terminal entry with status dot
5. `src/renderer/components/CommandPicker.tsx` — modal: pick command + branch
6. `src/renderer/components/ProjectItem.tsx` — collapsible project tree node
7. `src/renderer/components/Sidebar.tsx` — project list with Ctrl+wheel zoom
8. `src/renderer/components/ProjectConfigDialog.tsx` — create/edit/delete project
9. `src/renderer/components/EmptyState.tsx` — welcome screen
10. `src/renderer/App.tsx` — layout with draggable sidebar
11. Settings IPC (get/update) + persisted font size and sidebar width
12. Platform-appropriate menus (Mac app menu, no menu on Windows/Linux)
13. Dev-only DevTools shortcut (Ctrl+Shift+I)

### Phase 3: Polish ✅
1. Dark/light theme with xterm theme sync (system/dark/light cycle, VS Code color themes)
2. Keyboard shortcuts (Ctrl+T new terminal, Ctrl+Tab/Shift+Tab cycle, Ctrl+F search)
3. WSL2 detection + shell option on Windows
4. Default command detection (check if codex/claude are on PATH)
5. Clickable URLs in terminal output (xterm WebLinksAddon → openExternal)
6. Terminal search (Ctrl+F with SearchBar component + xterm SearchAddon)
7. Tab reordering via drag and drop
8. Smart activity detection per command type (shell/claude/codex) with Claude hooks fast-path

### Phase 4: Branch-Aware Sidebar + Themes ✅
1. Git branch detection IPC (`git:get-branch`, `git:checkout`, `git:watch-branch`, `git:unwatch-branch`)
2. Live branch detection via `fs.watch` on `.git/HEAD` (no polling)
3. `BranchGroup` component — collapsible branch nodes with git branch labels
4. `ProjectItem` restructured to group terminals by branch
5. `CommandPicker` updated — existing branch selection, `defaultBranchId` prop for scoped [+] buttons
6. `BranchManager` dialog — switch branches on main folder, delete worktree branches
7. Terminal padding (4px top/left/bottom)
8. Terminal order persistence across restarts (saved in meta table)
9. 10 built-in terminal color themes (VS Code Dark/Light, Dracula, Nord, Catppuccin Mocha, Solarized Dark/Light, Gruvbox Dark, Tokyo Night, Monokai)
10. Per-project terminal theme override
11. Custom theme editor with color pickers, hex inputs, and live preview
12. `@types/react` and `@types/react-dom` v19 added for type checking

### Phase 5: Packaging
1. electron-builder config for Mac (dmg), Windows (NSIS), Linux (AppImage)
2. Code signing setup
3. Auto-update setup

## Verification

1. **Phase 1 done** ✅: Electron window opens, can spawn a PTY via IPC, type commands in devtools console
2. **Phase 2 done** ✅: Full UI works — create project, open terminals, run commands, switch between them, font zoom, sidebar resize, copy/paste
3. **Phase 3 done** ✅: Theme switching, keyboard shortcuts, terminal search, clickable URLs, drag-and-drop tab reordering, smart activity detection (shell/claude/codex), WSL2 + command detection
4. **Phase 4 done** ✅: Branch-aware sidebar tree, live git branch detection, terminal themes (10 built-in + custom editor), per-project theme overrides, terminal padding, order persistence
5. **Phase 5 done**: Packaged app launches and works on target platform
