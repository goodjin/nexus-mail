# 后端开发计划 - 计划发送与模板模块

## 文档信息
- **模块编号**: MOD-03-05
- **模块名称**: 计划发送与模板签名
- **对应架构**: docs/v1.5/02-architecture/03-05-send-schedule-template.md
- **优先级**: P1

---

## 1. 接口清单

| 任务编号 | 接口编号 | 接口名称 |
|---|---|---|
| T-03 | API-SS-01 | scheduleSend |
| T-03 | API-SS-02 | cancelScheduledSend |
| T-03 | API-SS-03 | listScheduledSends |
| T-04 | API-TP-01~03 | 模板 CRUD |
| T-05 | API-SG-01~03 | 签名 CRUD |

---

## 2. 开发任务拆分

| 任务编号 | 任务名称 | 文件数 | 代码行数 | 依赖 |
|---|---|---:|---:|---|
| T-01 | 模板/签名表结构 | 1 | ≤150 | - |
| T-02 | 计划发送表结构 | 1 | ≤120 | - |
| T-03 | Send Scheduler 逻辑 | 2 | ≤200 | T-02 |
| T-04 | Template Store 逻辑 | 2 | ≤200 | T-01 |
| T-05 | Signature Store 逻辑 | 2 | ≤200 | T-01 |
| T-06 | IPC 命令接线 | 2 | ≤200 | T-03~05 |
| T-07 | 单元测试 | 2 | ≤200 | T-01~06 |

