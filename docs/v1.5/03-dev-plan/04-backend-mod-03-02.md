# 后端开发计划 - 跨账户聚合模块

## 文档信息
- **模块编号**: MOD-03-02
- **模块名称**: 跨账户聚合与全局搜索
- **对应架构**: docs/v1.5/02-architecture/03-02-unified-inbox-search.md
- **优先级**: P0

---

## 1. 接口清单

| 任务编号 | 接口编号 | 接口名称 |
|---|---|---|
| T-03 | API-UI-01 | getUnifiedInbox |
| T-04 | API-UI-02 | searchEmailsGlobal |
| T-04 | API-UI-03 | filterSearchResults |

---

## 2. 开发任务拆分

| 任务编号 | 任务名称 | 文件数 | 代码行数 | 依赖 |
|---|---|---:|---:|---|
| T-01 | 聚合查询 SQL | 1 | ≤200 | - |
| T-02 | UnifiedInbox Service | 2 | ≤200 | T-01 |
| T-03 | Global Search Orchestrator | 2 | ≤200 | T-01 |
| T-04 | IPC 命令接线 | 2 | ≤150 | T-02~03 |
| T-05 | 单元测试 | 2 | ≤200 | T-01~04 |

---

## 3. 详细任务定义

### T-01 聚合查询 SQL
**涉及文件**:
- src-tauri/src/core/database.rs

**验收标准**:
- 支持跨账户查询并保留账户/文件夹字段

