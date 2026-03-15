import fs from "node:fs";
import path from "node:path";

export function findMostRecentFile(dir: string, ext: string): string | null {
  try {
    let newest: string | null = null;
    let newestMtime = 0;

    function walk(d: string, depth: number) {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else if (entry.name.endsWith(ext)) {
            try {
              const stat = fs.statSync(full);
              if (stat.mtimeMs > newestMtime) {
                newestMtime = stat.mtimeMs;
                newest = full;
              }
            } catch { /* removed */ }
          }
        }
      } catch { /* unreadable dir */ }
    }

    walk(dir, 0);
    return newest;
  } catch {
    return null;
  }
}
