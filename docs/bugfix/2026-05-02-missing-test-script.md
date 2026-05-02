# Bug Fix: Missing npm test script

## 问题描述
- 日期: 2026-05-02
- 严重程度: Medium
- 影响范围: 本地测试流程

## 根因分析
- 问题位置: package.json:7-15
- 原因: scripts 中缺少 "test" 入口，导致 `npm test` 直接失败
- 代码流程: npm 读取 scripts.test，缺失时直接抛错并终止

## 修复方案
- 修改文件: package.json
- 修改内容: 新增 `"test": "npm run test:e2e"` 脚本

## 验证步骤
1. ✅ 运行 `npm test` 观察不再提示 Missing script

## 相关测试
- test:e2e (playwright test compose.spec.ts)

## 设计建议
- 保持 package.json 中提供统一的 `npm test` 入口，避免工具链默认命令失败
