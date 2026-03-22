# Nexus Mail 项目初始化完成

项目已成功初始化，基于 Tauri 2.x 和 React (TypeScript) 构建。

## 完成的变更

### 项目骨架
- 初始化了 Tauri 项目结构。
- 核心目录：
    - `src/`: 前端 React + Vite 代码。
    - `src-tauri/`: 后端 Rust 代码。
    - `docs/`: 项目文档。
    - `logs/` & `tmp/`: 符合规则的日志与临时目录。

### 基础配置
- **.gitignore**: 已配置忽略 `logs`, `tmp`, `node_modules` 等。
- **技术栈**:
    - 前端: React + TypeScript + Vite.
    - 后端: Rust (Tauri).
    - 样式: 原生 CSS (CSS Modules).

## 验证结果

- [x] 运行 `ls -R` 确认目录结构正确。
- [x] 确认 `.gitignore` 包含 `logs` 和 `tmp`。

## 后续建议
1. 运行 `npm install` 安装前端依赖。
2. 配置 `src-tauri/Cargo.toml` 以支持 IMAP/SMTP 库。
