# Upstream merge handoff — 2026-10-16

- Upstream tip: `ee23e581e01637b51b6b7aa18ab265861344aef1` (abcwyc/pi-agent-desktop/main, desktop 0.7.2).
- Fork tip before merge: `4c44a994b21653d2c3dfef8f4d8bfb6212c7d5cd` (main = origin/main at preflight).
- Previous upstream tip / merge base: `e5a5596522fd2e52fd3b2c8997920ac6803b3086` (desktop 0.7.1).
- Incoming: 17 commits, 10 non-merge commits. Source is the fetched upstream/main commit; the local tag v0.7.2 belongs to pi-web and must not be used as the desktop merge source.
- Backup: `backup/pre-upstream-merge-20261016` at the original fork tip.
- Normal two-parent merge; no rebase or force-push. Push requires user approval under .agents/skills/upstream-merge/SKILL.md.
- Textually conflicted paths (11): app/native-theme.css, components/AppShell.tsx, components/ChatInput.compaction.test.mjs (modify/delete), components/ChatInput.tsx, components/ChatWindow.tsx, components/ContextUsageRing.tsx, components/SettingsPanel.test.mjs, components/SettingsPanel.tsx, components/desktop/desktop-chrome.test.mjs, hooks/useAgentSession.test.mjs, scripts/release-component-pins.json.

## Integrated from upstream

- Desktop 0.7.2 and all seven locked pi SDK packages at 1.3.0. Kept upstream package name/version (@agegr/pi-web 0.10.0) and Playwright test:e2e entry.
- Settings follows the OS preferences-window layout: centered macOS toolbar, left navigation on Windows/Linux, existing phone picker. Cmd/Ctrl+, opens the last eligible settings section.
- Models settings displays provider modelOverrides, badges affected custom models, and explains saved/unsaved, overridden, and fallback context/output limits. Added xhigh/max thinking-map guidance. Verified fallback values and override precedence against the installed pi 1.3.0 provider-composer implementation.
- Navigator preview becomes clickable; jumping expands the render window far enough to include process-detail groups.
- macOS traffic-light Y inset derives from AppKit button geometry, retaining the 24pt target centre; macOS release/test-build runners require the macOS 26 SDK.
- Gatekeeper installation notes in both READMEs. All new locale keys are present in en, zh-CN, zh-TW.

## Kept from the fork

- Project-tree sidebar, hover peek, left shell, simplified composer, separate model/reasoning/tool controls and composer git chip.
- Side Chat/Recap, IndexedDB drafts and their conflict/setup restoration, memoized transcript and stable keys, overlay composer, scroll and stale-response guards.
- Class-based TabBar, file toolbar, artifact panel integration, missing-folder protection and browser notification opt-in.
- Completion audio stays removed. Manual compaction remains in the existing fork command flow; active auto-compaction stays visible in the status line. Did not restore the upstream composer gear/compact control, combined reasoning/tools menu or extra steer/follow-up buttons.
- Fork CSS stays in native-theme.css; globals.css/settings.css remain byte-identical to upstream. Sidebar's existing 10px inset plus 28px control still centres at 24px, so upstream's 48px-row rewrite is unnecessary here.

## Notable resolutions

- Reviewed all 20 upstream-touched/fork-modified overlap paths, including clean merges. Inventory below.
- Retained ChatInput.tsx and its streaming-thinking/mobile-layout tests from the fork: incoming changes there were upstream-specific UI rearrangement, compact control and audio plumbing. Kept the deleted upstream compaction-control test deleted. Retained the fork compaction status-line assertions.
- Adopted Cmd/Ctrl+, without resurrecting the removed topbar More state. Kept fork General options and omitted sound props/switch; applied platform styling through the existing dialog.
- Fork memoized renderer already carries data-conversation-turn, so no second upstream render path was restored. Added extraction sentinel for this marker and the larger window.
- The clickable navigator preview needed two integration fixes: overlap the 36px scrub track with the card (left 34px) to bridge pointer movement, and prevent pointer-induced focus loss from dismissing the card before its click handler runs. Real browser acceptance covers track jump to the earliest previously unrendered turn, moving to the preview and clicking another turn.
- New navigator fixture has 70 messages producing 105 rendered items (thinking plus answer); it requests the full branch through the real API to isolate renderer pagination from the API's default 50-message history page. A first fixture with tool-result messages did not reproduce that ratio and was corrected. First-turn scroll offset tolerates the existing 3px top inset.
- New Settings acceptance checks shortcut, retained auto-title option, absence of audio, override/fallback limits, all desktop CSS platform variants and a 390x844 phone viewport. Inspected macOS/Windows/mobile screenshots.
- Release-body text describes the retained fork composer instead of claiming the upstream composer redesign shipped.
- Release pins and component manifest match desktop 0.7.2 / pi 1.3.0 / pi-web 0.10.0. pi-web baseline remains 6fcd7d4; refreshed measured counts for AppShell, ChatWindow and SettingsPanel without changing risk policy or dispositions.

