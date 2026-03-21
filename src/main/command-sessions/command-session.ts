import type { ActivityUpdate } from "../../shared/types.js";

export interface CommandSession {
	/** Prepare env vars, config files, hooks. Called before PTY spawn. */
	setup(terminalId: string, env: Record<string, string>): void;

	/** Modify the command string (e.g. inject --settings, -c flags). */
	buildCommand(command: string): string;

	/** Build a resume command given the original command and session ID. */
	buildResumeCommand?(command: string, sessionId: string): string;

	/** Detect current activity state. Called every 2.5s by poll timer. */
	detectActivity(ptyPid: number): Promise<ActivityUpdate>;

	/** Start session tracking (find session ID for resume). Called after PTY spawn. */
	startTracking(ptyPid: number, onSessionId: (id: string) => void): void;

	/** Whether scrollback replay should be skipped (TUI commands). */
	skipScrollbackReplay: boolean;

	/** Clean up temp files, stop watchers. Called on terminal exit. */
	cleanup(): void;
}
