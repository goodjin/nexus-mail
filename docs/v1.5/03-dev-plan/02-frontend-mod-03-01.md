# 前端开发计划 - 智能收件箱模块

## 文档信息
- **模块编号**: MOD-03-01
- **模块名称**: 智能收件箱
- **对应架构**: docs/v1.5/02-architecture/03-01-smart-inbox.md
- **优先级**: P0

---

## 1. 模块概述

实现 Smart Inbox UI：优先级视图 + 分组列表 + 纠正动作。

---

## 2. 接口调用

| 任务编号 | 接口 | 调用场景 |
|---|---|---|
| T-01 | API-SI-01 | 加载分组统计与优先列表 |
| T-01 | API-SI-03 | 拉取完整分组 |
| T-03 | API-SI-02 | 用户纠正 |

---

## 3. 开发任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | IPC 调用封装 | src/lib/tauri.ts | - |
| T-02 | SmartInbox 视图组件 | src/components/mail/SmartInbox.tsx | T-01 |
| T-03 | 纠正交互与状态 | src/hooks/useMailbox.ts | T-02 |
| T-04 | UI 集成 | src/App.tsx | T-02~03 |
| T-05 | E2E 用例 | e2e/verification/ux.spec.ts | T-04 |

