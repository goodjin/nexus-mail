# 03-02 跨账户聚合与全局搜索模块

## 文档信息
- **项目名称**: Nexus Mail
- **文档编号**: MOD-03-02
- **版本**: v1.5
- **更新日期**: 2026-05-04
- **对应PRD**: FR-ML02-1 ~ FR-ML02-3

---

## 系统定位

**所属层次**: 应用/领域层（03）

**核心职责**:
- 提供“统一收件箱”视图数据
- 执行跨账户全局搜索并保留来源上下文
- 支持按账户/文件夹进行搜索结果过滤

**边界说明**:
- **负责**: 跨账户聚合逻辑、上下文标记、过滤
- **不负责**: 邮件同步、全文索引构建（由基础设施层提供）

---

## 对应 PRD

| PRD编号 | 内容 |
|---|---|
| FR-ML02-1 | 统一收件箱 |
| FR-ML02-2 | 全局搜索展示来源 |
| FR-ML02-3 | 跨账户过滤 |

---

## 依赖关系

### 上游依赖
| 模块 | 依赖原因 |
|---|---|
| Storage Service | 多账户邮件查询 |
| FTS Index | 跨账户全文搜索 |

### 下游依赖
| 模块 | 被调用场景 |
|---|---|
| UI 层 Unified Inbox | 列表渲染 |
| UI 层 Search | 搜索结果展示 |

---

## 数据流

**输入**: accountIds, folderIds, query  
**输出**: 带来源上下文的邮件列表

---

## 核心设计

### 设计目标
- 不丢失账户/文件夹上下文
- 支持过滤与排序

### 核心组件
- **Unified Inbox Aggregator**
- **Global Search Orchestrator**
- **Context Tagger**

---

## 接口定义（IPC）

| 接口编号 | 接口名称 | 说明 |
|---|---|---|
| API-UI-01 | getUnifiedInbox | 获取统一收件箱列表 |
| API-UI-02 | searchEmailsGlobal | 跨账户搜索 |
| API-UI-03 | filterSearchResults | 应用账户/文件夹过滤 |

---

## 数据结构

```ts
interface UnifiedInboxItem {
  id: string;
  accountId: string;
  folderId: string;
  subject: string;
  from: string;
  date: string;
  flags: string[];
}

interface GlobalSearchQuery {
  query: string;
  accountIds?: string[];
  folderIds?: string[];
}
```

---

## 状态机设计

**STATE-UI-01: 搜索结果状态**

| 状态 | 说明 |
|---|---|
| idle | 无查询 |
| searching | 查询中 |
| ready | 结果已返回 |
| error | 查询失败 |

---

## 边界条件

| 编号 | 条件 | 处理方式 |
|---|---|---|
| BOUND-UI-01 | 查询字符串为空 | 返回最近结果或空 |
| BOUND-UI-02 | 过滤条件无匹配 | 返回空列表 |

---

## 实现文件

| 文件路径 | 职责 |
|---|---|
| src-tauri/src/core/unified_inbox.rs | 聚合逻辑 |
| src-tauri/src/commands.rs | IPC 命令入口 |
| src/components/mail/UnifiedInbox.tsx | 统一收件箱 UI |

---

## 验收标准

| 标准 | 要求 |
|---|---|
| AC-ML02-01 | 统一收件箱可见且包含多账户邮件 |
| AC-ML02-02 | 搜索结果展示来源账户/文件夹 |
| AC-ML02-03 | 搜索支持按账户/文件夹过滤 |

