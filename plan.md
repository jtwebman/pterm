# pterm — Project Terminal Multiplexer

## Context

A cross-platform desktop app — a terminal multiplexer organized around **projects**. Each project points to a folder, has its own env vars and configurable commands, and can have multiple terminal sessions. Users run CLI tools (codex, claude, shells, etc.) directly in real terminal panes.

**Project branches** — full-copy clones of a project folder so you can work on multiple things in parallel without conflicts (preserves `.env`, `node_modules`, everything git worktrees would ignore).

## Requirements

1. **Sidebar with projects** — tree view, expand to see terminals
2. **Terminals under projects** — click to switch, real PTY terminals
3. **Cross-platform**: Mac (zsh/bash), Windows (cmd, PowerShell, WSL2), Linux (bash/zsh)
4. **Easy command launching** — `+` button or right-click project, pick from configured commands
5. **Extensible commands** — users add any command (codex, claude, npm run dev, etc.)
6. **Per-project env vars** — injected into all terminals for that project
7. **Project branches** — full folder copy to a separate path for parallel work

## Tech Stack

- **Electron 41** — cross-platform desktop shell
- **Node 24** — native TypeScript (`--experimental-strip-types`)
- **React 19 + Vite** — frontend renderer
- **@xterm/xterm 6 + @xterm/addon-fit 0.11** — terminal rendering
- **node-pty 1.1** — cross-platform PTY spawning (in Electron main process), requires `@electron/rebuild`
- **tsdown 0.20** — bundles main + preload TypeScript
- **Electron IPC** — communication between main and renderer (no WebSocket, no separate server)
- **React context + useReducer** — state management (no external library)
- **TailwindCSS** — styling
- **JSON file** — config persistence (`~/.pterm/config.json`)
- **crypto.randomUUID()** — ID generation (no nanoid dependency)

No Effect.ts, no SQLite, no schema validation libraries, no WebSocket server, no Zustand, no nanoid. Plain TypeScript + async/await + Electron IPC + React built-ins.

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
    sidebarWidth: number;
    defaultShell?: ShellType;
    fontSize: number;
    defaultProjectCommands: Command[];
  };
}

interface Project {
  id: string;           // crypto.randomUUID()
  name: string;
  folder: string;       // absolute path
  envVars: Record<string, string>;
  commands: Command[];
  branches: ProjectBranch[];
}

interface Command {
  id: string;
  name: string;         // "Shell", "Codex", "Claude", "npm run dev"
  command: string;      // "" (empty = default shell), "codex", "claude", etc.
  shell?: ShellType;    // override shell for this command
}

type ShellType = "default" | "bash" | "zsh" | "cmd" | "powershell" | "wsl";

interface ProjectBranch {
  id: string;
  name: string;         // user-given label like "feature-auth"
  folder: string;       // path to the copied folder
  createdAt: string;    // ISO date
}

