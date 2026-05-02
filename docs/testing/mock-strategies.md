# Mock Strategies

本文档描述 Nexus Mail 当前测试体系中的 Mock 策略与约束，确保 Mock 稳定但不过度掩盖真实风险。

## 依赖清单

| 依赖 | 测试层级 | 方案 | 原因 |
| --- | --- | --- | --- |
| Tauri invoke/IPC | E2E | 浏览器模式下 `src/lib/tauri.ts` mock | Web 环境无法调用真实 Tauri API |
| IMAP/SMTP 服务器 | Rust 单元/集成 | `core/test_servers.rs` + TLS mismatch test | 需要稳定模拟协议连接失败 |
| 邮件同步 / 账户数据 | E2E | localStorage mock 数据（`MOCK_ACCOUNTS_KEY` 等） | UI 测试需快速可控数据源 |
| 发送邮件 | E2E | `MOCK_SEND_EMAIL_KEY` 存 payload | 验证发送行为与失败路径 |
| 搜索/过滤/历史 | E2E | 内存 + localStorage 模拟 | 保持可复现行为 |
| 设置/主题 | E2E | `MOCK_SETTINGS_KEY` | 设置需可持久化与重置 |
| 文件下载 | E2E | `get_attachment` 返回字节数组 | 浏览器环境不支持真实对话框 |

## 必须保真的行为

- **错误分支**：`test_account_connection` 对 IMAP 登录/连接失败、SMTP 连接失败必须真实抛错路径。
- **同步行为**：`sync_account` 需触发 unread 变化与错误提示分支。
- **安全渲染**：返回的 `body_html` 必须包含恶意 payload，确保 DOMPurify 生效。
- **附件存在性**：列表/详情的 attachments 显示需与 mock 数据一致。

## 可以简化的行为

- IMAP/SMTP 实际协议通信细节（E2E 中以 mock 为准）
- 真实网络超时与重试策略（E2E 中可用可配置 timeout 代替）
- 消息体复杂 MIME 结构（E2E 中用固定附件元数据代替）

## 测试数据策略

- **账户**：默认 `demo@nexus-mail.com`，可通过 `update_account_details` 添加多账户。
- **邮件列表**：按 `folderKey` 与 `syncEmailSubjectPrefix` 生成 100 条记录，支持空文件夹。
- **附件**：样例 `uid=100` 强制包含附件与 XSS payload；`uid=99` 用于空正文兜底。
- **搜索**：`nomatch` 关键字返回空结果；历史最多 10 条。

## 风险说明

- Web mock 与真实 Tauri/IMAP 链路仍有差距，关键链路需补充 Tauri 集成测试。
- 视觉回归依赖基线截图，UI 调整后必须显式更新快照，避免误判。
- 多账户与设置弹窗路径需避免选择器歧义（严格模式下容易报错）。
