# 后端开发计划 - 智能收件箱模块

## 文档信息
- **模块编号**: MOD-03-01
- **模块名称**: 智能收件箱
- **对应架构**: docs/v1.5/02-architecture/03-01-smart-inbox.md
- **优先级**: P0

---

## 1. 模块概述

实现智能分组、纠正记录与分组统计的后端能力。

---

## 2. 接口清单

| 任务编号 | 接口编号 | 接口名称 |
|---|---|---|
| T-03 | API-SI-01 | getSmartInboxSummary |
| T-04 | API-SI-02 | setSmartInboxOverride |
| T-04 | API-SI-03 | listSmartInboxGroups |

---

## 3. 开发任务拆分

| 任务编号 | 任务名称 | 文件数 | 代码行数 | 依赖 |
|---|---|---:|---:|---|
| T-01 | 数据表定义与迁移 | 2 | ≤150 | - |
| T-02 | 数据访问层（规则/纠正） | 2 | ≤200 | T-01 |
| T-03 | SmartInbox Service | 2 | ≤200 | T-02 |
| T-04 | IPC 命令接线 | 2 | ≤150 | T-03 |
| T-05 | 单元测试与样例数据 | 3 | ≤200 | T-01~T-04 |

---

## 4. 详细任务定义

### T-01 数据表定义与迁移
**涉及文件**:
- src-tauri/src/core/database.rs
- src-tauri/src/core/migrations.rs（若存在）

**验收标准**:
- 新增 smart_inbox_rules / smart_inbox_overrides 表结构

### T-03 SmartInbox Service
**涉及文件**:
- src-tauri/src/core/smart_inbox.rs
- src-tauri/src/core/mod.rs

**验收标准**:
- 提供分组与统计输出

### T-04 IPC 命令接线
**涉及文件**:
- src-tauri/src/commands.rs

**验收标准**:
- getSmartInboxSummary / setSmartInboxOverride / listSmartInboxGroups 可调用

