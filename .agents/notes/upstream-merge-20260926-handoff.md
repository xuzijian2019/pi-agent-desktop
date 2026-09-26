# Upstream merge record — 2026-09-26, second merge

Two-parent merge of abcwyc/pi-agent-desktop `upstream/main`
`73bc9f1ec62722343452396d02b70a5ec2bdddd8` into this fork's `main`
`0de6dd1`. 23 incoming commits since `1edb878`. Backup branch:
`backup/pre-upstream-merge-20260926`. 20 files conflicted: AGENTS.md,
app/native-theme.css, AgentsConfig.test.mjs, AppShell.tsx, ChatInput.tsx,
ChatInput.test.mjs, ChatWindow.tsx, ChatWindow.composer-alignment.test.mjs,
ChatWindow.extension-request.test.mjs, DirectoryPicker.tsx, FileViewer.tsx,
MessageView.tsx, MobilePwaLayout.test.mjs, ProjectPicker.tsx,
SessionSidebar.tsx, useAgentSession.test.mjs, en/zh-CN/zh-TW locales,
scripts/fork-ownership.json. No dependency changes; npm install was not needed.

## Integrated from upstream

- Desktop 0.4.8 release bookkeeping; bundled Pi remains 0.87.1 and pi-web 0.10.0.
- Cached derived final/process messages and written-file lists; throttled and
  memoized streaming markdown; retained tool-result details projected to the
  fields the UI reads, with subagent details preserved whole.
- Server transcript pagination extends pages to whole-turn anchors. Shared
  message anchors now include compaction and subagent notification entries.
- Composer spacer height updated directly through the DOM, without a React
  state render; persistent scrollbar track and measured symmetric insets keep
  messages/composer centered, including WebKit. Programmatic scrolling does
  not light up the scrollbar thumb.
- IME guards across dialogs, menus, inline rename/worktree inputs, and fork-only
  model filter / file panel / project picker paths.
- Local HTML relative CSS/images load with scripts blocked by CSP and sandbox.
  Explicit Run scripts uses opaque-origin srcDoc with allow-scripts only.
  Watcher reconnects synchronize content without reloading an interactive
  preview; actual disk changes reload it. HTML serve size limit retained.
- Fork and branch failures display notices; auto-compact uses the same
  automation state as the gear; file-access roots reuse the cached session
  list; right-panel explorer refreshes after runs; mobile mentions return to chat.
- Sidebar list errors offer retry, and scrollbar hide timers now have a real ref.
- CSS migration: globals.css/settings.css exactly match pi-web 96966e5;
  native-theme.css holds all fork rules. Baseline hashes and CI refresh guard
  adopted, plus English/Simplified Chinese theme docs.

## Kept from the fork

- Project-tree sidebar and missing-folder controls, simplified topbar/composer,
  class-based tabs, file-tree search, terminal tabs and full-height file panel.
- Composer model menu, overlay layout, conversation navigator, tail-follow,
  load-error retry, recap/side chat, IndexedDB drafts, quoted selection and
  monotonic session request guards. Playwright remains test:e2e.
- Browser notification preference, fork-specific locale keys restored by
  0de6dd1, silent subagent completion, and exact system-prompt extension path.
- File actions retain wrap/open/reveal; upstream's copy-path/copy-contents
  removal is adopted without deleting the fork's other menu actions.

## Notable resolutions

- Reviewed every upstream-touched/fork-modified file for silent conflicts.
  Auto-merges deleted model-menu refs/grouping, transcript helper functions,
  and file-menu state while the fork still referenced them; retained required
  helpers and removed only genuinely dead flat-list virtualization.
- Ported direct DOM composer spacing into the fork layout and wired its CSS
  inset to extension overlays. Kept the fork's separate empty state and did
  not resurrect ChatMinimap, More, Tools or Full history UI.
- Final process splits retain original prefix block indices for deferred
  thinking; process groups skip an empty prefix. Written-file lists use
  upstream's identity cache inside the fork's memoized transcript renderer.
- Upstream style-only user bubble cap lives in native-theme.css; existing
  collapse/expand controls stay. Tests assert the CSS and actual fork markup.
- Ownership drift refreshed against pi-web 96966e5; all measured risk levels
  match. Release pins and component manifest match bundled versions.
- Added browser coverage for static HTML local CSS, blocked scripts, explicit
  isolated script mode, returning to static mode, and light/dark 1440/390px.

## Known pre-existing issues

- Sidebar Enter-to-content-search still mounts its wrapper only when the title
  filter leaves projects: a content-only match with zero title matches remains
  unreachable. This was recorded in the first 2026-09-26 merge and is unchanged
  by upstream 73bc9f1.
- Existing unused sidebar/explorer state and source-test helpers still produce
  lint warnings; unrelated cleanup was not expanded.

## Verification

Typecheck clean; lint 0 errors (26 warnings, previous handoff 39); unit
1,659 passed. Release pins/manifest valid (pin reasons now cite 73bc9f1),
CSS baseline exact, drift risk labels consistent, no conflict markers.

