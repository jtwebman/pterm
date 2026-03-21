import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
	Config,
	Project,
	ProjectBranch,
	ProjectCreateInput,
	ProjectUpdateInput,
	SettingsUpdateInput,
} from "../shared/types.js";

const CONFIG_DIR = path.join(os.homedir(), ".pterm");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const CONFIG_TMP = path.join(CONFIG_DIR, "config.json.tmp");

function defaultConfig(): Config {
	return {
		projects: [],
		settings: {
			theme: "system",
			sidebarWidth: 250,
			fontSize: 12,
			defaultProjectCommands: [
				{ id: crypto.randomUUID(), name: "Shell", command: "", type: "shell" },
			],
		},
	};
}

export class ConfigStore {
	private config: Config;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		fs.mkdirSync(CONFIG_DIR, { recursive: true });
		this.config = this.load();
	}

	private load(): Config {
		try {
			const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
			return JSON.parse(raw) as Config;
		} catch {
			const cfg = defaultConfig();
			this.writeSync(cfg);
			return cfg;
		}
	}

	private scheduleSave(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.writeSync(this.config);
			this.saveTimer = null;
		}, 200);
	}

	private writeSync(cfg: Config): void {
		fs.writeFileSync(CONFIG_TMP, JSON.stringify(cfg, null, 2));
		fs.renameSync(CONFIG_TMP, CONFIG_FILE);
	}

	flushSync(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.writeSync(this.config);
	}

	getConfig(): Config {
		return this.config;
	}

	getProjects(): Project[] {
		return structuredClone(this.config.projects);
	}

	getProject(id: string): Project | undefined {
		const project = this.config.projects.find((p) => p.id === id);
		return project ? structuredClone(project) : undefined;
	}

	createProject(input: ProjectCreateInput): Project {
		const project: Project = {
			id: crypto.randomUUID(),
			name: input.name,
			folder: input.folder,
			envVars: input.envVars,
			commands: input.commands,
			branches: [],
			worktreeCopyFiles: input.worktreeCopyFiles,
			terminalTheme: input.terminalTheme,
			browserCommand: input.browserCommand,
		};
		this.config.projects.push(project);
		this.scheduleSave();
		return project;
	}

	updateProject(input: ProjectUpdateInput): Project {
		const project = this.config.projects.find((p) => p.id === input.id);
		if (!project) throw new Error(`Project not found: ${input.id}`);

		if (input.name !== undefined) project.name = input.name;
		if (input.folder !== undefined) project.folder = input.folder;
		if (input.envVars !== undefined) project.envVars = input.envVars;
		if (input.commands !== undefined) project.commands = input.commands;
		if (input.worktreeCopyFiles !== undefined) project.worktreeCopyFiles = input.worktreeCopyFiles;
		if (input.terminalTheme !== undefined) project.terminalTheme = input.terminalTheme;
		if (input.browserCommand !== undefined) project.browserCommand = input.browserCommand;

		this.scheduleSave();
		return project;
	}

	deleteProject(id: string): void {
		this.config.projects = this.config.projects.filter((p) => p.id !== id);
		this.scheduleSave();
	}

	addBranch(projectId: string, branch: ProjectBranch): void {
		const project = this.config.projects.find((p) => p.id === projectId);
		if (!project) throw new Error(`Project not found: ${projectId}`);
		project.branches.push(branch);
		this.scheduleSave();
	}

	getSettings(): Config["settings"] {
		return this.config.settings;
	}

	updateSettings(input: SettingsUpdateInput): Config["settings"] {
		if (input.fontSize !== undefined) this.config.settings.fontSize = input.fontSize;
		if (input.sidebarWidth !== undefined) this.config.settings.sidebarWidth = input.sidebarWidth;
		if (input.theme !== undefined) this.config.settings.theme = input.theme;
		if (input.terminalTheme !== undefined) this.config.settings.terminalTheme = input.terminalTheme;
		if (input.browserCommand !== undefined)
			this.config.settings.browserCommand = input.browserCommand;
		if (input.customThemes !== undefined) this.config.settings.customThemes = input.customThemes;
		this.scheduleSave();
		return this.config.settings;
	}

	removeBranch(projectId: string, branchId: string): void {
		const project = this.config.projects.find((p) => p.id === projectId);
		if (!project) throw new Error(`Project not found: ${projectId}`);
		project.branches = project.branches.filter((b) => b.id !== branchId);
		this.scheduleSave();
	}
}
