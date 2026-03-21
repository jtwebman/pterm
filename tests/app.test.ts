import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { launchApp, closeApp } from "./helpers.js";

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

test.beforeEach(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pterm-test-"));
	// Prevent zsh first-run wizard from intercepting the shell
	fs.writeFileSync(path.join(tmpDir, ".zshrc"), "");
	({ app, page } = await launchApp(tmpDir));
});

test.afterEach(async () => {
	await closeApp(app);
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: create a project via the UI
async function createProject(page: Page, name: string, folder: string) {
	const createBtn = page.getByText("Create Project").or(page.getByText("+ Add"));
	await createBtn.first().click();
	await page.getByPlaceholder("My Project").fill(name);
	await page.getByPlaceholder("/path/to/project").fill(folder);
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page.getByText(name).first()).toBeVisible();
}

// Helper: launch a shell terminal for the current project
async function launchShellTerminal(page: Page) {
	await page.getByTitle("New terminal").first().click();
	// Select the "Shell" command explicitly (auto-detect may default to claude/codex)
	const shellBtn = page.locator("button", { hasText: "Shell" }).first();
	await shellBtn.click();
	await page.getByRole("button", { name: "Launch" }).click();
	await expect(page.locator(".xterm-screen")).toBeVisible({ timeout: 5_000 });
}

test("window opens with empty state", async () => {
	await expect(page.getByText("Welcome to pterm")).toBeVisible();
	await expect(page.getByText("Create Project")).toBeVisible();
});

test("create project dialog opens", async () => {
	await page.getByText("Create Project").click();
	await expect(page.getByPlaceholder("My Project")).toBeVisible();
	await expect(page.getByPlaceholder("/path/to/project")).toBeVisible();
});

test("create project and open terminal", async () => {
	const projectDir = path.join(tmpDir, "test-project");
	fs.mkdirSync(projectDir, { recursive: true });

	await createProject(page, "Test Project", projectDir);
	await launchShellTerminal(page);
});

test("terminal receives shell output", async () => {
	const projectDir = path.join(tmpDir, "test-project");
	fs.mkdirSync(projectDir, { recursive: true });

	await createProject(page, "Echo Test", projectDir);
	await launchShellTerminal(page);

	// Focus terminal and wait for shell prompt
	await page.locator(".xterm-screen").click();
	await page.waitForTimeout(1_000);

	// Type echo command
	await page.keyboard.type("echo PTERM_TEST_OUTPUT\n");

	// Wait for output to appear in the terminal DOM
	await expect(page.locator(".xterm-rows")).toContainText("PTERM_TEST_OUTPUT", {
		timeout: 5_000,
	});
});

test("close tab removes terminal", async () => {
	const projectDir = path.join(tmpDir, "test-project");
	fs.mkdirSync(projectDir, { recursive: true });

	await createProject(page, "Close Test", projectDir);
	await launchShellTerminal(page);

	// The close button (×) is hidden until hover — hover the tab to reveal it
	// The tab contains the command name "Shell" inside a .group container
	const tab = page.locator(".group", { hasText: "Shell" }).first();
	await tab.hover();
	await page.waitForTimeout(200);
	// The × button is the last button in the group
	await tab.locator("button").last().click();

	// Terminal should be gone
	await expect(page.locator(".xterm-screen")).not.toBeVisible({ timeout: 3_000 });
});

test("create branch, verify sidebar, delete via branch manager", async () => {
	// Set up a git repo as the project folder
	const projectDir = path.join(tmpDir, "branch-test");
	fs.mkdirSync(projectDir, { recursive: true });
	execFileSync("git", ["init"], { cwd: projectDir });
	execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: projectDir });
	execFileSync("git", ["config", "user.name", "Test"], { cwd: projectDir });
	fs.writeFileSync(path.join(projectDir, "README.md"), "test");
	execFileSync("git", ["add", "."], { cwd: projectDir });
	execFileSync("git", ["commit", "-m", "init"], { cwd: projectDir });

	await createProject(page, "Branch Test", projectDir);

	// Open branch manager via the branch icon on the project header
	const projectHeader = page.locator(".group", { hasText: "Branch Test" }).first();
	await projectHeader.hover();
	await page.waitForTimeout(200);
	await projectHeader.getByTitle("Manage branches").click();

	// Branch manager dialog should be open
	await expect(page.getByText("Branches — Branch Test")).toBeVisible();

	// Create a new worktree branch (dialog closes immediately, branch created in background)
	await page.getByPlaceholder("Branch name...").fill("test-feature");
	await page.getByRole("button", { name: "Create" }).click();

	// Dialog should close and branch should appear in sidebar
	await expect(page.getByText("test-feature").first()).toBeVisible({ timeout: 10_000 });

	// Verify worktree directory was created
	const worktreeDir = path.join(tmpDir, ".pterm", "worktrees");
	expect(fs.existsSync(worktreeDir)).toBe(true);
	const worktreeContents = fs.readdirSync(worktreeDir, { recursive: true });
	expect(worktreeContents.length).toBeGreaterThan(0);

	// Re-open branch manager to delete the branch
	await projectHeader.hover();
	await page.waitForTimeout(200);
	await projectHeader.getByTitle("Manage branches").click();
	await expect(page.getByText("Branches — Branch Test")).toBeVisible();

	// Click the delete button (×) next to the branch
	await page.getByTitle("Delete branch").click();

	// Branch should disappear from the manager dialog
	await expect(page.getByTitle("Delete branch")).not.toBeVisible({ timeout: 3_000 });

	// Close branch manager
	await page.getByRole("button", { name: "Close" }).click();

	// Verify worktree directory was cleaned up
	// The worktrees dir may still have the project UUID folder, but
	// the actual branch worktree folder inside it should be gone
	const remaining = fs.readdirSync(worktreeDir, { recursive: true }) as string[];
	const branchDirs = remaining.filter((f) => f.includes("test-feature"));
	expect(branchDirs.length).toBe(0);
});

