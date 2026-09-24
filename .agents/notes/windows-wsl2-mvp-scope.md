# Windows desktop with WSL2 agent runtime: initial MVP scope

Status: planning analysis, 2026-09-24. No WSL implementation or Windows validation has been done for this note.

## Outcome and target configuration

Keep the Tauri window on Windows while Pi Web, Pi AgentSession, tools, Git, terminals, sessions, credentials, and project files run in one user-selected WSL2 distro. A project selected in the UI has a Linux cwd such as `/home/user/code/project`; its Pi state stays under that distro user's `~/.pi/agent`. The existing native Windows mode remains available.

Scope the first installable MVP to Windows 11 x64 (22H2 or later), WSL2, one selected Ubuntu x64 distro at a time, and projects on the distro filesystem. Confirm localhost forwarding on the supported configuration during the first Windows spike. WSL1, automatic Windows/WSL state sharing, and projects primarily under `/mnt/c` are outside this MVP.

```text
Windows Tauri WebView -- localhost HTTP/SSE --> Next.js + Pi server in WSL2
                                              |-- Pi sessions: ~/.pi/agent
                                              |-- projects and worktrees: /home/...
                                              `-- Bash, terminal PTY, Git, extensions
```

This is the same user-level choice described for the Codex Windows app: its agent environment can be switched to WSL while the desktop UI remains on Windows. Reference: [OpenAI Docs, Windows app](https://learn.chatgpt.com/docs/windows/windows-app). The implementation here must be designed and verified independently.

## Current fork and gaps

- `src-tauri/src/lib.rs` starts the packaged server with the bundled **Windows** `node.exe` and serves its URL in the WebView. `terminate_process_tree()` and `desktop/server-launcher.cjs` assume a same-OS child/PID relationship. A Windows process ID cannot be used as the Linux server's parent watchdog.
- `scripts/prepare-desktop.mjs` builds a standalone server on the build host and copies that host's Node executable. `src-tauri/tauri.windows.conf.json` packages those Windows resources. The Linux server/native dependencies need a separate Linux build artifact; pointing the Windows artifact at WSL is insufficient.
- Once the server is in WSL, most existing `/api/*` routes naturally use Linux filesystem paths and commands. In particular, `lib/rpc-manager.ts`, `lib/terminal-manager.ts`, `lib/worktree.ts`, and the session/file routes can remain server-side rather than being rewritten as Windows-to-Linux calls.
- `lib/desktop-native.ts` obtains Windows paths from Tauri folder/file/save dialogs. Its native image, import, and save paths are sent to server APIs that read/write paths locally (`app/api/desktop/*`, files import). Those calls need a WSL-aware UI path or a byte-transfer boundary.
- `lib/desktop-api-auth.ts` protects selected native filesystem routes with a desktop token; `app/api/desktop/identity` already lets Tauri verify a server instance. WSL mode needs a full transport/auth review because the agent API is reachable through Windows/WSL localhost forwarding.
- Browser preferences/drafts use origin-local storage. Switching a Windows shell between native and WSL servers on the same localhost origin could mix environment-specific cwd and draft state; scope storage by runtime and distro or give environments distinct stable origins.

## Proposed work slices

1. **Windows discovery spike.** On a real Windows 11 + WSL2 host, verify `wsl.exe` distro enumeration, default user, WSL version, localhost reachability in both directions, and `node-pty` loading under Linux. Start a WSL Pi Web server manually and load it in the Windows Tauri WebView. Record what works and what fails before fixing a packaging design.
2. **Distro choice and companion delivery.** Add an explicit Windows native / WSL2 environment choice and distro selector. Build a versioned Linux x64 standalone server with a Linux Node runtime and native dependencies from the same fork commit, then bundle it in the Windows installer. Install or update it inside the selected distro under a user-owned Linux directory with version/digest checks. Surface missing WSL2, unsupported distro architecture, disk-space, and install errors. Do not install runtime files under `/mnt/c`.
3. **Secure launch and lifecycle.** Have Tauri invoke `wsl.exe` with argv, not interpolated shell commands. Launch the Linux companion as the distro's normal user, bind it to loopback, give it an ephemeral secret without exposing that secret in command-line arguments, and verify the expected instance before showing the WebView. Select a reachable port without attaching to an unrelated server. Stop the Linux process on app quit, recover after a GUI crash or WSL restart, and handle sleep/reconnect. Replace the same-OS parent-PID watchdog for this mode. Require launch authorization for the WSL-served agent API, not only the existing native file routes.
4. **Project and native file boundary.** Use the in-app `/api/cwd/browse` path for choosing WSL project folders and show Linux paths throughout the project/session UI. For Open/Reveal, validate the Linux path and convert it for Windows Explorer or an editor only at that native action. Transfer Windows-selected images/imports and exports as bounded bytes, rather than sending `C:\...` paths to a Linux `fs` call. Keep the existing file-root and project-trust checks on the Linux side.
5. **State, packaging, and release.** Separate native/WSL and per-distro drafts, recent projects, and workspace restoration without migrating Pi session JSONL between OSes. Add the Linux companion to the Windows packaging/release path, keep its version tied to the Windows app, and define the upgrade/restart sequence. Continue to build/test native Windows mode.

## MVP acceptance checks

- Install a Windows package, select an installed WSL2 Ubuntu distro, choose a project under `/home`, send a prompt, and verify a tool-created file exists in that distro. The session JSONL and credentials are under WSL `~/.pi/agent`, not the Windows profile.
- Reopen the app and session; streaming/SSE, stop, terminal, Git status, worktree operations, file preview, and search use the Linux project. Native Windows mode and its own sessions still work after switching back.
- Open/Reveal targets the selected distro's file, and basic image attach, file import, and export work across the Windows/WSL boundary with size and path checks. Unsupported native actions show a clear error rather than silently using the wrong OS path.
- Wrong distro, stopped WSL, port collision, stale server, app crash, network forwarding failure, and upgrade failure do not attach the UI to a different process or strand an active agent without an actionable recovery path.
- A normal Windows browser without the desktop launch credential cannot invoke WSL-mode agent or native file APIs. No broad network bind is introduced.
- Verify on a real Windows 11 + WSL2 host. CI can check Linux artifact assembly, Windows packaging, and isolated contracts, but macOS or Linux-only tests cannot establish this end-to-end behavior.

## Effort and boundaries

Directional estimate: 2–3 days for the discovery/prototype spike, then roughly 3–5 engineer weeks for an installable MVP and Windows validation. The largest uncertainty is WSL launch/stop and localhost behavior across supported Windows/WSL versions, followed by file-dialog transfer and dual-platform packaging.

This note does not authorize implementation. It does not propose changes to Pi agent core, a remote-agent service, WSL1 support, multi-distro concurrent sessions, automatic credential/session migration, or storing Linux projects on Windows drives.
