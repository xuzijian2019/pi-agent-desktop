# Pi 0.86.1 升级记录（Web UI）

日期：2026-09-20。范围沿用 `pi-0.85.1-web-upgrade.md` 的边界：Web-only，精确锁定 npm 上的
`@earendil-works/{pi-agent-core,pi-ai,pi-coding-agent,pi-tui}@0.86.1`，源码 checkout
`~/personal/pi/pi`（v0.86.1+1 commit）仅用于对照，不做本地构建安装。

## 变更（共 5 个文件）

- `package.json`/`package-lock.json`：四个直接依赖 0.85.1 → 0.86.1（`npm install`，非本地路径）。
- `lib/session-title.test.mjs`：0.86.0 起Agent 把 `initialState.systemPrompt` 物化为
  transript 首条 `system` 消息（`createMutableAgentState` 仅在 messages 未以 system 开头时
  unshift）。标题临时 agent 的 provider 前缀因此多出 `system` 角色 —— 行为正确（系统提示
  照旧随请求发出），仅更新三个断言的角色序列与索引。
- `app/api/project-trust/route.test.mjs`：修复一个**与本次升级无关的预存非密封测试**：
  allowed roots 派生自真实 `~/.pi/agent/sessions` 的会话 cwd，本机存在 `cwd:"/tmp"` 的历史
  会话，导致 mkdtemp 目录在 allow 之前就落在 allowed root 内 → 期望 403 实得 200。修复：
  在导入前把 `PI_AGENT_HOME`/`PI_CODING_AGENT_DIR` 指向一次性临时目录（两者均为调用时读取）。
- `lib/web-slash-commands.ts`：头部注释版本号 0.85.1 → 0.86.1。列表内容无需变化：与 0.86.1
  `BUILTIN_SLASH_COMMANDS` 对照，web 等价命令全部仍存在；新增 builtin（`bug`/`clone`/
  `share`/`import`/`scoped-models`/`changelog`/`quit`）无 Web 等价，`/login meta` 走动态
  provider 列表。

## 0.86.0 破坏性变更核对（对本仓库的影响）

- pi-ai provider 流输入 `Context` → `TranscriptContext`：本仓库不自定义 provider，
  `streamFn` 仅透传 `source.streamFunction`，不受影响。
- `ToolCall.arguments`/`ToolResultMessage.details` 收紧为 JSON 值、`ToolResultMessage` 变
  条件类型、`JsonValue` 数组 readonly：`tsc --noEmit` 全绿即证无类型冲突。
- `user_bash` fail-closed：本仓库未注册该扩展钩子。
- `PlainTextTheme` stub（0.85.1 引入的兼容层）无需改动：0.86.1 `Theme` 构造器的 fallback
  键集不变（`scrollbarTrack ?? muted`、`searchMatchBg ?? selectedBg` 等），stub 提供的
  `muted`/`text`/`thinkingXhigh`/`selectedBg` 仍覆盖全部派生路径。

## 验证结果（node_modules 确认为 0.86.1）

- `tsc --noEmit`、`npm run lint`（含 branding）通过。
- `npm test` 588/588（含上述两处测试修复）。
- 运行冒烟（临时 30199 端口 dev server，已停）：`/api/home`、`/api/models`（模型注册表
  正常加载）、`/api/sessions`（583 个会话扫描正常）、`/api/auth/providers`、
  `/api/agent/running` 均正常，服务器日志无错误。
- 未覆盖：浏览器人工走查（fork/分支/压缩/多 provider）、真实模型两轮 prompt 冒烟。

## 遗留

- `src-tauri/resources/component-versions.json` 的 `pi` 组件仍为 0.84.4，属桌面发布元数据，
  按既定边界留给下次桌面发布（`release:manifest` 生成）。
