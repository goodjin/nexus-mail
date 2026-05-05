# 前端开发计划 - 提醒与跟进模块

## 文档信息
- **模块编号**: MOD-03-04
- **模块名称**: 提醒与跟进
- **对应架构**: docs/v1.5/02-architecture/03-04-reminder-snooze.md
- **优先级**: P1

---

## 开发任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | IPC 调用封装 | src/lib/tauri.ts | - |
| T-02 | Snooze 操作入口 | src/components/mail/EmailDetail.tsx | T-01 |
| T-03 | 提醒中心 UI | src/components/mail/ReminderCenter.tsx | T-01 |
| T-04 | 列表置顶标记 | src/components/mail/EmailList.tsx | T-02 |
| T-05 | E2E 用例 | e2e/verification/ux.spec.ts | T-04 |

