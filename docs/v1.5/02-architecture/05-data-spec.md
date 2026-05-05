# Nexus Mail v1.5 数据结构规约

## 文档信息
- **项目名称**: Nexus Mail
- **版本**: v1.5
- **对应PRD**: docs/v1.5/01-prd.md
- **更新日期**: 2026-05-04

---

## 数据实体清单

| 编号 | 实体名称 | 表名 | 对应PRD | 所属模块 |
|---|---|---|---|---|
| DATA-01 | smart_inbox_overrides | smart_inbox_overrides | FR-ML01-3 | MOD-03-01 |
| DATA-02 | smart_inbox_rules | smart_inbox_rules | FR-ML01-1 | MOD-03-01 |
| DATA-03 | snooze_entries | snooze_entries | FR-ML04-1 | MOD-03-04 |
| DATA-04 | follow_up_reminders | follow_up_reminders | FR-ML04-2 | MOD-03-04 |
| DATA-05 | scheduled_sends | scheduled_sends | FR-ML05-1 | MOD-03-05 |
| DATA-06 | templates | templates | FR-ML05-2 | MOD-03-05 |
| DATA-07 | signatures | signatures | FR-ML05-3 | MOD-03-05 |
| DATA-08 | undo_records | undo_records | FR-ML03-3 | MOD-03-03 |

---

## 实体定义（摘要）

### DATA-01: smart_inbox_overrides
```ts
interface SmartInboxOverride {
  id: string;
  emailId: string;
  accountId: string;
  category: string;
  reason: string;
  createdAt: string;
}
```

### DATA-03: snooze_entries
```ts
interface SnoozeEntry {
  id: string;
  emailId: string;
  accountId: string;
  triggerAt: string;
  status: 'active' | 'triggered' | 'dismissed';
}
```

### DATA-05: scheduled_sends
```ts
interface ScheduledSend {
  id: string;
  draftId: string;
  accountId: string;
  sendAt: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';
}
```

### DATA-06: templates
```ts
interface Template {
  id: string;
  accountId: string;
  name: string;
  subject?: string;
  body: string;
  updatedAt: string;
}
```

### DATA-07: signatures
```ts
interface SignatureProfile {
  id: string;
  accountId: string;
  name: string;
  content: string;
  isDefault: boolean;
}
```

---

## 索引设计（摘要）

| 表 | 索引 | 用途 |
|---|---|---|
| snooze_entries | idx_snooze_trigger_at | 快速触发 |
| follow_up_reminders | idx_follow_trigger_at | 快速触发 |
| scheduled_sends | idx_schedule_send_at | 计划发送 |
| templates | idx_template_account | 账户级模板 |
| signatures | idx_signature_account | 账户级签名 |

