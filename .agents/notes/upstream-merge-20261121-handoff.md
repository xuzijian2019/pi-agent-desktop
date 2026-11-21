# Desktop upstream sync — 2026-11-21

## Inputs and isolation
- Fork main b3b4b76ca52d367a6152656c4e1502a3bb8f192e; desktop upstream 211bd1e997684d63e89a5ff694b4bef36883c66e. Common desktop baseline 30d039382c64267e94e3bade39b34a0d10d870d2.
- Fresh dot-cloud checkout, no concurrent sync or open fork PR at preflight. Backup and timestamp/SHA branch. Git merge --no-ff --no-commit retains the two upstream/fork parents.
- Five incoming commits including upstream #255 (upstream CI 44897881877). Two textual conflicts: ChatWindow.tsx and MessageView.tsx.

## Integrated from upstream
- Settings → Models suggests built-in provider/model settings only for an exact endpoint and model match, using the bundled offline catalog. Applying suggestions edits the draft; Save persists it.
- Custom model thinking-level probes retain configured mappings and distinguish refused, not sent, and inconclusive results. Chat explains a refused thinking level and opens Settings on the affected model; no automatic retry.
- Sidebar fixture dates now relative to the test run, preserving short relative labels and existing hit target assertions.

## Kept from the fork and notable resolutions
- Ported the refusal action into fork ChatWindow's memoized message renderer rather than restoring the upstream transcript/composer structure. Kept existing assistant-block filters, scrolling, draft/recovery, menu, side-chat removal and file/Chat policies. Reconciled five overlapping paths and inspected model route/settings even where git merged cleanly.
- Gemini's SDK can serialize the mapped level as uppercase in the nested thinkingLevel field; probe now sees that actual enum and classifies structured GenAI errors. 400/422 are refusals only with the baseline succeeding and a value on the wire; 429/5xx are inconclusive. Chat uses the same status reader for native Google refusals.
- Built-in matching sends only the draft endpoint's normalized host/port/path, omitting URL userinfo, query and fragments. The UI cannot display a response from a superseded endpoint/model.
- No live provider or gateway calls. Offline route tests use real SDK serialization at a mocked boundary. Browser fixtures use synthetic models and mock endpoint responses for model probing/saving; persisted JSONL tests the real refusal/navigation path without submitting a prompt.

## Bookkeeping and boundaries
- Dependencies and lockfile unchanged; release pins and component manifest match desktop 0.8.7 / pi 1.5.2 / pi-web 0.15.0. Release remains manual-only; no CI/release policy edits.
- Three locale additions checked; global/settings CSS remain upstream-identical and baseline stamp advanced to 211bd1e9.
- Latest agegr/pi-web main 432366bd510c72ce7b678a6cb1220f9cac1ed56c is context only. Integrated baseline remains f130910abf662b506b2ef2f475fc21a2fe57badc; measured 3804 cosmetic / 26183 structural (87%); refreshed ownership measurements without changing review policy.
- No macOS/Tauri/AppKit, signing, packaging or native binary acceptance. CI's existing Rust/payload jobs are not packaged runtime acceptance. Draft only pending explicit authorization for this PR; no main push/merge/rebase/squash/force/auto-merge/releases/tags.

## Verification
- Isolated cloud npm ci, tsc and lint; lint has 21 pre-existing warnings and 0 errors. Offline focused backend tests: 25 passed; distinct native structured refusal regression added.
- Isolated npm run web served the index and built-in model match with HTTP 200; local Chromium initialization denied socket creation. No local browser/screenshot pass asserted.
- Actual browser cases are the two mock Gemini Apply-vs-Save tests at 1280 light and 390 dark, plus persisted native Gemini refusal → exact model selection at 390 dark. CI and final screenshot pixel review recorded in draft PR body.
- Final local TypeScript clean; 4575 unit passed / 0 failed / 4 environment/platform skips (4579 total). CSS/menu/ownership focused checks: 18 passed. All three new Playwright tests enumerate.
