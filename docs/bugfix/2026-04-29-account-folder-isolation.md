# Bug Fix: account-scoped folder lookup for command handlers

## 问题描述
- 日期: 2026-04-29
- 严重程度: Critical
- 影响范围: 详情、附件、回复/转发、单条标记、批量操作、移动、删除等依赖 `folder_id` 的命令

## 根因分析
- 问题位置: `src-tauri/src/commands.rs`
- 原因: 多个命令先根据 `account_email` 解析到账户，再根据 `folder_id` 查询文件夹远程 ID，但旧实现中部分查询仅使用 `WHERE id = ?`，没有附带 `account_id = ?` 条件。
- 代码流程:
  1. 调用方传入自己的 `account_email`
  2. 同时传入其他账户的 `folder_id`
  3. 旧逻辑用 `SELECT remote_id FROM folders WHERE id = ?` 命中文件夹
  4. 后续 IMAP 详情、附件、删除、标记、回复等操作在错误的账户上下文上继续执行
  5. 结果是多账户隔离可被绕过

## 修复方案
- 修改文件: `src-tauri/src/commands.rs`
- 修改内容:
  - 新增共享方法 `load_folder_remote_id_for_account`
  - 将以下命令统一改为按 `folder_id + account_id` 联合查询文件夹：
    - `get_email_details`
    - `prepare_reply_forward`
    - `get_attachment`
    - `update_email_flag`
    - `apply_email_action`
    - `move_emails`
    - `delete_email`
  - 将 `folder not found` 统一视为账户归属校验失败的一部分

## 验证步骤
1. ✅ 复核工作区 diff，确认存在多个裸 `folders WHERE id = ?` 查询
2. ✅ 抽取共享账户归属查询并替换所有受影响命令
3. ✅ 新增跨账户回归测试，验证同账户允许、跨账户拒绝
4. ✅ 运行 Rust 测试与前端构建确认修复未引入回归

## 相关测试
- `src-tauri/src/commands.rs`
  - `test_load_folder_remote_id_for_account_allows_matching_folder`
  - `test_load_folder_remote_id_for_account_rejects_cross_account_folder`

## 设计建议
- 后续新增任何“账户 + 文件夹”双输入的命令时，都应复用共享账户归属查询，避免再出现散落的裸 `folder_id` 查找。
- `get_emails` 当前只接受 `folder_id`，属于“资源 ID 可唯一推导账户”的路径；若后续前端协议改为显式传账户上下文，也应沿用同一归属校验入口。
