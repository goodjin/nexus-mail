# 前端开发计划 - 跨账户聚合模块

## 文档信息
- **模块编号**: MOD-03-02
- **模块名称**: 跨账户聚合与全局搜索
- **对应架构**: docs/v1.5/02-architecture/03-02-unified-inbox-search.md
- **优先级**: P0

---

## 1. 开发任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | IPC 调用封装 | src/lib/tauri.ts | - |
| T-02 | Unified Inbox 视图 | src/components/mail/UnifiedInbox.tsx | T-01 |
| T-03 | 全局搜索 UI | src/components/mail/SearchBar.tsx | T-01 |
| T-04 | 过滤器状态 | src/hooks/useMailbox.ts | T-02~03 |
| T-05 | UI 集成 | src/App.tsx | T-02~04 |
| T-06 | E2E 用例 | e2e/verification/search.spec.ts | T-05 |

