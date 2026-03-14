export type ShellType = "default" | "bash" | "zsh" | "cmd" | "powershell" | "wsl";

export interface Command {
  id: string;
  name: string;
  command: string;
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
  status: "running" | "exited";
  busy: boolean;
  exitCode?: number;
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

export interface TerminalRestartInput {
  terminalId: string;
}

export interface ProjectCreateInput {
  name: string;
  folder: string;
  envVars: Record<string, string>;
  commands: Command[];
}

export interface ProjectUpdateInput {
  id: string;
  name?: string;
  folder?: string;
  envVars?: Record<string, string>;
  commands?: Command[];
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

export interface SettingsUpdateInput {
  fontSize?: number;
  sidebarWidth?: number;
}

export interface PtermBridge {
  terminal: {
    open: (input: TerminalOpenInput) => Promise<void>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    close: (input: TerminalCloseInput) => Promise<void>;
    restart: (input: TerminalRestartInput) => Promise<void>;
    onData: (terminalId: string, cb: (data: string) => void) => void;
    offData: (terminalId: string) => void;
    onExit: (terminalId: string, cb: (data: { exitCode: number; signal?: number }) => void) => void;
    offExit: (terminalId: string) => void;
    onBusy: (terminalId: string, cb: (busy: boolean) => void) => void;
    offBusy: (terminalId: string) => void;
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
  };
  platform: string;
}
