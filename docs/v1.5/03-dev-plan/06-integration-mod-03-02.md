# 集成测试计划 - 跨账户聚合模块

## 文档信息
- **模块编号**: MOD-03-02
- **模块名称**: 跨账户聚合与全局搜索
- **对应架构**: docs/v1.5/02-architecture/03-02-unified-inbox-search.md
- **优先级**: P0

---

## 测试场景

| 场景编号 | 场景名称 | 预期结果 |
|---|---|---|
| INT-UI-01 | 统一收件箱渲染 | 多账户邮件展示 |
| INT-UI-02 | 全局搜索结果 | 结果含账户/文件夹 |
| INT-UI-03 | 过滤器收敛 | 结果按账户/文件夹过滤 |

---

## 任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | Mock 数据准备 | e2e/helpers/mockData.ts | - |
| T-02 | 统一收件箱用例 | e2e/verification/mailbox-list.spec.ts | T-01 |
| T-03 | 全局搜索用例 | e2e/verification/search.spec.ts | T-01 |

