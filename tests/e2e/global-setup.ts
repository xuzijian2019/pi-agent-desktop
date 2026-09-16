import { mkdir, rm } from "node:fs/promises";
import { SANDBOX_ROOT, SESSIONS_DIR, WORK_ROOT } from "./sandbox";

/** Recreate the sandbox so each run starts with an empty agent dir and workspace. */
export default async function globalSetup() {
  await rm(SANDBOX_ROOT, { recursive: true, force: true });
  await mkdir(SESSIONS_DIR, { recursive: true });
  await mkdir(WORK_ROOT, { recursive: true });
}
