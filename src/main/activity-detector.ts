import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { CommandType, Activity, ActivityUpdate } from "../shared/types.js";

export function detectActivity(
	ptyPid: number,
	commandType: CommandType,
	activityFile?: string,
): Promise<ActivityUpdate> {
	switch (commandType) {
		case "claude":
			return detectClaudeActivity(ptyPid, activityFile);
		case "codex":
			return detectCodexActivity(ptyPid);
		case "shell":
		default:
			return detectShellActivity(ptyPid);
	}
}

// ── Shell strategy ──────────────────────────────────────────────────────

export function detectShellActivity(ptyPid: number): Promise<ActivityUpdate> {
	return new Promise((resolve) => {
		if (process.platform === "win32") {
			execFile(
				"powershell",
				[
					"-NoProfile",
					"-Command",
					`Get-CimInstance Win32_Process -Filter "ParentProcessId=${ptyPid}" | Select-Object -First 1`,
				],
				(err, stdout) => {
					const busy = !err && stdout.trim().length > 0;
					resolve({
						activity: busy ? "busy" : "idle",
						activityText: busy ? "Running" : "",
					});
				},
			);
		} else {
			execFile("pgrep", ["-P", String(ptyPid)], (err, stdout) => {
				if (err) {
					execFile("ps", ["-eo", "pid=,ppid="], (err2, stdout2) => {
						if (err2) {
							resolve({ activity: "idle", activityText: "" });
							return;
						}
						const hasChild = stdout2.split("\n").some((line) => {
							const parts = line.trim().split(/\s+/);
							return parts[1] === String(ptyPid);
						});
						resolve({
							activity: hasChild ? "busy" : "idle",
							activityText: hasChild ? "Running" : "",
						});
					});
					return;
				}
				const busy = stdout.trim().length > 0;
				resolve({
					activity: busy ? "busy" : "idle",
					activityText: busy ? "Running" : "",
				});
			});
		}
	});
}

// ── Claude strategy ─────────────────────────────────────────────────────

async function detectClaudeActivity(
	ptyPid: number,
	activityFile?: string,
): Promise<ActivityUpdate> {
	try {
		if (activityFile) {
			const fromFile = readActivityFile(activityFile);
			if (fromFile) return fromFile;
		}

		return { activity: "idle", activityText: "" };
	} catch {
		return { activity: "idle", activityText: "" };
	}
}

export function readActivityFile(filePath: string): ActivityUpdate | null {
	try {
		const stat = fs.statSync(filePath);
		if (Date.now() - stat.mtimeMs > 30_000) return null;

		const content = fs.readFileSync(filePath, "utf-8").trim();
		const lines = content.split("\n");
		if (lines.length < 2) return null;

		const activity = lines[0] as Activity;
		const activityText = lines[1];

		if (!["idle", "busy", "working", "waiting"].includes(activity)) return null;

		return { activity, activityText };
	} catch {
		return null;
	}
}

// ── Codex strategy ──────────────────────────────────────────────────────

async function detectCodexActivity(ptyPid: number): Promise<ActivityUpdate> {
	try {
		const codexPid = await findDescendantByName(ptyPid, "codex");
		if (!codexPid) {
			return { activity: "idle", activityText: "" };
		}

		const hasChildren = await processHasChildren(codexPid);
		if (hasChildren) {
			return { activity: "working", activityText: "Running tools" };
		}

		return { activity: "busy", activityText: "Starting" };
	} catch {
		return { activity: "idle", activityText: "" };
	}
}

// ── Process tree helpers ────────────────────────────────────────────────

export function processHasChildren(pid: number): Promise<boolean> {
	if (process.platform === "linux") {
		try {
			const entries = fs.readdirSync("/proc", { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const childPid = Number(entry.name);
				if (!Number.isInteger(childPid) || childPid <= 0) continue;
				try {
					const stat = fs.readFileSync(`/proc/${childPid}/stat`, "utf-8");
					const lastParen = stat.lastIndexOf(")");
					const fields = stat.substring(lastParen + 2).split(" ");
					const ppid = Number(fields[1]);
					if (ppid === pid) return Promise.resolve(true);
				} catch {
					/* process exited */
				}
			}
			return Promise.resolve(false);
		} catch {
			return Promise.resolve(false);
		}
	}

	return new Promise((resolve) => {
		execFile("ps", ["-e", "-o", "pid=,ppid="], (err, stdout) => {
			if (err) {
				resolve(false);
				return;
			}
			const has = stdout.split("\n").some((line) => {
				const parts = line.trim().split(/\s+/);
				return parts[1] === String(pid);
			});
			resolve(has);
		});
	});
}

export function findDescendantByName(ptyPid: number, name: string): Promise<number | null> {
	if (process.platform === "linux") {
		return findDescendantProc(ptyPid, name);
	}
	return findDescendantPs(ptyPid, name);
}

function findDescendantProc(ptyPid: number, name: string): Promise<number | null> {
	return new Promise((resolve) => {
		try {
			const entries = fs.readdirSync("/proc", { withFileTypes: true });
			const childMap = new Map<number, number[]>();
			const commMap = new Map<number, string>();

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const pid = Number(entry.name);
				if (!Number.isInteger(pid) || pid <= 0) continue;

				try {
					const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf-8");
					const lastParen = stat.lastIndexOf(")");
					const comm = stat.substring(stat.indexOf("(") + 1, lastParen);
					const fields = stat.substring(lastParen + 2).split(" ");
					const ppid = Number(fields[1]);

					commMap.set(pid, comm);
					if (!childMap.has(ppid)) childMap.set(ppid, []);
					childMap.get(ppid)!.push(pid);
				} catch {}
			}

			const queue = childMap.get(ptyPid) ?? [];
			const visited = new Set<number>();

			while (queue.length > 0) {
				const pid = queue.shift()!;
				if (visited.has(pid)) continue;
				visited.add(pid);

				const comm = commMap.get(pid) ?? "";
				if (comm === name || comm.startsWith(name)) {
					resolve(pid);
					return;
				}

				const children = childMap.get(pid);
				if (children) queue.push(...children);
			}

			resolve(null);
		} catch {
			resolve(null);
		}
	});
}

function findDescendantPs(ptyPid: number, name: string): Promise<number | null> {
	return new Promise((resolve) => {
		execFile("ps", ["-e", "-o", "pid=,ppid=,comm="], (err, stdout) => {
			if (err) {
				resolve(null);
				return;
			}

			const childMap = new Map<number, number[]>();
			const commMap = new Map<number, string>();

			for (const line of stdout.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const parts = trimmed.split(/\s+/);
				if (parts.length < 3) continue;
				const pid = Number(parts[0]);
				const ppid = Number(parts[1]);
				const comm = path.basename(parts.slice(2).join(" "));

				commMap.set(pid, comm);
				if (!childMap.has(ppid)) childMap.set(ppid, []);
				childMap.get(ppid)!.push(pid);
			}

			const queue = childMap.get(ptyPid) ?? [];
			const visited = new Set<number>();

			while (queue.length > 0) {
				const pid = queue.shift()!;
				if (visited.has(pid)) continue;
				visited.add(pid);

				const comm = commMap.get(pid) ?? "";
				if (comm === name || comm.startsWith(name)) {
					resolve(pid);
					return;
				}

				const children = childMap.get(pid);
				if (children) queue.push(...children);
			}

			resolve(null);
		});
	});
}
