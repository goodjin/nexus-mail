# Nexus Mail v1.1 详细开发计划

## 文档信息
- **基线 PRD**: `docs/prd.md` v1.1
- **基线架构**: `docs/architecture.md`
- **目标**: 把架构约束拆成可直接进入实现的执行计划，尽量复用现有代码，而不是按旧方案重做一套系统。

## Request Type
**Architecture-aligned execution plan**。当前仓库已经有前后端骨架、Tauri commands、SQLite/FTS、Playwright 和 mock 流程，适合在既有实现上做**对齐式重构 + 缺口补齐**，而不是重写。

## Scope

### In
- 按 `architecture.md` v1.1 对齐账户上下文、多账户导航、账号异常修复、设置中心、搜索范围、撰写发送、空状态与隐私策略。
- 把计划落到当前真实目录与模块边界：
  - 前端: `src/App.tsx`, `src/context/AccountContext.tsx`, `src/hooks/useMailbox.ts`, `src/hooks/useSettings.ts`, `src/lib/tauri.ts`, `src/components/**/*`
  - 后端: `src-tauri/src/commands.rs`, `src-tauri/src/core/{database,sync_engine,security,imap_client,smtp_client,mock_client,traits}.rs`
- 补齐执行顺序、依赖关系、验收标准和明确排除项。

### Out
- 不新增 PRD/架构之外的产品能力，如统一收件箱、离线操作队列、IMAP IDLE、联系人系统、移动端适配、POP3/EWS。
- 不引入新的测试框架或重做目录结构。
- 不把 mock-only 方案升级成“必须先接真实第三方服务才能开发”的强依赖。

## 当前基线判断

| 现状 | 证据 | 计划含义 |
| --- | --- | --- |
| 前端已有多账户与侧栏骨架，但主键仍偏向 `email` | `src/context/AccountContext.tsx`, `src/hooks/useMailbox.ts` | 需要统一切到 `accountId-first` 契约，避免多账户上下文继续隐式化。 |
| 后端已有账户、搜索、发送、设置命令 | `src-tauri/src/commands.rs` | 新计划应以**收敛命令语义**为主，而不是发明新边界。 |
| 设置模型过窄，仅覆盖 theme 和少量布尔项 | `src/hooks/useSettings.ts`, `src/lib/tauri.ts` | 设置中心需要扩成 `AppSettings` 语义，而不是继续以散装 KV 为 UI 拼装。 |
| 旧 backlog 含离线队列/Outbox 倾向 | 原 `docs/detailed_backlog.md` | 与 v1.1“直接发送，失败保留草稿”冲突，必须移除。 |
| mock 层已承担前端开发闭环 | `src/lib/tauri.ts` | 所有新 command / DTO / 状态都必须同步补 mock。 |

## Sequencing

### Batch A：基础契约层
1. 任务 1

### Batch B：可并行功能层
1. 任务 2
2. 任务 3
3. 任务 4
4. 任务 5

### Batch C：依赖功能层
1. 任务 6
2. 任务 7

### Batch D：集成收口
1. 任务 8

并行原则：
- **任务 2 / 3 / 4 / 5** 可在任务 1 完成后并行。
- **任务 6** 依赖任务 3；**任务 7** 依赖任务 3 与任务 5。
- **任务 8** 依赖全部功能任务完成。

## Plan

1. **冻结账户上下文与数据契约**
   - **Goal**: 统一前后端的账户标识、设置模型、命令参数命名和状态字段，避免后续每个功能各自补丁式对齐。
   - **Likely Areas**: `src-tauri/src/core/database.rs`, `src-tauri/src/core/traits.rs`, `src-tauri/src/commands.rs`, `src/context/AccountContext.tsx`, `src/hooks/useMailbox.ts`, `src/hooks/useSettings.ts`, `src/lib/tauri.ts`
   - **Depends on**: 无
   - **Acceptance**:
     - `Account` 至少能表达 `id / email / displayName / syncInterval / status / lastError / lastSync`
     - 搜索、同步、发送、设置相关 command 的参数风格统一，新增字段在 mock 层同步可用
     - 前端状态层不再把 `email` 当作唯一业务主键
     - 形成兼容迁移策略：先兼容旧返回结构，再切 UI 调用，最后清理旧字段依赖
   - **Must not**:
     - 不同时重做数据库引擎或引入新 ORM
     - 不在这一任务里实现具体 UI 行为

