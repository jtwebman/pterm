import fs from "node:fs";

import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";

import { resolveShell } from "../shell-resolver.js";

vi.mock("node:fs", () => ({
	default: {
		accessSync: vi.fn(),
		constants: { X_OK: 1 },
	},
}));

describe("resolveShell", () => {
	const originalPlatform = process.platform;
	const originalEnv = { ...process.env };

	function setPlatform(platform: string) {
		Object.defineProperty(process, "platform", { value: platform, writable: true });
	}

	beforeEach(() => {
		vi.mocked(fs.accessSync).mockReset();
		delete process.env.SHELL;
		delete process.env.ComSpec;
	});

	afterEach(() => {
		Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
		process.env.SHELL = originalEnv.SHELL;
		process.env.ComSpec = originalEnv.ComSpec;
	});

	describe("WSL", () => {
		it("returns wsl.exe with specified distro", () => {
			const result = resolveShell("wsl", "Debian");
			expect(result).toEqual({
				file: "wsl.exe",
				args: ["-d", "Debian", "--", "bash", "-l"],
			});
		});

		it("defaults to Ubuntu distro", () => {
			const result = resolveShell("wsl");
			expect(result).toEqual({
				file: "wsl.exe",
				args: ["-d", "Ubuntu", "--", "bash", "-l"],
			});
		});
	});

	describe("unix", () => {
		beforeEach(() => {
			setPlatform("linux");
		});

		it("bash type returns /bin/bash -l", () => {
			const result = resolveShell("bash");
			expect(result).toEqual({ file: "/bin/bash", args: ["-l"] });
		});

		it("zsh type returns /bin/zsh -l", () => {
			const result = resolveShell("zsh");
			expect(result).toEqual({ file: "/bin/zsh", args: ["-l"] });
		});

		it("default falls back through SHELL env", () => {
			process.env.SHELL = "/usr/local/bin/fish";
			vi.mocked(fs.accessSync).mockImplementation(() => {});
			const result = resolveShell();
			expect(result).toEqual({ file: "/usr/local/bin/fish", args: ["-l"] });
		});

		it("default falls back to /bin/zsh when SHELL is not executable", () => {
			process.env.SHELL = "/nonexistent/shell";
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/bin/zsh") return;
				throw new Error("ENOENT");
			});
			const result = resolveShell();
			expect(result).toEqual({ file: "/bin/zsh", args: ["-l"] });
		});

		it("default falls back to /bin/bash when zsh unavailable", () => {
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/bin/bash") return;
				throw new Error("ENOENT");
			});
			const result = resolveShell();
			expect(result).toEqual({ file: "/bin/bash", args: ["-l"] });
		});

		it("default falls back to /bin/sh when nothing else available", () => {
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("ENOENT");
			});
			const result = resolveShell();
			expect(result).toEqual({ file: "/bin/sh", args: ["-l"] });
		});
	});

	describe("windows", () => {
		beforeEach(() => {
			setPlatform("win32");
		});

		it("cmd type returns cmd.exe", () => {
			const result = resolveShell("cmd");
			expect(result).toEqual({ file: "cmd.exe", args: [] });
		});

		it("powershell type returns powershell.exe", () => {
			const result = resolveShell("powershell");
			expect(result).toEqual({ file: "powershell.exe", args: [] });
		});

		it("default uses ComSpec env", () => {
			process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
			const result = resolveShell();
			expect(result).toEqual({ file: "C:\\Windows\\System32\\cmd.exe", args: [] });
		});

		it("default falls back to powershell.exe without ComSpec", () => {
			const result = resolveShell();
			expect(result).toEqual({ file: "powershell.exe", args: [] });
		});
	});
});
