import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import type { DetectedBrowser, BrowserProfile } from "../shared/types.js";

const execFile = promisify(execFileCb);

interface BrowserCandidate {
  name: string;
  type: DetectedBrowser["type"];
  commands: string[];           // paths or commands to check (first found wins)
  localStatePaths: string[];    // paths to Chromium Local State file
}

function isWsl(): boolean {
  try {
    const release = require("node:fs").readFileSync("/proc/version", "utf-8");
    return /microsoft|wsl/i.test(release);
  } catch {
    return false;
  }
}

function getWindowsUsers(): string[] {
  try {
    const entries = readdirSync("/mnt/c/Users");
    return entries.filter(
      (e) => !["Public", "Default", "Default User", "All Users"].includes(e),
    );
  } catch {
    return [];
  }
}

function linuxCandidates(): BrowserCandidate[] {
  const home = homedir();
  const candidates: BrowserCandidate[] = [
    {
      name: "Google Chrome",
      type: "chrome",
      commands: ["google-chrome-stable", "google-chrome"],
      localStatePaths: [join(home, ".config/google-chrome/Local State")],
    },
    {
      name: "Firefox",
      type: "firefox",
      commands: ["firefox"],
      localStatePaths: [],
    },
    {
      name: "Microsoft Edge",
      type: "edge",
      commands: ["microsoft-edge-stable", "microsoft-edge"],
      localStatePaths: [join(home, ".config/microsoft-edge/Local State")],
    },
    {
      name: "Brave",
      type: "brave",
      commands: ["brave-browser"],
      localStatePaths: [
        join(home, ".config/BraveSoftware/Brave-Browser/Local State"),
      ],
    },
  ];

  if (isWsl()) {
    const users = getWindowsUsers();
    candidates.push({
      name: "Windows Chrome",
      type: "chrome",
      commands: [
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
      ],
      localStatePaths: users.map((u) =>
        `/mnt/c/Users/${u}/AppData/Local/Google/Chrome/User Data/Local State`,
      ),
    });
    candidates.push({
      name: "Windows Edge",
      type: "edge",
      commands: [
        "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ],
      localStatePaths: users.map((u) =>
        `/mnt/c/Users/${u}/AppData/Local/Microsoft/Edge/User Data/Local State`,
      ),
    });
    candidates.push({
      name: "Windows Firefox",
      type: "firefox",
      commands: ["/mnt/c/Program Files/Mozilla Firefox/firefox.exe"],
      localStatePaths: [],
    });
  }

  return candidates;
}

function macCandidates(): BrowserCandidate[] {
  const home = homedir();
  return [
    {
      name: "Google Chrome",
      type: "chrome",
      commands: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ],
      localStatePaths: [
        join(home, "Library/Application Support/Google/Chrome/Local State"),
      ],
    },
    {
      name: "Firefox",
      type: "firefox",
      commands: ["/Applications/Firefox.app/Contents/MacOS/firefox"],
      localStatePaths: [],
    },
    {
      name: "Microsoft Edge",
      type: "edge",
      commands: [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ],
      localStatePaths: [
        join(
          home,
          "Library/Application Support/Microsoft Edge/Local State",
        ),
      ],
    },
    {
      name: "Brave Browser",
      type: "brave",
      commands: [
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      ],
      localStatePaths: [
        join(
          home,
          "Library/Application Support/BraveSoftware/Brave-Browser/Local State",
        ),
      ],
    },
  ];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function whichCommand(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("which", [cmd]);
    const path = stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}

async function resolveCommand(cmd: string): Promise<string | null> {
  // Absolute path — check file existence
  if (cmd.startsWith("/")) {
    return (await fileExists(cmd)) ? cmd : null;
  }
  // Bare command name — use `which`
  return whichCommand(cmd);
}

async function readProfiles(
  localStatePaths: string[],
): Promise<BrowserProfile[]> {
  for (const p of localStatePaths) {
    try {
      const raw = await readFile(p, "utf-8");
      const data = JSON.parse(raw);
      const cache = data?.profile?.info_cache;
      if (!cache || typeof cache !== "object") continue;

      const profiles: BrowserProfile[] = [];
      for (const [dir, info] of Object.entries(cache)) {
        const name = (info as any)?.name || (info as any)?.shortcut_name || dir;
        profiles.push({ directory: dir, name });
      }
      if (profiles.length > 0) return profiles;
    } catch {
      continue;
    }
  }
  return [];
}

export async function detectBrowsers(): Promise<DetectedBrowser[]> {
  const platform = process.platform;
  const candidates =
    platform === "darwin" ? macCandidates() : linuxCandidates();

  const results: DetectedBrowser[] = [];

  await Promise.all(
    candidates.map(async (c) => {
      for (const cmd of c.commands) {
        const resolved = await resolveCommand(cmd);
        if (resolved) {
          const profiles = await readProfiles(c.localStatePaths);
          results.push({
            name: c.name,
            command: resolved,
            type: c.type,
            profiles: profiles.length > 0 ? profiles : undefined,
          });
          return;
        }
      }
    }),
  );

  return results;
}
