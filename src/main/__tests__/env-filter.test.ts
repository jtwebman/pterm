import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";

import { filterEnv } from "../env-filter.js";

describe("filterEnv", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Replace process.env with a controlled copy
		process.env = {
			PATH: "/usr/bin",
			HOME: "/home/user",
			LANG: "en_US.UTF-8",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("strips ELECTRON_ prefixed vars", () => {
		process.env.ELECTRON_RUN_AS_NODE = "1";
		process.env.ELECTRON_BROWSER = "true";
		const result = filterEnv();
		expect(result).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
		expect(result).not.toHaveProperty("ELECTRON_BROWSER");
	});

	it("strips VITE_ prefixed vars", () => {
		process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";
		process.env.VITE_PUBLIC_DIR = "/public";
		const result = filterEnv();
		expect(result).not.toHaveProperty("VITE_DEV_SERVER_URL");
		expect(result).not.toHaveProperty("VITE_PUBLIC_DIR");
	});

	it("strips PTERM_ prefixed vars", () => {
		process.env.PTERM_VERSION = "1.0.0";
		process.env.PTERM_CONFIG = "/some/path";
		const result = filterEnv();
		expect(result).not.toHaveProperty("PTERM_VERSION");
		expect(result).not.toHaveProperty("PTERM_CONFIG");
	});

	it("strips NODE_ prefixed vars", () => {
		process.env.NODE_ENV = "development";
		process.env.NODE_OPTIONS = "--max-old-space-size=4096";
		const result = filterEnv();
		expect(result).not.toHaveProperty("NODE_ENV");
		expect(result).not.toHaveProperty("NODE_OPTIONS");
	});

	it("strips npm_ prefixed vars", () => {
		process.env.npm_package_name = "pterm";
		process.env.npm_lifecycle_event = "dev";
		const result = filterEnv();
		expect(result).not.toHaveProperty("npm_package_name");
		expect(result).not.toHaveProperty("npm_lifecycle_event");
	});

	it("keeps normal env vars", () => {
		const result = filterEnv();
		expect(result).toHaveProperty("PATH", "/usr/bin");
		expect(result).toHaveProperty("HOME", "/home/user");
		expect(result).toHaveProperty("LANG", "en_US.UTF-8");
	});

	it("merges project env vars on top", () => {
		const result = filterEnv({ MY_VAR: "hello", ANOTHER: "world" });
		expect(result).toHaveProperty("PATH", "/usr/bin");
		expect(result).toHaveProperty("MY_VAR", "hello");
		expect(result).toHaveProperty("ANOTHER", "world");
	});

	it("project env vars override existing env vars", () => {
		const result = filterEnv({ PATH: "/custom/bin" });
		expect(result).toHaveProperty("PATH", "/custom/bin");
	});

	it("works with no project env vars (undefined)", () => {
		const result = filterEnv(undefined);
		expect(result).toHaveProperty("PATH", "/usr/bin");
		expect(result).toHaveProperty("HOME", "/home/user");
		expect(Object.keys(result)).toHaveLength(3);
	});

	it("works with empty project env vars", () => {
		const result = filterEnv({});
		expect(result).toHaveProperty("PATH", "/usr/bin");
		expect(result).toHaveProperty("HOME", "/home/user");
		expect(Object.keys(result)).toHaveLength(3);
	});
});
