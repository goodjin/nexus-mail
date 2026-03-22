# Nexus Mail 系统架构设计 (Architecture)

## 1. 整体分层架构图

```mermaid
graph TD
    subgraph Frontend [前端 - WebView (React/TS)]
        UI[UI Components - Spark 风格]
        Store[State Management - Zustand/Redux]
        IPC_Client[Tauri API / Invoke]
    end

    subgraph IPC_Bridge [通信层 - Tauri Command]
        Cmd[Tauri Commands]
        Evt[Tauri Events]
    end

    subgraph Backend [后端 - Rust Core]
        Sync[Sync Engine - 同步引擎]
        DB[Storage Service - SQLite/SQLCipher]
        Sec[Security Service - Keyring]
        
        subgraph Protocol_Layer [协议适配层]
            Trait[MailClient / MailSender Traits]
            Imap[IMAP Adaptor]
            Smtp[SMTP Adaptor]
            Mock[Mock Adaptor]
        end
    end

    subgraph External [外部依赖]
        Remote[IMAP/SMTP Servers]
        Keychain[OS Keychain]
        Disk[Local SQLite File]
    end

    %% 数据流向
    UI --> IPC_Client
    IPC_Client --> Cmd
    Cmd --> Sync
    Sync --> DB
    Sync --> Trait
    Trait --> Imap
    Trait --> Smtp
    Trait --> Mock
    Imap --> Remote
    Smtp --> Remote
    DB --> Disk
    Sec --> Keychain
```

---

## 2. 模块功能与边界定义

### 2.1 协议适配层 (Protocol Layer)
- **边界**: 仅处理 RFC 标准邮件协议。
- **功能**: 实现 `MailClient` 和 `MailSender` 接口，负责与远程服务器握手、登录及原始数据解析。
- **解耦**: 通过 Trait 适配，使得 `Sync Engine` 无需关心底层是 IMAP 还是 Mock 模式。

### 2.2 存储服务 (Storage Service)
- **边界**: 封装所有 SQL 逻辑，不直接暴露数据库连接。
- **功能**: 设计并维护 `accounts`, `folders`, `emails`, `attachments` 表。
- **特色**: 支持 `Upsert` 操作以配合增量同步。

### 2.3 同步引擎 (Sync Engine)
- **边界**: 业务逻辑的核心，协调协议层与存储层。
- **功能**: 定时轮询、增量抓取、状态同步（如标记已读）、操作队列管理。

### 2.4 安全服务 (Security Service)
- **边界**: 处理敏感凭据。
- **功能**: 集成系统密钥链，确保用户密码不以明文形式存储在数据库中。

---

## 3. 核心流程：初次同步 (Init Sync)
1. **Frontend**: 发起 `add_account` 指令。
2. **Backend**: 
   - 调用 `Security Service` 保存凭据。
   - `Sync Engine` 调用 `MailClient.connect()`。
   - 抓取文件夹结构并调用 `Storage Service` 持久化。
   - 开始后台增量同步任务。
3. **Frontend**: 接收到实时 Event，刷新文件夹列表。

---

## 4. 开发计划 (Roadmap) - 2026-03-20

- [x] **M1: 项目初始化与原型验证**
    - [x] Tauri + React 骨架搭建 (Done)
    - [x] IMAP/SMTP 基础连通性实验 (Done)
- [x] **M2: 架构抽象与 Mock 环境**
    - [x] 定义 `MailClient` / `MailSender` Traits (Done)
    - [x] 丰富 Mock 数据层实现 (Done)
- [/] **M3: 后端核心功能实现**
    - [x] SQLite 存储层基础表结构 (Done)
    - [x] 同步引擎初稿（文件夹同步）(Done)
    - [ ] **[Next]** 账户凭据安全存储 (Keyring 集成)
    - [ ] 增量拉取算法 (UID 管理)
    - [ ] 附件管理与缓存加密
    - [ ] 全文搜索索引 (FTS5)
- [ ] **M4: 前端卡片式 UI 开发**
    - [ ] 文件夹侧边栏与列表页
    - [ ] 邮件详情渲染 (HTML Sanitization)
    - [ ] 邮件撰写与发送界面
- [ ] **M5: 优化与发布**
    - [ ] 多重账户切换优化
    - [ ] 系统托盘与离线通知
    - [ ] 性能压测与跨平台打包
