# 集成测试计划 - 计划发送与模板模块

## 文档信息
- **模块编号**: MOD-03-05
- **模块名称**: 计划发送与模板签名
- **对应架构**: docs/v1.5/02-architecture/03-05-send-schedule-template.md
- **优先级**: P1

---

## 测试场景

| 场景编号 | 场景名称 | 预期结果 |
|---|---|---|
| INT-SS-01 | 计划发送 | 邮件按时间发送 |
| INT-TP-01 | 模板插入 | 模板内容进入正文 |
| INT-SG-01 | 签名插入 | 签名按账户生效 |

---

## 任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | Mock 计划发送 | e2e/helpers/mockConfig.ts | - |
| T-02 | 计划发送用例 | e2e/verification/compose.spec.ts | T-01 |
| T-03 | 模板/签名用例 | e2e/verification/compose.spec.ts | T-01 |

