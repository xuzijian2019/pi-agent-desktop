# Upstream merge handoff — 2026-10-09

- Upstream tip: `f59e0b18ed25d4c686bf10778983ea617dc24561` (abcwyc/pi-agent-desktop/main, desktop 0.6.3).
- Fork tip before merge: `23b6c0cb`; merge base: `e62d5011`.
- Backup: `backup/pre-upstream-merge-20261009`; origin/main matched HEAD before merging.
- Incoming commits (14): #88 type scale/hairlines/native hover motion; #89 composer controls below input/update-chip removal; #90 macOS file Open With; #91 native item action repair; 0.6.1/0.6.2/0.6.3 release prep; native popup freeze mitigation; lock-releasing popup command; in-app file context menu; contrast and upstream E2E maintenance; three integration merge commits.
- Conflicted files (13): app/native-theme.css; components/AppShell.tsx; ChatAppearance.test.mjs; ChatInput.tsx; ChatWindow.composer-alignment.test.mjs; ChatWindow.tsx; DirectoryPicker.tsx; FileExplorer.tsx; FileViewer.tsx; MessageView.tsx; ProjectPicker.tsx; SessionSidebar.tsx; SessionStatsPanel.tsx (modify/delete).

## Integrated from upstream

- Desktop file context menus on written files, local Markdown links and candidate inline-code paths: Open, Open With (macOS), reveal, copy path. In-app menu host supports keyboard navigation and submenus; macOS app discovery is bounded/cached.
- Settings uses its DOM menu; native popup attempts are disabled globally, and project/session/composer menus honor the switch. Native items are standalone resources so their action channels survive Tauri 2.12; popup_native_menu releases the resource-table lock before waiting for the popup.
- Type scale, retina hairlines, muted-text contrast, native hover motion/reduced-motion rules, related control styles.
- Session controls moved below the input card; new-session update chip and its API/types/helper removed.
- Desktop 0.6.3 metadata/release notes; Pi remains 1.1.0 and pi-web remains 0.10.0. Upstream terminal/theme harness maintenance adopted.

## Kept from the fork

- Project tree/reordering/path tips, fixed sidebar layout, simplified composer controls, composer branch entry point, side chat/recap, IndexedDB drafts, overlay composer and scroll restoration.
- Class-based tool cards, file-viewer toolbar, extracted picker body, external explorer search and folder-creation controls; CSS radius tokens kept in conflicting declarations.
- Declined UI stays absent: topbar History/More/session stats panel, sidebar branch switching and ChatMinimap. SessionStatsPanel remains deleted.
- Existing release reminder/General updates UI retained; only the obsolete new-session update chip was removed.

## Notable resolutions

- Reviewed every incoming file also modified by the fork, including auto-merged locale/API-type/extraction-test changes. Preserved fork classes and guards while adopting upstream logic.
- Mounted DomContextMenuHost in the fork AppShell; added a sentinel to prevent a later clean merge from dropping the mount.
- Composer wrapper closure moved before controls; added a source sentinel for this cross-region move. Alignment tests retain the fork overlay and now assert no new-session header/update check.
- CSS conflict resolutions keep fork structure/radius tokens while taking incoming non-conflicting scale/motion/contrast and hairline values.
- Refresh ownership drift measurements against the actual integrated pi-web baseline 6fcd7d4; no risk-class mismatch.

## Known pre-existing issues / limitations

- Lint retains 26 existing warnings.
- Generated .next-desktop/.next-e2e type outputs referenced the upstream-deleted app-update route. Removed only those stale generated route references to unblock typecheck; no tracked config changes or production build.
- Browser Playwright and macOS Rust checks do not constitute a packaged Tauri GUI acceptance run or Linux/Windows validation.

## Verification

- TypeScript: clean (final rerun after resolution).
- Lint: 0 errors / 26 warnings, unchanged from previous handoff.
- Unit: 2,848 passed / 0 failed, including two added merge sentinels.
- Rust: cargo test --locked --manifest-path src-tauri/Cargo.toml --lib: 4 passed / 0 failed on macOS.
- Clippy: cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings: clean.
- Release pins/manifest: all true (desktop 0.6.3, pi 1.1.0, pi-web 0.10.0).
- CSS parses cleanly; git diff --check clean; no conflict markers/unmerged files.
- Playwright full suite: 40 passed / 0 failed (5.3m), first run. Inspected desktop workbench and phone composer screenshots; controls fit below the input card.
