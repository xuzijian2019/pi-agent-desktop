# Upstream merge handoff — 2026-10-22

- Desktop upstream: `4d7558656130959ffa504bdcd08089026d8d614c`.
- Fork before merge: `8c7be9f041f8e1ca732cc82d72a787733bcc8965`.
- Merge base: `d414e9db0cc41e88d2cc4c243b728b4d28dd5ea9`.
- Incoming: 2 commits, 14 upstream-touched paths, 4 overlapping/conflicted paths.
- Branch: `merge/upstream-20261022-1247-4d755865`; backup: `backup/pre-upstream-merge-20261022-1247-8c7be9f`.
- Fresh isolated checkout on dot's own cloud executor; separate fetches for origin, desktop upstream, and pi-web. No open PR at preflight. Two-parent `--no-ff --no-commit` merge. No main push, force push, rebase, squash, release or tag publication; this PR needs its own explicit merge approval.
- Actual integrated pi-web baseline: `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`, verified by merge-base with desktop upstream. Latest pi-web main fetched as `e533d9b3975f8a74b378d5007c92fdf4d15d3fba`; it is not the desktop integration source.

## Integrated from upstream

- Headless Streamdown 1.4.1 stable Markdown block caching and paced word fades, with 48–96ms preprocessing snapshots.
- Immediate authoritative completion/stop/replacement; reduced-motion and document-wide syntax fallbacks; existing sanitize/URL/file/artifact/code widget pipeline retained.
- Upstream real-browser streaming replay with long-text parse-volume measurements, synthetic input, desktop/narrow light/dark snapshots, replacement, completion, reduced motion, file links, math/references and sanitization.

## Kept from the fork

- All existing project/sidebar/composer/side/recap/draft interaction design unchanged.
- Fork h4–h6 typography and upstream stylesheet ownership retained.
- Playwright remains the main test:e2e entry, with the new upstream fixture explicitly included rather than silently omitted.
- All original dependency versions retained; Streamdown/remend were already present transitively, so lock changes only promote the direct dependency and remove peer metadata.

## Notable resolutions

- Four textual conflicts: native-theme.css combines both heading coverage and the streaming wrapper's first-child margin; package.json preserves fork Playwright and adds the fixture to upstream convenience command; lock regenerated from fork lock; ownership adds the new MarkdownBody boundary, paths and decision without overwriting existing records.
- All 14 incoming paths and all four overlaps independently reviewed, including Streamdown's actual installed renderer forwarding of safety plugins/components. No discovered data-loss, sanitize bypass or fork functionality removal.
- New fixture receives E2E_BROWSER_EXECUTABLE from the isolated-HOME wrapper; two added regression cases protect executable use and CI wiring. No assertion removed or weakened; no timeout extended.
- Drift measured against actual integrated pi-web: 3398 cosmetic / 14749 structural. MarkdownBody 173 total / 2 cosmetic / 171 structural, medium as recorded. No risk policy relaxed.

## Verification

- npm ci passed using isolated HOME/cache.
- TypeScript passed; lint 0 errors / 21 existing warnings.
- Full unit suite before compatibility fallback: 3242 passed, 0 failures/skips/cancellations.
- All three locales retain 1881 matching keys; no new locale keys required.
- CSS baseline matches upstream byte hashes; release pins and generated component manifest valid: desktop 0.7.5, pi 1.3.0, pi-web 0.10.0.
- npm run web returned HTTP 200 with isolated synthetic HOME/agent data/build output. This is HTTP smoke only, not interaction or production package acceptance.
- Local Chromium launch blocked by process_singleton socket EPERM; no permission bypass, no local browser pass claimed. Real exact-revision GitHub CI and artifact pixel inspection pending at publication.
- Latest workflow inspected: lint/tsc/unit, Ubuntu Chromium E2E, Linux and Windows Rust tests/clippy, advisory audit/demo drift. Successful E2E artifacts are uploaded with always(), including test-results. Playwright starts npm run web/dev despite a preceding production build.
- No native binary/Tauri/AppKit/package acceptance requested or performed. Rust placeholder resources are compilation/unit evidence, not package evidence. No native changes in this batch.

## Known pre-existing issues / acceptance scope

- Prior main E2E failures were explicitly accepted for PR35 only; this new revision will be checked independently. Noncritical upstream issues are not expanded into unrelated fixes.
- New upstream compatibility boundary: the actual npm run web Streamdown chunk retains eight regex lookbehind literal lines. Existing loaders do not cover this module; Safari/iOS older than 16.4 cannot parse that syntax and may fail to load the chat page, despite the existing browserslist minimum of 16.2. No old-Safari device run or Next production-chunk verification was performed. Modern Chromium is not affected by this syntax limitation. The new eager import was confirmed on the main page client dependency chain; original main only locked the package transitively and did not import it. A minimal adapter fix now capability-checks with catchable RegExp construction and lazy-loads Streamdown only on supported engines. Unsupported/loading states retain original ReactMarkdown and all safety plugins; no vendor or browserslist changes. Unit and browser fixtures simulate unsupported lookbehind, with no claim of a real old-Safari run.
- Visual/interaction verification is separate from CI success. This PR stays draft until actual CI and necessary browser evidence are reviewed.

## Reviewed incoming inventory

- app/native-theme.css
- components/ChatWindow.render-cache.test.mjs
- components/MarkdownBody.tsx
- components/StreamingMarkdown.tsx
- docs/agents/fork-ui.md
- e2e/streaming-markdown.fixture.tsx
- e2e/streaming-markdown.mjs
- hooks/useStreamingMarkdown.ts
- lib/streaming-markdown.test.mjs
- lib/streaming-markdown.ts
- package-lock.json
- package.json
- public/THIRD_PARTY_NOTICES.txt
- scripts/fork-ownership.json

## Compatibility follow-up before PR publication

- Addressed the new declared-browser startup risk using a guarded lazy adapter rather than changing the upstream renderer or support policy. Added executable capability test, source wiring sentinel and browser fallback text/file-link/replacement assertions.
- npm run web HTTP200 on corrected tree with isolated HOME/agent data. Actual eager chunk inspection and updated local gates recorded below when complete.
- Independent review of actual Next dev manifests: initial page chunks decrease from 23 to 22; all 22 initial JavaScript chunks inspected, with Streamdown vendor implementations absent (only async loader/lazy metadata remains). This validates the eager-load boundary, not a real Safari device run.

- Corrected-tree local gates: TypeScript passed, lint 0 errors / 21 warnings, full unit suite 3244 passed with zero failures/skips/cancellations. Seven fixture environment/wiring tests passed. No app binary build performed.
