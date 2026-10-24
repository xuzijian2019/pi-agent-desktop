# Desktop upstream merge — 2026-10-24

## Fixed inputs and ancestry
- Fork origin/main: d968dc7e6765c61a59a7ca4d16b9d045cba9fb0c.
- Desktop upstream/main: 845a7ec1fd535a6f33bb2c4ecf4cf80508ac23e9 (0.7.6, 12 incoming commits).
- agegr/pi-web main fetched for drift only: e533d9b3975f8a74b378d5007c92fdf4d15d3fba; NOT merged. Actual integrated baseline remains 6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068 (0.10.0).
- Clean isolated clone; local backup backup/pre-upstream-20261024-1246-d968dc7e. Merge branch merge/upstream-20261024-1246-845a7ec1. Started with git merge --no-ff --no-commit. Preserve ordered fork/upstream parents; no rebase/squash/main push.
- No open PR at initial direct GitHub REST check. Re-fetch origin/main before publishing. User must separately authorize merging this PR; earlier PR approvals are not reusable.

## Incoming changes and review
All 52 incoming paths reviewed, including clean merges and both-side semantic overlap:
- Server/chat APIs and policy: independent server-created chat folders, default shell blocked, realpath-constrained file tools, read-only MCP defaults, explicit per-chat unlock, network-exposed unlock prohibited, folder reveal and optional Trash on chat deletion. Keep request guards, userHome routing, session list cache invalidation, fork session references/side/recap interactions.
- Session loader: >=16MiB read-only transcripts may strip unused oversized tool-result details; mutable opens continue through full SDK manager. New real 17MiB regression preserves thinking duration and summary and proves original file cannot be rewritten by slim manager.
- UI/hooks: retain fork composer controls, side/recap, render-time scroll/session race guards, persisted chat-fold hydration and IndexedDB behavior. Add upstream access rows and confirm dialog without resurrecting upstream combined controls/right-panel chat behavior. A separate Chat chip remains available with history even when hints/preset/effort callbacks are absent. Preserve old reference isolation assertions and add reachability/unlocked-label assertions.
- SDK package/lock update to 1.4.0; only SDK family and marked-cjk-friendly added/changed. Tauri JS versions unchanged; Cargo.lock only app 0.7.5 -> 0.7.6. Component manifest and release pins agree: app 0.7.6, pi 1.4.0, pi-web 0.10.0.
- All new locale keys present in en/zh-CN/zh-TW. Font fallback prefers native monospace and explicit CJK faces. Chat switch/confirmation styles live in native-theme.css; globals.css/settings.css unchanged, refreshed baseline reference.
- macOS Open With UTType-family filtering reviewed in source, preserving default-app/plain-text-editor fallbacks. Its macOS-gated test is not exercised by Linux/Windows.
- AGENTS and fork agent docs adopted; release workflow diff is upstream bilingual release notes only, not CI/job logic. Homebrew cask adopted upstream 0.7.6 metadata; no release/tag published.

## Conflict resolutions
Eight textual conflicts: ChatInput.tsx/test, ChatWindow, SessionSidebar, useAgentSession, rpc-manager, session-reader, release-component-pins.
- Combined upstream access controls with fork interaction model; no mechanical ours/theirs.
- Combined rpc-manager imports for fork AgentSession/cc-extension entries and upstream LoadExtensionsResult/isChatFolderPath; combined session reader slim-loader import with fork metadata processing.
- Pi pin advanced to 1.4.0 while keeping pi-web 0.10.0 and updating justification to this handoff.
- Measured ownership drift against actual pi-web baseline, refreshed six changed shared-path measurements without weakening thresholds/sentinels. Total at review: 3405 cosmetic / 15027 structural (82% structural).

## Verification (local complete; CI/visual pending)
All local checks use isolated HOME/agent data and clear PI_OFFLINE, XDG_STATE_HOME, NODE_ENV and inherited Next config. No user data or credentials included.
- npm ci succeeded.
- UI/hooks focused unit tests: 233/233; server/security/slim-loader focused tests: 160/160.
- Full unit: 3281/3281 passed after final side-policy integration; TypeScript passed; lint passed with 21 existing warnings (19 sidebar, one AppShell, one ExtensionStatusBar). Installed dependency check passed.
- Linux desktop:prepare and desktop:verify succeeded: staged server Code mode sandbox self-test and Amazon Bedrock dynamic import. This is Linux server staging, not Mac app/native package validation.
- Local component manifest and pin consistency passed. release:verify intentionally rejects preparing a new release at already-published upstream version 0.7.6; no version/tag/release change was made to bypass it.
- npm run web started and GET / returned 200. Targeted Playwright body could not run locally: installed Chromium failed process_singleton socket() with EPERM. Official browser download returned HTML rather than ZIP. No local screenshot or pixel acceptance claimed; use real CI artifacts.
- New targeted Playwright spec covers desktop/narrow x light/dark, synthetic long content, default shell denial, independent folders, unlock cancel/confirm/relock, other chat isolation and draft retention; screenshots must actually be viewed before visual acceptance.
- Current CI includes checks, Linux/Windows Rust tests/clippy, advisory npm audit and demo drift, Chromium E2E. Require exact PR head/merge SHA terminal outcomes; queued/skipped/absent are not passes.
- CI runs a build but playwright.config.ts still starts npm run web (dev server), despite E2E_SERVER_MODE=start. Web evidence is not production packaging acceptance. Rust placeholder resources are not package validation.

