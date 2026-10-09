# Upstream merge handoff — 2026-10-08

- Upstream tip: `e62d5011f346e56a42dee44c6427dcec0d9a852d` (`abcwyc/pi-agent-desktop/main`).
- Fork tip before merge: `1dde3b6d331d20df2b37733b97b5934149fd41e5`.
- Merge base: `3325240f`. Backup: `backup/pre-upstream-merge-20261008`.
- Incoming commits (12): #81 deleted-workspace status, #80 submitted sessions in the server catalogue (+ docs), #79/#83 pi SDK 1.0.4 → 1.1.0, #82/#85 npm audit fixes (next 16.3.8, dompurify, brace-expansion, sharp, source-map-js), #84 scheduled tasks, #78 sidebar row time / project header / compaction count, #86 Tauri 2.12 line, 0.6.0 release prep, #87 macOS vibrancy sidebar, desktop cursor/selection rules, native menus.
- Conflicted files: `components/AppShell.tsx`, `components/ChatInput.tsx`, `components/ChatInput.test.mjs`, `components/ChatWindow.tsx`, `components/SessionSidebar.tsx`, `components/fork-extractions.test.mjs`.

## Integrated from upstream

- **Scheduled tasks (#84)** in full: server scheduler, API routes, Scheduled page overlay in AppShell (`scheduledOpen`, `?view=scheduled`, chat behind it `inert`), `ScheduledSidebarRow` under New Session, scheduled runs filtered out of the project tree (`treeSessions`), run notifications, sentinels in `fork-extractions.test.mjs`.
- **Deleted workspace (#81)**: `/api/cwd/status` probe in AppShell, `workspaceUnavailable` / `onRecheckWorkspace` threaded through ChatWindow to ChatInput, `WorkspaceUnavailableBanner` in place of the model error, Send blocked (draft kept, local slash commands still run), trust load waits for the probe.
- **Pending prompt preview (#80)** in `lib/rpc-manager.ts` (auto-merged).
- **Native menus (#87)**: settings menu, composer project switcher, session row "…" and context menu, project "…" menu as native popups on desktop; `useNativeContextMenu`; vibrancy and desktop cursor/selection CSS.
- **Sidebar (#78)**: row last-activity time swapped for "…" on hover, project header `is-menu-open`, session count + running/unread chips on a *folded* project header, compaction count in the row menu.
- SDK 1.1.0, Tauri 2.12, next 16.3.8, croner; lockfile/Cargo.lock as upstream; release pins + manifest valid.

## Kept from the fork

- `MissingFolderNotice` replacing the chat area when the session list / trust probe reports `cwdMissing` (fork 5b9b03e). Upstream's composer banner is the fallback when the list does not know yet (folder deleted while the app is open, `not-directory`, `unreadable`).
- Topbar: the single `app-topbar-actions` group (Sub-agents + forks navigator). Upstream's History button and More menu (now with a native variant) stay removed; only the `!scheduledOpen` guard was adopted.
- One fixed `right-panel-toggle-button` (no topbar `main-file-toggle`); `renderMainFileToggle`, which git resurrected, was deleted again. Adopted upstream's `showFilePanelToggle` guard on it.
- Composer: fork `handleSend` (draft guards, `dispatchBuiltin`, `prepare()`), class-styled send button (`disabled={builtinCommandPending || !canSend}`), `chat-composer-wrap`, project-path tip.
- Sidebar: project drag reordering, hover path hint instead of a `title` tooltip (upstream's `rowTitle` dropped), branch subtitle stays in the project row, fork search also matching cwd/projectRoot, `actionsRef`, class-styled "…" button (trailing slot styles moved to `native-theme.css`: `.session-item-trailing`, `.session-item-time`).
- No project branch menu: upstream's `handleSwitchBranch` / `openProjectBranchMenu` / `handleSwitchProjectBranch` / `handleFetchBranches` and the native "Switch branch…" submenu are not taken (the fork switches branches from the composer chip). The native project menu mirrors the fork's DOM menu: terminal, reveal, archive.
- No completion sound: `useScheduledRunNotifications` gets `onSound: () => {}`.

## Notable resolutions

- `lib/rpc-session-info.test.mjs` (upstream #80): the fork routes prompts through `withCheckoutGuard`, which awaits a git lookup before admission, so one `setImmediate` tick was not enough and the first failure held the checkout lock, cascading into five more. Added an `admitted(wrapper)` wait; behaviour unchanged.
- `components/AppShell.right-panel-row.test.mjs`: regex accepts the `showFilePanelToggle` guard.
- `components/SessionSidebar.test.mjs` (#78): inverted the "branch moved to tooltip" assertion to pin the fork's in-row branch and no `title={rowTitle}`.
- `ChatInput.test.mjs`: `forkSendContext` and the VM handler test provide `workspaceUnavailable`; the `canSend` source assertion matches the fork's `builtinCommandPending ||` prefix.
- `AGENTS.md` keeps one Next.js block plus upstream's note about it.

## Known pre-existing issues / limitations

- Upstream's own harness (`npm run test:e2e:upstream`, `e2e/missing-workspace.mjs`) expects the composer banner for a deleted folder; where the session list already reports `cwdMissing` the fork shows `MissingFolderNotice` instead. Not run here; not a gate.
- Lint warnings unchanged at 26.

## Verification

- TypeScript: `node_modules/.bin/tsc --noEmit` clean.
- Lint: 0 errors / 26 warnings (same as previous handoff).
- Unit: 2,838 passed / 0 failed.
- Release pins/manifest: all true (desktop 0.6.0, pi 1.1.0, pi-web 0.10.0).
- Drift vs pi-web `6fcd7d4`: no risk-class mismatch.
- Playwright (`npm run test:e2e`, full suite, 1 worker): 40 passed / 0 failed in 5.4m on the first run. Server log shows `Error: aborted` / `uncaughtException: aborted` lines from deliberately dropped connections; no test failed on them.
