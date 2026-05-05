# Nexus Mail v1.5 接口规约（IPC Commands）

## 文档信息
- **项目名称**: Nexus Mail
- **版本**: v1.5
- **对应PRD**: docs/v1.5/01-prd.md
- **更新日期**: 2026-05-04

---

## 接口清单

| 编号 | 接口名称 | 说明 | 对应PRD | 所属模块 |
|---|---|---|---|---|
| API-SI-01 | getSmartInboxSummary | 智能收件箱统计与视图 | FR-ML01-2, FR-ML01-4 | MOD-03-01 |
| API-SI-02 | setSmartInboxOverride | 记录纠正 | FR-ML01-3 | MOD-03-01 |
| API-SI-03 | listSmartInboxGroups | 分组列表 | FR-ML01-1 | MOD-03-01 |
| API-UI-01 | getUnifiedInbox | 统一收件箱 | FR-ML02-1 | MOD-03-02 |
| API-UI-02 | searchEmailsGlobal | 全局搜索 | FR-ML02-2 | MOD-03-02 |
| API-UI-03 | filterSearchResults | 搜索过滤 | FR-ML02-3 | MOD-03-02 |
| API-AW-01 | applyAction | 快速/批量动作 | FR-ML03-1, FR-ML03-2 | MOD-03-03 |
| API-AW-02 | undoAction | 撤销动作 | FR-ML03-3 | MOD-03-03 |
| API-RM-01 | setSnooze | Snooze | FR-ML04-1 | MOD-03-04 |
| API-RM-02 | clearSnooze | 取消 Snooze | FR-ML04-1 | MOD-03-04 |
| API-RM-03 | setFollowUpReminder | 跟进提醒 | FR-ML04-2 | MOD-03-04 |
| API-RM-04 | listReminders | 提醒列表 | FR-ML04-1, FR-ML04-2 | MOD-03-04 |
| API-SS-01 | scheduleSend | 计划发送 | FR-ML05-1 | MOD-03-05 |
| API-SS-02 | cancelScheduledSend | 取消计划发送 | FR-ML05-1 | MOD-03-05 |
| API-SS-03 | listScheduledSends | 计划发送列表 | FR-ML05-1 | MOD-03-05 |
| API-TP-01 | listTemplates | 模板列表 | FR-ML05-2 | MOD-03-05 |
| API-TP-02 | saveTemplate | 保存模板 | FR-ML05-2 | MOD-03-05 |
| API-TP-03 | deleteTemplate | 删除模板 | FR-ML05-2 | MOD-03-05 |
| API-SG-01 | listSignatures | 签名列表 | FR-ML05-3 | MOD-03-05 |
| API-SG-02 | saveSignature | 保存签名 | FR-ML05-3 | MOD-03-05 |
| API-SG-03 | deleteSignature | 删除签名 | FR-ML05-3 | MOD-03-05 |

---

## 接口详细定义（示例）

### API-SI-01: getSmartInboxSummary
**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| accountId | string | 是 | 账户ID |

**响应**:
```ts
interface SmartInboxSummary {
  groups: SmartInboxGroup[];
  priorityItems: UnifiedInboxItem[];
}
```

### API-RM-01: setSnooze
**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| emailId | string | 是 | 邮件ID |
| accountId | string | 是 | 账户ID |
| triggerAt | string | 是 | ISO 时间 |

**响应**:
```ts
interface SnoozeResult {
  id: string;
  status: 'active';
}
```

### API-SS-01: scheduleSend
**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| draftId | string | 是 | 草稿ID |
| accountId | string | 是 | 账户ID |
| sendAt | string | 是 | ISO 时间 |

**响应**:
```ts
interface ScheduleResult {
  id: string;
  status: 'scheduled';
}
```

