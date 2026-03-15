import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers.js";
import type { ElectronApplication, Page } from "@playwright/test";

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

test.beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pterm-test-"));
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
  await expect(page.getByText(name)).toBeVisible();
}

// Helper: launch a shell terminal for the current project
async function launchShellTerminal(page: Page) {
  await page.getByTitle("New terminal").click();
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
