# Windows desktop with WSL2 agent runtime: MVP scope and integration plan

Status: planning + integration spike, 2026-09-24.

The basic Windows-to-WSL web path has now been manually validated on a Windows 11 machine with an Ubuntu 26 WSL2 distro:

- The fork runs successfully inside WSL2 with `npm run web`.
- A Windows browser can open that WSL-served Pi Web instance through localhost.
- Project browsing and Linux paths under the WSL filesystem work from that Windows browser.

Do not repeat those checks as the first milestone. The next uncertainty is the **Windows Tauri shell owning and securing a WSL2 Pi runtime**, including launch, lifecycle, WebView behavior, native-file boundaries, and packaging.

## Outcome and target configuration

Keep the Tauri window on Windows while Pi Web, Pi AgentSession, tools, Git, terminals, sessions, credentials, and project files run in one user-selected WSL2 distro. A project selected in the UI has a Linux cwd such as `/home/user/code/project`; its Pi state stays under that distro user's `~/.pi/agent`. The existing native Windows mode remains available.

Scope the first installable MVP to Windows 11 x64, WSL2, one selected Ubuntu x64 distro at a time, and projects on the distro filesystem. WSL1, automatic Windows/WSL state sharing, multi-distro concurrent sessions, and projects primarily under `/mnt/c` are outside this MVP.

```text
Windows Tauri / WebView2 -- localhost HTTP/SSE --> Next.js + Pi server in WSL2
           |                                   |-- Pi sessions: ~/.pi/agent
           |                                   |-- projects/worktrees: /home/...
           |                                   `-- Bash, PTY, Git, extensions
           |
           `-- wsl.exe control plane
               distro discovery / launch / stop / path conversion
```

The design goal is deliberately asymmetric: keep almost all agent/runtime behavior inside Linux and keep Windows responsible only for the desktop shell, runtime orchestration, and Windows-native actions.

## Existing architecture that should be preserved

- Once the server is in WSL, existing server-side APIs should continue to own filesystem, Git, worktree, terminal, search, and Pi session behavior. In particular, do **not** rewrite `lib/rpc-manager.ts`, `lib/terminal-manager.ts`, `lib/worktree.ts`, or session/file routes into per-operation Windows-to-WSL RPC.
- `app/api/cwd/browse` and the in-app `DirectoryPicker` already operate on the server filesystem. In WSL mode they should remain the primary project picker and continue to expose Linux paths directly.
- `app/api/desktop/identity` already provides an instance handshake that can be reused when Tauri verifies the WSL server it launched.
- The existing `PI_WEB_PASSWORD` + HttpOnly session-cookie authentication path should be reused for WSL-mode launch authorization instead of inventing authentication on every fetch/SSE request.

## Current fork gaps

- `src-tauri/src/lib.rs` currently starts the packaged server with the bundled **Windows** `node.exe`. WSL mode instead needs a runtime strategy that invokes `wsl.exe` and launches a Linux server inside the selected distro.
- `terminate_process_tree()` and `desktop/server-launcher.cjs` assume a same-OS process tree and parent PID. A Windows PID is not an appropriate Linux watchdog contract.
- `scripts/prepare-desktop.mjs` builds a standalone server on the build host and copies that host's Node runtime. A Windows-built server bundle cannot simply be pointed at WSL native dependencies.
- `lib/desktop-native.ts` receives Windows paths from Tauri file/save dialogs. Those paths cannot be handed directly to a WSL server's `fs` calls.
- `open_path` / `reveal_item_in_dir` currently call Windows `Path::exists()` on the supplied path. A Linux path such as `/home/user/repo/file.ts` will therefore fail until it is explicitly converted at the native boundary.
- Browser state is origin-local. Native Windows and WSL runtime state must not silently reuse environment-specific cwd/drafts/recent-project values.
- `~/.pi/agent/npm` can contain native Node extensions. Sharing it with an existing WSL Pi CLI means the desktop runtime's Node ABI must be tested against the user's existing CLI/runtime before a fixed bundled Node version is chosen.

# Phase 1: integration spike before packaging

