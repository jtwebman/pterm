import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ActivityUpdate } from "../../shared/types.js";
import {
	findDescendantByName,
	processHasChildren,
	readActivityFile,
} from "../activity-detector.js";
import type { CommandSession } from "./command-session.js";

export class ClaudeSession implements CommandSession {
	skipScrollbackReplay = true;

	private activityFile?: string;
	private sessionFile?: string;
	private hooksFile?: string;
	private sessionWatchTimer?: ReturnType<typeof setInterval>;

	setup(terminalId: string, env: Record<string, string>): void {
		this.activityFile = path.join(os.tmpdir(), `pterm-${terminalId}.activity`);
		this.sessionFile = path.join(os.tmpdir(), `pterm-${terminalId}.session`);
		env.PTERM_ACTIVITY_FILE = this.activityFile;
		env.PTERM_SESSION_FILE = this.sessionFile;
		this.hooksFile = this.writeHooksFile(terminalId);
	}

	buildCommand(command: string): string {
		if (this.hooksFile) {
			return `${command} --settings ${this.hooksFile}`;
		}
		return command;
	}

	buildResumeCommand(command: string, sessionId: string): string {
		return `${command} --resume ${sessionId}`;
	}

	async detectActivity(ptyPid: number): Promise<ActivityUpdate> {
		try {
			if (this.activityFile) {
				const fromFile = readActivityFile(this.activityFile);
				if (fromFile) return fromFile;
			}

			const claudePid = await findDescendantByName(ptyPid, "claude");
			if (claudePid) {
				const hasChildren = await processHasChildren(claudePid);
				if (hasChildren) {
					return { activity: "working", activityText: "Thinking" };
				}
			}

			return { activity: "idle", activityText: "" };
		} catch {
			return { activity: "idle", activityText: "" };
		}
	}

	startTracking(_ptyPid: number, onSessionId: (id: string) => void): void {
		if (!this.sessionFile) return;

		const sessionFile = this.sessionFile;
		let attempts = 0;
		this.sessionWatchTimer = setInterval(() => {
			attempts++;
			try {
				const sessionId = fs.readFileSync(sessionFile, "utf-8").trim();
				if (sessionId) {
					onSessionId(sessionId);
					if (this.sessionWatchTimer) clearInterval(this.sessionWatchTimer);
				}
			} catch {
				// File not written yet
			}
			if (attempts > 20 && this.sessionWatchTimer) clearInterval(this.sessionWatchTimer);
		}, 500);
	}

	cleanup(): void {
		if (this.sessionWatchTimer) clearInterval(this.sessionWatchTimer);
		if (this.activityFile) {
			try {
				fs.unlinkSync(this.activityFile);
			} catch {
				/* already gone */
			}
		}
		if (this.sessionFile) {
			try {
				fs.unlinkSync(this.sessionFile);
			} catch {
				/* already gone */
			}
		}
		if (this.hooksFile) {
			try {
				fs.unlinkSync(this.hooksFile);
			} catch {
				/* already gone */
			}
		}
	}

	private writeHooksFile(terminalId: string): string {
		const act = (state: string, text: string) =>
			`[ -n "$PTERM_ACTIVITY_FILE" ] && printf "${state}\\n${text}" > "$PTERM_ACTIVITY_FILE"`;

		const asyncHook = (state: string, text: string) => ({
			type: "command" as const,
			command: act(state, text),
			async: true,
		});

		const hooks = {
			hooks: {
				SessionStart: [
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command:
									'[ -n "$PTERM_SESSION_FILE" ] && jq -r .session_id > "$PTERM_SESSION_FILE"',
							},
						],
					},
				],
				UserPromptSubmit: [
					{
						matcher: "",
						hooks: [asyncHook("working", "Thinking")],
					},
				],
				PreToolUse: [
					{
						matcher: "",
						hooks: [asyncHook("working", "Using tools")],
					},
				],
				PostToolUse: [
					{
						matcher: "",
						hooks: [asyncHook("working", "Thinking")],
					},
				],
				SubagentStart: [
					{
						matcher: "",
						hooks: [asyncHook("working", "Running agent")],
					},
				],
				SubagentStop: [
					{
						matcher: "",
						hooks: [asyncHook("working", "Thinking")],
					},
				],
				PreCompact: [
					{
						matcher: "",
						hooks: [asyncHook("busy", "Compacting context")],
					},
				],
				PostCompact: [
					{
						matcher: "",
						hooks: [asyncHook("working", "Thinking")],
					},
				],
				Stop: [
					{
						matcher: "",
						hooks: [asyncHook("waiting", "Waiting for input")],
					},
				],
			},
		};

		const filePath = path.join(os.tmpdir(), `pterm-hooks-${terminalId}.json`);
		fs.writeFileSync(filePath, JSON.stringify(hooks));
		return filePath;
	}
}
