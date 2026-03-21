import { execFile } from "node:child_process";
import fs from "node:fs";

import type { DetectedShell, ShellType } from "../shared/types.js";

interface ResolvedShell {
	file: string;
	args: string[];
}

// Shell definitions: how to resolve each shell type to a binary + args
const UNIX_SHELLS: Record<string, { bins: string[]; args: string[] }> = {
	bash: { bins: ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"], args: ["-l"] },
	zsh: { bins: ["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh"], args: ["-l"] },
	fish: { bins: ["/usr/bin/fish", "/usr/local/bin/fish", "/opt/homebrew/bin/fish"], args: ["-l"] },
	nushell: { bins: ["/usr/bin/nu", "/usr/local/bin/nu", "/opt/homebrew/bin/nu"], args: ["-l"] },
	elvish: { bins: ["/usr/bin/elvish", "/usr/local/bin/elvish"], args: [] },
	tcsh: { bins: ["/bin/tcsh", "/usr/bin/tcsh"], args: ["-l"] },
	ksh: { bins: ["/bin/ksh", "/usr/bin/ksh"], args: ["-l"] },
	dash: { bins: ["/bin/dash", "/usr/bin/dash"], args: ["-l"] },
};

const WIN_SHELLS: Record<string, { file: string; args: string[] }> = {
	cmd: { file: "cmd.exe", args: [] },
	powershell: { file: "powershell.exe", args: [] },
	pwsh: { file: "pwsh.exe", args: [] },
	nushell: { file: "nu.exe", args: [] },
};

export function resolveShell(shellType?: ShellType, wslDistro?: string): ResolvedShell {
	if (shellType === "wsl") {
		return {
			file: "wsl.exe",
			args: ["-d", wslDistro || "Ubuntu", "--", "bash", "-l"],
		};
	}

	if (process.platform === "win32") {
		return resolveWindowsShell(shellType);
	}

	return resolveUnixShell(shellType);
}

function resolveUnixShell(shellType?: ShellType): ResolvedShell {
	// Specific shell requested
	if (shellType && shellType !== "default") {
		const def = UNIX_SHELLS[shellType];
		if (def) {
			for (const bin of def.bins) {
				if (isExecutable(bin)) return { file: bin, args: def.args };
			}
		}
	}

	// Default fallback chain
	const envShell = process.env.SHELL;
	if (envShell && isExecutable(envShell)) {
		return { file: envShell, args: ["-l"] };
	}
	if (isExecutable("/bin/zsh")) return { file: "/bin/zsh", args: ["-l"] };
	if (isExecutable("/bin/bash")) return { file: "/bin/bash", args: ["-l"] };
	return { file: "/bin/sh", args: ["-l"] };
}

function resolveWindowsShell(shellType?: ShellType): ResolvedShell {
	if (shellType && shellType !== "default") {
		const def = WIN_SHELLS[shellType];
		if (def) return def;
	}

	const comspec = process.env.ComSpec;
	if (comspec) return { file: comspec, args: [] };
	return { file: "powershell.exe", args: [] };
}

function isExecutable(filePath: string): boolean {
	try {
		fs.accessSync(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function commandExists(cmd: string): Promise<boolean> {
	const bin = process.platform === "win32" ? "where" : "which";
	return new Promise((resolve) => {
		execFile(bin, [cmd], (err) => resolve(!err));
	});
}

export async function detectShells(): Promise<DetectedShell[]> {
	const shells: DetectedShell[] = [{ type: "default", name: "Default" }];

	if (process.platform === "win32") {
		// Windows shells
		shells.push({ type: "cmd", name: "Command Prompt" });
		shells.push({ type: "powershell", name: "PowerShell" });
		if (await commandExists("pwsh")) shells.push({ type: "pwsh", name: "PowerShell Core" });
		if (await commandExists("nu")) shells.push({ type: "nushell", name: "Nushell" });
	} else {
		// Unix shells — check which are installed
		const candidates: { type: ShellType; name: string; cmd: string }[] = [
			{ type: "bash", name: "Bash", cmd: "bash" },
			{ type: "zsh", name: "Zsh", cmd: "zsh" },
			{ type: "fish", name: "Fish", cmd: "fish" },
			{ type: "nushell", name: "Nushell", cmd: "nu" },
			{ type: "elvish", name: "Elvish", cmd: "elvish" },
			{ type: "tcsh", name: "tcsh", cmd: "tcsh" },
			{ type: "ksh", name: "KornShell", cmd: "ksh" },
			{ type: "dash", name: "Dash", cmd: "dash" },
		];

		for (const c of candidates) {
			if (await commandExists(c.cmd)) {
				shells.push({ type: c.type, name: c.name });
			}
		}
	}

	return shells;
}

export function detectWslDistros(): Promise<string[]> {
	return new Promise((resolve) => {
		execFile("wsl.exe", ["-l", "-q"], { encoding: "buffer" }, (err, stdout) => {
			if (err) {
				resolve([]);
				return;
			}
			// wsl.exe outputs UTF-16LE — strip BOM and null bytes
			const text = stdout
				.toString("utf16le")
				// eslint-disable-next-line no-control-regex
				.replace(/\u0000/g, "")
				.replace(/^\uFEFF/, "");
			const distros = text
				.split(/\r?\n/)
				.map((l) => l.trim())
				.filter(Boolean);
			resolve(distros);
		});
	});
}
