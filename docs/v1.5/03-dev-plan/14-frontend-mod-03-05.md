# 前端开发计划 - 计划发送与模板模块

## 文档信息
- **模块编号**: MOD-03-05
- **模块名称**: 计划发送与模板签名
- **对应架构**: docs/v1.5/02-architecture/03-05-send-schedule-template.md
- **优先级**: P1

---

## 开发任务拆分

| 任务编号 | 任务名称 | 涉及文件 | 依赖 |
|---|---|---|---|
| T-01 | IPC 调用封装 | src/lib/tauri.ts | - |
| T-02 | 计划发送 UI | src/components/mail/ComposeModal.tsx | T-01 |
| T-03 | 模板管理 UI | src/components/settings/SettingsModal.tsx | T-01 |
| T-04 | 签名管理 UI | src/components/settings/SettingsModal.tsx | T-01 |
| T-05 | E2E 用例 | e2e/verification/compose.spec.ts | T-02 |

