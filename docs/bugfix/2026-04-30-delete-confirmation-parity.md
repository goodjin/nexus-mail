# Bug Fix: Delete confirmation parity across buttons and shortcuts

## 问题描述
- 日期: 2026-04-30
- 严重程度: High
- 影响范围: 邮件详情删除、列表批量删除、键盘 Delete / Backspace 删除

## 根因分析
- 问题位置: `src/App.tsx`, `src/components/mail/EmailList.tsx`, `src/components/mail/EmailDetail.tsx`
- 原因: 删除确认逻辑散落在按钮组件内，`App.tsx` 的键盘删除快捷键直接调用 `deleteEmails()`，绕过了 `confirm_before_delete`。同时列表批量删除组件在本地自行处理确认，导致删除保护没有单一可信入口。
- 代码流程:
  1. 详情按钮和批量删除按钮各自弹确认框。
  2. `Delete` / `Backspace` 直接走 `handleDeleteSelected()`。
  3. `useMailbox.deleteEmails()` 先做前端乐观删除。
  4. 因为快捷键路径未确认，UI 会在用户确认前就移除邮件。

## 修复方案
- 修改文件:
  - `src/App.tsx`
  - `src/components/mail/EmailList.tsx`
  - `src/components/mail/EmailDetail.tsx`
  - `e2e/actions.spec.ts`
  - `e2e/mail_detail.spec.ts`
  - `e2e/settings_shortcuts.spec.ts`
- 修改内容:
  - 将删除确认统一收口到 `App.tsx` 的共享删除入口。
  - 所有删除入口统一返回“是否实际执行删除”，避免取消确认后误清理选中态。
  - 为批量删除按钮增加 `data-testid="bulk-delete"`，便于稳定覆盖列表场景。
  - 新增 E2E 覆盖：
    - 详情页删除取消
    - 列表批量删除取消
    - Delete / Backspace 快捷键删除取消

## 验证步骤
1. ✅ 应用修复，统一删除确认入口
2. ✅ 增加取消确认与快捷键回归用例
3. ✅ 运行相关构建与 E2E，确认取消确认时无副作用

## 相关测试
- `e2e/actions.spec.ts`
- `e2e/mail_detail.spec.ts`
- `e2e/settings_shortcuts.spec.ts`

## 设计建议
- 破坏性操作的确认逻辑必须集中在单一 action 层，避免按钮、快捷键、菜单各自实现。
- E2E 必须同时覆盖 confirm accept / dismiss 两个分支，并覆盖所有等价入口。
