# Nexus Mail 测试规范与质量标准 (v1.0)

本文档定义了 Nexus Mail 项目的测试分层结构、命名规范及全场景覆盖要求，旨在确保从底层逻辑到用户交互的 100% 可靠性。

## 1. 测试分层体系 (Testing Pyramid)

### 1.1 后端单元测试 (Rust Unit Tests)
- **目标**: 验证独立函数和逻辑块的正确性。
- **范围**: `SecurityService` (加解密), `Database` (CRUD 逻辑), `IMAP/SMTP Parser` (协议解析)。
- **规范**: 放在文件底部的 `mod tests` 中。严禁依赖外部网络，必须使用 Mock。

### 1.2 后端集成测试 (Rust Integration Tests)
- **目标**: 验证多个模块间的协作（如 DB + SyncEngine）。
- **范围**: `SyncEngine` 同步流、多账号隔离。
- **工具**: `cargo test`。必须启动 `MockServers` 以模拟真实的 Socket 交互。

### 1.3 前端组件测试 (React Vitest)
- **目标**: 验证 UI 组件在不同 Props 下的状态渲染。
- **范围**: `Button`, `Badge`, `Card` 的样式与点击事件。
- **工具**: `Vitest`, `React Testing Library`。

### 1.4 端到端测试 (E2E & Flow Tests)
- **目标**: 验证核心业务流。
- **范围**: 
    - **首次运行流**: 启动 -> Seed 数据 -> 自动加载。
    - **同步流**: 点击刷新 -> 检查列表数据同步。
    - **写信流**: 填写内容 -> 发送 -> 验证成功反馈。
    - **附件流**: 选择附件 -> 查看列表 -> 删除附件。
- **工具**: `Playwright`。

### 1.5 视觉回归测试 (VRT)
- **目标**: 防止样式破坏。
- **范围**: 侧边栏布局、邮件列表选中态、模态框对齐及透明度。
- **工具**: `Playwright Screenshots`。

---

## 2. 全场景覆盖矩阵 (Scenario Matrix)

| 场景类型 | 覆盖点 | 测试策略 |
| :--- | :--- | :--- |
| **空状态** | 首次进入无账号、文件夹无邮件、搜索无结果。 | E2E + VRT |
| **异常防护** | 网络断开同步报错、密码错误、磁盘空间满（DB 失败）。 | Unit + E2E |
| **边界验证** | 写信不填收件人/主题、发送超大邮件、拉取 1000+ 邮件。 | E2E (Bench) |
| **用户交互** | 邮件列表选中态切换、模态框弹出/遮罩、附件删除按钮。 | Interaction (Playwright) |
| **数据一致性** | 删除邮件后本地与 Server 同步、未读数字实时更新。 | Integration |

---

## 3. 命名与代码规范

- **文件**: `[feature].spec.ts` (E2E), `[module]_test.rs` (Integration).
- **用例**: `should [expected_behavior] when [precondition]` (例如：`should_show_error_when_sending_empty_email`)。
- **断言**: 优先使用语义化断言（如 `toBeVisible`, `toHaveText`）。

---

## 4. 缺失用例审计 (Gap Audit)

通过该规范检查，目前项目缺失以下核心验证：
- [ ] **E2E**: `first_launch_flow`: 验证自动 Seed 后的首屏加载完整性。
- [ ] **E2E**: `compose_validation`: 验证写邮件时的空字段拦截及红色提示显示。
- [ ] **VRT**: `selected_state_vrt`: 专门针对选中邮件的背景色与文字对比度截图。
- [ ] **Integration**: `sync_consistency`: 验证同步后 Folder 的 `unread_count` 等于 Emails 数量。
- [ ] **E2E**: `attachment_interaction`: 点击附件图标、选择文件、显示并删除的操作流。
