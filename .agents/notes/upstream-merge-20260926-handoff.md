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
