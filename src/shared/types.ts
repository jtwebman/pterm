export type ShellType =
	| "default"
	| "bash"
	| "zsh"
	| "fish"
	| "nushell"
	| "elvish"
	| "tcsh"
	| "ksh"
	| "dash"
	| "cmd"
	| "powershell"
	| "pwsh"
	| "wsl";

export function makeTerminalKey(projectId: string, terminalId: string): string {
	return `${projectId}:${terminalId}`;
}

export type CommandType = "shell" | "claude" | "codex" | "opencode";

export type Activity = "idle" | "busy" | "working" | "waiting";

export interface Command {
	id: string;
	name: string;
	command: string;
	type: CommandType;
	shell?: ShellType;
	customShell?: string;
	enabled?: boolean;
	builtin?: boolean;
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
	/** Terminal color theme ID override for this project */
	terminalTheme?: string;
	/** Browser command override for this project */
	browserCommand?: string;
	/** IDs of default commands disabled for this project */
	disabledDefaults?: string[];
}

export interface DetectedBrowser {
	name: string;
	command: string;
	type: "chrome" | "edge" | "brave" | "firefox" | "other";
	profiles?: BrowserProfile[];
}

export interface BrowserProfile {
	directory: string;
	name: string;
}

export interface CustomTerminalTheme {
	id: string;
	name: string;
	variant: "dark" | "light";
	colors: {
		background: string;
		foreground: string;
		cursor: string;
		cursorAccent: string;
		selectionBackground: string;
		selectionForeground: string;
		black: string;
		red: string;
		green: string;
		yellow: string;
		blue: string;
		magenta: string;
		cyan: string;
		white: string;
		brightBlack: string;
		brightRed: string;
		brightGreen: string;
		brightYellow: string;
		brightBlue: string;
		brightMagenta: string;
		brightCyan: string;
		brightWhite: string;
	};
}

export interface Config {
	projects: Project[];
	settings: {
		theme: "system" | "dark" | "light";
		terminalTheme?: string;
		browserCommand?: string;
		sidebarWidth: number;
		defaultShell?: ShellType;
		fontSize: number;
		defaultProjectCommands: Command[];
		customThemes?: CustomTerminalTheme[];
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
	terminalTheme?: string;
	browserCommand?: string;
	disabledDefaults?: string[];
}

export interface ProjectUpdateInput {
	id: string;
	name?: string;
	folder?: string;
	envVars?: Record<string, string>;
	commands?: Command[];
	worktreeCopyFiles?: string[];
	terminalTheme?: string;
	browserCommand?: string;
	disabledDefaults?: string[];
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

export interface DetectedShell {
	type: ShellType;
	name: string;
}

export interface SettingsUpdateInput {
	fontSize?: number;
	sidebarWidth?: number;
	theme?: "system" | "dark" | "light";
	terminalTheme?: string;
	browserCommand?: string;
	customThemes?: CustomTerminalTheme[];
	defaultProjectCommands?: Command[];
}

export interface ActivityUpdate {
	activity: Activity;
	activityText: string;
}

export interface DirEntry {
	name: string;
	isDirectory: boolean;
	/** true if the file/folder is gitignored (not tracked), i.e. won't be in a worktree */
	gitIgnored?: boolean;
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
		setOrder: (keys: string[]) => Promise<void>;
		getOrder: () => Promise<string[] | null>;
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
		openExternal: (url: string, browserCommand?: string) => Promise<void>;
		detectWsl: () => Promise<string[]>;
		detectCommands: () => Promise<DetectedCommand[]>;
		detectShells: () => Promise<DetectedShell[]>;
		detectBrowsers: () => Promise<DetectedBrowser[]>;
		listDir: (folder: string, gitRoot?: string) => Promise<DirEntry[]>;
	};
	git: {
		getBranch: (folder: string) => Promise<string | null>;
		listBranches: (folder: string) => Promise<string[]>;
		checkout: (folder: string, branch: string) => Promise<void>;
		watchBranch: (folder: string) => Promise<void>;
		unwatchBranch: (folder: string) => Promise<void>;
		onBranchChanged: (cb: (folder: string, branch: string) => void) => () => void;
	};
	theme: {
		getNative: () => Promise<boolean>;
		onNativeChanged: (cb: (isDark: boolean) => void) => () => void;
	};
	platform: string;
}