The Phase 1 goal is not to produce an installer. It is to prove that a Windows Tauri shell can safely and reliably use the already-working WSL runtime.

A Phase 1 result is successful only when all mandatory gates below pass on the real Windows 11 + Ubuntu 26 WSL2 validation machine.

## Gate A — Windows can identify and invoke the intended distro

From Windows, verify and record:

- [ ] `wsl.exe -l -v` returns the target distro and reports WSL version 2.
- [ ] Tauri/Rust can execute a command in the selected distro without invoking an interpolated shell string.
- [ ] The command runs as the distro's normal user, not root.
- [ ] Detect and record Linux `$HOME`, `uname -m`, distro identity, and Node version.
- [ ] Reject unsupported architecture or WSL1 with an actionable error.
- [ ] Distro names containing spaces or punctuation are passed as argv correctly.

Suggested manual probe:

```powershell
wsl.exe -l -v
wsl.exe -d "<distro>" -- sh -lc 'printf "user=%s\nhome=%s\n" "$USER" "$HOME"; uname -m; node -v'
```

Implementation should avoid `sh -lc` for user-controlled values; the shell form above is only a discovery probe.

### Gate A pass condition

Tauri can select one installed WSL2 distro and obtain its runtime facts deterministically without relying on the Windows default distro.

## Gate B — Windows Tauri WebView can use the manually started WSL server

This is the first check that is still missing even though a normal Windows browser already works.

Start the current fork in WSL as today, then point a Windows Tauri development shell at that server without starting a second Windows Next.js server.

Validate inside the Tauri WebView:

- [ ] Main UI loads from the WSL server.
- [ ] Tauri IPC remains available from the localhost-served page.
- [ ] Open a project under `/home/...`.
- [ ] Start/reopen a Pi session.
- [ ] Prompt streaming works.
- [ ] Stop/cancel works.
- [ ] Terminal opens and reports Linux `pwd`, `uname`, and shell.
- [ ] Git status/branch operations execute in WSL.
- [ ] Worktree list/create/remove execute in WSL.
- [ ] File explorer, file preview, search, and project trust all operate on the WSL project.
- [ ] A tool-created proof file appears in the WSL project.
- [ ] Session state is written under WSL `~/.pi/agent`, not the Windows user profile.
- [ ] Close/reopen the Tauri shell and reconnect to the manually running server without corrupting the session.

A useful development path is to add a shell-only mode that skips `beforeDevCommand` and points the Tauri shell at an explicitly supplied URL. Do not make the validation depend on a second Windows checkout running its own Pi server.

### Gate B pass condition

The same WSL instance that is already usable from a Windows browser is usable through the real Windows Tauri/WebView2 shell for core agent, terminal, Git, worktree, and file workflows.

## Gate C — Tauri can launch and identify the WSL server

Only after Gate B passes, replace the manually started server with a Tauri-launched one.

Validate:

- [ ] Tauri launches via `wsl.exe -d <distro> -- ...` using argv, not an interpolated command string.
- [ ] The WSL server binds loopback only.
- [ ] Tauri generates an ephemeral instance id and secret.
- [ ] The secret is not exposed in process command-line arguments.
- [ ] Tauri does not display the WebView until `/api/desktop/identity` returns the expected instance id.
- [ ] A stale/unrelated process on a candidate port cannot be mistaken for the launched server.
- [ ] Startup failure returns WSL-side logs and an actionable message.
- [ ] Repeated app launches do not create duplicate WSL servers for one desktop instance.

### Port-selection spike

Do not assume the existing Windows `TcpListener` reservation is sufficient for a server that will bind inside WSL's network namespace.

Explicitly test:

- [ ] Windows process occupies candidate port, then WSL attempts to bind it.
- [ ] WSL process occupies candidate port, then Windows attempts to bind it.
- [ ] Windows localhost can reach the selected WSL port after the server is ready.
- [ ] Port collision causes retry/failure, never attachment to another process.

Prefer a design where the WSL launcher participates in port selection and Tauri always verifies the instance identity after connecting.

### Gate C pass condition

