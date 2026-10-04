# Upstream merge handoff — 2026-10-04 (round 4)

- Upstream tip: `upstream/main` 16c885e (abcwyc/pi-agent-desktop)
- Previous upstream tip: f66ba13 (round 3)
- Fork tip before merge: b75f728
- Incoming commits: b7bb197 fix(desktop): survive Windows overwrite installs that leave stale nested deps (#72); 4a33c7f Prepare desktop release 0.5.2; 16c885e fix(branches): scope the branch-summary lock to its own session (#74)
- Conflicted files: none. `git merge --no-ff upstream/main` auto-merged; `git diff --cached` against HEAD is empty for every overlapping file.

## Integrated from upstream
- `scripts/stage-package.mjs` + test: `removeStaleNestedPackages()` and the Windows overwrite-install handling (#72); `desktop/server-launcher.cjs` and `src-tauri/installer-hooks.nsh` (new) carry the installer side; `tauri.windows.conf.json` references the hook.
- Release 0.5.2: `src-tauri/Cargo.toml` / `Cargo.lock` version, `pi-agent-desktop-package.json`, `resources/component-versions.json`, `scripts/prepare-desktop.mjs`.
- #74 branch-summary lock scope — the fork's own d9097fc, already on main; upstream's copy was byte-identical, so `hooks/useAgentSession.ts`, the guard test, `BranchNavigator.summary.test.mjs` and `AGENTS.md` show no merge delta.

## Kept from the fork
Everything; no fork file was touched by upstream outside the identical #74 hunks.

## Notable resolutions
- `src-tauri/Cargo.lock`: both sides advanced it; merged lock keeps tauri 2.11.5, plugin-updater 2.10.1 paired with `@tauri-apps/plugin-updater` 2.10.1 (release-workflows.test pin).
- Release pins: `readLocalComponentVersions` → pi-agent-desktop 0.5.2, pi 1.0.2, pi-web 0.10.0; `piPin`, `piWebPin`, `manifest` all true, no edit needed.

## Known pre-existing issues
- `git fetch upstream pi-web-upstream` in the skill's preflight is wrong (second arg is parsed as a ref); fetch the remotes separately.

## Verification
- tsc: clean.
- lint: eslint exited without errors; warning count not captured (output truncated by the background time limit).
- Unit: **2,695 passed, 0 failed**.
- Playwright: 26 of 28 executed tests passed. `idle-network.spec.ts:59` and `upstream-html-preview.spec.ts:7` hit test timeouts under host load (load average ~6); the run was killed before `workbench.spec.ts` and the rest of `web-ui-batches.spec.ts` executed. Neither failing spec touches files this merge changed (merge delta is desktop packaging only). Re-run the full suite on a quiet machine.
- Killing a Playwright run leaves `.next-e2e/dev/lock` behind; the next run then times out waiting for its web server. Delete the lock first.
