export type ShellType = "default" | "bash" | "zsh" | "cmd" | "powershell" | "wsl";

export function makeTerminalKey(projectId: string, terminalId: string): string {
  return `${projectId}:${terminalId}`;
}

export type CommandType = "shell" | "claude" | "codex";

export type Activity = "idle" | "busy" | "working" | "waiting";

export interface Command {
  id: string;
  name: string;
  command: string;
  type: CommandType;
  shell?: ShellType;
}

export interface ProjectBranch {
  id: string;
  name: string;
  folder: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  folder: string;
  envVars: Record<string, string>;
  commands: Command[];
  branches: ProjectBranch[];
  /** Glob patterns of files to copy into new worktrees (e.g. ".env", ".env.local") */
  worktreeCopyFiles: string[];
}

export interface Config {
  projects: Project[];
  settings: {
    theme: "system" | "dark" | "light";
    sidebarWidth: number;
    defaultShell?: ShellType;
    fontSize: number;
    defaultProjectCommands: Command[];
  };
}

export interface TerminalSession {
  key: string;
  projectId: string;
  branchId?: string;
  terminalId: string;
  commandId?: string;
  commandName: string;
  commandType: CommandType;
  status: "running" | "exited";
  activity: Activity;
  activityText: string;
  exitCode?: number;
  restored?: boolean;
  aiSessionId?: string;
}

// IPC input types

export interface TerminalOpenInput {
  projectId: string;
  terminalId: string;
  commandId?: string;
  branchId?: string;
  cols: number;
  rows: number;
}

export interface TerminalWriteInput {
  terminalId: string;
  data: string;
}

export interface TerminalResizeInput {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface TerminalCloseInput {
  terminalId: string;
}

export interface TerminalRestoreInput {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface SavedSession {
  terminalId: string;
  projectId: string;
  commandId?: string;
  branchId?: string;
  commandName: string;
  commandType: CommandType;
  status: "running" | "exited";
  exitCode?: number;
  cwd: string;
  cols: number;
  rows: number;
  aiSessionId?: string;
}

export interface TerminalRestartInput {
  terminalId: string;
}

export interface ProjectCreateInput {
  name: string;
  folder: string;
  envVars: Record<string, string>;
  commands: Command[];
  worktreeCopyFiles: string[];
}

export interface ProjectUpdateInput {
  id: string;
  name?: string;
  folder?: string;
  envVars?: Record<string, string>;
  commands?: Command[];
  worktreeCopyFiles?: string[];
}

export interface BranchCreateInput {
  projectId: string;
  name: string;
}

export interface BranchDeleteInput {
  projectId: string;
  branchId: string;
}

// Preload bridge shape

export interface DetectedCommand {
  name: string;
  command: string;
  type: CommandType;
}

export interface SettingsUpdateInput {
  fontSize?: number;
  sidebarWidth?: number;
  theme?: "system" | "dark" | "light";
}

export interface ActivityUpdate {
  activity: Activity;
  activityText: string;
}

export interface PtermBridge {
  terminal: {
    open: (input: TerminalOpenInput) => Promise<void>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    close: (input: TerminalCloseInput) => Promise<void>;
    restart: (input: TerminalRestartInput) => Promise<void>;
    restore: (input: TerminalRestoreInput) => Promise<{ scrollback: string[]; respawned: boolean }>;
    getSavedSessions: () => Promise<SavedSession[]>;
    setActiveKey: (key: string) => Promise<void>;
    getActiveKey: () => Promise<string | null>;
    onData: (terminalId: string, cb: (data: string) => void) => void;
    offData: (terminalId: string) => void;
    onExit: (terminalId: string, cb: (data: { exitCode: number; signal?: number }) => void) => void;
    offExit: (terminalId: string) => void;
    onActivity: (terminalId: string, cb: (data: ActivityUpdate) => void) => void;
    offActivity: (terminalId: string) => void;
  };
  project: {
    list: () => Promise<Project[]>;
    create: (input: ProjectCreateInput) => Promise<Project>;
    update: (input: ProjectUpdateInput) => Promise<Project>;
    delete: (id: string) => Promise<void>;
  };
  branch: {
    create: (input: BranchCreateInput) => Promise<ProjectBranch>;
    delete: (input: BranchDeleteInput) => Promise<void>;
  };
  settings: {
    get: () => Promise<Config["settings"]>;
    update: (input: SettingsUpdateInput) => Promise<Config["settings"]>;
  };
  dialog: {
    pickFolder: () => Promise<string | null>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    detectWsl: () => Promise<string[]>;
    detectCommands: () => Promise<DetectedCommand[]>;
  };
  theme: {
    getNative: () => Promise<boolean>;
    onNativeChanged: (cb: (isDark: boolean) => void) => () => void;
  };
  platform: string;
}
