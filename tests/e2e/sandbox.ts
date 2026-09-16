import os from "node:os";
import path from "node:path";

/**
 * Fixed sandbox paths shared by the Playwright config, the global setup and the
 * workers (each runs in its own process, so the location must be derivable
 * without passing state around). Kept outside the repo so the dev server does
 * not recompile whenever a test writes a session file.
 */
export const SANDBOX_ROOT = path.join(os.tmpdir(), "pi-web-e2e");
export const SANDBOX_HOME = path.join(SANDBOX_ROOT, "home");
export const AGENT_DIR = path.join(SANDBOX_HOME, ".pi", "agent");
export const SESSIONS_DIR = path.join(AGENT_DIR, "sessions");
export const WORK_ROOT = path.join(SANDBOX_ROOT, "work");

export const E2E_PORT = process.env.PI_WEB_E2E_PORT ?? "30142";
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Env for the dev server under test: no real HOME, no real agent dir, no network. */
export function sandboxServerEnv(): Record<string, string> {
  return {
    HOME: SANDBOX_HOME,
    USERPROFILE: SANDBOX_HOME,
    XDG_CONFIG_HOME: path.join(SANDBOX_HOME, ".config"),
    XDG_CACHE_HOME: path.join(SANDBOX_HOME, ".cache"),
    PI_CODING_AGENT_DIR: AGENT_DIR,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_WEB_NO_OPEN: "1",
    // Separate build dir so an e2e run never fights a dev server on `.next`.
    PI_WEB_DIST_DIR: ".next-e2e",
  };
}
