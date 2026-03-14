import { spawn } from "node:child_process";
import { createServer } from "vite";
import { watch } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let electronProcess = null;

function runCmd(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: root, stdio: "inherit" });
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} failed`))));
  });
}

function buildMain() {
  return runCmd("npx", ["tsdown", "--config", "tsdown.main.config.ts"]);
}

function buildPreload() {
  return runCmd("npx", ["tsdown", "--config", "tsdown.preload.config.ts"]);
}

function startElectron(url) {
  if (electronProcess) {
    electronProcess.removeAllListeners("close");
    electronProcess.kill("SIGTERM");
    electronProcess = null;
  }
  electronProcess = spawn("npx", ["electron", "."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  electronProcess.on("close", (code, signal) => {
    // Electron on Linux/WSL2 exits with SIGTRAP during X11 teardown — ignore it
    if (signal === "SIGTRAP" || signal === "SIGTERM") return;
    if (code !== null) process.exit(code);
  });
}

// Build main + preload, start vite dev server, launch Electron
await Promise.all([buildMain(), buildPreload()]);

const server = await createServer({ root, configFile: resolve(root, "vite.config.ts") });
await server.listen();
const address = server.resolvedUrls.local[0];
console.log(`\nVite dev server: ${address}`);

startElectron(address);

// Watch for main/preload source changes and rebuild + restart
let rebuildTimer = null;
watch(resolve(root, "src/main"), { recursive: true }, () => {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    console.log("\nRebuilding main...");
    await buildMain();
    startElectron(address);
  }, 200);
});

watch(resolve(root, "src/preload"), { recursive: true }, () => {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    console.log("\nRebuilding preload...");
    await buildPreload();
    startElectron(address);
  }, 200);
});
