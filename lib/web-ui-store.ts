import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import lockfile from "proper-lockfile";
import { writePrivateFileAtomicSync } from "./atomic-file";

export class UiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function uiStorePath(name: string): string { return join(getAgentDir(), "web-ui", name); }
export function readUiStore<T>(name: string, fallback: T): T {
  try { return JSON.parse(readFileSync(uiStorePath(name), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
export async function updateUiStore<T, R>(name: string, fallback: T, update: (data: T) => R): Promise<R> {
  const file = uiStorePath(name);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(file, { realpath: false, retries: { retries: 8, minTimeout: 25, maxTimeout: 200 } });
  try {
    const data = readUiStore(name, fallback);
    const result = update(data);
    writePrivateFileAtomicSync(file, JSON.stringify(data));
    return result;
  } finally { await release(); }
}
