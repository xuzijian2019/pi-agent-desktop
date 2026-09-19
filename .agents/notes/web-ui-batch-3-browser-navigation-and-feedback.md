# Web UI batch 3: browser navigation and background-run feedback

Status: implemented under the user's 2026-09-18 request; original review retained below.
Review baseline: `bb7eb66`, 2026-09-18, Chrome on macOS 27.0.
Priority: third, after [draft safety](web-ui-batch-1-draft-persistence.md) and [selection correctness](web-ui-batch-2-session-selection-and-search.md).

## Outcome

Make the web UI behave like a browser application: navigable session history, useful tabs and keyboard controls, clear connection state, and optional feedback when background work finishes.

## Review evidence

- Session navigation uses `router.replace()` and initial URL state is captured on mount. Session switching therefore does not build a browser history of conversations; changing replace to push alone is insufficient without Back/Forward state reconciliation.
- Sidebar session rows are clickable divs, without normal link keyboard/new-tab behavior. Browser titles use only the project name, making several conversations from one project indistinguishable.
- New Session advertises Command/Ctrl+N even though the shortcut implementation acknowledges that regular browsers reserve it for a new window. A Ctrl+Alt+N-compatible path already exists through the current handler.
- Live Add Project testing confirmed that Escape from its empty filter does not dismiss the modal. The filter calls `closeDropdown()` on the child picker, while the parent owns modal visibility.
- The global Escape abort handler does not check whether a dialog/menu consumed the key. That is a source-level risk of stopping a run while dismissing another surface; it was not exercised against a real running agent.
- Notifications return immediately outside Tauri, and `useDesktopConnection(desktopMode)` disables the server-offline banner in the browser.
- A 120-tool-call history could be expanded successfully through native Chrome controls. Earlier automation timeouts were not established as an application performance bug.

## Core scope

1. **History and links.** Create history entries for explicit session navigation and reconcile application state on Back/Forward. Keep replace semantics for initial normalization and temporary-to-persisted session promotion where appropriate. Give session rows real URLs, keyboard activation, and native Command/Ctrl-click and middle-click behavior without swallowing modified clicks. Preserve drafts, scroll state, and the latest-navigation guarantees from batch 2.
2. **Useful browser titles.** Include a concise session title and project, with running/unread status where useful. Review the title MutationObserver in `AppShell` and extension title events so competing writers cannot repeatedly overwrite one another.
3. **Keyboard and dialog fixes.** Advertise a browser-compatible new-session shortcut and retain the desktop shortcut in Tauri. Wire Add Project dismissal to its parent. Route Escape to the topmost active interaction before allowing abort; honor consumed events and editable/IME contexts. Ensure hidden panels cannot trap keyboard focus.
4. **Connection feedback.** Reuse the connection-state logic for web with a browser-appropriate retry action. Show server unreachable/reconnecting state, retain drafts, and distinguish a server connection problem from a model/provider error. Do not invoke Tauri relaunch from web.
5. **Completion feedback.** Add opt-in browser notifications with title/unread indicators as a permission-free fallback. Request permission only after an explicit user gesture. Account for the selected session when its browser tab/window is in the background, deduplicate notifications across open tabs, and avoid notifying twice for one logical run.

Primary files: `components/AppShell.tsx`, `components/SessionSidebar.tsx`, `components/ProjectPicker.tsx`, `hooks/useKeyboardShortcuts.ts`, `lib/desktop-notify.ts`, and `lib/desktop-connection.ts`. Keep native integrations behind their existing wrappers.

## Acceptance checks

- Navigate A → B → Back → Forward; URL, transcript, selected row, project, draft, and scroll position agree after every step, including delayed reads.
- Command/Ctrl-click and middle-click open an independent session tab. Normal click keeps in-app navigation; keyboard users can reach and activate session links.
- The displayed new-session shortcut works in Chrome. Escape dismisses Add Project and other active overlays without aborting a run underneath; intentional abort remains available.
- Stop/restart an isolated test server: web connection feedback appears and recovers without losing the draft. Do not stop the user's development server.
- Foreground/background, permission granted/denied/unsupported, multiple tabs, and extension-continued runs produce the intended notification count. No unsolicited permission prompt appears on page load.
- Tauri notification/relaunch behavior remains intact. Run focused behavior tests, full unit tests, typecheck, lint, and relevant browser E2E; no development-time `next build`.

## Follow-on QOL candidates, outside the core batch

- Search the complete transcript, including collapsed process/tool output, with jump-to-result.
- A keyboard launcher for sessions, projects, files, models, and actions; reuse existing file search rather than building another browser.
- In-file search, jump to line, and remembered word wrapping in source preview.
- Improve phone-width composer allocation: at 390 px the model label was reduced to roughly one visible character, while More Controls used substantial width. Desktop viewport testing does not establish real mobile keyboard/IME behavior.
- Web-specific settings showing the running checkout/version and restart/update guidance. The current desktop-release status does not describe whether this fork's web checkout is current.

Keep these as separately scoped follow-ups unless explicitly selected. This note records the review and proposal; it does not authorize implementation, commits, publishing, or permission changes.

## Implementation and verification (2026-09-18)

- Explicit session/New Session navigation creates history entries; Back/Forward restores application state. Session titles are real links with keyboard, modified-click and middle-click behavior. Promotion retains replace semantics.
- One title writer combines session/project identity, extension title events, and running/unread indicators. Web advertises Ctrl+Alt+N; Tauri retains its existing shortcut. Add Project restores focus and dismisses with Escape, consumed keys cannot reach global abort, and collapsed panels are inert.
- Health probes also run on web, with a web retry path that never calls native relaunch. Browser notifications are opt-in via Settings; permission is requested only from the checkbox gesture. Server run identities and Web Locks deduplicate notifications across tabs, including extension continuations. Title/unread indicators require no notification permission.
- Browser coverage includes native links/history, modal Escape, simulated network loss, and an actual test-owned server stop/restart on a separate port/build directory. Notification permission/focus branches use a fake Notification API with real cross-tab Web Locks, avoiding OS notification side effects. Native Tauri runtime behavior was not exercised; its integration remains behind the existing wrappers and the unit/type checks pass.

Verification passed: `npm test` (528 tests), `node_modules/.bin/tsc --noEmit`, `npm run lint`, and `PW_CHANNEL=chrome npm run test:e2e` (8 tests). The focused composer/reconnect E2E also passed after the final retry adjustment. Tests use sandbox sessions and browser contexts; no model requests, commits, publishing, or development-time production build.
