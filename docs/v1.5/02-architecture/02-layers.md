# Nexus Mail v1.5 分层架构设计

## 1. 分层概述

采用四层架构（结合 Tauri 桌面应用形态）：

| 层次 | 编号 | 主要职责 |
|---|---|---|
| 用户界面层 | 05 | 页面渲染与交互（React） |
| 命令/接口层 | 04 | IPC 命令与参数校验（Tauri Commands） |
| 应用/领域层 | 03 | 智能收件箱、提醒、计划发送等业务编排 |
| 基础设施层 | 01 | 本地存储、索引、调度、通知 |

---

## 2. 各层详细设计

### 2.1 基础设施层（01）
**职责**：
- SQLite/FTS 数据存取
- 本地调度器（定时触发）
- 桌面通知适配
- 本地规则存储

**核心组件**：
- Storage Service
- FTS Index
- Scheduler
- Notification Adapter

### 2.2 应用/领域层（03）
**职责**：
- 智能分类与纠正规则
- 统一收件箱与全局搜索编排
- 快速动作与撤销窗口
- Snooze/提醒/计划发送
- 模板与签名管理

**核心模块**：
- SmartInboxService
- UnifiedInboxService
- ActionWorkflowService
- ReminderService
- SendSchedulerService
- TemplateService

### 2.3 命令/接口层（04）
**职责**：
- 对外暴露命令接口（Tauri）
- 参数校验与 DTO 转换
- 与前端约定统一命名

**核心接口**：
- smartInbox*
- unifiedInbox*
- search*
- snooze*
- reminder*
- schedule*
- template*
- signature*

### 2.4 用户界面层（05）
**职责**：
- Smart Inbox UI
- Unified Inbox UI
- 搜索与过滤 UI
- 快速动作/批量工具栏
- 提醒与计划发送配置 UI

---

## 3. 层间依赖

```
05 → 04 → 03 → 01
```

---

## 4. 功能-层次映射

| PRD功能 | 所属层次 | 模块编号 |
|---|---|---|
| 智能收件箱 | 03 | MOD-03-01 |
| 跨账户聚合 | 03 | MOD-03-02 |
| 高效处理链路 | 03 | MOD-03-03 |
| 提醒与跟进 | 03 | MOD-03-04 |
| 发送与模板增强 | 03 | MOD-03-05 |

