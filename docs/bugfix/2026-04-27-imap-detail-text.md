# Bug Fix: Tauri 邮件详情仅显示 "..."

## 问题描述
- 日期: 2026-04-27
- 严重程度: Medium
- 影响范围: Tauri 实际运行的邮件详情渲染

## 根因分析
- IMAP `get_email_details` 对单一正文结构（非 multipart）使用 `BODY.PEEK[]` 拉取时，解析段落路径为空，导致取不到正文内容。
- 前端详情渲染在正文缺失时回退到 `snippet`，而 IMAP 列表 `snippet` 固定为 `"..."`，因此详情区只显示 `...`。

## 修复方案
- 当解析到正文 path 为空时，改用 `BODY.PEEK[TEXT]` 获取正文内容。

## 修复内容
- `src-tauri/src/core/imap_client.rs`
  - 空 path 时使用 `BODY.PEEK[TEXT]` 拉取正文。

## 验证步骤
1. ✅ `cd src-tauri && cargo test --lib`
2. ⏳ 需要在 Tauri 实际运行环境验证邮件详情内容是否正确显示。

## 相关测试
- Rust 单元测试（`cargo test --lib`）

## 设计建议
- 若仍遇到正文为空，可在 IMAP 解析失败时加入 `RFC822.TEXT` 的兜底策略。
