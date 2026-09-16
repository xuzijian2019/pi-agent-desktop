# Pi 0.85.1 升级计划（Web UI）

## 目标与边界

- 将本仓库的 `@earendil-works/pi-agent-core`、`pi-ai`、`pi-coding-agent`、`pi-tui` 四个直接依赖精确锁定到 `0.85.1`，更新 npm 锁文件。目标是 npm 上的 0.85.1 发布包；`~/personal/pi/pi` 只供阅读，对比 `v0.84.4..v0.85.1`，不依赖其后续 HEAD 或本地构建。
- 仅保证浏览器访问的 Web UI 与其 Next.js 后端正常工作。验收使用 `npm run dev` 和 Web 入口 `npm run web`；不运行 `next build`（会污染开发时的 `.next/`），不要求 Tauri、standalone、签名或 desktop profile 构建通过。
- 不顺带升级 pi-web、Next、React，也不改存量会话文件格式。除发现真实兼容问题外，不重构 SDK 集成层。
- 开始前检查 `git status --short`，保留并理解任何新增的用户改动；本计划本身不执行升级。

## 已确认的事实和风险

- 本仓库 `package.json`/`package-lock.json` 固定四个 pi 包为 0.84.4，Node 要求 `>=22.19.0`，当前 CI 使用 `npm ci`。新版 `pi-coding-agent` 依赖新增的 `@earendil-works/chord`；需要在安装及 Web 服务运行时确认传递依赖可解析。
- 0.85.1 发布说明称 0.85.0 的 SDK 导入问题已修复，支持的本地 SDK/stdio RPC API 未变。公开 API 对比尚未发现本仓库必须改签名的地方，但不能据此推断运行时行为无差异。
- 会话文件仍是 v3；重点风险是 `lib/rpc-manager.ts` 对 `SessionManager` 的直接操作（未落盘会话、bash-only 手动落盘、fork 后销毁 wrapper、reload 和扩展绑定），以及 `lib/session-reader.ts`/`lib/session-manager-access.ts` 的读路径。
- 次级风险：`lib/model-scope.ts` 和模型认证/发现 API；`hooks/useAgentSession.ts` 的 SSE、重试、压缩状态；技能、插件、项目资源信任。新版 provider 行为有修复，不能只凭 TypeScript 通过判断功能正常。
- `bun.lock` 虽在 git 中但仍是 0.83.0，Web CI/安装走 npm。此次以 `package-lock.json` 为唯一安装锁文件，不为本升级引入 Bun 安装路径；若后续确认 Bun 仍被使用，另开任务同步或移除过期锁文件。
- `src-tauri/resources/component-versions.json` 和 `.github/workflows/release.yml` 中含 0.84.4，但属于桌面发布元数据；本次 Web-only 改动不生成/修改它们。`release:verify` 要求与远程最新版本一致，不能作为固定 0.85.1 的 Web 验收条件。

## 执行步骤

1. **基线和测试先行。** 确认工作区状态，记录 `node -v`，跑当前 `npm test`、`node_modules/.bin/tsc --noEmit`、`npm run lint`。先补针对会话生命周期及事件边界的回归断言：新会话尚未落盘时可列表/读取；bash-only 会话落盘后可恢复；fork 后旧 ID 重新加载独立状态；SSE 在 prompt 完成及扩展续跑后正确收敛。现有测试能明确覆盖的行为不重复造测试。
2. **锁定版本。** 使用 `npm install --save-exact` 将四个直接依赖统一装到 0.85.1，提交范围限 `package.json`/`package-lock.json` 及确实需要的兼容修复。用干净 npm 安装（`npm ci`）和 `npm ls` 检查实际解析版本及新增 chord；不要误装本地源码或 0.85.0。先运行 TypeScript、相关定向测试，按失败点修复。
3. **验证 SDK 接口和会话行为。** 逐项检查 `createAgentSessionServices`/`createAgentSessionFromServices`、模型初始化及 scopedModels、`bindExtensions`、工具启停、`SessionManager.open/create`、live snapshot、session file flush、fork/navigate、reload/abort/compaction。只在有失败证据时改动封装逻辑；不批量改 JSONL。
4. **验证 Web 数据与交互。** 启动 `npm run dev`（若 30141 被占用，另选端口）；检查 `/api/models`、`/api/sessions`、`/api/agent/*`、认证、技能/插件相关请求。浏览器手动走新建对话、发送与工具调用、切换/刷新/恢复会话、fork/分支、steer/follow-up、取消/压缩、模型切换、扩展工具与项目信任。检查浏览器控制台和服务器日志无新增异常；`npm run web` 入口另做启动冒烟测试。不能仅凭 API 200 判定通过，要确认 UI 状态与会话内容一致。
5. **最终验收和记录。** 跑全套 `npm test`、`node_modules/.bin/tsc --noEmit`、`npm run lint`，确认 `npm ci` 后仍可启动 Web UI；记录测试结果、手测覆盖、未覆盖的 provider/扩展及变更文件。若 Web-only 工作导致桌面发布元数据落后，在结果中注明，留给下一次桌面发布处理，不伪称发布门禁已通过。

## 完成标准与停机条件

- 四个直接依赖精确为 0.85.1，npm 锁文件一致；干净安装和 Web 服务启动成功。
- 会话创建/恢复、工具与扩展、模型选择、流事件及分支功能无回归；自动化检查通过，Web 手测通过。
- 若发布包缺失必要导出、会话写入破坏已有 JSONL、或 Web 后端无法加载新增依赖，应停止推广升级，保留失败用例与复现步骤后针对性修复；不得用本地 pi HEAD 或 0.85.0 临时替代。

预计 1–3 个工作日；主要不确定性来自会话生命周期运行时行为和可用的 provider/扩展集成测试环境。

---

## 执行结果（2026-09-16）

**状态：完成（Web 范围）。** 变更仅三处：`package.json`/`package-lock.json` 四包锁定 0.85.1；`lib/rpc-manager.ts` `PlainTextTheme` 兼容修复。

- 基线：tsc/lint/507 测试全绿（Node v24.15.0）。
- 唯一兼容问题：0.85.1 `Theme` 构造器新增 `scrollbarTrack: fgColors.scrollbarTrack ?? fgColors.muted`，stub 缺 `muted` → `fgAnsi(undefined)` 抛错（v0.84.4 tag 对比确认）。修复：fg stub 增加 `muted: ""`（`""` 是 0.85.1 显式支持的默认色哨兵）。无其他封装改动。
- `npm ci` 干净安装 + `npm ls`：四包精确 0.85.1，`chord@0.85.1` dedupe 正常。
- 验证（node_modules 确认为 0.85.1 时运行）：npm test 507/507；tsc、lint 通过；`npm run dev` 与 `npm run web` 均可启动。API 冒烟：home/running/models(16)/sessions(569)/会话读回正常；真实会话两轮 prompt（zai-coding-cn glm-5.3）：纯文本回复、`read` 工具 toolCall→toolResult→回复全链路、JSONL v3 落盘与读路径正常。测试会话与临时 cwd 已清理。
- 未覆盖：浏览器 UI 人工走查（fork/分支/压缩/取消/多 provider/扩展绑定）、Tauri/standalone/发布元数据（`component-versions.json`、`release.yml` 仍为 0.84.4，留给下次桌面发布）。
- 环境注意：npm 12 拒绝 env/CLI 层 `--allow-scripts`（本 harness 注入 `npm_config_allow_scripts`），项目内安装需 `env -u npm_config_allow_scripts`；sharp/unrs-resolver/esbuild 安装脚本被拦但不影响 dev server。Next 16 同目录仅允许一个 dev server。