## Known pre-existing issues

- Lint baseline remains 26 warnings (0 errors), same as 2026-10-15.
- Standalone webpack reports the existing dynamic-import warning in app/api/sessions/[id]/export/route.ts.
- npm install reports existing React peer warnings and 8 dependency audit advisories; no broad audit upgrades were made during this merge.
- Native AppKit placement and Windows/Linux native behavior are not established by browser CSS screenshots. Rust gates cover compilation and unit behavior; no desktop app installation or signed/notarized release is part of this merge request.
- AGENTS.md is upstream-owned and Next dev appends generated instructions; restore only the generated dev-server change before committing.

## Verification

- TypeScript: clean. Lint: 0 errors / 26 warnings. Full unit suite: 2969 passed / 0 failed (13 suites, four workers, empty temporary PI_CODING_AGENT_DIR).
- Rust: cargo test --locked --lib, 7 passed. cargo clippy --locked --all-targets -- -D warnings clean.
- Dedicated upstream-072 Playwright acceptance: 2 passed / 0 failed (10.6s).
- Full Playwright: 43 passed / 0 failed (5.5 minutes, Chromium, 1 worker), including the two new 0.7.2 acceptance cases.
- Final isolated desktop frontend build succeeded. Staged server runs with the bundled arm64 Node; Code mode sandbox self-test available, Bedrock module imports, no module-resolution errors. Repeated after the final navigator focus/CSS correction so staged output matches the reviewed tree. All production output is isolated in .next-desktop; dev checkout .next is untouched. Local macOS SDK is 27.0.
- Drift: 3386 cosmetic / 14841 structural (81%), no risk mismatches.
- Conflict-marker and whitespace checks clean; release pins/manifest all valid; globals.css/settings.css identical to upstream; no drift risk mismatches. Restored only the Next-generated AGENTS.md append before staging. Final two-parent commit and clean working-tree confirmation follow the checks.

## Silent semantic review overlap inventory

- `app/native-theme.css`
- `components/AppShell.tsx`
- `components/AppShell.workspace-memory.test.mjs`
- `components/ChatInput.compaction.test.mjs`
- `components/ChatInput.streaming-thinking.test.mjs`
- `components/ChatInput.tsx`
- `components/ChatWindow.tsx`
- `components/ContextUsageRing.tsx`
- `components/MobilePwaLayout.test.mjs`
- `components/SettingsPanel.test.mjs`
- `components/SettingsPanel.tsx`
- `components/desktop/desktop-chrome.test.mjs`
- `hooks/useAgentSession.test.mjs`
- `hooks/useKeyboardShortcuts.ts`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`
- `lib/i18n/messages/zh-TW.ts`
- `package-lock.json`
- `package.json`
- `scripts/release-component-pins.json`

## Incoming commits

```text
ee23e581 chore(homebrew): update cask to 0.7.2
156aedb3 Prepare desktop release 0.7.2
91ab83f6 Merge pull request #138 from abcwyc/claude/input-module-style-review-966aff
bc62b060 Merge pull request #133 from abcwyc/claude/topbar-navigator-fixes
39029d9f Merge pull request #137 from abcwyc/claude/settings-modal-platform-styles-499dbd
5faefc2a Merge pull request #136 from abcwyc/claude/traffic-light-alignment-style-5684e7
0527de54 Merge pull request #135 from abcwyc/claude/model-overrides-131
7a6464f6 Merge pull request #134 from abcwyc/claude/install-notes-thinking-hint
dfefa628 Merge pull request #132 from abcwyc/claude/pi-latest-version-upgrade-2c8113
f274db65 test(e2e): find the navigator preview by class now that it is a button
5544dd64 Refine the composer: round send, mode cues, leaner control row
06727353 feat(settings): follow each platform's preferences-window style
504c9d1e fix(desktop): derive the macOS traffic-light inset from AppKit, build on the macOS 26 SDK
c2e50510 fix(models): show modelOverrides and stop placeholder numbers posing as limits (#131)
811e8892 docs+ui: macOS Gatekeeper install note, explain xhigh/max in the thinking map
bd145fbd fix(ui): align the topbar chrome and make the conversation navigator jump again
1362b7f3 deps: upgrade the bundled pi SDK to 1.3.0
```
