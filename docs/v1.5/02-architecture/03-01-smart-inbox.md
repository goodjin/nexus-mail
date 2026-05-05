# 03-01 智能收件箱模块

## 文档信息
- **项目名称**: Nexus Mail
- **文档编号**: MOD-03-01
- **版本**: v1.5
- **更新日期**: 2026-05-04
- **对应PRD**: FR-ML01-1 ~ FR-ML01-4

---

## 系统定位

**所属层次**: 应用/领域层（03）

**核心职责**:
- 维护邮件分类结果（重要/人际/通知/订阅/低优先级）
- 生成“优先收件箱 + 普通列表”视图数据
- 记录用户纠正行为并形成可解释规则
- 输出分组未读数与最近更新时间

**边界说明**:
- **负责**: 分类、纠正规则、分组统计与视图数据生成
- **不负责**: 邮件同步、UI 渲染、搜索索引

---

## 对应 PRD

| PRD编号 | 内容 |
|---|---|
| FR-ML01-1 | 智能收件箱分组规则 |
| FR-ML01-2 | 优先级视图 |
| FR-ML01-3 | 用户纠正机制 |
| FR-ML01-4 | 分组指标 |

---

## 依赖关系

### 上游依赖
| 模块 | 依赖原因 |
|---|---|
| Storage Service | 读取邮件元数据与分类结果 |
| FTS Index | 提取特征（主题/发件人/关键词） |

### 下游依赖
| 模块 | 被调用场景 |
|---|---|
| UI 层 SmartInbox 视图 | 渲染优先收件箱与普通列表 |

---

## 数据流

**输入**: 邮件元数据、规则表、用户纠正记录  
**输出**: 分组列表、优先视图、分组统计

---

## 核心设计

### 组件
- **Classifier**: 基于规则将邮件映射到分类
- **Override Engine**: 用户纠正优先级与分类
- **Group Stats**: 统计未读与最近更新时间

### 设计约束
- 规则必须可解释（基于字段/发件人/标签）
- 纠正记录可追溯且可回滚

---

## 接口定义（IPC）

| 接口编号 | 接口名称 | 说明 |
|---|---|---|
| API-SI-01 | getSmartInboxSummary | 获取分组统计与优先视图 |
| API-SI-02 | setSmartInboxOverride | 记录用户纠正 |
| API-SI-03 | listSmartInboxGroups | 拉取完整分组列表 |

---

## 数据结构

```ts
interface SmartInboxGroup {
  id: string;
  label: 'important' | 'personal' | 'notifications' | 'newsletters' | 'low_priority';
  unreadCount: number;
  latestAt: string;
}

interface SmartInboxOverride {
  id: string;
  emailId: string;
  accountId: string;
  category: SmartInboxGroup['label'];
  reason: 'user_mark_important' | 'user_mark_unimportant';
  createdAt: string;
}
```

---

## 状态机设计

**STATE-SI-01: 纠正记录状态**

| 状态 | 说明 |
|---|---|
| active | 生效中 |
| revoked | 被用户撤销 |

---

## 边界条件

| 编号 | 条件 | 处理方式 |
|---|---|---|
| BOUND-SI-01 | 分类枚举非法 | 返回参数错误 |
| BOUND-SI-02 | 同一邮件重复纠正 | 合并为最新记录 |

---

## 实现文件

| 文件路径 | 职责 |
|---|---|
| src-tauri/src/core/smart_inbox.rs | 分类与纠正规则 |
| src-tauri/src/commands.rs | IPC 命令入口 |
| src/components/mail/SmartInbox.tsx | 前端视图 |

---

## 验收标准

| 标准 | 要求 |
|---|---|
| AC-ML01-01 | 分组规则可解释且可纠正 |
| AC-ML01-02 | 优先视图与普通列表同时可用 |
| AC-ML01-03 | 分组未读与更新时间准确 |

