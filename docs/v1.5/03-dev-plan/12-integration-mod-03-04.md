# 集成测试计划 - 提醒与跟进模块

## 文档信息
- **模块编号**: MOD-03-04
- **模块名称**: 提醒与跟进
- **对应架构**: docs/v1.5/02-architecture/03-04-reminder-snooze.md
- **优先级**: P1

---

## 测试场景

| 场景编号 | 场景名称 | 预期结果 |
|---|---|---|
| INT-RM-01 | Snooze 设置 | 邮件被置为提醒态 |
| INT-RM-02 | Snooze 到期 | 邮件回到顶部 |
| INT-RM-03 | Follow-up 提醒 | 通知触发 |

---

## 任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | Mock 调度数据 | e2e/helpers/mockData.ts | - |
| T-02 | Snooze 场景 | e2e/verification/mail-detail.spec.ts | T-01 |
| T-03 | Follow-up 场景 | e2e/verification/ux.spec.ts | T-01 |

