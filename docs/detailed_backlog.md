# Nexus Mail 详细开发计划与技术对接方案

本文档详细列出了各模块的实现逻辑、对接方式及验证策略，用于指导后续开发。

---

## 1. 协议内核：真实客户端适配 (Real Adaptors)

### 1.1 `RealImapClient` (IMAP 适配器)
- **实现方式**: 包装 `imap` 库，管理 TCP/SSL 连接池。
- **对接方式**: 实现 `MailClient` Trait。
- **存储关联**: 抓取 `UID` 以支持增量同步。
- **验证方式**: 
    - 对真实网易/Gmail 服务器的连接测试。
    - 针对 `MailClient` Trait 的端到端异步单元测试。

### 1.2 `RealSmtpSender` (SMTP 适配器)
- **实现方式**: 包装 `lettre` 库。
- **对接方式**: 实现 `MailSender` Trait。
- **集成点**: 与 `Sync Engine` 的离线发送队列配合。
- **验证方式**: 使用 Mock 环境捕获发送流；实测端到端撰写并成功发件。

---

## 2. 数据引擎：同步逻辑与存储 (Sync & Storage)

### 2.1 账户凭据安全存储 (Security/Keyring)
- **实现方式**: 集成 `keyring-rs`。
- **存储逻辑**: 数据库仅存系统 UUID，密码存储在 macOS Keychain / Windows Credential Manager。
- **对接方式**: `SyncEngine` 在连接服务器前调取。
- **验证方式**: 编写脚本验证密码在磁盘文件（DB）中不可见，但在系统密钥链中可读取。

### 2.2 增量拉取算法 (Incremental Sync)
- **实现方式**: 
    - 使用 IMAP `UID FETCH [LAST_UID + 1: *]`。
    - 结合 `MODSEQ` (RFC 4551) 以检测服务器端状态变化（如已读/删除）。
- **对接方式**: 将差异数据批量存入 `Database` (Upsert)。
- **验证方式**: 手动在一台设备上将一封信标记为“已读”，验证 Nexus Mail 同步后本地数据库状态是否随之改变。

### 2.3 SQLite 全面加密 (SQLCipher)
- **实现方式**: 集成 `sqlx` 的 `sqlcipher` feature 或 `rusqlite`。
- **对接方式**: 在 `Database::new()` 时设置 `PRAGMA key = 'user_password_derived_key'`。
- **验证方式**: 尝试使用常规 SQLite 工具打开 `.db` 文件，确认为非法格式或加密。

### 2.4 全文检索索引 (FTS5 Search)
- **实现方式**: 
    - 建立 `emails_fts` 虚拟表。
    - 使用触发器 (Trigger) 在 `emails` 表插入/更新时同步更新索引。
- **功能**: 支持毫秒级的收信人、主题、正文搜索。
- **验证方式**: 插入 1000 封邮件，测试模糊匹配搜索的耗时。

---

## 3. 分发层：通信桥梁 (IPC & Commands)

### 3.1 Tauri 指令集合 (Tauri Commands)
- **对接方式**: 定义 `commands/mailbox.rs`。
- **核心接口**: 
    - `list_accounts()`: 返回本地所有已配置账户。
    - `sync_folder(folder_id)`: 触发特定文件夹同步。
    - `get_email_body(uid)`: 获取正文 HTML 及附件清单。
- **验证方式**: 编写 `src-tauri/tests/commands_test.rs` 使用 `tauri::test::mock_context` 进行模拟调用。

### 3.2 离线操作队列 (Offline Queue)
- **逻辑**: 如果当前无网络，删除/标记邮件操作先存入本地 `pending_ops` 表。
- **集成点**: 网络恢复后，`Sync Engine` 自动后台重试这些指令并同步至服务器。

---

## 4. UI 展现层：前端实现 (Frontend)

### 4.1 卡片式列表 (Mail Cards)
- **实现**: React + CSS Modules (Spark 风格)。
- **对接**: 通过 Tauri Event 接收 `sync_engine` 推送的增量更新，实现列表实时刷新。
- **验证**: 模拟 10,000 条邮件数据，测试滚动的帧率。

### 4.2 HTML 安全沙箱 (Sanitization)
- **重要性**: 防止邮件中的 JS 注入（XSS）。
- **实现**: 调用后端 Rust 的脚本（如 `html-sanitizer`）处理后再传给渲染器。
- **验证**: 构造包含 `<script>` 标签的恶意 Mock 邮件，验证预览时脚本已被过滤。

---

## 5. 项目检查点 (Verification Checklist)

- [ ] [P0] 数据库加密开启，密码存入系统 Keychain。
- [ ] [P0] 真实 IMAP 能够按 UID 增量抓取最新邮件并保存。
- [ ] [P1] 离线状态下标记已读，联网后服务器状态同步。
- [ ] [P1] 搜索功能支持按发件人子串或主题关键词秒级返回。
- [ ] [P1] 附件可以从 IMAP 下载并正确缓存在本地。

**确认后，我将按照这个顺序开始各个击破。**