## Known boundaries and accepted scope
- No Mac app binary build, Tauri/AppKit/native runtime/signing/install validation requested or performed. Native Open With change remains source-reviewed only.
- Cross-path re-review found the old unrestricted /side reader violates the new folder-boundary promise. Initial synthetic inspection exposed unrestricted side tools; final regression uses the actual SDK runToolCall before/after-hook pipeline rather than bypassing hooks with direct tool.execute. This is a merge semantic safety conflict, not accepted as unrelated; final fix and regression results recorded below.
- Upstream Linux Trash metadata write failure may report an error after folder has moved into Trash; data remains there. No unrelated fix applied.
- Existing option-controls E2E fixture remains skipped from main; distinct-basename regression does not cover duplicate basename navigation. No weakened assertions or timeout inflation added.
- Prior main /session stats failure and cancelled Linux setup are not proof this merge regresses or passes. Report this revision's real evidence.

## Superseded chat-side safety integration (not the final feature set)
- Reuse upstream createChatWorkspaceExtension for folder-chat side read/grep/find/ls with no named-file grants, no skills or external extensions, and noContextFiles. The side view stays within its own chat folder even when the parent is unlocked or later relocked. Legacy-chat side and all recap sessions remain tool-free; project side keeps the previous read-only behavior.
- This deliberately narrower side scope prevents a fork-only secondary execution path from bypassing the new upstream permission promise. Pure question/answer and in-folder inspection remain; no unrelated project policy changes.
- New actual SDK tool-pipeline regression exercises in-folder reads, absolute/relative traversal and symlink denial, unlock/relock stability, empty context/external-extension loading, legacy and recap tool absence, and unchanged project read behavior.

## Final user-requested scope: remove fork side conversations
The user subsequently requested deletion of the fork side feature. The previously prepared side-boundary implementation was not published on a sync branch or PR. This final tree removes SideChatPanel, ChatWindow/AppShell side overlay and inert state, side/btw slash registration/parser, side request/follow-up/heartbeat paths and all three locale side keys. The ephemeral API accepts only recap; per-item only DELETE cancellation remains. Recap generation, cancellation, lifecycle/race guards, draft retention and historical branch snapshots remain. Chat-derived recap still has no tools, context files or external extensions.

Side-only tests are removed because the feature is removed, not weakened to disguise a failure. New tests assert absence of side UI/commands and server rejection of side/btw; renamed recap.local.spec.ts preserves recap pending/cancel/error/draft/history/parent-JSONL assertions. docs/recap.md documents the remaining feature. No main push or merge authorized.

### Removal revision validation
- TypeScript and lint passed after removal (21 unchanged warnings).
- Full unit run: 3285/3286 passed; unchanged MCP stdio crash-status integration case observed transient connecting instead of failed. No assertion/timeout change made; focused retry and exact PR CI determine final outcome. Earlier pre-removal full run was 3281/3281.
- New UI/server removal-focused checks passed (9 client and 13 server). Visual evidence remains pending CI artifacts, not local Chromium.

## First PR revision: CI and actual screenshot findings
PR #41 head 7e82d19ad004fcfe285fed9e3491c1759db343f9, merge test SHA a35faa3c6f5c0abf710dbdb2cc72d998a9f50277, CI run 40101531804 completed: checks/Linux Rust/Windows Rust/E2E success. E2E 51 passed, 1 existing skip; artifact 12562354798 matches that head. Actual inspection of all 12 new chat screenshots found a merge-specific layout error: upstream ChatAccessRows referenced composer-menu-row absent from fork styles, and the fork 120px tools-menu minimum compressed the new permissions description and switch. The confirmation/chat screenshots were otherwise readable. This is NOT visual acceptance: apply a dedicated chat menu layout fix, preserve permission text, add width/switch geometry assertions, and inspect new-head screenshots again.

Audit job success is not clean audit: npm audit exited 1 under continue-on-error. Existing undici 8.11.0 / nested 8.10.2 GHSA-xjj6-f33q-929c is reachable via provider discovery global fetch; synthetic local HTTP response reproduced unhandled Readable error / Node exit despite fetch catch. Same versions as main; >=8.12.2 required. No dependency patch without explicit risk-scope approval. Next image optimizer disabled with sharp 0.35.5 workaround; no use-cache/Server Actions entry found. Draft retained pending risk disposition and final UI evidence.

### Chat access layout correction
- Dedicated 360px chat menu, narrow-screen anchoring to the full composer controls row, fork flex rows and menu tokens, readable wrapped description and 26x15 switch. Ordinary project tools menus unchanged.
- 59 focused component/style tests passed. E2E now asserts menu width >=280 and actual 26x15 switch geometry in addition to viewport containment; next exact-head CI/screenshots required.
