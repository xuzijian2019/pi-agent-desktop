# Fork 改动盘点与回流（upstreaming）计划

状态：2026-10-04 盘点。基线：`upstream/main`（abcwyc/pi-agent-desktop）= f66ba13 之后 3 个提交；
`pi-web-upstream/main`（agegr/pi-web）= 6fcd7d4 (v0.10.0)，已完整包含在我们和 abcwyc 的历史里。

## 分歧规模

| 对比对象 | 领先提交 | 落后提交 | diff |
|---|---|---|---|
| abcwyc/pi-agent-desktop | 132（非 merge） | 3（#71 staging、#72 Windows 覆盖安装、0.5.2 release） | 220 文件 / +20.6k −8.3k |
| agegr/pi-web | 同上 + abcwyc 全部桌面层 | 0 | 422 文件 / +53k −11.5k |

三层归属：pi-web 拥有 Web UI 与 SDK 适配；abcwyc 拥有 Tauri 壳、打包、发布、桌面设置；
本 fork 在其上加了 **浏览器 profile / workbench / 设计语言重做 / e2e 基建 / 一批 chat 修复**。

## 改动分组（按可回流性）

### A. 独立 bug fix —— 直接 PR 到 pi-web（文件全是 pi-web 自有）
| 提交 | 内容 | 备注 |
|---|---|---|
| 45ffe69 | pi 先发 system-prompt 更新时不重复用户 prompt（`lib/prompt-recovery.ts`） | SDK 行为相关，pi-web 很可能同样中招 |
| 56e19a5 | agent turn 进行中更新 context usage | |
| 98fa1ae / b861b16 | 流式输出跟随不跳视口、prompt anchor 尺寸稳定 | `components/prompt-anchor.ts` |
| fdc6eb3 | 尊重模型配置的 thinking effort 等级（`lib/thinking-level-options.ts`） | pi-web 无 clamp 逻辑 |
| 33bcd07 / 0e0a78b | 图片预览不溢出 composer；项目下拉保持在视口内 | |
| b8f2965 | 语法高亮背景样式冲突 | |
| 85f443d | edit tool 优先 + stream block 守卫 | 需拆：tool-presets 部分是 fork 概念 |
| 5589022 | 本地文件链接在文件面板打开 | |
| c258f08 | 侧栏打开状态跨 mobile 断点保留 | |
| 2166e48 / 6295701 | 项目标题点击只展开；"Session actions" aria 标签 | |
| 1637614 / 5b9b03e | 缺失 cwd 当状态而非错误；项目目录已删除的 missing-folder 流程 | `lib/missing-folder.ts` + `MissingFolderNotice.tsx` 独立可移植 |
| 7434a68 | 空闲 API 轮询合并、watcher 404/403 不再重连（`lib/web-ui-client.ts` + FileExplorer 守卫） | pi-web 的轮询是它自己的，收益直接 |
| d9097fc | branch-summary 锁按 session 作用域 | **已进 abcwyc #74**，pi-web 同样有这段代码，应再发一份 |
| 9931628 | markdown 表格按聊天宽度换行 | pi-web 开放 PR #1056 (uvforce) 同题，先评论/对比 |
| 73c1947 | 模型菜单外点关闭；恢复图片选择器 | 需确认是否 fork 重构引入的回归 |
| batch 1-3 的 `lib/draft-store.ts`、`lib/session-data-cache.ts`（prefetch 超时、"最新点击赢"） | 草稿持久化、选择竞态 | 纯逻辑，pi-web 直接受益 |

### B. 通用小功能 —— 先开 discussion/issue 再 PR 到 pi-web
- 18ddf1d 大段粘贴折成 fenced block chip（`lib/pasted-text.ts`）
- 785e0f0 图片 lightbox（`ImageLightbox.tsx`）
- e213976 write tool 内容按源码渲染（`lib/write-tool-display.ts`）
- abb359f effort/tool preset 跨 session 记忆（`app-prefs`）
- 2f.. 自动命名新 session + 项目路径 hover 条（b770bab）
- 81da647 全文 transcript 搜索（服务端索引 + 精确跳转）——体量大，先 issue 问意向
- 840818c `/side` `/btw` `/recap` 临时只读子会话（`lib/ephemeral-session.ts`, `app/api/ephemeral`）——概念新，先 discussion
- TabBar a11y、FileExplorer 选中态、useTheme 跟随系统（已在 fork-ownership 记为"upstreaming declined"→ 复查是否当时问过 pi-web 还是 abcwyc）

