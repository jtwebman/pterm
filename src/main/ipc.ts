import { execFile as execFileCb, spawn } from "node:child_process";
import { watch, type FSWatcher, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { ipcMain, dialog, shell, nativeTheme } from "electron";
import type { BrowserWindow } from "electron";

import type {
	TerminalOpenInput,
	TerminalWriteInput,
	TerminalResizeInput,
	TerminalCloseInput,
	TerminalRestartInput,
	TerminalRestoreInput,
	ProjectCreateInput,
	ProjectUpdateInput,
	BranchCreateInput,
	BranchDeleteInput,
	SettingsUpdateInput,
} from "../shared/types.js";
import type { DirEntry } from "../shared/types.js";
import { createBranch, deleteBranch } from "./branch-manager.js";
import { detectBrowsers } from "./browser-detector.js";
import { detectCommands } from "./command-detector.js";
import type { ConfigStore } from "./config-store.js";
import type { SessionStore } from "./session-store.js";
import { detectShells, detectWslDistros } from "./shell-resolver.js";
import type { TerminalManager } from "./terminal-manager.js";

const execFile = promisify(execFileCb);
const gitWatchers = new Map<string, FSWatcher>();

export function closeAllGitWatchers(): void {
	for (const watcher of gitWatchers.values()) {
		watcher.close();
	}
	gitWatchers.clear();
}

export function registerIpcHandlers(
	terminalManager: TerminalManager,
	configStore: ConfigStore,
	sessionStore: SessionStore,
	getMainWindow: () => BrowserWindow | null,
): void {
	// Terminal
	ipcMain.handle("terminal:open", (event, input: TerminalOpenInput) => {
		const project = configStore.getProject(input.projectId);
		if (!project) throw new Error(`Project not found: ${input.projectId}`);

		let cwd = project.folder;
		if (input.branchId) {
			const branch = project.branches.find((b) => b.id === input.branchId);
			if (branch) cwd = branch.folder;
		}

		const defaults = configStore.getSettings().defaultProjectCommands;
		terminalManager.open(event.sender, input, project, cwd, defaults);
	});

	ipcMain.handle("terminal:write", (_event, input: TerminalWriteInput) => {
		terminalManager.write(input.terminalId, input.data);
	});

	ipcMain.handle("terminal:resize", (_event, input: TerminalResizeInput) => {
		terminalManager.resize(input.terminalId, input.cols, input.rows);
	});

	ipcMain.handle("terminal:close", (_event, input: TerminalCloseInput) => {
		return terminalManager.closeAndDelete(input.terminalId);
	});

	ipcMain.handle("terminal:restore", (event, input: TerminalRestoreInput) => {
		return terminalManager.restore(
			event.sender,
			input.terminalId,
			input.cols,
			input.rows,
			configStore,
		);
	});

	ipcMain.handle("terminal:get-saved-sessions", () => {
		return sessionStore.loadAllSessions();
	});

	ipcMain.handle("terminal:set-active-key", (_event, key: string) => {
		sessionStore.setMeta("activeTerminalKey", key);
	});

	ipcMain.handle("terminal:get-active-key", () => {
		return sessionStore.getMeta("activeTerminalKey");
	});

	ipcMain.handle("terminal:set-order", (_event, keys: string[]) => {
		sessionStore.setMeta("terminalOrder", JSON.stringify(keys));
	});

	ipcMain.handle("terminal:get-order", () => {
		const raw = sessionStore.getMeta("terminalOrder");
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	});

	ipcMain.handle("terminal:restart", (event, input: TerminalRestartInput) => {
		const info = terminalManager.getTerminalInfo(input.terminalId);
		if (!info) return;

		const project = configStore.getProject(info.projectId);
		if (!project) return;

		return terminalManager.restart(event.sender, input.terminalId, project, info.cwd);
	});

	// Projects
	ipcMain.handle("project:list", () => {
		return configStore.getProjects();
	});

	ipcMain.handle("project:create", (_event, input: ProjectCreateInput) => {
		return configStore.createProject(input);
	});

	ipcMain.handle("project:update", (_event, input: ProjectUpdateInput) => {
		return configStore.updateProject(input);
	});

	ipcMain.handle("project:delete", (_event, id: string) => {
		configStore.deleteProject(id);
	});

	// Branches
	ipcMain.handle("branch:create", async (_event, input: BranchCreateInput) => {
		const project = configStore.getProject(input.projectId);
		if (!project) throw new Error(`Project not found: ${input.projectId}`);

		const branch = await createBranch(project, input.name);
		configStore.addBranch(input.projectId, branch);
		return branch;
	});

	ipcMain.handle("branch:delete", async (_event, input: BranchDeleteInput) => {
		const project = configStore.getProject(input.projectId);
		if (!project) throw new Error(`Project not found: ${input.projectId}`);

		const branch = project.branches.find((b) => b.id === input.branchId);
		if (!branch) throw new Error(`Branch not found: ${input.branchId}`);

		await deleteBranch(project, branch);
		configStore.removeBranch(input.projectId, input.branchId);
	});

	// Git
	ipcMain.handle("git:get-branch", async (_event, folder: string) => {
		try {
			const { stdout } = await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: folder,
			});
			return stdout.trim() || null;
		} catch {
			return null;
		}
	});

	ipcMain.handle("git:list-branches", async (_event, folder: string) => {
		try {
			const { stdout } = await execFile("git", ["branch", "--list", "--all", "--no-color"], {
				cwd: folder,
			});
			return stdout
				.split("\n")
				.map((line) =>
					line
						.replace(/^\*?\s+/, "")
						.replace(/^remotes\/origin\//, "")
						.trim(),
				)
				.filter((name) => name && !name.includes("HEAD ->"));
		} catch {
			return [];
		}
	});

	ipcMain.handle("git:checkout", async (_event, folder: string, branch: string) => {
		await execFile("git", ["checkout", branch], { cwd: folder });
	});

	ipcMain.handle("git:watch-branch", (_event, folder: string) => {
		if (gitWatchers.has(folder)) return;

		// Resolve the directory containing HEAD.
		// For normal repos: .git/HEAD  →  watch .git/ directory
		// For worktrees: .git is a file with "gitdir: /path" → watch that directory
		let watchDir = join(folder, ".git");
		let headFilename = "HEAD";
		try {
			const st = statSync(watchDir);
			if (st.isFile()) {
				// Worktree: .git is a file like "gitdir: /path/to/.git/worktrees/branch-name"
				const content = readFileSync(watchDir, "utf-8").trim();
				const match = content.match(/^gitdir:\s*(.+)$/);
				if (match) {
					watchDir = match[1];
				}
			}
		} catch {
			/* fall back to default */
		}

		try {
			// Watch the directory — git replaces HEAD atomically (write tmp + rename)
			// which can break file-level watchers on Linux. Directory watchers see
			// the rename event with the filename.
			const watcher = watch(watchDir, { persistent: false }, async (_eventType, filename) => {
				if (filename && filename !== headFilename) return;
				try {
					const { stdout } = await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
						cwd: folder,
					});
					const branch = stdout.trim();
					if (branch) {
						const win = getMainWindow();
						if (win) win.webContents.send("git:branch-changed", folder, branch);
					}
				} catch {
					/* not a git repo anymore or detached HEAD */
				}
			});
			gitWatchers.set(folder, watcher);
		} catch {
			/* directory doesn't exist */
		}
	});

	ipcMain.handle("git:unwatch-branch", (_event, folder: string) => {
		const watcher = gitWatchers.get(folder);
		if (watcher) {
			watcher.close();
			gitWatchers.delete(folder);
		}
	});

	// Settings
	ipcMain.handle("settings:get", () => {
		return configStore.getSettings();
	});

	ipcMain.handle("settings:update", (_event, input: SettingsUpdateInput) => {
		return configStore.updateSettings(input);
	});

	// Dialogs
	ipcMain.handle("dialog:pick-folder", async () => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	});

	ipcMain.handle("shell:open-external", (_event, url: string, browserCommand?: string) => {
		if (!/^https?:\/\//.test(url)) return;

		if (browserCommand) {
			// Parse command string into executable + args
			// Handles: "/path with spaces/exe" --flag="value with spaces"
			const args: string[] = [];
			let i = 0;
			const src = browserCommand.trim();
			while (i < src.length) {
				if (src[i] === '"') {
					// Standalone quoted token: "..."
					const end = src.indexOf('"', i + 1);
					if (end === -1) {
						args.push(src.slice(i + 1));
						break;
					}
					args.push(src.slice(i + 1, end));
					i = end + 1;
				} else {
					// Unquoted token — may contain embedded quotes like --flag="val"
					let token = "";
					while (i < src.length && src[i] !== " ") {
						if (src[i] === '"') {
							// Embedded quote: consume until closing quote
							const end = src.indexOf('"', i + 1);
							if (end === -1) {
								token += src.slice(i + 1);
								i = src.length;
								break;
							}
							token += src.slice(i + 1, end);
							i = end + 1;
						} else {
							token += src[i];
							i++;
						}
					}
					if (token) args.push(token);
				}
				// Skip whitespace between tokens
				while (i < src.length && src[i] === " ") i++;
			}
			const exe = args.shift()!;
			args.push(url);
			const child = spawn(exe, args, { detached: true, stdio: "ignore" });
			child.unref();
			return;
		}

		// Platform-appropriate fallback
		const platform = process.platform;
		if (platform === "linux") {
			const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
			child.unref();
			return;
		}
		if (platform === "darwin") {
			const child = spawn("open", [url], { detached: true, stdio: "ignore" });
			child.unref();
			return;
		}
		// Windows native Electron — works fine
		return shell.openExternal(url);
	});

	// Browser detection
	ipcMain.handle("shell:detect-browsers", () => {
		return detectBrowsers();
	});

	// Directory listing with git-ignore detection
	ipcMain.handle(
		"shell:list-dir",
		async (_event, folder: string, gitRoot?: string): Promise<DirEntry[]> => {
			let entries: string[];
			try {
				entries = readdirSync(folder);
			} catch {
				return [];
			}

			const result: DirEntry[] = [];
			for (const name of entries) {
				try {
					const st = statSync(join(folder, name));
					result.push({ name, isDirectory: st.isDirectory() });
				} catch {
					// skip entries we can't stat
				}
			}
			result.sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

			// Check which entries are gitignored (these are the useful ones to copy)
			if (gitRoot && result.length > 0) {
				const paths = result.map((e) => join(folder, e.name));
				try {
					// git check-ignore exits 1 when no paths are ignored
					const { stdout } = await execFile("git", ["check-ignore", ...paths], {
						cwd: gitRoot,
					}).catch((err: unknown) => {
						const execErr = err as { stdout?: string };
						if (execErr.stdout) return { stdout: execErr.stdout };
						return { stdout: "" };
					});
					const ignoredSet = new Set(stdout.trim().split("\n").filter(Boolean));
					for (const entry of result) {
						entry.gitIgnored = ignoredSet.has(join(folder, entry.name));
					}
				} catch {
					// If git isn't available, leave gitIgnored undefined
				}
			}

			return result;
		},
	);

	// Shell detection
	ipcMain.handle("shell:detect-shells", () => {
		return detectShells();
	});

	// WSL detection
	ipcMain.handle("shell:detect-wsl", () => {
		return detectWslDistros();
	});

	// Command detection
	ipcMain.handle("shell:detect-commands", () => {
		return detectCommands();
	});

	// Theme
	ipcMain.handle("theme:get-native", () => {
		return nativeTheme.shouldUseDarkColors;
	});

	nativeTheme.on("updated", () => {
		const win = getMainWindow();
		if (win) {
			win.webContents.send("theme:native-changed", nativeTheme.shouldUseDarkColors);
		}
	});
}
