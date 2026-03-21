import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";

// Mock node:fs before importing ConfigStore
vi.mock("node:fs", () => {
	const store = new Map<string, string>();
	return {
		default: {
			mkdirSync: vi.fn(),
			readFileSync: vi.fn((filePath: string) => {
				const content = store.get(filePath);
				if (content === undefined) {
					const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
					(err as NodeJS.ErrnoException).code = "ENOENT";
					throw err;
				}
				return content;
			}),
			writeFileSync: vi.fn((filePath: string, data: string) => {
				store.set(filePath, data);
			}),
			renameSync: vi.fn((src: string, dest: string) => {
				const content = store.get(src);
				if (content !== undefined) {
					store.set(dest, content);
					store.delete(src);
				}
			}),
			// Expose store for test inspection/setup
			__store: store,
		},
	};
});

vi.mock("node:os", () => ({
	default: {
		homedir: vi.fn(() => "/mock-home"),
	},
}));

import fs from "node:fs";

import { ConfigStore } from "../config-store.js";

const CONFIG_FILE = "/mock-home/.pterm/config.json";
const CONFIG_TMP = "/mock-home/.pterm/config.json.tmp";

// Access the internal store for setup/inspection
const fileStore = (fs as unknown as { __store: Map<string, string> }).__store;