One Tauri launch deterministically creates exactly one authenticated, identifiable WSL server and attaches only to that server.

## Gate D — lifecycle survives normal and abnormal shutdown

The current `PI_WEB_PARENT_PID` watchdog cannot be reused as-is across Windows and Linux.

Prototype a WSL-specific lifetime contract. A preferred spike is a thin Linux launcher kept alive by a private pipe/stdin lease from the Windows `wsl.exe` process:

1. Tauri starts `wsl.exe`.
2. The WSL launcher receives startup configuration through a private channel rather than CLI secrets.
3. The launcher creates a Linux process group and starts the Next/Pi server.
4. Normal desktop quit requests graceful termination of that group.
5. If the Windows owner disappears and the pipe reaches EOF, the launcher terminates the Linux process group after a short grace period.

Validate:

- [ ] Normal app Quit terminates its WSL server and active child tools.
- [ ] Closing/hiding behavior does not terminate the server when the desktop app is intentionally staying resident.
- [ ] Force-killing the Windows GUI eventually removes the owned WSL server.
- [ ] Killing only the WSL server makes the desktop connection state go offline and offers recovery.
- [ ] `wsl --shutdown` / distro restart is detected and recoverable.
- [ ] Windows sleep/resume does not silently reconnect to the wrong process.
- [ ] Shutdown never calls `wsl --terminate <distro>` merely to stop Pi; unrelated user processes in the distro must survive.

### Gate D pass condition

The desktop owns only its server/process group and can recover from loss of either side without killing unrelated WSL work or leaving a persistent orphan.

# Phase 2: secure desktop bootstrap

The existing web-auth implementation should be reused.

Proposed flow:

1. Tauri generates a random per-launch desktop secret.
2. WSL server receives it as `PI_WEB_PASSWORD` and separately receives the desktop API token/instance id.
3. Initial desktop page detects Tauri and exchanges the Tauri-held secret through `/api/web-auth`.
4. The server returns the existing HttpOnly session cookie.
5. Normal fetch/SSE/EventSource traffic then uses the cookie automatically.

Validation:

- [ ] Tauri WebView enters the app without asking the user for a password.
- [ ] A normal Windows Chrome/Edge tab at the same localhost URL cannot call agent APIs without authenticating.
- [ ] SSE/streaming and reconnect work with cookie auth.
- [ ] Existing `desktop-api` token checks remain required for deliberately broad native filesystem APIs.
- [ ] No server binds to `0.0.0.0` as part of desktop WSL mode.
- [ ] Authentication remains valid after normal WebView reload but does not survive attaching to an unrelated new server instance.

# Phase 3: Windows/WSL native-file boundary

Project selection is already server-side and should stay that way. Only operations that truly cross operating systems need conversion or byte transfer.

## Linux path -> Windows native action

For Open/Reveal:

- [ ] Server/UI continues to use the canonical Linux path.
- [ ] Tauri is also given the selected distro identity.
- [ ] At the native action boundary, convert the validated Linux path to a Windows-accessible WSL path.
- [ ] Pass the converted path to Explorer/default-app handling.
- [ ] Never interpret arbitrary unvalidated user text as a Windows/UNC path.

Validate files/directories with spaces, Unicode, symlinks, deleted paths, and project/worktree locations.

## Windows selection -> WSL server

For image attach and file import:

- [ ] Tauri dialog returns a Windows path only to the Windows side.
- [ ] Windows side reads the selected file with explicit size limits.
- [ ] Transfer bounded bytes + metadata to the WSL server.
- [ ] The WSL server writes/imports only within its existing allowed-root/project-trust rules.
- [ ] Do not make `C:\...` paths an accepted WSL server filesystem primitive.

## WSL export -> Windows save dialog

- [ ] Fetch bounded bytes from the WSL server.
- [ ] Let the Windows save dialog choose a destination.
- [ ] Write those bytes on the Windows side.
- [ ] Do not POST a Windows destination path to a WSL-side `fs.writeFile`.

# Phase 4: runtime compatibility and Node ABI

Before deciding to ship a fixed Linux Node runtime, test the existing WSL Pi installation.

