# Walkthrough - M21/M22/M23: 搜索、操作补全与安全审计

## 概述
本阶段完成了 Nexus Mail 核心交互流的最后拼图。通过补全搜索 UI 和邮件管理按钮，实现了完全闭环的用户操作流，并通过 15 项增量 E2E 测试验证了系统的健壮性与安全性。

## 主要变更

### 1. 补全搜索 UI 与邮件操作 (M21)
- **全文搜索**: 在 `EmailList` 顶部增加了搜索框，深度集成后端 **SQLite FTS5** 全文检索。
- **邮件动作**: 在详情页头部新增了“删除”、“存档”、“已读/未读”、“旗标”一组功能按钮。
- **附件管理**: `EmailDetail` 现在能自动渲染并分类展示邮件详情中的附件，支持预览与下载。

### 2. 测试场景全覆盖 (M22)
- **多维导航**: 编写了 `navigation.spec.ts`，验证了跨账户切换及文件夹点击的 UI 同步。
- **搜索流验证**: `search.spec.ts` 模拟实际用户的搜索输入，确认结果过滤与清除逻辑准确无误。
- **操作闭环**: `actions.spec.ts` 验证了从点击“删除”到页面重载的完整状态机。

### 3. 安全性审计与 XSS 隔离 (M23)
- **安全拦截**: 编写了专门的 `security.spec.ts`，模拟注入包含恶意 `<script>` 及 `onerror` 载荷的邮件。
- **验证结论**: 确认 `DOMPurify` 策略成功剥离了所有动态脚本执行点，保障了 HTML 邮件渲染的绝对安全。

## 验证结果

### E2E 自动化测试全量通过
所有 15 项 Playwright 测试均已达标：
```bash
Running 15 tests using 7 workers
  15 passed (3.1s)
```

### UI 视觉回归
- 已通过 `--update-snapshots` 更新了包含搜索框和操作按钮的新版视觉基准图。

## 关键代码变动
- [EmailList.tsx](file:///Users/jin/github/nexus-mail/src/components/mail/EmailList.tsx): 搜索 UI 实现。
- [EmailDetail.tsx](file:///Users/jin/github/nexus-mail/src/components/mail/EmailDetail.tsx): 动作组与附件列表实现。
- [commands.rs](file:///Users/jin/github/nexus-mail/src-tauri/src/commands.rs): `search_emails` 多账户隔离逻辑。
- [security.spec.ts](file:///Users/jin/github/nexus-mail/e2e/security.spec.ts): 核心安全用例。
