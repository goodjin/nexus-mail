# 03-04 提醒与跟进模块

## 文档信息
- **项目名称**: Nexus Mail
- **文档编号**: MOD-03-04
- **版本**: v1.5
- **更新日期**: 2026-05-04
- **对应PRD**: FR-ML04-1 ~ FR-ML04-3

---

## 系统定位

**所属层次**: 应用/领域层（03）

**核心职责**:
- 管理 Snooze 条目与到期触发
- 管理未回复提醒（Follow-up）
- 触发桌面通知

**边界说明**:
- **负责**: 提醒计划与触发
- **不负责**: 邮件发送与同步

---

## 对应 PRD

| PRD编号 | 内容 |
|---|---|
| FR-ML04-1 | Snooze |
| FR-ML04-2 | 未回复提醒 |
| FR-ML04-3 | 桌面通知链路 |

---

## 依赖关系

### 上游依赖
| 模块 | 依赖原因 |
|---|---|
| Scheduler | 定时触发 |
| Notification Adapter | 桌面通知 |
| Storage Service | 保存提醒记录 |

### 下游依赖
| 模块 | 被调用场景 |
|---|---|
| UI 层 Reminder Center | 查看与管理提醒 |
| UI 层 EmailList | 到期置顶 |

---

## 数据流

**输入**: emailId / messageId + triggerAt  
**输出**: reminder status + notification

---

## 核心设计

### 组件
- **Snooze Manager**
- **FollowUp Manager**
- **Notification Dispatcher**

---

## 接口定义（IPC）

| 接口编号 | 接口名称 | 说明 |
|---|---|---|
| API-RM-01 | setSnooze | 设置 Snooze |
| API-RM-02 | clearSnooze | 取消 Snooze |
| API-RM-03 | setFollowUpReminder | 设置未回复提醒 |
| API-RM-04 | listReminders | 列出所有提醒 |

---

## 数据结构

```ts
interface SnoozeEntry {
  id: string;
  emailId: string;
  accountId: string;
  triggerAt: string;
  status: 'active' | 'triggered' | 'dismissed';
}

interface FollowUpReminder {
  id: string;
  messageId: string;
  accountId: string;
  triggerAt: string;
  status: 'pending' | 'notified' | 'dismissed';
}
```

---

## 状态机设计

**STATE-RM-01: Snooze**
| 状态 | 说明 |
|---|---|
| active | 计划中 |
| triggered | 已到期 |
| dismissed | 已取消 |

**STATE-RM-02: Follow-up**
| 状态 | 说明 |
|---|---|
| pending | 计划中 |
| notified | 已通知 |
| dismissed | 已取消 |

---

## 边界条件

| 编号 | 条件 | 处理方式 |
|---|---|---|
| BOUND-RM-01 | triggerAt <= now | 拒绝并提示 |
| BOUND-RM-02 | 同一邮件重复 Snooze | 更新 triggerAt |

---

## 实现文件

| 文件路径 | 职责 |
|---|---|
| src-tauri/src/core/reminder.rs | 提醒与调度逻辑 |
| src-tauri/src/commands.rs | IPC 命令入口 |
| src/components/mail/ReminderCenter.tsx | 提醒 UI |

---

## 验收标准

| 标准 | 要求 |
|---|---|
| AC-ML04-01 | Snooze 到期可回到顶部 |
| AC-ML04-02 | 未回复提醒按时间触发 |
| AC-ML04-03 | 桌面通知可触达 |

