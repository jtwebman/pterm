import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ActivityUpdate } from "../../shared/types.js";
import { detectShellActivity } from "../activity-detector.js";
import type { CommandSession } from "./command-session.js";

const HISTORY_DIR = path.join(os.homedir(), ".pterm", "history");

export class ShellSession implements CommandSession {
	skipScrollbackReplay = false;

	setup(terminalId: string, env: Record<string, string>): void {
		fs.mkdirSync(HISTORY_DIR, { recursive: true });
		env.HISTFILE = path.join(HISTORY_DIR, `${terminalId}.history`);
	}

	buildCommand(command: string): string {
		return command;
	}

	detectActivity(ptyPid: number): Promise<ActivityUpdate> {
		return detectShellActivity(ptyPid);
	}

	startTracking(): void {
		// No-op for shell
	}

	cleanup(): void {
		// No-op for shell
	}
}
