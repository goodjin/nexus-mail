# 03-03 高效处理链路模块

## 文档信息
- **项目名称**: Nexus Mail
- **文档编号**: MOD-03-03
- **版本**: v1.5
- **更新日期**: 2026-05-04
- **对应PRD**: FR-ML03-1 ~ FR-ML03-3

---

## 系统定位

**所属层次**: 应用/领域层（03）

**核心职责**:
- 提供列表快速动作入口（归档/删除/已读）
- 统一批量动作语义与快捷键
- 提供撤销与回滚窗口

**边界说明**:
- **负责**: 动作编排与撤销管理
- **不负责**: 具体 IMAP/SMTP 同步细节

---

## 对应 PRD

| PRD编号 | 内容 |
|---|---|
| FR-ML03-1 | 列表快速动作区 |
| FR-ML03-2 | 批量处理一致性 |
| FR-ML03-3 | 撤销与回滚 |

---

## 依赖关系

### 上游依赖
| 模块 | 依赖原因 |
|---|---|
| Sync Engine | 执行移动/删除/标记 |
| Storage Service | 保存撤销记录 |

### 下游依赖
| 模块 | 被调用场景 |
|---|---|
| UI 层 EmailList | 快速动作按钮 |
| UI 层 Bulk Toolbar | 批量操作与撤销 |

---

## 数据流

**输入**: actionType + emailIds + accountId  
**输出**: actionResult + undoToken

---

## 核心设计

### 组件
- **Action Orchestrator**: 统一动作入口
- **Undo Manager**: 生成撤销记录与时效
- **Shortcut Adapter**: 快捷键触发动作

---

## 接口定义（IPC）

| 接口编号 | 接口名称 | 说明 |
|---|---|---|
| API-AW-01 | applyAction | 执行单条/批量动作 |
| API-AW-02 | undoAction | 撤销最近动作 |
| API-AW-03 | listAvailableActions | 提供动作能力清单 |

---

## 数据结构

```ts
interface ActionRequest {
  accountId: string;
  emailIds: string[];
  action: 'archive' | 'delete' | 'mark_read' | 'mark_unread' | 'move';
  targetFolderId?: string;
}

interface UndoRecord {
  id: string;
  action: ActionRequest;
  expiresAt: string;
  rollbackPayload: string;
}
```

---

## 状态机设计

**STATE-AW-01: 撤销记录**

| 状态 | 说明 |
|---|---|
| pending | 撤销可用 |
| applied | 已撤销 |
| expired | 超时不可撤销 |

---

## 边界条件

| 编号 | 条件 | 处理方式 |
|---|---|---|
| BOUND-AW-01 | 无可撤销记录 | 返回提示 |
| BOUND-AW-02 | 目标文件夹不存在 | 阻止移动 |

---

## 实现文件

| 文件路径 | 职责 |
|---|---|
| src-tauri/src/core/action_workflow.rs | 动作与撤销逻辑 |
| src-tauri/src/commands.rs | IPC 命令入口 |
| src/components/mail/EmailList.tsx | 快速动作区 |

---

## 验收标准

| 标准 | 要求 |
|---|---|
| AC-ML03-01 | 列表 hover 动作可用 |
| AC-ML03-02 | 批量动作语义一致 |
| AC-ML03-03 | 动作提供撤销窗口 |