2. **账户接入与异常修复闭环**
   - **Goal**: 把“添加账户 → 自动发现/手动配置 → 测试连接 → 保存 → 错误标记 → 修复”做成完整链路。
   - **Likely Areas**: `src/components/settings/SettingsModal.tsx`, `src/components/layout/Sidebar.tsx`, `src/context/AccountContext.tsx`, `src/App.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/core/{database,security,imap_client,smtp_client}.rs`
   - **Depends on**: 任务 1
   - **Acceptance**:
     - 设置中心支持自动发现失败后切换手动配置
     - 账户错误状态来自后端 `status/lastError`，而不是仅靠前端字符串猜测
     - 侧栏与设置页都能展示账户错误标记并进入修复流程
     - 重新认证、更新密码、编辑服务器配置至少有一条完整恢复路径
   - **Must not**:
     - 不引入统一收件箱
     - 不把账号修复埋进一次性 toast，必须有可回访入口

3. **设置中心与偏好服务扩容**
   - **Goal**: 把设置从散装 KV 提升到 `AppSettings` 级别，承接主题、删除确认、下载目录、远程图片策略、搜索历史上限和同步间隔。
   - **Likely Areas**: `src/hooks/useSettings.ts`, `src/components/settings/SettingsModal.tsx`, `src/components/mail/SettingsModal.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/core/database.rs`, `src/lib/tauri.ts`
   - **Depends on**: 任务 1
   - **Acceptance**:
     - `getAppSettings/updateAppSettings/refreshAccountNow` 或等价 typed contract 成立
     - 主题模式支持 `light / dark / system`
     - 删除确认和远程图片策略为可持久化设置
     - 下载目录与同步间隔具备前后端闭环，不只是 UI 占位
   - **Must not**:
     - 不继续扩散 `Record<string, string>` 直接驱动 UI 的模式
     - 不把临时“本邮件允许加载远程图片”错误落成全局持久化设置

4. **邮箱导航、搜索范围与空状态重构**
   - **Goal**: 让侧栏、列表、搜索态、空状态与同步反馈符合 v1.1 的信息架构。
   - **Likely Areas**: `src/App.tsx`, `src/hooks/useMailbox.ts`, `src/components/layout/Sidebar.tsx`, `src/components/mail/EmailList.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/core/database.rs`, `src/lib/tauri.ts`
   - **Depends on**: 任务 1
   - **Acceptance**:
     - 左侧按账户分组展示文件夹，当前账户上下文始终明确
     - 搜索支持“当前文件夹 / 当前账户 / 所有账户”三档范围
     - 顶栏只承担搜索输入，过滤器与结果摘要在结果区顶部
     - 无账号、空文件夹、无搜索结果、列表加载失败四类状态各有独立 UI 和主操作
     - 列表区可显示同步中/同步失败/最近同步时间
   - **Must not**:
     - 不把搜索过滤器继续堆回顶栏
     - 不让空状态只剩一句文案而没有主操作

5. **邮件详情、附件与隐私策略**
   - **Goal**: 把详情页的加载态、远程图片策略、附件下载/预览、悬停预览边界收紧到架构定义。
   - **Likely Areas**: `src/components/mail/EmailDetail.tsx`, `src/components/mail/EmailList.tsx`, `src/hooks/useMailbox.ts`, `src-tauri/src/commands.rs`, `src-tauri/src/core/{database,imap_client}.rs`, `src/lib/tauri.ts`
   - **Depends on**: 任务 1
   - **Acceptance**:
     - HTML 渲染继续走净化链路
     - 远程图片加载遵循 `remoteImagePolicy`，并支持当前邮件临时允许
     - 附件下载形成真实闭环；图片/PDF 支持预览，其余类型至少支持下载
     - 邮件列表悬停预览只做 peek，不覆盖右侧详情
     - 详情失败时显示失败原因和恢复动作
   - **Must not**:
     - 不默认放开所有远程图片
     - 不把附件能力仅停留在“显示文件名”

