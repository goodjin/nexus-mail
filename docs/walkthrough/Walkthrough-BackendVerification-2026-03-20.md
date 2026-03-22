# Nexus Mail 后端邮件通信验证

在项目初始化后，我们对核心的 IMAP 和 SMTP 模块进行了集成测试。

## 验证项与结果

- [x] **IMAP 连接测试** (`imap.qiye.163.com:143`)
    - 结果：通过。识别到 12 个远程文件夹。
- [x] **SMTP 发送测试** (`smtp.qiye.163.com:25`)
    - 结果：通过。在调整了 TLS 策略（根据端口 25 的特性适配了 Plain/STARTTLS 模式）后，成功发送了测试邮件。

## 技术细节
- 使用了 `imap` 库处理拉取，`lettre` 库处理发送。
- 考虑到端口 25 的特殊性，我们在 `lettre` 配置中显式处理了 TLS 握手策略，解决了服务器端无预警断连的问题。

## 代码位置
- [imap_client.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/core/imap_client.rs)
- [smtp_client.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/core/smtp_client.rs)
- [core/mod.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/core/mod.rs)
