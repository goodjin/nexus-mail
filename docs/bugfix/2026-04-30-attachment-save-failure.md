# Bug Fix: packaged app attachment save failure

## 问题描述
- 日期: 2026-04-30
- 严重程度: High
- 影响范围: macOS 打包桌面版附件下载/保存

## 根因分析
- 问题位置:
  - `src-tauri/capabilities/default.json`
  - `src/components/mail/EmailDetail.tsx`
- 原因:
  - Tauri v2 的 `fs:default` 只允许应用目录范围内的文件系统访问，不允许直接写用户通过保存对话框选择的主目录路径。
  - 附件保存逻辑调用 `writeFile(filePath, data)` 时，桌面版会因 FS scope 拒绝而失败。
  - 同时，前端错误提示只有固定文案，无法直接暴露真实失败原因。
- 代码流程:
  1. 用户点击附件下载
  2. `dialog.save()` 返回用户选择的绝对路径
  3. `plugin-fs.writeFile()` 尝试写入该路径
  4. capability 未放开用户主目录写权限，写入被拒绝

## 修复方案
- 修改文件:
  - `src-tauri/capabilities/default.json`
  - `src/components/mail/EmailDetail.tsx`
- 修改内容:
  - 为主窗口增加 `fs:allow-home-write-recursive`，允许保存到用户主目录范围
  - 保存时显式传递 `{ create: true }`
  - 对无扩展名附件不再传无效 `*` 过滤器
  - 失败弹窗改为显示真实错误消息，便于后续定位

## 验证步骤
1. ✅ 定位到附件下载使用 `plugin-dialog.save + plugin-fs.writeFile`
2. ✅ 核对 Tauri FS 插件文档，确认 `fs:default` 不包含用户目录写权限
3. ✅ 更新 capability 与前端保存逻辑
4. ✅ 重新构建并生成新的 `Nexus Mail.app`
5. ✅ 重新启动打包桌面版进程

## 相关测试
- 构建验证:
  - `npm run build --silent`
  - `npm run tauri build -- --bundles app`

## 设计建议
- 如果后续需要支持保存到主目录以外的任意磁盘位置，可将写文件动作下沉到 Rust command，并只对“用户通过保存对话框明确选择的路径”执行写入。
- 附件下载路径属于用户发起的高权限操作，前端固定文案不应吞掉具体错误。
