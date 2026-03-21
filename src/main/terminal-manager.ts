import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { WebContents } from "electron";
import * as pty from "node-pty";

import type {
	TerminalOpenInput,
	Project,
	Command,
	CommandType,
	Activity,
} from "../shared/types.js";
import { detectActivity } from "./activity-detector.js";
import type { AiSessionTracker } from "./ai-session-tracker.js";
import { writeClaudeHooksFile, cleanupClaudeHooksFile } from "./claude-hooks.js";
import { filterEnv } from "./env-filter.js";
import type { SessionStore } from "./session-store.js";
import { resolveShell } from "./shell-resolver.js";

/** Per-command-type resume/restore behavior. */
interface CommandStrategy {
	/** Build the resume command given the original command and session ID. */
	buildResumeCommand?(originalCommand: string, sessionId: string): string;
	/**
	 * If true, the command uses a TUI — scrollback is meaningless to replay
	 * because it's full of cursor-positioning escape sequences that only
	 * render correctly during a live session.
	 */
	skipScrollbackReplay: boolean;
}

const COMMAND_STRATEGIES: Partial<Record<CommandType, CommandStrategy>> = {
	claude: {
		buildResumeCommand: (cmd, sessionId) => `${cmd} --resume ${sessionId}`,
		skipScrollbackReplay: true,
	},
	codex: {
		skipScrollbackReplay: true,
	},
};

interface ManagedTerminal {
	pty: pty.IPty | null;
	webContents: WebContents;
	terminalId: string;
	projectId: string;
	branchId?: string;
	commandId?: string;
	commandName: string;
	commandType: CommandType;
	cwd: string;
	activity: Activity;
	activityText: string;
	activityFile?: string;
	sessionFile?: string;
	hooksFile?: string;
	pollTimer: ReturnType<typeof setInterval> | null;
	sessionWatchTimer?: ReturnType<typeof setInterval>;
	envVars?: Record<string, string>;
	cols: number;
	rows: number;
	closing: boolean;
}

const HISTORY_DIR = path.join(os.homedir(), ".pterm", "history");

export class TerminalManager {
	private terminals = new Map<string, ManagedTerminal>();
	private sessionStore: SessionStore | null = null;
	private aiSessionTracker: AiSessionTracker | null = null;
	private shuttingDown = false;

	setSessionStore(store: SessionStore): void {
		this.sessionStore = store;
	}

	setAiSessionTracker(tracker: AiSessionTracker): void {
		this.aiSessionTracker = tracker;
	}

	open(
		webContents: WebContents,
		input: TerminalOpenInput,
		project: Project,
		cwd: string,
		defaultCommands?: Command[],
	): void {
		const command = input.commandId
			? (project.commands.find((c) => c.id === input.commandId) ??
				defaultCommands?.find((c) => c.id === input.commandId))
			: undefined;

		const commandName = command?.name ?? "Shell";
		const commandType: CommandType = command?.type ?? "shell";
		const shell = resolveShell(command?.shell);
		const env = filterEnv(project.envVars);

		// Per-terminal shell history
		if (commandType === "shell") {
			fs.mkdirSync(HISTORY_DIR, { recursive: true });
			env.HISTFILE = path.join(HISTORY_DIR, `${input.terminalId}.history`);
		}

		// For Claude commands, inject env vars and pass hooks via --settings flag
		let activityFile: string | undefined;
		let sessionFile: string | undefined;
		let hooksFile: string | undefined;
		if (commandType === "claude") {
			activityFile = path.join(os.tmpdir(), `pterm-${input.terminalId}.activity`);
			sessionFile = path.join(os.tmpdir(), `pterm-${input.terminalId}.session`);
			env.PTERM_ACTIVITY_FILE = activityFile;
			env.PTERM_SESSION_FILE = sessionFile;
			hooksFile = writeClaudeHooksFile(input.terminalId);
		}

		const args = [...shell.args];
		if (command?.command) {
			let cmd = command.command;
			if (hooksFile) {
				cmd = `${cmd} --settings ${hooksFile}`;
			}
			if (process.platform === "win32") {
				args.push("/c", cmd);
			} else {
				args.push("-c", cmd);
			}
		}

		const ptyProcess = pty.spawn(shell.file, args, {
			name: "xterm-256color",
			cols: input.cols,
			rows: input.rows,
			cwd,
			env,
		});

		const pollTimer = setInterval(() => {
			void this.pollActivity(input.terminalId);
		}, 2500);

		const managed: ManagedTerminal = {
			pty: ptyProcess,
			webContents,
			terminalId: input.terminalId,
			projectId: input.projectId,
			branchId: input.branchId,
			commandId: input.commandId,
			commandName,
			commandType,
			cwd,
			activity: "idle",
			activityText: "",
			activityFile,
			sessionFile,
			hooksFile,
			pollTimer,
			envVars: project.envVars,
			cols: input.cols,
			rows: input.rows,
			closing: false,
		};

		this.terminals.set(input.terminalId, managed);

		// Persist session metadata
		this.sessionStore?.saveSession({
			terminalId: input.terminalId,
			projectId: input.projectId,
			commandId: input.commandId,
			branchId: input.branchId,
			commandName,
			commandType,
			cwd,
			cols: input.cols,
			rows: input.rows,
		});

		// For Claude: watch the session file written by the SessionStart hook
		if (sessionFile && this.sessionStore) {
			this.watchSessionFile(input.terminalId, sessionFile);
		}
		// For Codex: use the tracker (polling-based)
		if (commandType === "codex" && this.aiSessionTracker) {
			this.aiSessionTracker.trackCodex(input.terminalId, ptyProcess.pid, this.sessionStore!);
		}

		ptyProcess.onData((data) => {
			if (!webContents.isDestroyed()) {
				webContents.send(`terminal:data:${input.terminalId}`, data);
			}
			this.sessionStore?.appendScrollback(input.terminalId, Buffer.from(data));
		});

		ptyProcess.onExit(({ exitCode, signal }) => {
			clearInterval(pollTimer);
			this.cleanupActivityFile(input.terminalId);
			this.sessionStore?.flushScrollback(input.terminalId);
			const t = this.terminals.get(input.terminalId);
			// If close() is driving the shutdown, let it handle cleanup/status
			if (!t?.closing) {
				// During shutdown, leave sessions as "running" in DB so
				// markAllRunningAsExited() on next launch triggers restore
				if (!this.shuttingDown) {
					this.sessionStore?.updateSessionStatus(input.terminalId, "exited", exitCode);
				}
				this.aiSessionTracker?.stopTracking(input.terminalId);
				if (!webContents.isDestroyed()) {
					webContents.send(`terminal:exit:${input.terminalId}`, { exitCode, signal });
				}
				// Keep in map but null out pty — it's now a dead session
				if (t) {
					t.pty = null;
					t.pollTimer = null;
				}
			}
		});
	}

