import { execFile } from "child_process";
import { promisify } from "util";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { listWorktrees, invalidateProjectCache } from "./worktree";
import { withCheckoutGuard } from "./checkout-guard";
import { UiError } from "./web-ui-store";
import { allowFileRoot } from "./allowed-roots";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "./file-access";
import type { BranchInventory, BranchOperation, BranchPreview } from "./git-branch-types";

const exec = promisify(execFile);
async function git(cwd: string, args: string[]) {
  try { return (await exec("git", ["-C", cwd, ...args], { timeout: 10000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" } })).stdout.replace(args.includes("-z") ? /$^/ : /^\s+|\s+$/g, ""); }
  catch (e) { throw new UiError((e as { stderr?: string }).stderr?.trim() || "Git operation failed"); }
}
async function fingerprint(cwd: string) {
  const [head, branch, status] = await Promise.all([git(cwd, ["rev-parse", "HEAD"]), git(cwd, ["symbolic-ref", "--quiet", "HEAD"]).catch(() => ""), git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])]);
  // Status paths alone do not detect edits to already-dirty files. Include
  // tracked diff bytes and untracked contents via Git's object hash command.
  const diff = await git(cwd, ["diff", "HEAD", "--no-ext-diff", "--binary"]);
  const untracked = (await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
  const hashes = await Promise.all(untracked.map(p => git(cwd, ["hash-object", "--", p])));
  return { head, branch, dirty: !!status, stamp: createHash("sha256").update(JSON.stringify([head, branch, status, diff, hashes])).digest("hex") };
}
export async function branchInventory(cwd: string): Promise<BranchInventory> {
  let root: string;
  try { root = await git(cwd, ["rev-parse", "--show-toplevel"]); } catch { return { isGit: false, root: cwd, current: null, head: "", branches: [], worktrees: [] }; }
  const [head, current, refs, worktrees] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]).catch(() => ""), git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => null),
    git(root, ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(symref)", "refs/heads", "refs/remotes"]), listWorktrees(root),
  ]);
  return { isGit: true, root, current, head, worktrees, branches: refs.split("\n").filter(Boolean).flatMap(line => {
    const [ref, sha, symbolic] = line.split("\t");
    if (symbolic || ref.endsWith("/HEAD")) return [];
    const remote = ref.startsWith("refs/remotes/"); const name = ref.replace(/^refs\/(heads|remotes)\//, "");
    return [{ ref, name, sha, remote, worktree: remote ? undefined : worktrees.find(w => w.branch === name)?.path }];
  }) };
}
type Token = { preview: BranchPreview; stamp: string; expires: number };
declare global { var __piBranchTokens: Map<string, Token> | undefined; }
const tokens = () => globalThis.__piBranchTokens ??= new Map();
async function validName(cwd: string, name: unknown): Promise<string> {
  if (typeof name !== "string" || !name || name.startsWith("-") || name.length > 240) throw new UiError("Invalid branch name");
  await git(cwd, ["check-ref-format", `refs/heads/${name}`]); return name;
}
export async function previewBranch(cwd: string, input: BranchOperation): Promise<BranchPreview> {
  const inventory = await branchInventory(cwd);
  if (!inventory.isGit) throw new UiError("Not a Git repository");
  if (!inventory.head) throw new UiError("Create an initial commit before creating or switching branches.");
  if (!["switch", "create"].includes(input.action) || !["current", "worktree"].includes(input.location)) throw new UiError("Invalid branch operation");
  const state = await fingerprint(inventory.root);
  let name: string; let targetRef: string | undefined; let baseSha: string;
  if (input.action === "switch") {
    const branch = inventory.branches.find(b => b.ref === input.ref);
    if (!branch) throw new UiError("Branch not found");
    if (branch.worktree && branch.worktree !== inventory.root) throw new UiError(`Open existing worktree: ${branch.worktree}`, 409);
    name = await validName(cwd, input.name || (branch.remote ? branch.name.slice(branch.name.indexOf("/") + 1) : branch.name));
    if (branch.remote && inventory.branches.some(b => b.ref === `refs/heads/${name}`)) throw new UiError("Local branch already exists. Select it or choose another name.", 409);
    if (!branch.remote && name !== branch.name) throw new UiError("Select the existing local branch name");
    targetRef = branch.ref; baseSha = branch.sha;
  } else {
    name = await validName(cwd, input.name);
    if (inventory.branches.some(b => b.ref === `refs/heads/${name}`)) throw new UiError("Branch already exists. Select existing branch.", 409);
    const base = !input.baseRef || input.baseRef === "HEAD" ? inventory.head : inventory.branches.find(b => b.ref === input.baseRef)?.sha;
    if (!base) throw new UiError("Base branch not found");
    baseSha = base;
  }
  const commonDir = await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const dir = name.replace(/[\/\\:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  if (!dir) throw new UiError("Invalid worktree directory");
  const path = input.location === "worktree" ? join(`${dirname(commonDir)}-worktrees`, dir) : inventory.root;
  if (input.location === "worktree" && existsSync(path)) throw new UiError(`Directory already exists: ${path}`, 409);
  const preview: BranchPreview = { ...input, name, cwd: inventory.root, token: randomUUID(), head: state.head, dirty: state.dirty, baseSha, targetRef, path };
  for (const [key, t] of tokens()) if (t.expires < Date.now()) tokens().delete(key);
  if (tokens().size >= 100) tokens().delete(tokens().keys().next().value!);
  tokens().set(preview.token, { preview, stamp: state.stamp, expires: Date.now() + 120000 });
  return preview;
}
export async function executeBranch(token: string, keepChanges: boolean, busy: (cwd: string) => Promise<boolean>) {
  const record = tokens().get(token);
  if (!record || record.expires < Date.now()) throw new UiError("Preview expired. Review again.", 409);
  return withCheckoutGuard(record.preview.cwd, async () => {
    if (tokens().get(token) !== record) throw new UiError("Operation already used", 409);
    tokens().delete(token);
    const p = record.preview;
    if (!isExistingFilePathAllowed(p.cwd, await getAllowedFileRoots())) throw new UiError("Access denied", 403);
    if (p.location === "current" && await busy(p.cwd)) throw new UiError("A run is active in this checkout. Stop it or use a new worktree.", 409);
    const current = await fingerprint(p.cwd);
    if (current.stamp !== record.stamp) throw new UiError("Checkout changed. Review again.", 409);
    if (p.targetRef && await git(p.cwd, ["rev-parse", "--verify", p.targetRef]) !== p.baseSha) throw new UiError("Branch changed. Review again.", 409);
    if (p.dirty && p.location === "current" && (p.action === "switch" || p.baseSha !== p.head) && !keepChanges) throw new UiError("Confirm switching while keeping local changes", 409);
    const create = p.action === "create" || p.targetRef?.startsWith("refs/remotes/");
    if (p.location === "worktree") {
      if (existsSync(p.path)) throw new UiError("Worktree path already exists", 409);
      mkdirSync(dirname(p.path), { recursive: true });
      await git(p.cwd, ["worktree", "add", ...(create ? ["-b", p.name] : []), "--", p.path, create ? p.baseSha : p.name]);
      allowFileRoot(p.path);
    } else if (create) {
      await git(p.cwd, ["checkout", "-b", p.name, p.baseSha]);
    } else { await git(p.cwd, ["checkout", p.name]); }
    if (p.targetRef?.startsWith("refs/remotes/")) {
      try { await git(p.path, ["branch", `--set-upstream-to=${p.targetRef}`, p.name]); }
      catch { invalidateProjectCache(); return { path: p.path, branch: p.name, warning: "Branch created, but tracking could not be configured" }; }
    }
    invalidateProjectCache(); return { path: p.path, branch: p.name };
  });
}
