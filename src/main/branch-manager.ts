import fs from "node:fs/promises";
import { globSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { Project, ProjectBranch } from "../shared/types.js";

const execFile = promisify(execFileCb);

const WORKTREE_STORE = path.join(os.homedir(), ".pterm", "worktrees");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createBranch(project: Project, branchName: string): Promise<ProjectBranch> {
  const worktreePath = path.join(WORKTREE_STORE, project.id, slugify(branchName));
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  try {
    // Try creating a new branch
    await execFile("git", ["worktree", "add", "-b", branchName, worktreePath], {
      cwd: project.folder,
    });
  } catch {
    // Branch already exists, attach worktree to existing branch
    await execFile("git", ["worktree", "add", worktreePath, branchName], {
      cwd: project.folder,
    });
  }

  // Copy files matching worktreeCopyFiles patterns
  if (project.worktreeCopyFiles.length > 0) {
    for (const pattern of project.worktreeCopyFiles) {
      const matches = globSync(pattern, { cwd: project.folder });
      for (const relativePath of matches) {
        const src = path.join(project.folder, relativePath);
        const dest = path.join(worktreePath, relativePath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    name: branchName,
    folder: worktreePath,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteBranch(project: Project, branch: ProjectBranch): Promise<void> {
  try {
    await execFile("git", ["worktree", "remove", branch.folder], {
      cwd: project.folder,
    });
  } catch {
    // Worktree may already be gone; clean up manually
  }

  await fs.rm(branch.folder, { recursive: true, force: true });
}
