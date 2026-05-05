# Nexus Mail v1.5 状态机规约

## 文档信息
- **项目名称**: Nexus Mail
- **版本**: v1.5
- **对应PRD**: docs/v1.5/01-prd.md
- **更新日期**: 2026-05-04

---

## 状态机清单

| 编号 | 状态机名称 | 实体 | 对应PRD |
|---|---|---|---|
| STATE-SS-01 | 计划发送状态 | scheduled_sends | FR-ML05-1 |
| STATE-RM-01 | Snooze 状态 | snooze_entries | FR-ML04-1 |
| STATE-RM-02 | Follow-up 状态 | follow_up_reminders | FR-ML04-2 |
| STATE-AW-01 | 撤销记录状态 | undo_records | FR-ML03-3 |

---

## STATE-SS-01 计划发送状态

| 状态 | 描述 |
|---|---|
| scheduled | 已计划 |
| sending | 发送中 |
| sent | 已发送 |
| failed | 失败 |
| canceled | 已取消 |

**转换**:
- scheduled → sending：到达 sendAt
- sending → sent：SMTP 成功
- sending → failed：SMTP 失败
- scheduled → canceled：用户取消

---

## STATE-RM-01 Snooze 状态

| 状态 | 描述 |
|---|---|
| active | 计划中 |
| triggered | 到期触发 |
| dismissed | 取消 |

---

## STATE-RM-02 Follow-up 状态

| 状态 | 描述 |
|---|---|
| pending | 计划中 |
| notified | 已通知 |
| dismissed | 取消 |

---

## STATE-AW-01 撤销记录状态

| 状态 | 描述 |
|---|---|
| pending | 可撤销 |
| applied | 已撤销 |
| expired | 过期不可撤销 |

