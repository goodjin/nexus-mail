# 03-05 计划发送与模板签名模块

## 文档信息
- **项目名称**: Nexus Mail
- **文档编号**: MOD-03-05
- **版本**: v1.5
- **更新日期**: 2026-05-04
- **对应PRD**: FR-ML05-1 ~ FR-ML05-3

---

## 系统定位

**所属层次**: 应用/领域层（03）

**核心职责**:
- 计划/延迟发送调度
- 模板管理与插入
- 多签名与条件规则

**边界说明**:
- **负责**: 计划发送与模板/签名管理
- **不负责**: SMTP 发送实现细节

---

## 对应 PRD

| PRD编号 | 内容 |
|---|---|
| FR-ML05-1 | 延迟/计划发送 |
| FR-ML05-2 | 模板系统 |
| FR-ML05-3 | 签名体系 |

---

## 依赖关系

### 上游依赖
| 模块 | 依赖原因 |
|---|---|
| Scheduler | 计划发送触发 |
| SMTP Adapter | 实际发送 |
| Storage Service | 保存模板与签名 |

### 下游依赖
| 模块 | 被调用场景 |
|---|---|
| UI 层 Compose | 模板/签名插入 |
| UI 层 Scheduled | 计划发送管理 |

---

## 数据流

**输入**: draftId + sendAt / template / signature  
**输出**: schedule status / template list / signature profile

---

## 核心设计

### 组件
- **Send Scheduler**
- **Template Manager**
- **Signature Resolver**

---

## 接口定义（IPC）

| 接口编号 | 接口名称 | 说明 |
|---|---|---|
| API-SS-01 | scheduleSend | 计划发送 |
| API-SS-02 | cancelScheduledSend | 取消计划发送 |
| API-SS-03 | listScheduledSends | 列表 |
| API-TP-01 | listTemplates | 模板列表 |
| API-TP-02 | saveTemplate | 新增/更新模板 |
| API-TP-03 | deleteTemplate | 删除模板 |
| API-SG-01 | listSignatures | 签名列表 |
| API-SG-02 | saveSignature | 新增/更新签名 |
| API-SG-03 | deleteSignature | 删除签名 |

---

## 数据结构

```ts
interface ScheduledSend {
  id: string;
  draftId: string;
  accountId: string;
  sendAt: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';
}

interface Template {
  id: string;
  accountId: string;
  name: string;
  subject?: string;
  body: string;
  updatedAt: string;
}

interface SignatureProfile {
  id: string;
  accountId: string;
  name: string;
  content: string;
  isDefault: boolean;
}
```

---

## 状态机设计

**STATE-SS-01: 计划发送**
| 状态 | 说明 |
|---|---|
| scheduled | 已计划 |
| sending | 发送中 |
| sent | 已发送 |
| failed | 失败 |
| canceled | 已取消 |

---

## 边界条件

| 编号 | 条件 | 处理方式 |
|---|---|---|
| BOUND-SS-01 | sendAt <= now | 拒绝 |
| BOUND-SS-02 | 同账户多默认签名 | 仅允许一个默认 |

---

## 实现文件

| 文件路径 | 职责 |
|---|---|
| src-tauri/src/core/send_scheduler.rs | 计划发送逻辑 |
| src-tauri/src/core/template_store.rs | 模板/签名存储 |
| src-tauri/src/commands.rs | IPC 命令入口 |
| src/components/mail/ComposeModal.tsx | 插入模板/签名 |

---

## 验收标准

| 标准 | 要求 |
|---|---|
| AC-ML05-01 | 可设置计划发送时间 |
| AC-ML05-02 | 模板可创建/插入 |
| AC-ML05-03 | 签名按账户可配置 |

