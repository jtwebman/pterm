import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Write a temp settings file with pterm activity hooks and return its path.
 * Claude's --settings flag accepts a file path.
 *
 * The hooks write activity state to $PTERM_ACTIVITY_FILE (set per-terminal env var).
 * The SessionStart hook captures the session ID to $PTERM_SESSION_FILE for resume.
 * When Claude runs outside pterm, the env vars are absent and hooks are no-ops.
 */
export function writeClaudeHooksFile(terminalId: string): string {
	const hooks = {
		hooks: {
			SessionStart: [
				{
					matcher: "",
					hooks: [
						{
							type: "command",
							command: '[ -n "$PTERM_SESSION_FILE" ] && jq -r .session_id > "$PTERM_SESSION_FILE"',
						},
					],
				},
			],
			UserPromptSubmit: [
				{
					matcher: "",
					hooks: [
						{
							type: "command",
							command:
								'[ -n "$PTERM_ACTIVITY_FILE" ] && printf "working\\nThinking" > "$PTERM_ACTIVITY_FILE"',
							async: true,
						},
					],
				},
			],
			PreToolUse: [
				{
					matcher: "",
					hooks: [
						{
							type: "command",
							command:
								'[ -n "$PTERM_ACTIVITY_FILE" ] && printf "working\\nUsing tools" > "$PTERM_ACTIVITY_FILE"',
							async: true,
						},
					],
				},
			],
			Stop: [
				{
					matcher: "",
					hooks: [
						{
							type: "command",
							command:
								'[ -n "$PTERM_ACTIVITY_FILE" ] && printf "waiting\\nWaiting for input" > "$PTERM_ACTIVITY_FILE"',
							async: true,
						},
					],
				},
			],
		},
	};

	const filePath = path.join(os.tmpdir(), `pterm-hooks-${terminalId}.json`);
	fs.writeFileSync(filePath, JSON.stringify(hooks));
	return filePath;
}

/**
 * Clean up the temp hooks file for a terminal.
 */
export function cleanupClaudeHooksFile(terminalId: string): void {
	const filePath = path.join(os.tmpdir(), `pterm-hooks-${terminalId}.json`);
	try {
		fs.unlinkSync(filePath);
	} catch {
		/* already gone */
	}
}
