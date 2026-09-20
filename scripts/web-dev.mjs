import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parseLaunchOptions } = require("../bin/pi-web-options.js");
const { attachReadyHandoff, followChildUntilExit, shouldOpenBrowser } = require("../lib/browser-open.js");

const pkgDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const { port, openBrowser } = parseLaunchOptions(args);
const wantOpen = openBrowser && shouldOpenBrowser(process.env);

function leftoverNextArgs(argv) {
  const leftover = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-open") continue;
    if (arg === "-p" || arg === "--port" || arg === "-H" || arg === "--hostname") {
      i += 1;
      continue;
    }
    if (
      arg.startsWith("-p=")
      || arg.startsWith("--port=")
      || arg.startsWith("-H=")
      || arg.startsWith("--hostname=")
    ) {
      continue;
    }
    leftover.push(arg);
  }
  return leftover;
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

await reclaimPort(port);

const child = spawn(
  process.execPath,
  [resolveNextBin(), "dev", "-H", "127.0.0.1", "-p", port, ...leftoverNextArgs(args)],
  {
    cwd: pkgDir,
    stdio: ["inherit", "pipe", "inherit"],
  },
);

attachReadyHandoff(child.stdout, { port, wantOpen });
followChildUntilExit(child);

child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
