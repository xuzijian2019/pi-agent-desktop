import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { getHelpText, parseLaunchOptions } = require("../bin/pi-web-options.js");
const { getNextNodeArgs } = require("../bin/pi-web-node-args.js");
const { wireChildProcessLifecycle } = require("../bin/process-lifecycle.js");
const { attachReadyHandoff, shouldOpenBrowser } = require("../lib/browser-open.js");

const pkgDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

let launchOptions;
try {
  launchOptions = parseLaunchOptions(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (launchOptions.help) {
  process.stdout.write(getHelpText());
  process.exit(0);
}

if (!loopbackHosts.has(launchOptions.hostname)) {
  console.error("npm run web listens on 127.0.0.1. Use npm run dev:lan to bind another host.");
  process.exit(1);
}

function resolveNextBin() {
  try {
    return require.resolve("next/dist/bin/next", { paths: [pkgDir] });
  } catch {
    try {
      const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
      return path.join(path.dirname(nextPkg), "dist", "bin", "next");
    } catch {
      return path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
    }
  }
}

/**
 * A dev server left behind by an earlier run owns the port and the new one
 * dies on EADDRINUSE. The port is this project's own, so reclaim it: ask the
 * previous listener to quit, and insist if it does not.
 */
const PORT_TERM_WAIT_MS = 2500;
const PORT_KILL_WAIT_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listenerPids(targetPort) {
  try {
    if (process.platform === "win32") {
      const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
      const pids = output.split(/\r?\n/)
        .filter((line) => /LISTENING/i.test(line) && /:(\d+)\s/.test(line) && line.includes(`:${targetPort} `))
        .map((line) => line.trim().split(/\s+/).pop());
      return [...new Set(pids.filter((pid) => /^\d+$/.test(pid ?? "")))];
    }
    const output = execFileSync("lsof", ["-ti", `tcp:${targetPort}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return [...new Set(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  } catch {
    // No listener, or no lsof/netstat: fall through and let the server try.
    return [];
  }
}

function signalPids(pids, signal) {
  for (const pid of pids) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", [...(signal === "SIGKILL" ? ["/F"] : []), "/PID", pid]);
      else process.kill(Number(pid), signal);
    } catch { /* already gone */ }
  }
}

async function waitForRelease(targetPort, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await sleep(120);
    if (!listenerPids(targetPort).length) return true;
  }
  return !listenerPids(targetPort).length;
}

async function reclaimPort(targetPort) {
  const pids = listenerPids(targetPort).filter((pid) => Number(pid) !== process.pid);
  if (!pids.length) return;
  console.log(`pi-web: port ${targetPort} is in use by pid ${pids.join(", ")} — stopping it`);
  signalPids(pids, "SIGTERM");
  if (await waitForRelease(targetPort, PORT_TERM_WAIT_MS)) return;
  signalPids(listenerPids(targetPort), "SIGKILL");
  if (!(await waitForRelease(targetPort, PORT_KILL_WAIT_MS))) {
    console.warn(`pi-web: port ${targetPort} is still held; starting anyway`);
  }
}

await reclaimPort(launchOptions.port);

const nextBin = resolveNextBin();
const child = spawn(
  process.execPath,
  getNextNodeArgs(nextBin, ["dev", "-H", "127.0.0.1", "-p", launchOptions.port]),
  {
    cwd: pkgDir,
    stdio: ["inherit", "pipe", "inherit"],
    env: { ...process.env, PI_WEB_HOSTNAME: "127.0.0.1" },
  },
);

attachReadyHandoff(child.stdout, {
  port: launchOptions.port,
  wantOpen: launchOptions.openBrowser && shouldOpenBrowser(process.env),
});
wireChildProcessLifecycle(child);
