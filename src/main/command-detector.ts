import { execFile } from "node:child_process";
import type { DetectedCommand, CommandType } from "../shared/types.js";

interface KnownCommand {
  name: string;
  command: string;
  type: CommandType;
}

const KNOWN_COMMANDS: KnownCommand[] = [
  { name: "Claude Code", command: "claude", type: "claude" },
  { name: "Codex", command: "codex", type: "codex" },
  { name: "Shell", command: "", type: "shell" },
];

function commandExists(cmd: string): Promise<boolean> {
  const bin = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(bin, [cmd], (err) => {
      resolve(!err);
    });
  });
}

export async function detectCommands(): Promise<DetectedCommand[]> {
  const results: DetectedCommand[] = [];
  for (const known of KNOWN_COMMANDS) {
    if (!known.command) {
      results.push(known);
      continue;
    }
    if (await commandExists(known.command)) {
      results.push(known);
    }
  }
  return results;
}
