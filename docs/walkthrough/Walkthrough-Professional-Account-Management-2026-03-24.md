# Walkthrough - Professional Account Management & Security Hardening (M36) - 2026-03-24

本阶段完成了从“演示模式”向“专业邮件客户端”的转变，实现了完整的账户管理系统、多协议 TLS 支持以及更严谨的安全性。

## 主要变更

### 1. 数据库架构升级 (Schema Evolution)
`accounts` 表已扩展，支持存储 IMAP 和 SMTP 的加密安全首选项。
- **新增字段**: `imap_use_tls` (BOOL), `smtp_use_tls` (BOOL)。
- **持久化**: 自动处理老版本数据库的迁移。

### 2. 后端核心重构 (Backend Core)
- **Security Service**: 彻底移除 `demo@nexus-mail.com` 的默认密码回退逻辑。现在所有账户必须显式存储凭据，确保流程真实。
- **Mail Clients**: `RealImapClient` 和 `RealSmtpClient` 均已更新，能够根据用户配置动态选择是否启用 TLS/SSL 加密，不再硬编码 993/465 端口的逻辑。
- **Sync Engine**: 同步流程已适配新的账户模型，支持更灵活的端口与安全配置。

### 3. Tauri 命令扩展 (IPC Bridge)
新增了以下管理接口：
- `get_accounts_detailed`: 返回包含所有服务器配置的账户列表。
- `update_account_details`: 更新显示名称、主机名、端口及安全设置。
- `update_account_password`: 独立的安全接口，用于更新加密存储中的账户密码。

### 4. 前端设置界面重构 (Settings UI)
设置模态框已升级为标签式界面：
- **常规设置**: 保留原有的同步频率等全局配置。
- **账户管理**: 
    - 列表展示所有已配置账户。
    - 提供详细的编辑表单（主机、端口、TLS 开关）。
    - 支持实时修改账户名称及密码（安全输入）。

## 验证结果

### 自动化测试
共执行 12 项后端单元测试，涵盖了：
- **隔离性**: 验证多账户间数据的严格隔离。
- **安全性**: 
    - 验证丢失密码时操作报错（不再自动恢复）。
    - 验证密码存储与检索的正确性。
- **客户端逻辑**: 验证 SMTP 客户端在无密码时的阻断逻辑。

```bash
running 12 tests
test commands::tests::test_get_accounts ... ok
test core::database::tests::test_db_initialization ... ok
test core::database::tests::test_upsert_logic ... ok
test core::sync_engine::tests::test_sync_no_new_emails ... ok
test core::sync_engine::tests::test_incremental_sync_with_mock ... ok
test core::database::tests::test_fts_search ... ok
test core::database::tests::test_multi_account_isolation ... ok
test core::security::tests::test_print_real_store ... ok
test core::security::tests::test_password_not_found ... ok
test core::smtp_client::tests::test_send_email_fails_without_password ... ok
test core::smtp_client::tests::test_send_email_with_password ... ok
test core::security::tests::test_custom_security_ops ... ok

test result: ok. 12 passed; 0 failed
```

---
> [!IMPORTANT]
> 由于 demo 回退逻辑已移除，初次运行建议进入“账户设置”更新一次密码，或重新运行 `Dev Seed` 以初始化加密凭据。