	write(terminalId: string, data: string): void {
		const t = this.terminals.get(terminalId);
		if (t?.pty) t.pty.write(data);
	}

	resize(terminalId: string, cols: number, rows: number): void {
		const t = this.terminals.get(terminalId);
		if (t) {
			if (t.pty) t.pty.resize(cols, rows);
			t.cols = cols;
			t.rows = rows;
		}
	}

	close(terminalId: string): Promise<void> {
		const t = this.terminals.get(terminalId);
		if (!t) return Promise.resolve();
		if (t.closing) return Promise.resolve();

		if (!t.pty) {
			// Already dead — just remove from map
			this.terminals.delete(terminalId);
			return Promise.resolve();
		}

		t.closing = true;

		return new Promise<void>((resolve) => {
			if (t.pollTimer) clearInterval(t.pollTimer);

			const killTimeout = setTimeout(() => {
				try {
					t.pty?.kill("SIGKILL");
				} catch {
					// already dead
				}
				this.terminals.delete(terminalId);
				resolve();
			}, 1000);

			t.pty!.onExit(() => {
				clearTimeout(killTimeout);
				this.terminals.delete(terminalId);
				resolve();
			});

			try {
				t.pty!.kill();
			} catch {
				clearTimeout(killTimeout);
				this.terminals.delete(terminalId);
				resolve();
			}
		});
	}

	/** Close and permanently delete from DB — used when user explicitly closes a tab. */
	async closeAndDelete(terminalId: string): Promise<void> {
		await this.close(terminalId);
		this.sessionStore?.deleteSession(terminalId);
		try {
			fs.unlinkSync(path.join(HISTORY_DIR, `${terminalId}.history`));
		} catch {
			// History file may not exist (non-shell commands don't create one)
		}
	}

