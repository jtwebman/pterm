import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";

import { readActivityFile, detectActivity } from "../activity-detector.js";

describe("readActivityFile", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "activity-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null for non-existent file", () => {
		const result = readActivityFile(path.join(tmpDir, "does-not-exist.txt"));
		expect(result).toBeNull();
	});

	it("returns null for file older than 30 seconds", () => {
		const filePath = path.join(tmpDir, "stale.txt");
		fs.writeFileSync(filePath, "busy\nDoing work");
		const oldTime = Date.now() / 1000 - 60;
		fs.utimesSync(filePath, oldTime, oldTime);

		const result = readActivityFile(filePath);
		expect(result).toBeNull();
	});

	it("returns null for file with less than 2 lines", () => {
		const filePath = path.join(tmpDir, "oneline.txt");
		fs.writeFileSync(filePath, "busy");

		const result = readActivityFile(filePath);
		expect(result).toBeNull();
	});

	it("returns null for invalid activity value", () => {
		const filePath = path.join(tmpDir, "invalid.txt");
		fs.writeFileSync(filePath, "running\nDoing stuff");

		const result = readActivityFile(filePath);
		expect(result).toBeNull();
	});

	it("returns correct {activity, activityText} for valid file with busy", () => {
		const filePath = path.join(tmpDir, "valid.txt");
		fs.writeFileSync(filePath, "busy\nCompiling project");

		const result = readActivityFile(filePath);
		expect(result).toEqual({ activity: "busy", activityText: "Compiling project" });
	});

	it("returns correct result for idle activity", () => {
		const filePath = path.join(tmpDir, "idle.txt");
		fs.writeFileSync(filePath, "idle\nWaiting for input");

		const result = readActivityFile(filePath);
		expect(result).toEqual({ activity: "idle", activityText: "Waiting for input" });
	});

	it("returns correct result for working activity", () => {
		const filePath = path.join(tmpDir, "working.txt");
		fs.writeFileSync(filePath, "working\nRunning tests");

		const result = readActivityFile(filePath);
		expect(result).toEqual({ activity: "working", activityText: "Running tests" });
	});

	it("returns correct result for waiting activity", () => {
		const filePath = path.join(tmpDir, "waiting.txt");
		fs.writeFileSync(filePath, "waiting\nAwaiting approval");

		const result = readActivityFile(filePath);
		expect(result).toEqual({ activity: "waiting", activityText: "Awaiting approval" });
	});

	it("returns null on read error (e.g. directory instead of file)", () => {
		const dirPath = path.join(tmpDir, "subdir");
		fs.mkdirSync(dirPath);

		const result = readActivityFile(dirPath);
		expect(result).toBeNull();
	});
});

describe("detectActivity", () => {
	it("returns an ActivityUpdate for shell type", async () => {
		const result = await detectActivity(999999, "shell");
		expect(result).toHaveProperty("activity");
		expect(result).toHaveProperty("activityText");
		expect(["idle", "busy", "working", "waiting"]).toContain(result.activity);
	});

	it("returns idle for claude type with no activity file", async () => {
		const result = await detectActivity(999999, "claude");
		expect(result).toEqual({ activity: "idle", activityText: "" });
	});

	it("reads activity file for claude type when provided", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-test-"));
		try {
			const filePath = path.join(tmpDir, "activity.txt");
			fs.writeFileSync(filePath, "working\nAnalyzing code");

			const result = await detectActivity(999999, "claude", filePath);
			expect(result).toEqual({ activity: "working", activityText: "Analyzing code" });
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("returns an ActivityUpdate for codex type", async () => {
		const result = await detectActivity(999999, "codex");
		expect(result).toHaveProperty("activity");
		expect(result).toHaveProperty("activityText");
		expect(["idle", "busy", "working", "waiting"]).toContain(result.activity);
	});

	it("uses shell strategy for unknown command type", async () => {
		const result = await detectActivity(999999, "opencode");
		expect(result).toHaveProperty("activity");
		expect(result).toHaveProperty("activityText");
		expect(["idle", "busy", "working", "waiting"]).toContain(result.activity);
	});
});