### C. 桌面/构建层 —— PR 到 abcwyc
- 0c53ad4 / 7cd53c5 `npm run web` + WSL 浏览器 handoff（**PR #68 已开，待 review**）
- 336b790 Tauri JS 插件版本钉到 Cargo 版本（`release-workflows.test.mjs`）—— abcwyc v0.4.7 就是这么挂的，高价值
- 42ac94b dev 端口回收（`scripts/web-dev.mjs`）
- 7193faf 浏览器构建下显示 web 包版本/tagline（`lib/branding.ts`）
- tests/e2e Playwright 基建（沙箱 `/tmp/pi-web-e2e`、30142、`PI_OFFLINE`）——两家都没有；abcwyc 已有 CI，更可能接受
- Windows WSL2 MVP scope note —— 对应 abcwyc issue #44/#55，可作为 discussion

### D. fork 产品决策 —— 不回流（保留为 fork 差异）
- 右侧 workbench 整套（Activity/Saved Tasks/Search/Files 合并 Changes+Pinned、Send preview、BranchControl git 唯一入口）
- 删除 Browser/Diff/Outputs 面板、Session stats、Full history、topbar Tools/More、两处侧栏 git 切换器
- `native-theme.css` 设计语言（+3.6k 行）、inline style → class 全量转换、radius/focus/motion token
- 项目树侧栏 + 全高布局、ProjectPicker/path-ui 抽出
- 删除完成音（useAudio）、品牌头
- `.agents/notes`、ownership/drift 工具链、upstream-merge skill

## 待办顺序建议
1. 先 merge abcwyc 落后的 3 个提交（#71 Code mode staging、#72 Windows 覆盖安装），否则下次 desktop 发布会踩同样问题。
2. 推 PR #68 完成 review；补 336b790（插件版本钉）到 abcwyc。
3. 对 A 组逐条 `git diff pi-web-upstream/main -- <files>` 验证仍可复现，再在 pi-web 开 PR（一 PR 一 fix；每条带 `.test.mjs`）。先查重：#1056 表格、#1033 composer 高度。
4. B 组按价值挑 2-3 个开 issue 探意向（pasted-text、lightbox、auto-name）。

## Issue 索引（xuzijian2019/pi-agent-desktop）

- #2 [pi-web] system-prompt 更新先于用户消息到达时，用户 prompt 被重复显示
- #3 [pi-web] agent turn 进行中不更新 context usage
- #4 [pi-web] 流式输出跟随时视口跳动；prompt anchor 尺寸不稳定
- #5 [pi-web] effort 选择器未按模型支持的 thinking 等级过滤
- #6 [pi-web] 图片附件预览溢出 composer
- #7 [pi-web] 项目下拉菜单超出视口；缺少完整路径 hover
- #8 [pi-web] 语法高亮背景与代码块背景样式冲突
- #9 [pi-web] 消息中的本地文件链接应在文件面板打开而非外部浏览器
- #10 [pi-web] 关闭 mobile 抽屉后桌面侧栏也被隐藏
- #11 [pi-web] 侧栏：项目标题点击误开新会话；行菜单 aria-label 错误
- #12 [pi-web] 项目目录已删除时整个 UI 403；应降级为状态而非错误
- #13 [pi-web] 空闲时 /api 轮询过多；watch-dir EventSource 对 403/404 无限重连
- #14 [pi-web] 草稿持久化丢失；旧的会话点击覆盖 New Session
- #15 [pi-web] Markdown 表格单元格按聊天宽度换行而非 max-content
- #16 [pi-web] 模型菜单点击外部不关闭；图片选择器按钮缺失
- #17 [pi-web] edit 工具结果优先展示；流式 block 守卫
- #18 [pi-web][feature] 大段粘贴文本折叠成 chip，发送时展开为 fenced block
- #19 [pi-web][feature] 聊天内图片 lightbox
- #20 [pi-web][feature] write 工具内容按文件语言高亮渲染
- #21 [pi-web][feature] 新会话继承上次选择的 effort 等级与 tool preset
- #22 [pi-web][feature] 新会话首轮后自动生成标题
- #23 [pi-web][feature] 全文 transcript 搜索与精确跳转
- #24 [pi-web][feature] /side /btw /recap：基于当前会话快照的临时只读子对话
- #25 [pi-web][feature] 文件资源管理器选中态高亮；git 状态颜色走 CSS 变量
- #26 [abcwyc] 推进 PR #68：npm run web / WSL 浏览器 handoff
- #27 [abcwyc] 把 Tauri JS 插件版本钉到 src-tauri/Cargo.lock 的 crate 版本
- #28 [abcwyc] Playwright 浏览器 e2e 基建（沙箱、独立端口、PI_OFFLINE）
- #29 [abcwyc] 浏览器构建下 Settings 显示 web 包版本与不含 'desktop app' 的 tagline
- #30 [abcwyc] Windows + WSL2 agent runtime 的 MVP 范围讨论
- #31 [chore] 合并 abcwyc 落后的 3 个提交（#71 Code mode staging、#72 Windows 覆盖安装、0.5.2）