Record:

```bash
node -v
node -p 'process.versions.modules'
which node
pi --version || true
find ~/.pi/agent/npm -name '*.node' -print 2>/dev/null | head
```

Then validate:

- [ ] Desktop server can load `node-pty` under the chosen runtime.
- [ ] Existing Pi extensions under `~/.pi/agent/npm` continue to load.
- [ ] Running desktop then Pi CLI does not cause alternating native-extension rebuild failures.
- [ ] Running Pi CLI then desktop does not cause ABI mismatch failures.

Initial preference for the spike: use the selected distro's existing compatible Node (`>=22.19`) when present. Only choose a fully bundled Linux Node after the shared `~/.pi/agent/npm` ABI behavior is understood.

If a bundled Node is eventually required, consider isolating desktop-managed native package state rather than repeatedly mutating a cache shared with a different Node major.

# Phase 5: distro selection and state isolation

After the integration path works:

- [ ] Add Windows Native / WSL2 runtime selection.
- [ ] Enumerate installed WSL2 distros.
- [ ] Persist the selected distro explicitly.
- [ ] Keep recent projects, draft cwd, workspace restoration, and other environment-specific browser state scoped by runtime + distro.
- [ ] Switching Native -> WSL -> Native does not expose stale Linux paths to Windows APIs or vice versa.
- [ ] Do not migrate session JSONL or credentials between operating systems.
- [ ] WSL mode intentionally uses the selected distro user's existing `~/.pi/agent`.

# Phase 6: companion packaging and installer

Packaging comes after Gates A-D, not before them.

Target release shape:

```text
Windows NSIS installer
  |-- Tauri Windows executable
  |-- native Windows server/runtime resources
  `-- versioned linux-x64 WSL companion archive
```

Build the Linux companion on Linux so Linux native dependencies are genuine Linux artifacts. Prefer shipping it as a versioned archive instead of expanding a second large `node_modules` tree directly into the NSIS resources.

On first WSL use:

- [ ] Check distro/architecture compatibility.
- [ ] Install/update companion to a user-owned Linux path, not `/mnt/c`.
- [ ] Verify version and digest.
- [ ] Use atomic staging/rename where possible.
- [ ] Keep app version and companion version tied to the same fork commit/release.
- [ ] Fail safely if install/update is interrupted.
- [ ] Preserve the existing native Windows build and release path.

CI can validate Windows packaging and Linux companion assembly separately, but final release acceptance still requires the real Windows + WSL2 integration suite.

# Suggested implementation slices

## Slice 1 — shell-only WSL integration harness

Smallest code change that provides high information value:

- Add a development-only way for the Windows Tauri shell to use an externally supplied server URL without starting its own Windows server.
- Validate Gate B against the already-working `npm run web` WSL instance.
- Add no installer/runtime delivery code yet.

## Slice 2 — WSL runtime abstraction + discovery

Introduce an explicit server-runtime abstraction in the Rust shell instead of continuing to grow one `start_packaged_server()` path.

Conceptually:

```text
DesktopRuntime
  - Native
  - Wsl { distro }