	/** Restore a saved session: return scrollback and optionally spawn a new PTY. */
	restore(
		webContents: WebContents,
		terminalId: string,
		cols: number,
		rows: number,
		configStore: { getProject: (id: string) => Project | undefined },
	): { scrollback: string[]; respawned: boolean } {
		// Load session metadata to determine what kind of restore this is
		const sessions = this.sessionStore?.loadAllSessions() ?? [];
		const saved = sessions.find((s) => s.terminalId === terminalId);

		const strategy = saved ? COMMAND_STRATEGIES[saved.commandType as CommandType] : undefined;

		// TUI commands (claude, codex) produce scrollback full of escape sequences
		// that render as garbage when replayed — always skip for those types
		let scrollback: string[] = [];
		if (!strategy?.skipScrollbackReplay) {
			const scrollbackBuffers = this.sessionStore?.loadScrollback(terminalId) ?? [];
			scrollback = scrollbackBuffers.map((buf) => buf.toString("base64"));
		}

		if (!saved) return { scrollback, respawned: false };

		const project = configStore.getProject(saved.projectId);
		if (!project) return { scrollback, respawned: false };

		// If session was previously running (now marked exited by crash recovery), respawn
		if (saved.exitCode === -1) {
			const command = saved.commandId
				? project.commands.find((c) => c.id === saved.commandId)
				: undefined;

			// Use the command type's resume strategy to build the command
			let resumeCommand = command?.command;
			if (resumeCommand && saved.aiSessionId && strategy?.buildResumeCommand) {
				resumeCommand = strategy.buildResumeCommand(resumeCommand, saved.aiSessionId);
			}

			// Build a synthetic project with the resume command if needed
			let openProject = project;
			if (resumeCommand && command && resumeCommand !== command.command) {
				openProject = {
					...project,
					commands: project.commands.map((c) =>
						c.id === command.id ? { ...c, command: resumeCommand! } : c,
					),
				};
			}

			// Update session status back to running
			this.sessionStore?.updateSessionStatus(terminalId, "running");

			// Clear old scrollback — the new PTY will generate fresh output
			this.sessionStore?.deleteScrollback(terminalId);

			this.open(
				webContents,
				{
					projectId: saved.projectId,
					terminalId,
					commandId: saved.commandId,
					branchId: saved.branchId,
					cols,
					rows,
				},
				openProject,
				saved.cwd,
			);
		}

		return { scrollback, respawned: saved.exitCode === -1 };
	}

	async restart(
		webContents: WebContents,
		terminalId: string,
		project: Project,
		cwd: string,
	): Promise<void> {
		const t = this.terminals.get(terminalId);
		if (!t) return;

		const { cols, rows, commandId, branchId, projectId } = t;
		await this.close(terminalId);
		this.sessionStore?.deleteScrollback(terminalId);
		this.open(
			webContents,
			{ projectId, terminalId, commandId, branchId, cols, rows },
			project,
			cwd,
		);
	}

	async closeAll(): Promise<void> {
		this.shuttingDown = true;
		this.sessionStore?.flushAllScrollback();
		const promises = [...this.terminals.keys()].map((id) => this.close(id));
		await Promise.all(promises);
	}

	getBusyCount(): number {
		let count = 0;
		for (const t of this.terminals.values()) {
			if (t.pty && t.activity !== "idle") count++;
		}
		return count;
	}

	getTerminalCount(): number {
		let count = 0;
		for (const t of this.terminals.values()) {
			if (t.pty) count++;
		}
		return count;
	}

	getTerminalInfo(terminalId: string): { projectId: string; cwd: string } | undefined {
		const t = this.terminals.get(terminalId);
		if (!t) return undefined;
		return { projectId: t.projectId, cwd: t.cwd };
	}

	private async pollActivity(terminalId: string): Promise<void> {
		const t = this.terminals.get(terminalId);
		if (!t || !t.pty) return;

		try {
			const update = await detectActivity(t.pty.pid, t.commandType, t.activityFile);

			// Only emit if something changed
			if (t.activity !== update.activity || t.activityText !== update.activityText) {
				t.activity = update.activity;
				t.activityText = update.activityText;
				if (!t.webContents.isDestroyed()) {
					t.webContents.send(`terminal:activity:${terminalId}`, update);
				}
			}
		} catch {
			// Silently ignore detection errors
		}
	}

	/**
	 * Watch the session file written by Claude's SessionStart hook.
	 * Once the file appears with a session ID, store it in the DB.
	 */
	private watchSessionFile(terminalId: string, sessionFile: string): void {
		let attempts = 0;
		const timer = setInterval(() => {
			attempts++;
			try {
				const sessionId = fs.readFileSync(sessionFile, "utf-8").trim();
				if (sessionId) {
					this.sessionStore?.updateAiSessionId(terminalId, sessionId);
					clearInterval(timer);
				}
			} catch {
				// File not written yet
			}
			if (attempts > 20) clearInterval(timer); // give up after ~10s
		}, 500);

		const t = this.terminals.get(terminalId);
		if (t) t.sessionWatchTimer = timer;
	}

	private cleanupActivityFile(terminalId: string): void {
		const t = this.terminals.get(terminalId);
		if (!t) return;
		if (t.sessionWatchTimer) clearInterval(t.sessionWatchTimer);
		if (t.activityFile) {
			try {
				fs.unlinkSync(t.activityFile);
			} catch {
				/* already gone */
			}
		}
		if (t.sessionFile) {
			try {
				fs.unlinkSync(t.sessionFile);
			} catch {
				/* already gone */
			}
		}
		if (t.hooksFile) {
			cleanupClaudeHooksFile(terminalId);
		}
	}
}
