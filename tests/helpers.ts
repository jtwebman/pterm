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
    args: [path.join(ROOT, "dist/main/index.mjs")],
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
 * Cleanly shut down the app. Evaluates app.quit() in the main process
 * to avoid fighting with the close handler's preventDefault.
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.evaluate(async ({ app }) => {
      app.quit();
    });
  } catch {
    // App may already be closed
  }
  await app.close();
}
