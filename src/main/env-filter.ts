export function filterEnv(projectEnvVars?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(ELECTRON_|VITE_|PTERM_|NODE_|npm_)/.test(key)) continue;
    env[key] = value;
  }

  if (projectEnvVars) {
    Object.assign(env, projectEnvVars);
  }

  return env;
}
