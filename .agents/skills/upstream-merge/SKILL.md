---
name: upstream-merge
description: Merge upstream/main (abcwyc/pi-agent-desktop) into this fork's main while preserving fork customizations — preflight, conflict-resolution rules, silent-semantic-conflict review, release/drift bookkeeping, verification gates and the handoff record. Use when asked to "merge upstream", "sync with upstream", "pull upstream changes", or to finish/review an in-progress upstream merge.
---

# Upstream merge

Remotes: `upstream` = abcwyc/pi-agent-desktop (the merge source).
`pi-web-upstream` = agegr/pi-web (used only as the drift baseline). `origin` = this fork.
Background reading: `docs/ownership-boundaries.md` and the newest
`.agents/notes/upstream-merge-*-handoff.md` (it names the previous upstream tip).

## 1. Preflight

```bash
git fetch upstream pi-web-upstream
git status --short                                  # must be clean, or an in-progress merge (.git/MERGE_HEAD)
git log --oneline HEAD..upstream/main               # incoming commits
git branch backup/pre-upstream-merge-$(date +%Y%m%d)
```

Estimate the conflict surface before merging: compare the files upstream changed
against the files the fork changed.

```bash
OLD=$(git merge-base HEAD upstream/main)
comm -12 <(git diff --name-only $OLD upstream/main | sort) <(git diff --name-only $OLD HEAD | sort)
```

## 2. Merge and resolve

Create a two-parent merge: `git merge --no-ff upstream/main`. Never rebase and
never force-push.

Resolution rules:
- **Fork interaction design wins.** This covers the project-tree sidebar, the
  sidebar-left layout, the simplified composer, the composer git-branch chip,
  side/recap, IndexedDB drafts, the class-based `TabBar`, and Playwright as
  `test:e2e`. Adopt upstream *logic* (guards, new features, fixes) into it.
- If upstream adds an entry to a menu or list the fork restructured, re-apply
  the entry in the fork's structure. Don't resurrect upstream's structure.
- Styling goes in `app/native-theme.css` with a `className`. Don't add fork CSS
  to `app/globals.css`. Desktop-only code goes in `components/desktop/`.
- New i18n keys go in all three locales: `en`, `zh-CN`, `zh-TW`.
- `package.json` keeps upstream's name and version. If upstream changes
  dependencies, run `npm install` to regenerate the lockfile.
- Check that no conflict markers remain: `git grep -nE '^(<<<<<<<|>>>>>>>|=======$)'`.

## 3. Review silent semantic conflicts (the step people skip)

Git merges cross-file moves and non-overlapping edits without reporting a
conflict. For every file that is fork-modified **and** upstream-touched, compare
what upstream intended with what landed:

```bash
git diff $OLD upstream/main -- <file>       # upstream's intent
git diff HEAD --cached -- <file>            # what the merge applied to the fork
```

Watch for:
- logic that upstream moved between files (e.g. scroll saving moved from
  `ChatWindow` into `useAgentSession`)
- fork-only refs or state that an upstream rewrite stopped resetting
- features upstream deleted that the fork still references (e.g. the
  `AppSettings` modal)

When code moves, add a sentinel to `components/fork-extractions.test.mjs` or to
the relevant `*.test.mjs` file.

## 4. Bookkeeping

- Release pins must match the bundled versions:
  ```bash
  node --input-type=module -e 'import {readLocalComponentVersions,createComponentManifest,isReleasePinValid} from "./scripts/release-components.mjs"; import fs from "node:fs"; const l=await readLocalComponentVersions(), p=JSON.parse(fs.readFileSync("scripts/release-component-pins.json")), m=JSON.parse(fs.readFileSync("src-tauri/resources/component-versions.json")); console.log(l, {piPin:isReleasePinValid(p.pi,l.pi), piWebPin:isReleasePinValid(p["pi-web"],l["pi-web"]), manifest:JSON.stringify(m)===JSON.stringify(createComponentManifest(l))})'
  ```
  If any value is `false`, update `scripts/release-component-pins.json` and
  `src-tauri/resources/component-versions.json`. The pin `reason` should cite
  the merge commit or handoff note, not `AGENTS.md` (that file is upstream-owned).
- Drift: `npm run drift` falls back to a stale baseline. Pass the pi-web commit
  that upstream integrated: `node scripts/measure-fork-drift.mjs <pi-web-ref>`.
  Update `structuralDrift` / `risk` in `scripts/fork-ownership.json` when the
  output flags a mismatch.

## 5. Gates

Run these in this order; each takes minutes.

```bash
node_modules/.bin/tsc --noEmit
npm run lint          # 0 errors; compare the warning count with the previous handoff note
npm test
```

End-to-end preflight. Environment failures used to cost a full ~7-minute run each:
```bash
lsof -iTCP:30142 -sTCP:LISTEN     # port 30142 is the e2e-only port; kill any orphan `next dev -p 30142`
npx playwright install chromium   # no-op when current; required after any Playwright version bump
npm run test:e2e                  # full suite, 1 worker
```
If every test fails within milliseconds, the cause is the environment, not the
code. `PW_CHANNEL=chrome` falls back to the installed Chrome.
Never run `next build` in the dev checkout.

## 6. Record and commit

Write `.agents/notes/upstream-merge-YYYYMMDD-handoff.md` with these sections:
header (upstream tip, fork tip, incoming commits, conflicted files), Integrated
from upstream, Kept from the fork, Notable resolutions, Known pre-existing
issues, Verification. `.agents/` is gitignored, so use `git add -f` (earlier
notes are tracked the same way).

Commit message:
```
Merge upstream/main (<sha>) into main, preserving fork customizations

<one paragraph: what was integrated, what was kept>

Resolution notes and verification results:
.agents/notes/upstream-merge-YYYYMMDD-handoff.md

Verified: unit N passed; tsc clean; lint 0 errors (N warnings, …); full Playwright suite N passed.
```

Ask before pushing.

## Why merges get slow

- Upstream sends large bundled commits that land on the fork's highest-drift
  files (`AppShell`, `SessionSidebar`, `ChatInput`, `ChatWindow`,
  `useAgentSession`). Merging more often keeps each batch small.
- Semantic review (step 3) can't be skipped: the tests mostly match source text,
  so they don't prove behaviour.
- End-to-end environment failures: an orphaned server on 30142, or a missing
  browser after a Playwright bump. Check both before the first run.
