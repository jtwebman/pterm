import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { Project, ProjectBranch } from "../shared/types.js";

const BRANCH_STORE = path.join(os.homedir(), ".pterm", "branches");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createBranch(project: Project, branchName: string): Promise<ProjectBranch> {
  const destFolder = path.join(BRANCH_STORE, project.id, slugify(branchName));
  await fs.mkdir(path.dirname(destFolder), { recursive: true });
  await fs.cp(project.folder, destFolder, { recursive: true });

  return {
    id: crypto.randomUUID(),
    name: branchName,
    folder: destFolder,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteBranch(branch: ProjectBranch): Promise<void> {
  await fs.rm(branch.folder, { recursive: true, force: true });
}