describe("ConfigStore", () => {
	beforeEach(() => {
		fileStore.clear();
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("initialization", () => {
		it("creates default config when file does not exist", () => {
			const store = new ConfigStore();
			const config = store.getConfig();

			expect(config.projects).toEqual([]);
			expect(config.settings.theme).toBe("system");
			expect(config.settings.sidebarWidth).toBe(250);
			expect(config.settings.fontSize).toBe(12);
			expect(config.settings.defaultProjectCommands).toHaveLength(1);
			expect(config.settings.defaultProjectCommands[0].type).toBe("shell");

			// Should have written the default config to disk
			expect(fs.writeFileSync).toHaveBeenCalled();
			expect(fs.renameSync).toHaveBeenCalledWith(CONFIG_TMP, CONFIG_FILE);
		});

		it("creates config directory with recursive option", () => {
			new ConfigStore();
			expect(fs.mkdirSync).toHaveBeenCalledWith("/mock-home/.pterm", { recursive: true });
		});

		it("loads existing config from file", () => {
			const existing = {
				projects: [
					{
						id: "proj-1",
						name: "My Project",
						folder: "/tmp/proj",
						envVars: {},
						commands: [],
						branches: [],
						worktreeCopyFiles: [],
					},
				],
				settings: {
					theme: "dark",
					sidebarWidth: 300,
					fontSize: 14,
					defaultProjectCommands: [],
				},
			};
			fileStore.set(CONFIG_FILE, JSON.stringify(existing));

			const store = new ConfigStore();
			const config = store.getConfig();

			expect(config.projects).toHaveLength(1);
			expect(config.projects[0].name).toBe("My Project");
			expect(config.settings.theme).toBe("dark");
			expect(config.settings.fontSize).toBe(14);
		});

		it("handles corrupt JSON gracefully and falls back to default", () => {
			fileStore.set(CONFIG_FILE, "{ not valid json !!!");

			const store = new ConfigStore();
			const config = store.getConfig();

			expect(config.projects).toEqual([]);
			expect(config.settings.theme).toBe("system");
			// Should have written the default config to replace the corrupt one
			expect(fs.writeFileSync).toHaveBeenCalled();
		});
	});

	describe("createProject", () => {
		it("creates a project with UUID and persists", () => {
			const store = new ConfigStore();
			const project = store.createProject({
				name: "Test Project",
				folder: "/home/user/code",
				envVars: { NODE_ENV: "dev" },
				commands: [{ id: "cmd-1", name: "Shell", command: "", type: "shell" }],
				worktreeCopyFiles: [".env"],
			});

			expect(project.id).toBeDefined();
			expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			expect(project.name).toBe("Test Project");
			expect(project.folder).toBe("/home/user/code");
			expect(project.envVars).toEqual({ NODE_ENV: "dev" });
			expect(project.branches).toEqual([]);
			expect(project.worktreeCopyFiles).toEqual([".env"]);

			// Should be in the store
			expect(store.getProjects()).toHaveLength(1);
		});

		it("preserves optional fields", () => {
			const store = new ConfigStore();
			const project = store.createProject({
				name: "Themed Project",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
				terminalTheme: "monokai",
				browserCommand: "firefox",
			});

			expect(project.terminalTheme).toBe("monokai");
			expect(project.browserCommand).toBe("firefox");
		});

		it("schedules a save after creation", () => {
			const store = new ConfigStore();
			vi.mocked(fs.writeFileSync).mockClear();
			vi.mocked(fs.renameSync).mockClear();

			store.createProject({
				name: "P",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			// Before timer fires, no write should have happened
			expect(fs.writeFileSync).not.toHaveBeenCalled();

			// After 200ms, the save should fire
			vi.advanceTimersByTime(200);
			expect(fs.writeFileSync).toHaveBeenCalled();
		});
	});

	describe("getProject", () => {
		it("returns a clone, not a reference", () => {
			const store = new ConfigStore();
			const created = store.createProject({
				name: "Ref Test",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			const fetched = store.getProject(created.id);
			expect(fetched).toBeDefined();
			expect(fetched!.name).toBe("Ref Test");

			// Mutating the fetched object should not affect the store
			fetched!.name = "Mutated";
			const refetched = store.getProject(created.id);
			expect(refetched!.name).toBe("Ref Test");
		});

		it("returns undefined for non-existent ID", () => {
			const store = new ConfigStore();
			expect(store.getProject("does-not-exist")).toBeUndefined();
		});
	});

	describe("getProjects", () => {
		it("returns all projects", () => {
			const store = new ConfigStore();
			store.createProject({
				name: "A",
				folder: "/a",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});
			store.createProject({
				name: "B",
				folder: "/b",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			const projects = store.getProjects();
			expect(projects).toHaveLength(2);
			expect(projects.map((p) => p.name)).toEqual(["A", "B"]);
		});

		it("returns cloned array", () => {
			const store = new ConfigStore();
			store.createProject({
				name: "Clone Test",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			const projects = store.getProjects();
			projects.push({
				id: "fake",
				name: "Injected",
				folder: "/x",
				envVars: {},
				commands: [],
				branches: [],
				worktreeCopyFiles: [],
			});

			expect(store.getProjects()).toHaveLength(1);
		});
	});

	describe("updateProject", () => {
		it("updates specified fields", () => {
			const store = new ConfigStore();
			const project = store.createProject({
				name: "Before",
				folder: "/old",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			const updated = store.updateProject({
				id: project.id,
				name: "After",
				folder: "/new",
				terminalTheme: "solarized",
			});

			expect(updated.name).toBe("After");
			expect(updated.folder).toBe("/new");
			expect(updated.terminalTheme).toBe("solarized");
			// Unchanged fields remain
			expect(updated.envVars).toEqual({});
		});

		it("throws on missing project ID", () => {
			const store = new ConfigStore();

			expect(() => {
				store.updateProject({ id: "nonexistent", name: "Nope" });
			}).toThrow("Project not found: nonexistent");
		});
	});

	describe("deleteProject", () => {
		it("removes the project from the store", () => {
			const store = new ConfigStore();
			const project = store.createProject({
				name: "To Delete",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			expect(store.getProjects()).toHaveLength(1);
			store.deleteProject(project.id);
			expect(store.getProjects()).toHaveLength(0);
			expect(store.getProject(project.id)).toBeUndefined();
		});

		it("is a no-op for non-existent ID", () => {
			const store = new ConfigStore();
			store.createProject({
				name: "Keep Me",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			store.deleteProject("nonexistent");
			expect(store.getProjects()).toHaveLength(1);
		});
	});

	describe("addBranch", () => {
		it("adds a branch to the correct project", () => {
			const store = new ConfigStore();
			const project = store.createProject({
				name: "Branch Host",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			const branch = {
				id: "branch-1",
				name: "feature-x",
				folder: "/tmp/worktrees/feature-x",
				createdAt: "2026-01-01T00:00:00Z",
			};
			store.addBranch(project.id, branch);

			const fetched = store.getProject(project.id);
			expect(fetched!.branches).toHaveLength(1);
			expect(fetched!.branches[0].name).toBe("feature-x");
		});

		it("throws on missing project", () => {
			const store = new ConfigStore();

			expect(() => {
				store.addBranch("nonexistent", {
					id: "b1",
					name: "branch",
					folder: "/tmp",
					createdAt: "2026-01-01T00:00:00Z",
				});
			}).toThrow("Project not found: nonexistent");
		});
	});

	describe("removeBranch", () => {
		it("removes the branch from the correct project", () => {
			const store = new ConfigStore();
			const project = store.createProject({
				name: "Branch Host",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			store.addBranch(project.id, {
				id: "branch-1",
				name: "feature-a",
				folder: "/tmp/wa",
				createdAt: "2026-01-01T00:00:00Z",
			});
			store.addBranch(project.id, {
				id: "branch-2",
				name: "feature-b",
				folder: "/tmp/wb",
				createdAt: "2026-01-02T00:00:00Z",
			});

			store.removeBranch(project.id, "branch-1");

			const fetched = store.getProject(project.id);
			expect(fetched!.branches).toHaveLength(1);
			expect(fetched!.branches[0].id).toBe("branch-2");
		});

		it("throws on missing project", () => {
			const store = new ConfigStore();

			expect(() => {
				store.removeBranch("nonexistent", "branch-1");
			}).toThrow("Project not found: nonexistent");
		});
	});

	describe("updateSettings", () => {
		it("merges partial updates into existing settings", () => {
			const store = new ConfigStore();

			store.updateSettings({ fontSize: 16, theme: "dark" });
			const settings = store.getSettings();

			expect(settings.fontSize).toBe(16);
			expect(settings.theme).toBe("dark");
			// Unchanged fields remain at defaults
			expect(settings.sidebarWidth).toBe(250);
		});

		it("updates optional settings fields", () => {
			const store = new ConfigStore();

			store.updateSettings({
				terminalTheme: "nord",
				browserCommand: "chrome --new-window",
				customThemes: [
					{
						id: "custom-1",
						name: "My Theme",
						variant: "dark",
						colors: {
							background: "#000",
							foreground: "#fff",
							cursor: "#fff",
							cursorAccent: "#000",
							selectionBackground: "#333",
							selectionForeground: "#fff",
							black: "#000",
							red: "#f00",
							green: "#0f0",
							yellow: "#ff0",
							blue: "#00f",
							magenta: "#f0f",
							cyan: "#0ff",
							white: "#fff",
							brightBlack: "#888",
							brightRed: "#f88",
							brightGreen: "#8f8",
							brightYellow: "#ff8",
							brightBlue: "#88f",
							brightMagenta: "#f8f",
							brightCyan: "#8ff",
							brightWhite: "#fff",
						},
					},
				],
			});

			const settings = store.getSettings();
			expect(settings.terminalTheme).toBe("nord");
			expect(settings.browserCommand).toBe("chrome --new-window");
			expect(settings.customThemes).toHaveLength(1);
		});

		it("returns the updated settings object", () => {
			const store = new ConfigStore();
			const result = store.updateSettings({ fontSize: 20 });
			expect(result.fontSize).toBe(20);
		});
	});

	describe("flushSync", () => {
		it("writes immediately and clears pending timer", () => {
			const store = new ConfigStore();
			vi.mocked(fs.writeFileSync).mockClear();
			vi.mocked(fs.renameSync).mockClear();

			store.createProject({
				name: "Flush Test",
				folder: "/tmp",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			// scheduleSave was called but timer hasn't fired
			expect(fs.writeFileSync).not.toHaveBeenCalled();

			store.flushSync();

			expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
			expect(fs.renameSync).toHaveBeenCalledWith(CONFIG_TMP, CONFIG_FILE);

			// Advancing timers should NOT cause another write (timer was cleared)
			vi.mocked(fs.writeFileSync).mockClear();
			vi.advanceTimersByTime(500);
			expect(fs.writeFileSync).not.toHaveBeenCalled();
		});

		it("writes even when no pending timer", () => {
			const store = new ConfigStore();
			vi.mocked(fs.writeFileSync).mockClear();

			store.flushSync();
			expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
		});

		it("uses atomic write (tmp file + rename)", () => {
			const store = new ConfigStore();
			vi.mocked(fs.writeFileSync).mockClear();
			vi.mocked(fs.renameSync).mockClear();

			store.flushSync();

			expect(fs.writeFileSync).toHaveBeenCalledWith(CONFIG_TMP, expect.any(String));
			expect(fs.renameSync).toHaveBeenCalledWith(CONFIG_TMP, CONFIG_FILE);
		});
	});

	describe("scheduleSave debouncing", () => {
		it("multiple rapid changes result in a single write", () => {
			const store = new ConfigStore();
			vi.mocked(fs.writeFileSync).mockClear();
			vi.mocked(fs.renameSync).mockClear();

			// Make several changes in quick succession
			store.createProject({
				name: "P1",
				folder: "/a",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});
			store.createProject({
				name: "P2",
				folder: "/b",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});
			store.updateSettings({ fontSize: 18 });

			// No writes yet
			expect(fs.writeFileSync).not.toHaveBeenCalled();

			// Advance past debounce window
			vi.advanceTimersByTime(200);

			// Should have written exactly once
			expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

			// The written config should contain both projects and updated settings
			const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
			const written = JSON.parse(writtenJson);
			expect(written.projects).toHaveLength(2);
			expect(written.settings.fontSize).toBe(18);
		});

		it("resets timer on each change within debounce window", () => {
			const store = new ConfigStore();
			vi.mocked(fs.writeFileSync).mockClear();

			store.createProject({
				name: "P1",
				folder: "/a",
				envVars: {},
				commands: [],
				worktreeCopyFiles: [],
			});

			// Advance 150ms (within 200ms window)
			vi.advanceTimersByTime(150);
			expect(fs.writeFileSync).not.toHaveBeenCalled();

			// Make another change, which resets the timer
			store.updateSettings({ fontSize: 20 });

			// Advance another 150ms (300ms total, but only 150ms since last change)
			vi.advanceTimersByTime(150);
			expect(fs.writeFileSync).not.toHaveBeenCalled();

			// Advance the remaining 50ms to trigger the write
			vi.advanceTimersByTime(50);
			expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
		});
	});
});
