# Nexus Mail 数据库与同步引擎初步集成验证

本项目后端架构已完成从协议抓取到本地持久化的全链路打通。

## 验证项与结果

- [x] **数据库 Schema (SQLite)**
    - 成功设计并初始化了 `accounts` (账户), `folders` (文件夹), `emails` (邮件), `attachments` (附件) 表。
    - **Upsert 支持**: 实现了基于唯一约束的增量更新逻辑，支持重复同步而不产生冗余数据。
- [x] **同步引擎 (SyncEngine)**
    - 成功实现了 `init_sync` 指令，能够协调 `MailClient` Trait 抓取数据并自动存入数据库。
- [x] **Mock 集成测试**
    - **测试通过**: 运行 `cargo test` 成功验证：从 `MockMailClient` 抓取到的文件夹及账户信息已正确持久化到本地（内存）数据库。

## 核心代码
- [database.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/core/database.rs) (存储层核心)
- [sync_engine.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/core/sync_engine.rs) (业务逻辑核心)
- [traits.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/core/traits.rs) (抽象协议定义)

## 下步计划
- 将先前调通的真实 `imap_client` 和 `smtp_client` 封装进对应的 Trait。
- 实现 `Keyring` 凭据管理，确保存储安全性。