6. **撰写、回复/转发与直接发送模型**
   - **Goal**: 对齐 v1.1 的 direct-send 模型，补齐可见发件账号、草稿保护、失败恢复和回复/转发继承逻辑。
   - **Likely Areas**: `src/components/mail/ComposeModal.tsx`, `src/components/mail/RichTextEditor.tsx`, `src/App.tsx`, `src/context/AccountContext.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/core/{smtp_client,database,traits}.rs`, `src/lib/tauri.ts`
   - **Depends on**: 任务 1, 任务 3
   - **Acceptance**:
     - 多账户下撰写器顶部始终显示并允许切换发件账号
     - 回复/转发默认继承原邮件账户上下文
     - 关闭窗口、切换页面或发送失败时，都能保住未发送内容
     - 发送成功写入已发送；发送失败保留草稿并返回可重试原因
     - 计划中不再出现 Outbox / pending send queue 语义
   - **Must not**:
     - 不引入离线发送队列
     - 不依赖“最后一次选中的账户”推断 from account

7. **组织管理与快捷键收口**
   - **Goal**: 在新导航和搜索模型稳定后，补齐批量操作、移动/归档/删除一致性以及快捷键覆盖。
   - **Likely Areas**: `src/components/mail/EmailList.tsx`, `src/App.tsx`, `src/hooks/useMailbox.ts`, `src/components/layout/Sidebar.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/core/{sync_engine,database,imap_client}.rs`
   - **Depends on**: 任务 4, 任务 5
   - **Acceptance**:
     - 多选状态下详情保持最后一次显式点击的邮件
     - 删除、归档、移动、已读/未读、旗标在单封和批量场景语义一致
     - 删除前确认开关受设置中心控制
     - 快捷键不与输入态冲突，覆盖新建、搜索、设置、同步及基础组织操作
   - **Must not**:
     - 不让批量工具栏和搜索/过滤区域重叠
     - 不在快捷键层引入平台特化分叉逻辑作为首版前提

8. **Mock、测试与集成验证收口**
   - **Goal**: 让所有新契约在 mock、单元测试、E2E 和构建路径中都可验证，避免计划落地后只在聊天里自洽。
   - **Likely Areas**: `src/lib/tauri.ts`, `e2e/**/*.ts`, `src-tauri/src/core/**/*.rs`, `src-tauri/src/commands.rs`, `package.json`
   - **Depends on**: 任务 2 ~ 7
   - **Acceptance**:
     - mock 层支持新增账户状态、设置项、搜索范围、发送失败与空状态场景
     - Rust 单元测试覆盖账户状态、设置默认值、搜索范围和发送失败草稿保留
     - Playwright 覆盖：无账号引导、账户修复、搜索范围切换、发件账号可见、发送失败恢复
     - 继续使用仓库已有验证路径：`npm run build`、`npm run test:e2e`、`npm run test:visual`、Rust 测试
   - **Must not**:
     - 不新增测试框架
     - 不跳过 mock 层直接让前端依赖真实外部服务

## Assumptions
- 当前代码库已经具备 MVP 级账户、列表、详情、搜索、发送与设置能力，本计划以**对齐式完善**为主。
- `src/lib/tauri.ts` 会继续承担浏览器环境 mock 适配层。
- `commands.rs` 短期内仍是主命令入口，暂不强制拆分成多文件模块。
- 前端仍以 React + hooks + context 为主，不额外引入全局状态库。

## Risks
- **账户标识迁移风险高**：从 `email` 切到 `accountId` 会波及前后端和 mock，必须先做兼容层再清旧字段。
- **设置模型扩容易碎**：当前 `Record<string, string>` 使用面较广，直接硬切会让 UI 和 mock 同时破裂。
- **搜索范围切换影响面大**：列表、搜索历史、FTS 查询和空状态都会受影响，不能只改前端筛选。
- **撰写保护容易遗漏**：关闭、切换、失败恢复、回复/转发继承都在不同组件路径上，必须统一状态机语义。

## Open Decisions
- **无阻塞性开放决策**。架构文档已经明确：
  - v1 使用**按账户分组浏览**，不是统一收件箱
  - v1 使用**直接发送**，不是 Outbox 队列
  - 设置中心承接主题、同步、隐私与账号修复

执行时若要变更以上三项，必须先回改 `docs/prd.md` 与 `docs/architecture.md`，再重排本计划。
