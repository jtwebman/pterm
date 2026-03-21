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

/**
 * OpenCode has a plugin system that receives all bus events including
 * session.status (idle/busy) and tool.execute.before/after hooks.
 * We write a plugin to ~/.config/opencode/plugins/pterm.ts that writes
 * activity state to $PTERM_ACTIVITY_FILE. When run outside pterm,
 * the env var is unset so the plugin is a no-op.
 */

const OPENCODE_PLUGIN_DIR = path.join(os.homedir(), ".config", "opencode", "plugins");
const OPENCODE_PLUGIN_FILE = path.join(OPENCODE_PLUGIN_DIR, "pterm.ts");

const PLUGIN_SOURCE = `// pterm activity plugin — writes status to $PTERM_ACTIVITY_FILE
// No-op when run outside pterm (env var unset)
import { writeFileSync } from "fs"

function write(state: string, text: string) {
  const f = process.env.PTERM_ACTIVITY_FILE
  if (!f) return
  try { writeFileSync(f, state + "\\n" + text) } catch {}
}

export default () => ({
  event: async ({ event }: { event: { type: string } }) => {
    switch (event.type) {
      case "session.status":
        const status = (event as any).properties?.status
        if (status?.type === "idle") write("waiting", "Waiting for input")
        else if (status?.type === "busy") write("working", "Thinking")
        break
    }
  },
  "tool.execute.before": async () => {
    write("working", "Using tools")
  },
  "tool.execute.after": async () => {
    write("working", "Thinking")
  },
})
`;

function ensurePlugin(): void {
	try {
		try {
			const existing = fs.readFileSync(OPENCODE_PLUGIN_FILE, "utf-8");
			if (existing === PLUGIN_SOURCE) return;
		} catch {
			// File doesn't exist yet
		}
		fs.mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });
		fs.writeFileSync(OPENCODE_PLUGIN_FILE, PLUGIN_SOURCE);
	} catch {
		// Non-fatal
	}
}

export class OpenCodeSession implements CommandSession {
	skipScrollbackReplay = true;

	private activityFile?: string;
	setup(terminalId: string, env: Record<string, string>): void {
		this.activityFile = path.join(os.tmpdir(), `pterm-${terminalId}.activity`);
		env.PTERM_ACTIVITY_FILE = this.activityFile;
		ensurePlugin();
	}

	buildCommand(command: string): string {
		return command;
	}

	buildResumeCommand(_command: string, sessionId: string): string {
		// opencode session resume uses session ID
		return `opencode session resume ${sessionId}`;
	}

	async detectActivity(ptyPid: number): Promise<ActivityUpdate> {
		try {
			// Primary: read activity file written by our plugin
			if (this.activityFile) {
				const fromFile = readActivityFile(this.activityFile);
				if (fromFile) return fromFile;
			}

			// Fallback: process tree
			const pid = await findDescendantByName(ptyPid, "opencode");
			if (!pid) {
				return { activity: "idle", activityText: "" };
			}

			const hasChildren = await processHasChildren(pid);
			if (hasChildren) {
				return { activity: "working", activityText: "Running tools" };
			}

			return { activity: "waiting", activityText: "Waiting for input" };
		} catch {
			return { activity: "idle", activityText: "" };
		}
	}

	startTracking(_ptyPid: number, _onSessionId: (id: string) => void): void {
		// OpenCode stores sessions in SQLite. Poll for the most recent session
		// by checking the database. For now, use a simple approach: read the
		// opencode export output to get the session ID.
		// The session ID tracking is less critical — resume support can be added
		// once we understand the session lifecycle better.
	}

	cleanup(): void {
		if (this.activityFile) {
			try {
				fs.unlinkSync(this.activityFile);
			} catch {
				/* already gone */
			}
		}
	}
}
