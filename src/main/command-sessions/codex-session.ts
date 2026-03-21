import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ActivityUpdate } from "../../shared/types.js";
import {
	findDescendantByName,
	processHasChildren,
	readActivityFile,
} from "../activity-detector.js";
import { findMostRecentFile } from "../fs-utils.js";
import type { CommandSession } from "./command-session.js";

const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");
const CODEX_HOOKS_FILE = path.join(os.homedir(), ".codex", "hooks.json");

// UUID v7 pattern (also matches v4). Extracts from filenames like
// rollout-2026-03-17T11-35-09-019cfd14-901c-75c3-a71e-da31d8ead1b7.jsonl
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractUuid(value: string): string | null {
	const m = value.match(UUID_RE);
	return m ? m[0] : null;
}

/**
 * Write ~/.codex/hooks.json with pterm activity hooks.
 * Codex has a Claude-compatible hooks engine behind the `codex_hooks` feature flag.
 * Hooks fire for SessionStart, UserPromptSubmit, and Stop events.
 * When run outside pterm, $PTERM_ACTIVITY_FILE is unset so the commands are no-ops.
 */
function ensureCodexHooksFile(): void {
	const act = (state: string, text: string) =>
		`[ -n "$PTERM_ACTIVITY_FILE" ] && printf "${state}\\n${text}" > "$PTERM_ACTIVITY_FILE"`;

	const hook = (state: string, text: string) => ({
		type: "command" as const,
		command: act(state, text),
	});

	const hooks = {
		hooks: {
			UserPromptSubmit: [
				{
					matcher: "",
					hooks: [hook("working", "Thinking")],
				},
			],
			Stop: [
				{
					matcher: "",
					hooks: [hook("waiting", "Waiting for input")],
				},
			],
		},
	};

	try {
		// Only write if the file doesn't exist or has different content
		const desired = JSON.stringify(hooks);
		try {
			const existing = fs.readFileSync(CODEX_HOOKS_FILE, "utf-8");
			if (existing === desired) return;
		} catch {
			// File doesn't exist yet
		}
		fs.mkdirSync(path.dirname(CODEX_HOOKS_FILE), { recursive: true });
		fs.writeFileSync(CODEX_HOOKS_FILE, desired);
	} catch {
		// Non-fatal — hooks are a nice-to-have, JSONL watcher is the fallback
	}
}

export class CodexSession implements CommandSession {
	skipScrollbackReplay = true;

	private activityFile?: string;
	private jsonlWatchTimer?: ReturnType<typeof setInterval>;
	private jsonlOffset = 0;
	private jsonlPath?: string;
	private sessionIdFound = false;

	setup(terminalId: string, env: Record<string, string>): void {
		this.activityFile = path.join(os.tmpdir(), `pterm-${terminalId}.activity`);
		env.PTERM_ACTIVITY_FILE = this.activityFile;
		ensureCodexHooksFile();
	}

	buildCommand(command: string): string {
		// Enable the codex_hooks feature flag so hooks.json is loaded
		return `${command} --enable codex_hooks`;
	}

	buildResumeCommand(_command: string, sessionId: string): string {
		// sessionId may be a UUID directly, or a JSONL file path (from older sessions).
		// Extract the UUID if it looks like a path.
		const uuid = extractUuid(sessionId) ?? sessionId;
		return `codex resume ${uuid} --enable codex_hooks`;
	}

	async detectActivity(ptyPid: number): Promise<ActivityUpdate> {
		try {
			// Primary: read activity file (written by hooks or JSONL watcher)
			if (this.activityFile) {
				const fromFile = readActivityFile(this.activityFile);
				if (fromFile) return fromFile;
			}

			// Fallback: process tree heuristic
			const codexPid = await findDescendantByName(ptyPid, "codex");
			if (!codexPid) {
				return { activity: "idle", activityText: "" };
			}

			const hasChildren = await processHasChildren(codexPid);
			if (hasChildren) {
				return { activity: "working", activityText: "Running tools" };
			}

			// Codex running with no children = waiting for input, not "busy"
			return { activity: "waiting", activityText: "Waiting for input" };
		} catch {
			return { activity: "idle", activityText: "" };
		}
	}

	startTracking(_ptyPid: number, onSessionId: (id: string) => void): void {
		// Watch JSONL session files for session UUID and granular tool-use states.
		// Hooks handle the coarse transitions (thinking ↔ waiting), but JSONL
		// gives us function_call → "Using tools" which hooks can't provide.
		this.jsonlWatchTimer = setInterval(() => {
			this.pollJsonl(onSessionId);
		}, 500);
	}

	cleanup(): void {
		if (this.jsonlWatchTimer) clearInterval(this.jsonlWatchTimer);
		if (this.activityFile) {
			try {
				fs.unlinkSync(this.activityFile);
			} catch {
				/* already gone */
			}
		}
	}

	private pollJsonl(onSessionId: (id: string) => void): void {
		try {
			// Find the most recent JSONL file if we haven't locked onto one yet
			if (!this.jsonlPath) {
				const found = findMostRecentFile(CODEX_SESSIONS_DIR, ".jsonl");
				if (!found) return;
				this.jsonlPath = found;
				this.jsonlOffset = 0;
			}

			const stat = fs.statSync(this.jsonlPath);
			if (stat.size <= this.jsonlOffset) return;

			// Read only the new bytes
			const fd = fs.openSync(this.jsonlPath, "r");
			try {
				const buf = Buffer.alloc(stat.size - this.jsonlOffset);
				fs.readSync(fd, buf, 0, buf.length, this.jsonlOffset);
				this.jsonlOffset = stat.size;

				const lines = buf.toString("utf-8").split("\n").filter(Boolean);
				for (const line of lines) {
					try {
						const event = JSON.parse(line);
						this.processEvent(event, onSessionId);
					} catch {
						// Partial or invalid JSON line
					}
				}
			} finally {
				fs.closeSync(fd);
			}
		} catch {
			// File not ready or gone
		}
	}

	private processEvent(event: Record<string, unknown>, onSessionId: (id: string) => void): void {
		const topType = event.type as string | undefined;
		const payload = event.payload as Record<string, unknown> | undefined;

		// Extract session UUID from session_meta event (payload.id)
		if (!this.sessionIdFound && topType === "session_meta" && payload) {
			const id = payload.id as string | undefined;
			if (id) {
				this.sessionIdFound = true;
				onSessionId(id);
			}
		}

		// Map event types to activity state and write to activity file.
		// Top-level "type" is the envelope: "event_msg", "response_item", "turn_context".
		// The actual event kind is in payload.type for both "event_msg" and "response_item".
		if (!this.activityFile) return;

		const eventType =
			(topType === "event_msg" || topType === "response_item") && payload
				? (payload.type as string | undefined)
				: topType;

		let activity: string | undefined;
		let text: string | undefined;

		switch (eventType) {
			case "task_started":
			case "user_message":
			case "agent_message":
				activity = "working";
				text = "Thinking";
				break;
			case "function_call":
			case "custom_tool_call":
				activity = "working";
				text = "Using tools";
				break;
			case "function_call_output":
			case "custom_tool_call_output":
			case "reasoning":
				activity = "working";
				text = "Thinking";
				break;
			case "task_complete":
				activity = "waiting";
				text = "Waiting for input";
				break;
		}

		if (activity && text) {
			try {
				fs.writeFileSync(this.activityFile, `${activity}\n${text}`);
			} catch {
				// tmp file write failed — non-fatal
			}
		}
	}
}
