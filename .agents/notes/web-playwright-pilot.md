# Web Playwright 试点：无模型会话的浏览器闭环

状态：首条路径已落地并连续三次通过（2026-09-16）。落地形态为纯 Playwright CLI（`npm run test:e2e`），不依赖任何编辑器/MCP 集成，任何 agent 或 CI 用同一条命令验证。

## 已实施结果

- 文件：`playwright.config.ts`、`tests/e2e/sandbox.ts`、`tests/e2e/global-setup.ts`、`tests/e2e/bash-session.spec.ts`；`package.json` 加 `test:e2e`；`.gitignore`/`eslint.config.mjs` 忽略 `.next-e2e/`、`playwright-report/`、`test-results/`。
- 隔离：沙箱 `/tmp/pi-web-e2e`（`HOME`、`PI_CODING_AGENT_DIR`、cwd 全在其中），`PI_OFFLINE=1`，每次运行前清空；断言 `session.path` 落在沙箱 agent dir 内，未触及真实 `~/.pi`。
- 并存：测试服务器用 30142 + `distDir=.next-e2e`（`next.config.ts` 读 `PI_WEB_DIST_DIR`，仅此一处为测试而加），与开发者已在 30141 运行的 `next dev` 互不干扰，不杀非测试进程。
- 断言三件套：浏览器内 bash 块展开后可见唯一标记；`/api/sessions` 按 cwd 关联到 session id；磁盘 JSONL 含该标记；再以 `?session=` 重开仍可见。
- 结果：`npx playwright test` ×3 全绿（约 5.3s/条）；`npm test` 507 通过、`tsc --noEmit` 干净、`npm run lint` 通过。浏览器为 Playwright 自带 Chromium；`PW_CHANNEL=chrome` 可切本机 Chrome。
- 实现细节坑：UI 用 `?cwd=` 直接建新会话，免去目录选择器交互；bash 结果默认折叠，展开需点击工具块头部，且转录重载会重置展开状态，故用重试式展开断言。

## 目标与判定

通过一次真实浏览器操作，证明 `npm run web` (Next dev) -> Web UI -> `/api/agent/new` -> in-process Pi SDK -> JSONL -> `/api/sessions` -> 刷新恢复的闭环。用 `!printf <唯一标记>` 作为输入：`hooks/useAgentSession.ts` 把 `!` 命令送到 `executeBash`，`lib/rpc-manager.ts` 执行并为仅有 Bash 的会话落盘。此路径不需要 provider 凭据、不消费 token，也不伪造 SDK 或拦截应用 API。

验收：一条 Playwright 测试从空白浏览器打开新会话，选择临时 cwd，发送 `!printf`，等待命令及输出在 UI 中出现；确认对应的临时 agent dir 下出现 JSONL、经会话读取 API 可查到唯一标记；刷新页面或重新从侧栏打开该会话，标记仍可见。至少连续运行两次均通过；失败有截图、trace 和服务端日志。没有真实浏览器断言/API 验证/落盘验证三者中的任一项，都不算完成。

## 范围

- 仅浏览器 Web profile（WSL/Linux 开发环境首先验证）；不测 Tauri、构建产物或远程部署。
- 首条测试只覆盖 Bash-only 会话创建、执行、列表及恢复。暂不测模型 prompt、流式 tool call、fork、分支、压缩、取消、扩展 UI、跨 provider thinking；它们不能从这条绿色测试推出通过。
- 不用 `next build`；不更改生产逻辑来配合测试。若发现真实缺陷，另补定向回归及最小修复。

## 落地步骤

1. 增加 `@playwright/test` 为开发依赖并锁定 npm lock；加 `test:e2e` 命令、`playwright.config.ts` 和一条测试（例如 `tests/e2e/bash-session.spec.ts`）。优先使用 Playwright 自带 Chromium 保证 CI 可重复；本机可先使用现有 `/usr/bin/google-chrome` 验证 runner，但不能让项目长期依赖单机路径。将 `playwright-report/`、`test-results/` 等产物忽略。
2. 测试 runner 创建独立临时 HOME、`PI_CODING_AGENT_DIR`、cwd 和浏览器 context。设置 `PI_OFFLINE=1`，禁用浏览器自动打开；不要读取或复制真实 `~/.pi/agent`、auth.json、项目扩展及真实 workspace。配置好清理策略：仅清理测试自己创建的临时目录，失败时保留 trace/log；日志不得包含凭据。
3. 使用 Playwright `webServer` 或等效的受控子进程启动 `npm run web -- --no-open -p <空闲端口>`，绑定 127.0.0.1；等待健康响应，禁止复用其他开发服务。Next dev 同一 checkout 共享 `.next` 锁，若已有 `next dev` 在运行，先提示并停用或采用独立 checkout / 独立 distDir，不强行启动第二个，也不杀非测试进程。仅终止测试启动的进程。
4. 测试通过可访问的 UI 定位器选择临时 cwd 并发送 Bash 命令，用唯一标记断言输出；用响应/session id 关联磁盘 JSONL，避免靠文件数或固定延时推断结果。`expect.poll` 等待会话写入和侧栏刷新，使用语义定位器而非 CSS 层级。刷新后再次确认相同会话 id 和标记。若空凭据的会话启动本身失败，记录复现并定位 SDK 初始化条件，不偷偷接入个人配置或真实模型。
5. 先跑单条测试两次，再跑 `npm test`、`tsc --noEmit`、`npm run lint`，确认未污染现有配置与会话。记录命令、浏览器版本、执行时间和隔离目录验证结果。

## 后续扩展门槛

首条路径稳定后再增加可控的本地模型接口夹具（真正经过 Pi provider/SDK，不使用 Playwright route mock 假装模型成功），并逐步覆盖流式事件/工具调用、取消、自动压缩与 fork。先确认测试 provider 能准确模拟 streaming、usage 和工具协议；不能模拟的行为保留为真实 provider 的可选冒烟测试，标记凭据和费用前提，不能称作离线确定性回归。每类行为分别断言浏览器状态、服务端会话状态及 JSONL，避免只看 API 200。

## 风险与停机条件

- `PI_CODING_AGENT_DIR` 隔离配置及会话，但仍要验证路径和 HOME 是否被各读取路径尊重；发现触及真实用户目录时立即停测。
- Next dev 启动冷时较慢，用有界超时和失败诊断，不以 `sleep` 代替就绪检查。
- Playwright 浏览器下载可能受网络限制。本机 Chrome 可用于先验证方法；CI 浏览器安装/缓存另配，不把单机路径提交为唯一方案。
- 如果 Bash-only 流程无法代表浏览器建会话/恢复，请收缩或修正断言，不为了让测试绿而绕过 UI；模型相关路径留给第二阶段。
