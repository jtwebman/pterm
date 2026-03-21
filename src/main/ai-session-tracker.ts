import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findDescendantByName } from "./activity-detector.js";
import { findMostRecentFile } from "./fs-utils.js";
import type { SessionStore } from "./session-store.js";

interface TrackedSession {
	timer: ReturnType<typeof setInterval>;
	found: boolean;
}

const POLL_INTERVAL_MS = 2500;
const CLAUDE_SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");

/**
 * Try to read a Claude session ID from ~/.claude/sessions/{pid}.json.
 * Returns the sessionId string or null.
 */
function readClaudeSessionId(pid: number): string | null {
	try {
		const raw = fs.readFileSync(path.join(CLAUDE_SESSIONS_DIR, `${pid}.json`), "utf-8");
		const data = JSON.parse(raw);
		return data.sessionId ?? null;
	} catch {
		return null;
	}
}

export class AiSessionTracker {
	private tracked = new Map<string, TrackedSession>();

	trackClaude(terminalId: string, ptyPid: number, sessionStore: SessionStore): void {
		const entry: TrackedSession = {
			timer: null as unknown as ReturnType<typeof setInterval>,
			found: false,
		};

		entry.timer = setInterval(async () => {
			if (entry.found) return;
			try {
				// bash -c "claude ..." typically exec's into claude, so the pty PID
				// IS the claude process. Try reading the session file for ptyPid first.
				let sessionId = readClaudeSessionId(ptyPid);

				// Fallback: walk the process tree for a child named "claude"
				if (!sessionId) {
					const claudePid = await findDescendantByName(ptyPid, "claude");
					if (claudePid) {
						sessionId = readClaudeSessionId(claudePid);
					}
				}

				if (!sessionId) return;

				entry.found = true;
				sessionStore.updateAiSessionId(terminalId, sessionId);
				clearInterval(entry.timer);
			} catch {
				// Not ready yet
			}
		}, POLL_INTERVAL_MS);

		this.tracked.set(terminalId, entry);
	}

	trackCodex(terminalId: string, _ptyPid: number, sessionStore: SessionStore): void {
		const entry: TrackedSession = {
			timer: null as unknown as ReturnType<typeof setInterval>,
			found: false,
		};

		entry.timer = setInterval(() => {
			if (entry.found) return;
			try {
				const sessionsDir = path.join(os.homedir(), ".codex", "sessions");
				const jsonlFile = findMostRecentFile(sessionsDir, ".jsonl");
				if (!jsonlFile) return;

				entry.found = true;
				sessionStore.updateAiSessionId(terminalId, jsonlFile);
				clearInterval(entry.timer);
			} catch {
				// Not ready yet
			}
		}, POLL_INTERVAL_MS);

		this.tracked.set(terminalId, entry);
	}

	stopTracking(terminalId: string): void {
		const entry = this.tracked.get(terminalId);
		if (entry) {
			clearInterval(entry.timer);
			this.tracked.delete(terminalId);
		}
	}

	stopAll(): void {
		for (const [_id, entry] of this.tracked) {
			clearInterval(entry.timer);
		}
		this.tracked.clear();
	}
}
