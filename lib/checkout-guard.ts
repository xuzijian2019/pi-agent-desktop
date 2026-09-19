import { execFile } from "child_process";
import { realpathSync } from "fs";
import { resolve } from "path";
import { promisify } from "util";
const exec = promisify(execFile);
declare global { var __piCheckoutLocks: Map<string, Promise<void>> | undefined; }
export async function checkoutRoot(cwd: string): Promise<string> {
  try { return (await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 5000 })).stdout.trim(); }
  catch { try { return realpathSync(cwd); } catch { return resolve(cwd); } }
}
export async function withCheckoutGuard<T>(cwd: string, action: (root: string) => Promise<T>): Promise<T> {
  const root = await checkoutRoot(cwd);
  const locks = globalThis.__piCheckoutLocks ??= new Map();
  const previous = locks.get(root) ?? Promise.resolve();
  let release!: () => void;
  const next = previous.then(() => new Promise<void>(r => { release = r; }));
  locks.set(root, next);
  await previous;
  // Let the queued promise install release before entering the action.
  await Promise.resolve();
  try { return await action(root); } finally { release(); if (locks.get(root) === next) locks.delete(root); }
}
