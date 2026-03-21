import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";

import { ClaudeSession } from "../command-sessions/claude-session.js";
import { CodexSession } from "../command-sessions/codex-session.js";
import { createCommandSession } from "../command-sessions/index.js";
import { OpenCodeSession } from "../command-sessions/opencode-session.js";
import { ShellSession } from "../command-sessions/shell-session.js";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
describe("createCommandSession", () => {
	it("returns ShellSession for 'shell' type", () => {
		expect(createCommandSession("shell")).toBeInstanceOf(ShellSession);
	});

	it("returns ClaudeSession for 'claude' type", () => {
		expect(createCommandSession("claude")).toBeInstanceOf(ClaudeSession);
	});

	it("returns CodexSession for 'codex' type", () => {
		expect(createCommandSession("codex")).toBeInstanceOf(CodexSession);
	});

	it("returns OpenCodeSession for 'opencode' type", () => {
		expect(createCommandSession("opencode")).toBeInstanceOf(OpenCodeSession);
	});
});

// ---------------------------------------------------------------------------
// ShellSession
// ---------------------------------------------------------------------------
describe("ShellSession", () => {
	let session: ShellSession;

	beforeEach(() => {
		session = new ShellSession();
	});

	afterEach(() => {
		session.cleanup();
	});

	it("setup sets HISTFILE env var with terminalId", () => {
		const env: Record<string, string> = {};
		session.setup("term-abc", env);

		expect(env.HISTFILE).toBeDefined();
		expect(env.HISTFILE).toContain("term-abc");
		expect(env.HISTFILE).toMatch(/\.history$/);
	});

	it("buildCommand returns command unchanged", () => {
		expect(session.buildCommand("ls -la")).toBe("ls -la");
	});

	it("cleanup is safe to call (no errors)", () => {
		expect(() => session.cleanup()).not.toThrow();
		// Call twice to confirm idempotent
		expect(() => session.cleanup()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// ClaudeSession
// ---------------------------------------------------------------------------
describe("ClaudeSession", () => {
	let session: ClaudeSession;
	const terminalId = `test-claude-${Date.now()}`;

	beforeEach(() => {
		session = new ClaudeSession();
	});

	afterEach(() => {
		session.cleanup();
	});

	it("setup creates activity file path in env", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		expect(env.PTERM_ACTIVITY_FILE).toBeDefined();
		expect(env.PTERM_ACTIVITY_FILE).toContain(terminalId);
		expect(env.PTERM_ACTIVITY_FILE).toContain(os.tmpdir());
	});

	it("setup creates hooks JSON file", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		// The hooks file should exist on disk
		const hooksPath = path.join(os.tmpdir(), `pterm-hooks-${terminalId}.json`);
		expect(fs.existsSync(hooksPath)).toBe(true);

		const content = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
		expect(content.hooks).toBeDefined();
		expect(content.hooks.UserPromptSubmit).toBeDefined();
		expect(content.hooks.Stop).toBeDefined();
		expect(content.hooks.SessionStart).toBeDefined();
	});

	it("buildCommand adds --settings flag pointing to hooks file", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		const result = session.buildCommand("claude");
		expect(result).toContain("--settings");
		expect(result).toContain(`pterm-hooks-${terminalId}.json`);
	});

	it("cleanup removes temp files", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		const activityFile = env.PTERM_ACTIVITY_FILE;
		const sessionFile = env.PTERM_SESSION_FILE;
		const hooksFile = path.join(os.tmpdir(), `pterm-hooks-${terminalId}.json`);

		// Write something to the activity/session files so they exist
		fs.writeFileSync(activityFile, "working\nThinking");
		fs.writeFileSync(sessionFile, "session-123");

		expect(fs.existsSync(activityFile)).toBe(true);
		expect(fs.existsSync(sessionFile)).toBe(true);
		expect(fs.existsSync(hooksFile)).toBe(true);

		session.cleanup();

		expect(fs.existsSync(activityFile)).toBe(false);
		expect(fs.existsSync(sessionFile)).toBe(false);
		expect(fs.existsSync(hooksFile)).toBe(false);
	});

	it("cleanup handles already-deleted files gracefully", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		// Manually remove the hooks file before cleanup
		const hooksFile = path.join(os.tmpdir(), `pterm-hooks-${terminalId}.json`);
		fs.unlinkSync(hooksFile);

		// cleanup should not throw
		expect(() => session.cleanup()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// CodexSession
// ---------------------------------------------------------------------------
describe("CodexSession", () => {
	let session: CodexSession;
	const terminalId = `test-codex-${Date.now()}`;

	beforeEach(() => {
		session = new CodexSession();
	});

	afterEach(() => {
		session.cleanup();
	});

	it("setup creates activity file path in env", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		expect(env.PTERM_ACTIVITY_FILE).toBeDefined();
		expect(env.PTERM_ACTIVITY_FILE).toContain(terminalId);
		expect(env.PTERM_ACTIVITY_FILE).toContain(os.tmpdir());
	});

	it("buildCommand adds notify flag", () => {
		const result = session.buildCommand("codex");
		expect(result).toContain("--enable codex_hooks");
	});

	it("buildResumeCommand extracts UUID from session path", () => {
		const sessionPath = "rollout-2026-03-17T11-35-09-019cfd14-901c-75c3-a71e-da31d8ead1b7.jsonl";
		const result = session.buildResumeCommand("codex", sessionPath);

		expect(result).toContain("019cfd14-901c-75c3-a71e-da31d8ead1b7");
		expect(result).toContain("codex resume");
		expect(result).toContain("--enable codex_hooks");
		// Should not contain the full filename
		expect(result).not.toContain("rollout-");
	});

	it("cleanup removes temp files", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		const activityFile = env.PTERM_ACTIVITY_FILE;
		// Write something so the file exists
		fs.writeFileSync(activityFile, "working\nThinking");
		expect(fs.existsSync(activityFile)).toBe(true);

		session.cleanup();

		expect(fs.existsSync(activityFile)).toBe(false);
	});

	it("cleanup clears interval timers", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		// Start tracking to create the interval timer
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
		session.startTracking(12345, () => {});

		session.cleanup();

		expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
		clearIntervalSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// OpenCodeSession
// ---------------------------------------------------------------------------
describe("OpenCodeSession", () => {
	let session: OpenCodeSession;
	const terminalId = `test-opencode-${Date.now()}`;

	const pluginDir = path.join(os.homedir(), ".config", "opencode", "plugins");
	const pluginFile = path.join(pluginDir, "pterm.ts");

	beforeEach(() => {
		session = new OpenCodeSession();
	});

	afterEach(() => {
		session.cleanup();
	});

	it("setup creates activity file path and ensures plugin", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		expect(env.PTERM_ACTIVITY_FILE).toBeDefined();
		expect(env.PTERM_ACTIVITY_FILE).toContain(terminalId);

		// The plugin file should exist (ensurePlugin creates it)
		expect(fs.existsSync(pluginFile)).toBe(true);
		const content = fs.readFileSync(pluginFile, "utf-8");
		expect(content).toContain("PTERM_ACTIVITY_FILE");
	});

	it("buildCommand returns command unchanged", () => {
		expect(session.buildCommand("opencode")).toBe("opencode");
	});

	it("buildResumeCommand formats resume command with session ID", () => {
		const result = session.buildResumeCommand("opencode", "sess-456");
		expect(result).toBe("opencode session resume sess-456");
	});

	it("cleanup removes activity file", () => {
		const env: Record<string, string> = {};
		session.setup(terminalId, env);

		const activityFile = env.PTERM_ACTIVITY_FILE;
		fs.writeFileSync(activityFile, "waiting\nWaiting for input");
		expect(fs.existsSync(activityFile)).toBe(true);

		session.cleanup();

		expect(fs.existsSync(activityFile)).toBe(false);
	});
});