test("sidebar updates when branch changes via shell", async () => {
	// Set up a git repo as the project folder
	const projectDir = path.join(tmpDir, "branch-watch-test");
	fs.mkdirSync(projectDir, { recursive: true });
	execFileSync("git", ["init"], { cwd: projectDir });
	execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: projectDir });
	execFileSync("git", ["config", "user.name", "Test"], { cwd: projectDir });
	fs.writeFileSync(path.join(projectDir, "README.md"), "test");
	execFileSync("git", ["add", "."], { cwd: projectDir });
	execFileSync("git", ["commit", "-m", "init"], { cwd: projectDir });

	await createProject(page, "Watch Test", projectDir);

	// Sidebar should show the initial branch (main or master)
	const initialBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: projectDir,
	})
		.toString()
		.trim();
	await expect(page.getByText(`Watch Test (${initialBranch})`)).toBeVisible({ timeout: 3_000 });

	// Launch a shell terminal
	await launchShellTerminal(page);

	// Focus terminal and wait for shell prompt to be ready
	await page.locator(".xterm-screen").click();
	await page.waitForTimeout(2_000);

	// Create and switch to a new branch via the shell
	await page.keyboard.type("git checkout -b random-branch", { delay: 20 });
	await page.keyboard.press("Enter");

	// Wait for git output to confirm the command succeeded
	await expect(page.locator(".xterm-rows")).toContainText("random-branch", { timeout: 5_000 });

	// Sidebar should update to show the new branch name
	await expect(page.getByText("Watch Test (random-branch)")).toBeVisible({ timeout: 5_000 });

	// Switch back to the original branch
	await page.keyboard.type(`git checkout ${initialBranch}`, { delay: 20 });
	await page.keyboard.press("Enter");

	// Wait for git output to confirm
	await expect(page.locator(".xterm-rows")).toContainText(`Switched to branch '${initialBranch}'`, {
		timeout: 5_000,
	});

	// Sidebar should update back
	await expect(page.getByText(`Watch Test (${initialBranch})`)).toBeVisible({ timeout: 5_000 });
});