start()
stop()
identity/reconnect metadata
native-path bridge metadata
```

Keep exact Rust types implementation-driven; the important boundary is that WSL lifecycle logic does not leak into every existing native server branch.

## Slice 3 — Tauri-owned WSL launcher

Implement Gates C-D: argv-safe `wsl.exe` launch, private startup/lifetime channel, identity handshake, logs, shutdown, and recovery.

## Slice 4 — authentication bootstrap

Enable the existing web password/session-cookie layer automatically for WSL desktop mode and prove normal browsers cannot access the agent API.

## Slice 5 — native-file bridge

Implement Open/Reveal conversion and byte-based attach/import/export.

## Slice 6 — runtime/distro UI and state scoping

Expose Native/WSL choice, distro selection, state isolation, recovery UI, and diagnostics.

## Slice 7 — Linux companion + installer/release

Only now lock the companion format, Linux build job, Windows installer inclusion, versioning, update behavior, and end-to-end release checks.

# Phase 1 validation checklist for the existing Windows machine

The following is the immediate checklist. Browser-to-WSL connectivity and WSL project browsing are already considered proven and are intentionally omitted.

### Environment

- [ ] Record `wsl.exe -l -v`, Windows build, WSL version, distro name, `uname -m`, Node version.
- [ ] Verify explicit `wsl.exe -d <selected distro>` execution.
- [ ] Verify normal user + expected `$HOME`.

### Tauri against manually running WSL server

- [ ] Windows Tauri shell loads the WSL URL.
- [ ] Tauri IPC/plugin calls still work.
- [ ] Existing session opens.
- [ ] New session starts.
- [ ] Prompt/SSE streaming works.
- [ ] Stop works.
- [ ] Terminal is a Linux PTY.
- [ ] Git status/branch works.
- [ ] Worktree operations work.
- [ ] File explorer/preview/search work.
- [ ] Agent creates a file in `/home/...`.
- [ ] Session is persisted in WSL `~/.pi/agent`.

### Launch/control prototype

- [ ] Tauri can start the server via explicit distro `wsl.exe`.
- [ ] Server stdout/stderr are capturable in Windows-side diagnostics.
- [ ] Identity handshake succeeds.
- [ ] Wrong/stale port fails identity verification.
- [ ] Port-collision behavior is recorded.
- [ ] Secrets do not appear in command-line args.

### Lifecycle prototype

- [ ] Normal Quit kills only the owned Linux process group.
- [ ] Force-kill GUI eventually removes the owned server.
- [ ] Other WSL shells/processes survive desktop shutdown.
- [ ] Server kill is detected by WebView.
- [ ] Distro restart is recoverable.
- [ ] Sleep/resume is recoverable.

### Security prototype

- [ ] Random per-launch desktop auth is enabled.
- [ ] Tauri auto-authenticates.
- [ ] Normal Windows browser without the credential receives 401 on agent APIs.
- [ ] SSE still works after auth.
- [ ] Server stays loopback-only.

### Runtime compatibility

- [ ] Record WSL CLI Node major/ABI.
- [ ] `node-pty` loads.
- [ ] Existing Pi extension/native modules load.
- [ ] CLI -> desktop -> CLI does not produce native ABI churn.

## Phase 1 exit criteria

Do not start installer/companion work until all of these are true:

1. Windows Tauri/WebView2 runs the full core workflow against the WSL server.
2. Tauri can launch the exact selected distro and verify the server identity.
3. Authentication prevents an unrelated local browser from invoking agent APIs.
4. Normal and abnormal desktop shutdown do not leave the owned WSL agent runtime stranded.
5. No shutdown/recovery path terminates unrelated processes in the distro.
6. The chosen Node strategy does not break the user's existing WSL Pi environment.

At that point the major architecture uncertainty is removed. Remaining work becomes productization: native-file bridging, runtime selection UX, packaging, updater behavior, and broader compatibility testing.

## MVP acceptance checks

- Install a Windows package, select an installed WSL2 Ubuntu distro, choose a project under `/home`, send a prompt, and verify a tool-created file exists in that distro. Session JSONL and credentials stay under WSL `~/.pi/agent`.
- Reopen the app and session; streaming/SSE, stop, terminal, Git status, worktree operations, file preview, and search use the Linux project. Native Windows mode and its own sessions still work after switching back.
- Open/Reveal targets the selected distro's file, and basic image attach, file import, and export work across the Windows/WSL boundary with size and path checks.
- Wrong distro, stopped WSL, port collision, stale server, app crash, network forwarding failure, and upgrade failure never attach the UI to a different process and always produce an actionable recovery path.
- A normal Windows browser without the desktop launch credential cannot invoke WSL-mode agent APIs. No broad network bind is introduced.
- Verify release candidates on a real Windows 11 + WSL2 host. CI alone is not sufficient for this feature.

## Boundaries

This plan does not propose changes to Pi agent core, a general remote-agent service, WSL1 support, multi-distro concurrent sessions, automatic credential/session migration, or storing Linux projects primarily on Windows drives.
