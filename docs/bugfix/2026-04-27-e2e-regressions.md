# Bug Fix: E2E regressions after UI/mock updates

## 问题描述
- 日期: 2026-04-27
- 严重程度: Medium
- 影响范围: Playwright E2E（actions / first_launch / multi_account_persistence / visual）

## 根因分析
- `e2e/actions.spec.ts` 仍断言 `action-archive`，但 UI 已移除该按钮（`src/components/mail/EmailDetail.tsx`）。
- `e2e/actions.spec.ts` 假设列表无附件，但 mock 已在首条邮件附带附件。
- `e2e/first_launch.spec.ts` 依赖“Clear Local Cache”按钮，但新 SettingsModal 已移除该入口。
- `e2e/*` 使用 `getByText('Settings')` 触发 strict mode 歧义（标题与按钮文案重复）。
- `e2e/visual.spec.ts` 快照未更新，UI 布局变化导致 VRT 失败。

## 修复方案
- 更新 E2E 断言与定位方式，避免歧义选择器。
- 使用 `addInitScript` 清理 mock 本地缓存，替代 UI 清理入口。
- 重新生成 VRT 快照。

## 修复内容
1. `e2e/actions.spec.ts`
   - 移除 `action-archive` 断言。
   - 调整附件区域断言为可见。
2. `e2e/first_launch.spec.ts`
   - 使用 localStorage 清理模拟首次启动。
   - 改为检查侧边栏账户按钮与 `badge-inbox=95`。
3. `e2e/multi_account_persistence.spec.ts`
   - `getByText('Settings')` → `getByRole('heading', { name: 'Settings' })`。
4. `e2e/visual.spec.ts` 快照更新

## 验证步骤
1. ✅ `npx playwright test e2e/actions.spec.ts e2e/first_launch.spec.ts e2e/multi_account_persistence.spec.ts --workers=1 --timeout=60000 --reporter=line`
2. ✅ `npx playwright test e2e/visual.spec.ts --update-snapshots --workers=1 --reporter=line`

## 相关测试
- `e2e/actions.spec.ts`
- `e2e/first_launch.spec.ts`
- `e2e/multi_account_persistence.spec.ts`
- `e2e/visual.spec.ts`

## 设计建议
- 对 Settings 弹窗添加稳定的 `data-testid`，避免文本歧义。
- UI 变更应同步更新 VRT 基线，避免累计噪声。
