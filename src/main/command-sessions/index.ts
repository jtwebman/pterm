import type { CommandType } from "../../shared/types.js";
import { ClaudeSession } from "./claude-session.js";
import { CodexSession } from "./codex-session.js";
import type { CommandSession } from "./command-session.js";
import { OpenCodeSession } from "./opencode-session.js";
import { ShellSession } from "./shell-session.js";

export type { CommandSession } from "./command-session.js";

export function createCommandSession(type: CommandType): CommandSession {
	switch (type) {
		case "claude":
			return new ClaudeSession();
		case "codex":
			return new CodexSession();
		case "opencode":
			return new OpenCodeSession();
		default:
			return new ShellSession();
	}
}