Browser: full Playwright suite **40 passed** (5.7m, 1 worker) on the final
tree. Earlier runs that did not count:
- First full run: 38 passed, 1 failed — `side-recap.local.spec.ts` used a
  scroller selector the merged markup no longer has; now
  `.chat-window .scrollbar-subtle.pt-4`. The new `upstream-html-preview`
  spec's mobile case also needed its setup corrected to reopen the panel
  after entering mobile width. Both are test setup fixes, not app changes.
- One rerun was interrupted after test 31 and left an orphaned
  `next dev -p 30142` reparented to launchd; it was killed before rerunning.
- One 40-pass run was discarded: a read-only review agent ran
  `git stash`/`git stash pop` mid-run, briefly serving the pre-merge tree
  and clearing MERGE_HEAD. The working tree was verified identical to the
  stash snapshot, the index restored from the stash's index commit, and
  MERGE_HEAD recreated before the counted rerun.

Post-verification review (three parallel semantic reviews: chat/session core,
shell/files/sidebar, CSS/build/release) found no functional regressions;
removed an orphaned bubble-height comment left in MessageView.tsx by the
merge.

---

## Earlier merge on the same date (preserved record)

# Upstream merge record — 2026-09-26

Two-parent merge of abcwyc/pi-agent-desktop `upstream/main` (`1edb878`) into this
fork's `main` (`bffc4cd`). 14 incoming commits. Backup branch:
`backup/pre-upstream-merge-20260925`. 12 files conflicted: native-theme.css,
AppSettings.tsx (modify/delete), AppShell.tsx, ChatWindow.tsx, FileViewer.tsx,
SessionSidebar.tsx, TabBar.tsx, en/zh-CN/zh-TW locales, fork-ownership.json,
release-component-pins.json.

## Integrated from upstream

- Desktop 0.4.7 release notes, component manifest, and Cargo.toml version bump.
- Settings: `AppSettings` deleted; Version & Updates is `AppUpdatesSection` at
  the top of General; window/tray switches are `DesktopAppSection` (renders
  nothing outside Tauri). Update reminder opens General. Theme lives in
  Settings → General (sidebar sun/moon toggle stays gone).
- Sidebar full-text session search: Enter runs `SessionSearch` across every
  conversation; Escape / clear returns to the title filter.
- File viewer resolves markdown/HTML preview before the first fetch
  (`lib/file-viewer-state.ts`).
- Topbar dropdowns no longer subtract the sidebar width twice. Sidebar reopen
  stays reachable next to an open split file panel (`!rightPanelFullWidth`).
- In-panel close control kept always visible (this fork has no topbar file
  toggle). CSS restyle kept from the fork (`git checkout --ours` on
  `app/native-theme.css`).
- Tauri plugin crates aligned with this fork's npm pins (updater 2.10.1,
  notification 2.3.3), not upstream's 2.12.0 / 2.4.0 — package.json here uses
  exact versions.

## Kept from the fork

- Project-tree sidebar, full-height file panel, one-group topbar (sub-agents +
  forks only). Tools / More / Full history stay deleted; `fork-extractions`
  still flags them.
- Overlay composer, recap, side chat, IndexedDB drafts, SSE running events,
  Playwright as `test:e2e`.
- Desktop-only workspace restore (`desktopMode ? persistedWorkspace : null`).
- WEB_APP_VERSION / taglineWeb for the browser build, plus the autoTitle
  switch, ported into General.

## Notable resolutions

- Did not resurrect the More menu portal or `AppShell.more-menu.test.mjs`.
- ChatWindow composer-alignment test rewritten for the overlay composer (no
  scrollbar-gutter probe, no ChatMinimap).
- Slash-menu e2e no longer clicks the removed "Theme: Dark" sidebar button.
- `rpc-manager.ts` risk dropped to medium (216) after workbench activity
  tracking went away; `SettingsPanel.tsx` added to the ownership manifest
  (382 structural).

## Known pre-existing issues

- `SessionSidebar.tsx` still carries unused explorer/search state that
  `SessionSidebar.test.mjs` pins as source markers. Lint reports those as unused.

## Verification

tsc clean; lint 0 errors (39 warnings, was 38); unit 1,626 passed.
Playwright full suite: 38 passed, 1 failed (slash-menu Theme: Dark). That test
was retargeted and the slash-menu file then passed 6/6.

## Post-merge review fixes

Follow-up commit on top of 2e956fc restores fork behaviour the merge dropped:
- `chat.loadFailed` / `files.choosePreview` locale keys (en, zh-CN, zh-TW) —
  upstream's 825c7f1 pruned them as unused upstream; the fork still renders both.
- `.file-tab-add` styling and inactive-tab label weight in `app/native-theme.css`
  — upstream moved TabBar's inline styles into CSS, but the CSS side was
  resolved `--ours`.
- Web-only "Browser notifications" switch in General (lived in the deleted
  AppSettings modal; `lib/desktop-notify.ts` gates on its pref). Pinned in
  `components/SettingsPanel.test.mjs`.

Open (inherited from upstream, not fixed): Enter-to-search in the sidebar never
mounts `SessionSearch` when the title filter matches nothing
(`allProjects.length === 0` branch), so content-only matches are unreachable.
