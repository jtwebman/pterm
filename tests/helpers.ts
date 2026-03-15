import path from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Launch pterm with a fresh config directory so tests don't pollute each other.
 * Returns the ElectronApplication and the first BrowserWindow page.
 */
export async function launchApp(tmpDir: string): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  const app = await electron.launch({
    args: [
      ...(process.env.CI ? ["--no-sandbox", "--disable-gpu-sandbox"] : []),
      path.join(ROOT, "dist/main/index.mjs"),
    ],
    env: {
      ...process.env,
      // Isolate config + DB to temp dir so tests are hermetic
      HOME: tmpDir,
      USERPROFILE: tmpDir,
    },
  });

  const page = await app.firstWindow();

  await page.waitForLoadState("domcontentloaded");
  // Wait for React to mount
  await page.waitForSelector("#root > *", { timeout: 10_000 });
  return { app, page };
}

/**
 * Cleanly shut down the app. Force-closes all windows then exits,
 * with a timeout fallback to process.exit().
 */
export async function closeApp(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return;
  try {
    await app.evaluate(async ({ app, BrowserWindow }) => {
      // Force-close all windows without triggering the close handler
      for (const win of BrowserWindow.getAllWindows()) {
        win.removeAllListeners("close");
        win.destroy();
      }
      app.quit();
    });
  } catch {
    // App may already be closed
  }
  try {
    await app.close();
  } catch {
    // Process may have already exited
  }
}
