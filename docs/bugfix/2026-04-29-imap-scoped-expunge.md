# Bug Fix: IMAP scoped expunge for delete and move

## 问题描述
- 日期: 2026-04-29
- 严重程度: Critical
- 影响范围: 真实 IMAP 账号的删除、移动邮件操作

## 根因分析
- 问题位置: `src-tauri/src/core/imap_client.rs:delete_email`, `src-tauri/src/core/imap_client.rs:move_email`
- 原因: 旧实现对单封邮件打上 `\Deleted` 后直接调用 `EXPUNGE`。IMAP 的 `EXPUNGE` 会清除当前已选文件夹内 **所有** 带 `\Deleted` 标记的邮件，而不是仅清除当前目标 UID。
- 代码流程:
  1. 选择源文件夹
  2. 对目标邮件执行 `UID STORE ... +FLAGS (\\Deleted)`
  3. 直接执行 `EXPUNGE`
  4. 结果会连带删除同文件夹中其他已处于 `\Deleted` 状态的邮件

## 修复方案
- 修改文件: `src-tauri/src/core/imap_client.rs`
- 修改内容:
  - 优先使用 `UID MOVE`（服务端支持 `MOVE` 能力时）
  - 次优使用 `UID EXPUNGE`（服务端支持 `UIDPLUS` 时）
  - 对不支持 `UIDPLUS` 的服务端，先读取当前 `DELETED` UID 集合，临时清除非目标邮件的 `\Deleted` 标记，仅对目标邮件执行 `EXPUNGE`，再恢复其他邮件标记
  - 同步修复 `delete_email`，避免同类误删

## 验证步骤
1. ✅ 定位 `move_email` / `delete_email` 的 `EXPUNGE` 风险
2. ✅ 应用分层降级修复（`UID MOVE` / `UID EXPUNGE` / scoped fallback）
3. ✅ 运行 Rust 测试与构建检查确认修复未破坏现有行为

## 相关测试
- `src-tauri/src/core/imap_client.rs`
  - `move_strategy_prefers_uid_move_when_supported`
  - `move_strategy_falls_back_to_uid_expunge_before_scoped_expunge`
  - `deleted_uid_restore_set_excludes_target_uid`

## 设计建议
- 后续可补充基于 mock IMAP session 的协议级测试，覆盖 `MOVE`、`UIDPLUS`、无扩展三种服务端能力组合。
- 所有“单 UID 删除”逻辑都应避免直接依赖裸 `EXPUNGE`，否则会再次引入跨邮件误删风险。
