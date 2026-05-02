# Nexus Mail 通用测试规范与质量标准 (v2.0)

本文档旨在为所有新功能的开发提供统一的质量衡量标准，确保系统在复杂交互下的高内效与安全性。

## 1. 测试分层原则 (Standard Layers)

### 1.1 逻辑层 (Unit/Integration)
- **无状态逻辑**: 纯函数、加解密算法必须通过 100% 覆盖的单元测试。
- **持久化隔离**: 任何涉及数据库的操作必须验证“多账户隔离” (WHERE account_id = ?)。
- **协议模拟**: 后端集成测试必须在 `MockServers` 环境下运行，验证 Socket 协议闭环。

### 1.2 表现层 (VRT)
- **视觉一致性**: 所有新增 UI 组件必须建立视觉基准图。
- **状态覆盖**: 必须包含：**正常态**、**悬停态 (Hover)**、**选中态 (Selected)**。
- **布局鲁棒性**: 验证在不同窗口尺寸下的瀑布流或弹性布局表现。

### 1.3 交互层 (E2E)
- **定位标准**: **严禁**使用具体的 CSS Class 或 Index 定位。必须统一使用 `data-testid`。
- **环境隔离**: E2E 必须同时支持“浏览器 Mock 模式”（快速反馈）和“Tauri 集成模式”（深度验证）。
- **桌面路径验证**: 涉及本地文件保存、附件下载、导出、打开系统对话框的功能，除浏览器 Mock 外，必须至少有一条 **打包桌面版真实路径** 验证，覆盖 capability / permission scope 与系统文件选择行为。

---

## 2. 通用测试用例标准 (Feature Baseline)

任何新功能（Feature）的 PR 必须满足以下 **“六点验证”** 标准：

### 2.1 状态同步 (State Sync)
- **动作**: 执行修改逻辑 (如：删除、标记、移动)。
- **验证**: 
    - [ ] 后端持久化成功 (数据库记录更新)。
    - [ ] 前端视图实时刷新。
    - [ ] 关联组件 (如侧边栏未读数、Badge) 同步更新。
    - [ ] 若动作受确认框保护，必须验证 **确认前无副作用**、确认后才落库/刷新。

### 2.2 视图完整性 (View Integrity)
- **验证**:
    - [ ] **Loading 态**: 请求未返回时显示 Skeleton 或 Spinner。
    - [ ] **Empty 态**: 无数据时显示友好的占位提示。
    - [ ] **Error 态**: 请求失败时弹出 Toast 或展示重试按钮。

### 2.3 边界与负值 (Boundaries)
- **验证**:
    - [ ] 输入为空或包含非法字符时的校验拦截。
    - [ ] 后端返回 500 或网络断开时的优雅降级。
    - [ ] 大数据量（大量附件或超长文本）下的渲染性能。
    - [ ] 用户取消系统确认框 / 保存对话框时，不得产生任何删除、移动、写文件等副作用。

### 2.4 安全性审计 (Security) [强制]
- **验证**:
    - [ ] **防注入**: 渲染 HTML 必须经过 `DOMPurify` 审计。
    - [ ] **防泄露**: 验证搜索或筛选逻辑不会越权访问其它账户数据。
    - [ ] **凭据安全**: 验证敏感信息不以明文形式出现在日志或本地存储中。

---

## 3. E2E 场景模板库 (Templates)

| 模式 | 描述 | 标准断言 |
| :--- | :--- | :--- |
| **CRUD 模板** | 增删改查类操作 | `expect(item).not.toBeVisible()` / `expect(db).to_have_record()` |
| **Search 模板** | 过滤类操作 | `expect(count).toBe(1)` -> `clear()` -> `expect(count).toBe(original)` |
| **Toggle 模板** | 状态切换 (Flag/Read) | `expect(icon).toHaveClass('active')` -> `SyncBadge` 更新 |
| **Switch 模板** | 导航切换 (Account/Folder) | 全局 Context 刷新，List 重新 Loading 并显示新数据集 |

---

## 4. 持续集成与更新流程

- **Snapshot 更新**: 当 UI 故意变更（如重构、新增功能）导致 VRT 失败时，必须手动运行 `playwright test --update-snapshots` 并提交新的基准图。
- **测试现状检查表**:
    - [x] 模块化 Mock 数据映射 (保证 Web/App 双端一致性)。
    - [x] 统一 `data-testid` 命名空间 (如 `action-xxx`, `badge-xxx`)。
    - [x] 所有 Tauri `invoke` 必须有对应的 Mock Case。
