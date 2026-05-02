# Bug Fix: 详情加载提示与多选切换

## 问题描述
- 日期: 2026-04-27
- 严重程度: Low/Medium
- 影响范围:
  - 邮件详情加载失败时没有提示
  - 勾选多选框时，详情不切换到对应邮件

## 根因分析
- 详情加载流程在失败时仅 `console.error`，UI 无状态提示。
- 多选框点击仅更新 `selectedUids`，未触发 `onEmailSelect`。

## 修复方案
- 增加详情加载/失败状态并在详情页展示提示。
- 勾选多选框时同步切换当前选中邮件。

## 修复内容
1. `src/App.tsx`
   - 增加 `detailStatus` 状态并在详情加载过程中更新。
2. `src/components/mail/EmailDetail.tsx`
   - 展示加载与失败提示（包含错误原因）。
3. `src/components/mail/EmailList.tsx`
   - 勾选多选框时触发 `onEmailSelect`。

## 验证步骤
1. ✅ `npm run build`
2. ⏳ Tauri 实机：切换/勾选邮件时确认详情切换与加载提示。

## 设计建议
- 详情加载失败时可提供“重试”按钮，避免用户只能重进。
