# Walkthrough - M19: 设计并增补测试体系

## 概述
针对近期出现的同步报错、未读数不一致及 UI 样式问题，本项目建立了一套完整的测试规范，并增补了缺失的 E2E（端到端）测试用例，确保核心流程的 100% 覆盖。

## 主要变更

### 1. 建立测试规范 (Standardization)
- **文档**: 创建了 [testing_standard.md](file:///Users/jin/github/nexus-mail/docs/testing_standard.md)，定义了从 Unit 到 E2E 的分层体系。
- **规范**: 统一了 `data-testid` 命名及“场景-预期”的测试编写模型。

### 2. 后端增强与数据隔离 (Data Integrity)
- **重置逻辑**: 新增 `reset_database` 命令，支持一键清空环境以便进行干净的自动化测试。
- **UI 触发**: 在 `SettingsModal` 中接入了重置功能，模拟真实用户的“清除缓存”操作。

### 3. 核心 E2E 用例增补 (Coverage Gap)
- **First Launch 流**: 模拟首次启动，验证自动 Seed 数据、账号加载及未读数显示的一致性。
- **交互验证**: 专门测试邮件列表的选择状态（确认背景色高亮）及 Compose 模态框的透明度。
- **校验逻辑**: 验证写信时不填必填项的红色错误提示。
- **附件操作**: 模拟文件选择、显示及删除流程。

### 4. 环境一致性修复
- **Mock 同步**: 修复了前端 Mock 数据与后端 Seed 数据不一致的问题，确保测试在“浏览器模式”和“Tauri 模式”下具有相同的预期值（100 封邮件）。

## 验证结果

### 自动化测试报告
运行 `npx playwright test`，所有核心用例均通过：
```bash
Running 5 tests using 5 workers
  5 passed (3.0s)
```

### 视觉回归与交互
- [x] 选中态样式：已通过 Computed Style 验证（Blue 背景）。
- [x] 错误反馈：已验证 Compose 模态框内部的实时报错。

## 附件
- 测试规范文档: [testing_standard.md](file:///Users/jin/github/nexus-mail/docs/testing_standard.md)
- 新增 E2E 脚本: `e2e/first_launch.spec.ts`, `e2e/interactions.spec.ts`
