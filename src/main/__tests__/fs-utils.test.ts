import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";

import { findMostRecentFile } from "../fs-utils.js";

describe("findMostRecentFile", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-utils-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null for non-existent directory", () => {
		const result = findMostRecentFile(path.join(tmpDir, "nope"), ".txt");
		expect(result).toBeNull();
	});

	it("returns null for empty directory", () => {
		const result = findMostRecentFile(tmpDir, ".txt");
		expect(result).toBeNull();
	});

	it("returns null when no files match extension", () => {
		fs.writeFileSync(path.join(tmpDir, "file.md"), "hello");
		fs.writeFileSync(path.join(tmpDir, "file.js"), "world");

		const result = findMostRecentFile(tmpDir, ".txt");
		expect(result).toBeNull();
	});

	it("returns the most recently modified file matching extension", () => {
		const older = path.join(tmpDir, "older.log");
		const newer = path.join(tmpDir, "newer.log");

		fs.writeFileSync(older, "old content");
		const oldTime = Date.now() / 1000 - 100;
		fs.utimesSync(older, oldTime, oldTime);

		fs.writeFileSync(newer, "new content");
		const newTime = Date.now() / 1000;
		fs.utimesSync(newer, newTime, newTime);

		const result = findMostRecentFile(tmpDir, ".log");
		expect(result).toBe(newer);
	});

	it("searches subdirectories recursively", () => {
		const subDir = path.join(tmpDir, "sub", "deep");
		fs.mkdirSync(subDir, { recursive: true });

		const topFile = path.join(tmpDir, "top.txt");
		fs.writeFileSync(topFile, "top");
		const oldTime = Date.now() / 1000 - 100;
		fs.utimesSync(topFile, oldTime, oldTime);

		const deepFile = path.join(subDir, "deep.txt");
		fs.writeFileSync(deepFile, "deep");

		const result = findMostRecentFile(tmpDir, ".txt");
		expect(result).toBe(deepFile);
	});

	it("stops recursion at depth 5", () => {
		// Create a directory 6 levels deep (depth 0 through 6)
		let dir = tmpDir;
		for (let i = 0; i < 7; i++) {
			dir = path.join(dir, `d${i}`);
			fs.mkdirSync(dir);
		}

		// Place a file at depth 6 (beyond the limit)
		const tooDeep = path.join(dir, "hidden.txt");
		fs.writeFileSync(tooDeep, "too deep");

		const result = findMostRecentFile(tmpDir, ".txt");
		expect(result).toBeNull();
	});

	it("finds file at exactly depth 5", () => {
		// Create directories at depth 0 through 5
		let dir = tmpDir;
		for (let i = 0; i < 5; i++) {
			dir = path.join(dir, `d${i}`);
			fs.mkdirSync(dir);
		}

		const atLimit = path.join(dir, "found.txt");
		fs.writeFileSync(atLimit, "at limit");

		const result = findMostRecentFile(tmpDir, ".txt");
		expect(result).toBe(atLimit);
	});

	it("returns null on unreadable directory", () => {
		const unreadable = path.join(tmpDir, "noperm");
		fs.mkdirSync(unreadable);
		fs.chmodSync(unreadable, 0o000);

		// The top-level dir itself is fine, but the unreadable subdir is skipped
		// Since there are no files at the top level, result is null
		const result = findMostRecentFile(unreadable, ".txt");

		// Restore permissions for cleanup
		fs.chmodSync(unreadable, 0o755);

		expect(result).toBeNull();
	});

	it("handles multiple files and picks newest by mtime", () => {
		const files = ["a.json", "b.json", "c.json"];
		const baseTime = Date.now() / 1000;

		for (let i = 0; i < files.length; i++) {
			const filePath = path.join(tmpDir, files[i]);
			fs.writeFileSync(filePath, `content ${i}`);
			const mtime = baseTime - (files.length - i) * 100;
			fs.utimesSync(filePath, mtime, mtime);
		}

		// c.json has the newest mtime (baseTime - 100)
		const result = findMostRecentFile(tmpDir, ".json");
		expect(result).toBe(path.join(tmpDir, "c.json"));
	});
});