// Client-side only (React context + useReducer)
interface TerminalSession {
  key: string;          // "projectId:terminalId"
  projectId: string;
  branchId?: string;    // if running in a branch copy
  terminalId: string;
  commandName: string;
  status: "running" | "exited";
  busy: boolean;        // true if shell has child processes (polled every 2-3s)
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
├── package.json                        # root, electron + deps
├── tsdown.config.ts                    # bundles main.ts + preload.ts
├── vite.config.ts                      # React renderer
├── electron-builder.yml                # packaging config
├── index.html                          # Vite entry
│
├── src/
│   ├── main/                           # Electron main process
│   │   ├── index.ts                    # app lifecycle, BrowserWindow
│   │   ├── ipc.ts                      # ipcMain handlers (terminal, project, branch)
│   │   ├── terminal-manager.ts         # PTY lifecycle, history, events
│   │   ├── shell-resolver.ts           # cross-platform shell fallback chains
│   │   ├── config-store.ts             # JSON file CRUD for projects
│   │   ├── branch-manager.ts           # folder copy/delete
│   │   └── env-filter.ts              # strip Electron vars, merge project env
│   │
│   ├── preload/
│   │   └── index.ts                    # contextBridge: ptermBridge
│   │
│   ├── renderer/                       # React app
│   │   ├── main.tsx                    # React entry
│   │   ├── App.tsx                     # layout: sidebar | terminal pane
│   │   ├── index.css                   # tailwind
│   │   ├── bridge.ts                   # ptermBridge type + accessor
│   │   ├── store.ts                    # React context + useReducer: projects, terminals, active state
│   │   ├── terminal-links.ts           # clickable paths/URLs in terminal
│   │   └── components/
│   │       ├── Sidebar.tsx
│   │       ├── ProjectItem.tsx
│   │       ├── TerminalTab.tsx
│   │       ├── TerminalPane.tsx        # xterm.js viewport
│   │       ├── CommandPicker.tsx       # popover to launch terminals
│   │       ├── ProjectConfigDialog.tsx # edit name, folder, env, commands
│   │       ├── BranchDialog.tsx        # create/manage project branches
│   │       └── EmptyState.tsx
│   │
│   └── shared/
│       └── types.ts                    # Project, Command, Branch, IPC channel types
```

Single package, no monorepo. Electron apps with Vite use this flat structure well (see electron-vite or similar setups).

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
| `dialog:pick-folder` | Open native folder picker |
| `shell:open-external` | Open URL in browser |

### Push Events (webContents.send → ipcRenderer.on)

Per-terminal scoped channels — no dispatch/filtering needed in renderer:

| Channel | Purpose |
|---------|---------|
| `terminal:data:{terminalId}` | PTY output chunk |
| `terminal:exit:{terminalId}` | PTY process exited (exitCode, signal) |
| `terminal:busy:{terminalId}` | Activity state changed (busy: boolean) |

## UI Layout

```
┌─ Sidebar (250px) ──────┬─ Terminal Area ─────────────────┐
│ [+ Add Project]         │                                 │
│                         │  $ codex                        │
│ ▼ my-web-app            │  > Analyzing your project...    │
│   ● Shell               │  > Reading src/index.ts         │
│   ● Codex  ← active     │  > ...                          │
│   [+]                   │                                 │
│                         │                                 │
│ ▼ my-web-app/feature-x  │                                 │
│   ● Claude              │                                 │
│   [+]                   │                                 │
│                         │                                 │
│ ▶ api-server            │                                 │
│                         │                                 │
│ ─────────────────────── │                                 │
│ [Settings]              │                                 │
└─────────────────────────┴─────────────────────────────────┘
```

Project branches appear as sub-entries (e.g., `my-web-app/feature-x`). They share the parent's commands and env vars but run in the copied folder.

## Key Implementation Details

### Shell Resolution (cross-platform)
- **macOS/Linux**: `$SHELL` → `/bin/zsh` → `/bin/bash` → `/bin/sh`
- **Windows**: `ComSpec` → `powershell.exe` → `cmd.exe`
- **WSL**: `wsl.exe -d <distro> -- bash -l` (detect distros via `wsl.exe -l -q`)
- Fallback chain: if first shell fails to spawn, try next candidate

### PTY Management
- node-pty in Electron main process
- `xterm-256color` terminal name
- Ensure spawn-helper executable permission on Linux (critical for packaged apps)
- Graceful kill: SIGTERM → wait 1s → SIGKILL
- Env filtering: strip `ELECTRON_*`, `VITE_*`, `PTERM_*` vars before PTY spawn (gives user a clean shell, prevents Electron internals from leaking into child processes)
- Merge project env vars on top
- Stream data to renderer via `webContents.send(`terminal:data:${terminalId}`, data)`

### Project Branches (folder copy)
```typescript
async function createBranch(project: Project, branchName: string): Promise<ProjectBranch> {
  const destFolder = join(branchStorePath, project.id, slugify(branchName));
  await cp(project.folder, destFolder, { recursive: true });
  return { id: crypto.randomUUID(), name: branchName, folder: destFolder, createdAt: new Date().toISOString() };
}
```
- Uses Node's `fs.cp()` (recursive copy)
- Branches stored in `~/.pterm/branches/{projectId}/{branch-slug}/`
- Full copy preserves `.env`, `node_modules`, everything
- Delete removes the folder entirely

### Config Persistence
- `~/.pterm/config.json` — human-editable JSON
- Atomic writes (write `.tmp`, rename)
- Debounced (200ms) to avoid thrashing

### Preload Bridge

Per-terminal scoped channels: each terminal gets its own `terminal:data:{id}` and `terminal:exit:{id}` channel. No global dispatch, no filtering. Component mounts → subscribes to its channel. Component unmounts → removes listeners.

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld("ptermBridge", {
  terminal: {
    open: (input) => ipcRenderer.invoke("terminal:open", input),
    write: (input) => ipcRenderer.invoke("terminal:write", input),
    resize: (input) => ipcRenderer.invoke("terminal:resize", input),
    close: (input) => ipcRenderer.invoke("terminal:close", input),
    restart: (input) => ipcRenderer.invoke("terminal:restart", input),
    onData: (terminalId, cb) => {
      ipcRenderer.on(`terminal:data:${terminalId}`, (_, data) => cb(data));
    },
    offData: (terminalId) => {
      ipcRenderer.removeAllListeners(`terminal:data:${terminalId}`);
    },
    onExit: (terminalId, cb) => {
      ipcRenderer.on(`terminal:exit:${terminalId}`, (_, data) => cb(data));
    },
    offExit: (terminalId) => {
      ipcRenderer.removeAllListeners(`terminal:exit:${terminalId}`);
    },
    onBusy: (terminalId, cb) => {
      ipcRenderer.on(`terminal:busy:${terminalId}`, (_, busy) => cb(busy));
    },
    offBusy: (terminalId) => {
      ipcRenderer.removeAllListeners(`terminal:busy:${terminalId}`);
    },
  },
  project: {
    list: () => ipcRenderer.invoke("project:list"),
    create: (input) => ipcRenderer.invoke("project:create", input),
    update: (input) => ipcRenderer.invoke("project:update", input),
    delete: (id) => ipcRenderer.invoke("project:delete", id),
  },
  branch: {
    create: (input) => ipcRenderer.invoke("branch:create", input),
    delete: (input) => ipcRenderer.invoke("branch:delete", input),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  },
  platform: process.platform,
});
```

### xterm.js Terminal Pane
- Terminal instance: cursor blink, 12px, SF Mono font stack, 100,000-line scrollback (configurable in settings)
- FitAddon for responsive sizing
- Theme from CSS computed styles, MutationObserver for dark/light changes
- `terminal.onData()` → `ptermBridge.terminal.write()`
- `ptermBridge.terminal.onData(terminalId, cb)` → `terminal.write(data)`
- `ptermBridge.terminal.offData(terminalId)` on unmount
- Custom link provider for clickable file paths and URLs (Phase 3)
- Keyboard shortcuts: Ctrl+L/Cmd+K clear, Ctrl+Left/Right word movement

### Activity Detection
- Poll child processes every 2-3s per terminal
- Unix: `pgrep -P <shellPid>` (fallback: `ps -eo pid=,ppid=`)
- Windows: `Get-CimInstance Win32_Process -Filter "ParentProcessId=<pid>"`
- Push `terminal:busy:{terminalId}` events to renderer
- Sidebar shows busy indicator (green dot = idle, yellow = busy)

### Close Confirmation
- Intercept `BrowserWindow.on('close')` event
- Count terminals with `busy: true`
- Show native dialog: "You have X active terminal sessions (Y busy). Close all?"
- Kill all PTYs (SIGTERM → SIGKILL) before allowing window close

### Window Chrome
- Native window frames on all platforms (no custom title bar)
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

## Implementation Sequence

### Phase 1: Scaffold + Main Process
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

### Phase 2: React Frontend
1. `src/renderer/main.tsx` + `App.tsx` + `index.css` — Vite/React/Tailwind setup
2. `src/renderer/bridge.ts` — typed ptermBridge accessor
3. `src/renderer/store.ts` — React context + useReducer (AppContext, useApp hook)
4. `src/renderer/components/TerminalPane.tsx` — xterm.js (highest priority)
5. `src/renderer/components/Sidebar.tsx` + `ProjectItem.tsx` + `TerminalTab.tsx`
6. `src/renderer/components/CommandPicker.tsx` — launch terminals
7. `src/renderer/components/ProjectConfigDialog.tsx` — project settings
8. `src/renderer/components/EmptyState.tsx` — first-run

### Phase 3: Project Branches + Polish
1. `src/renderer/components/BranchDialog.tsx` — create/manage branches
2. Branch entries in sidebar
3. WSL2 detection + shell option on Windows
4. Dark/light theme with xterm theme sync
5. Keyboard shortcuts
6. Default command detection (check if codex/claude are on PATH)
7. `src/renderer/terminal-links.ts` — clickable paths/URLs

### Phase 4: Packaging
1. electron-builder config for Mac (dmg), Windows (NSIS), Linux (AppImage)
2. Code signing setup (defer)
3. Auto-update setup (defer)

## Verification

1. **Phase 1 done**: Electron window opens, can spawn a PTY via IPC, type commands in devtools console
2. **Phase 2 done**: Full UI works — create project, open terminals, run commands, switch between them
3. **Phase 3 done**: Create a branch, open terminals in branch folder, delete branch, WSL works on Windows
4. **Phase 4 done**: Packaged app launches and works on target platform
