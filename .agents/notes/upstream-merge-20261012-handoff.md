# Upstream merge handoff — 2026-10-12

- Upstream tip: `06132389` (abcwyc/pi-agent-desktop/main, desktop 0.6.5).
- Fork tip before merge: `8875e237`; merge base / previous upstream tip: `1cabde80`.
- Backup: `backup/pre-upstream-merge-20261012`.
- Incoming commits (17): `793a43f5` accent-contrast text on accent buttons; `886200ad` Homebrew cask + release updater; `aa279c95` remove Mist/Rose/Pine themes; `98a45c19` macOS sidebar/fonts/focus conventions; `c8da553f`/`6280fc1d` desktop 0.6.5 release + cask; `9543cd5c` focus composer on new session; `ac4df31f` Settings Clear cache; `a5186224` timestamped logs, panic hook, server monitor, open-logs button; `4e111f12` window-state geometry restore; `2d8e5b53` cask `depends_on :macos` (#98); `bc8c883e` image data URLs built once per block; plus four integration merges.
- Textually conflicted files: `app/native-theme.css`, `components/ChatInput.tsx`, `components/ChatWindow.tsx`, `components/SessionSidebar.tsx`. Clean-merged overlaps reviewed: AGENTS.md, README(.zh-CN).md, MessageView.tsx, SessionSidebar.test.mjs, SettingsPanel.test.mjs, three locales.

## Integrated from upstream

- Desktop: Clear cache button, open-logs button, timestamped desktop logs, panic hook and server monitor (`lib.rs`, `server-launcher.cjs`, `DesktopAppSection.tsx`, `desktop-native.ts`, permissions/capabilities); `tauri-plugin-window-state` geometry restore.
- Homebrew cask (`Casks/pi-agent.rb`), `scripts/update-homebrew-cask.mjs` + test, release workflow cask update.
- Mist/Rose/Pine themes removed (`lib/theme.ts`, `ThemeIcon.tsx`, locale keys, e2e themes).
- macOS-convention styling: AccentColor focus ring/selection, `ui-monospace` first, sentence-case section header, inset project-row pills, no project chevron (folder glyph carries the state), opaque composer overlay band.
- `imageSource()` moved to `lib/result-image.ts`; result images keyed by index.
- New-session composer autofocus.
- Desktop 0.6.5; pi 1.1.0 and pi-web 0.10.0 unchanged; no npm dependency changes.

## Kept from the fork

- Class-based `SessionItem` (`session-item` + state classes, `<a href>` title link, `sidebar-session-icon`) instead of upstream's inline-styled row.
- Simplified composer: upstream's steering/follow-up segmented buttons (where the `#fff` → `--accent-contrast` fix landed) stay absent; nothing to port.
- `--text-meta` stays retired (fork `d06dd67e`); upstream's re-tuned value was dropped.
- Fork's project path-hint hover bar CSS.
- ChatWindow's `onViewCommand` / `dispatchCommand` wiring; upstream's sound props stay absent.

## Notable resolutions

- SessionSidebar conflicts kept HEAD; upstream's inline intents were ported into classes: `.session-item` padding-left 14px → 11px (the merged show-more inset of 31px already assumed 11), `session-item-glyph` added to the fork's chat glyph (hidden via upstream CSS), and `.session-item-title` now sets `font-weight: 400` explicitly (upstream relied on an inline 400 the fork's markup doesn't have).
- native-theme.css: dropped the orphaned `.sidebar-project-tree-chevron-button` rules since the chevron's TSX removal merged cleanly.
- ChatWindow: fork props + `autoFocus={isNew}`.
- Release pins/manifest valid (all true). Drift against pi-web `6fcd7d4`: 3311 cosmetic / 13788 structural, no risk mismatches.

## Known pre-existing issues

- Lint baseline 26 warnings, unchanged.
- Browser tests do not exercise packaged-desktop features (Clear cache, window-state, log folder).

## Verification

- tsc clean; lint 0 errors / 26 warnings; unit 2856 passed / 0 failed.
- Rust: `cargo test --locked --lib` 6 passed; clippy `-D warnings` clean.
- Full Playwright suite: 40 passed / 0 failed (5.2m), first run.
- No AGENTS.md dev-server noise; no conflict markers.
