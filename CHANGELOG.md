# Changelog

本项目版本记录。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

**维护者：** luofanglei· [1551180125@qq.com](mailto:1551180125@qq.com) · [@luofanglei1-ctrl](https://github.com/luofanglei1-ctrl)

仓库：https://github.com/luofanglei1-ctrl/grok-desktop

> **GitHub Release 正文：** [docs/RELEASE_v1.0.5.md](./docs/RELEASE_v1.0.5.md) · [docs/RELEASE_v1.0.4.md](./docs/RELEASE_v1.0.4.md)

---

## [1.0.5] — 2026-07-22

### 修复

- **发送失败不再显示 `[object Object]`**
  - ACP JSON-RPC 错误对象转为真正的 `Error`（含 `message` / `code`）
  - `session:prompt` / `session:run-slash` IPC 兜底序列化
  - 渲染进程剥离 Electron invoke 包装前缀，展示可读错误

### 变更

- 版本号 **1.0.5**

### 安装包

- `Grok-Desktop-1.0.5-Windows-Setup-x64.exe`
- `Grok-Desktop-1.0.5-Windows-Portable-x64.exe`

---

## [1.0.4] — 2026-07-22

### 修复

- **退出再打开不再弹出旧的「任务/目标完成」提示**
  - 完成记录可靠落盘到 Electron `userData`
  - 目标仅在状态**新变为** complete 时提示（重开 seed 不弹）
  - 连接/恢复的 `ready` 不再误判为对话结束
  - 仅真实用户 prompt 结束后才发「任务已完成」

### 变更

- 版本号 **1.0.4**

### 安装包

- `Grok-Desktop-1.0.4-Windows-Setup-x64.exe`
- `Grok-Desktop-1.0.4-Windows-Portable-x64.exe`

---

## [1.0.3] — 2026-07-22

### 新增

- **深色 / 普通（浅色）主题切换**（设置 → 外观），颜色 token 抽离，即时生效并持久化。
- **上下文窗口用量条**（对话顶栏）：按**当前模型 context 窗口**估算占用百分比与 token。
- **自动压缩**：达到 CLI 阈值（默认模型窗口的 **85%**，非固定 2M）时自动执行 `/compact`。
- **手动压缩**：顶栏「压缩」、可选保留说明；静默调用，不往对话插入 `/compact` 消息。
- 思考过程完整展示（可折叠块）；聊天长文折叠优化。
- 统一 UI 滚动条（无箭头、圆角）；浅色主题选中态/对话卡片样式优化。

### 变更

- 版本号 **1.0.3**。
- 系统指令（compact / context 等）改为静默调用。

### 安装包

- `Grok-Desktop-1.0.3-Windows-Setup-x64.exe`
- `Grok-Desktop-1.0.3-Windows-Portable-x64.exe`

---

## [1.0.2] — 2026-07-21

### 新增

- **关闭窗口行为**：默认点击 × 最小化到系统托盘；设置中可改为「直接退出」。
- **托盘菜单**：右键托盘图标 → 显示主窗口 / 退出。
- 打包图标明确使用 `assets/icon.ico` / `icon.png`（含安装程序图标）。

### 变更

- 版本号 **1.0.2**。
- 移除顶部 File / Edit / View / Window / Help 菜单栏。

### 安装包

- `Grok-Desktop-1.0.2-Windows-Setup-x64.exe`
- `Grok-Desktop-1.0.2-Windows-Portable-x64.exe`

---

## [1.0.1] — 2026-07-21

### 新增

- **+ 添加菜单**（输入框左侧）：向上展开；附加文件/文件夹与图片；切换任务 / 计划 / 目标模式；访问权限入口。
- **计划模式**：对齐官方 CLI `/plan` 与 ACP `session/set_mode`；Offcanvas 计划面板；模式芯片。
- **目标模式**：对齐官方 `/goal`（start / pause / resume / status / clear）。
  - 在对话框直接输入目标并发送，无需二次弹窗。
  - 输入框标签：状态 / 暂停 / 恢复 / 清除（悬停显示完整名称）。
  - 接收 `goal_updated` 实时进度。
- **完成后系统通知**：对话轮次或目标完成时弹出系统通知 + 应用内 Toast（设置可关）。
- **开机自启**：设置中可开启登录时启动（`app.setLoginItemSettings`）。
- **多分辨率适配**：侧栏 / 内容宽度 / 字号 token 适配 1080p、2K、4K；界面缩放（自动 / 100%–150%）。
- **浮层组件体系**：Bootstrap 5 + `GrokUI`（Modal / Toast / Offcanvas），弹层不挤占布局。
- **环境页品牌信息**：`src/brand.js` 配置作者、邮箱、GitHub（luofanglei1-ctrl）。
- 项目 UI 开发 skill：`.grok/skills/grok-desktop-ui/`。

### 变更

- 版本号 **1.0.1**。
- 仓库 / 更新检查地址指向 `luofanglei1-ctrl/grok-desktop`。
- Windows `AppUserModelId` 调整为 `com.luofanglei.grok-desktop`，改善系统通知显示。
- 对话完成通知覆盖**当前会话与后台会话**（不再仅限后台）。

### 修复

- 对话结束时因状态竞态导致不触发完成通知的问题。
- 目标相关操作从加号菜单收敛到输入框标签，避免菜单过长。

### 技术

- `src/brand.js`、`src/acp.js`（setMode / goal_updated）、`renderer/ui-overlay.js`、`renderer/bootstrap-theme.css`。
- 依赖：Bootstrap 5（vendored 至 `renderer/vendor/bootstrap/`）。

### 安装包文件名

- `Grok-Desktop-1.0.1-Windows-Setup-x64.exe`
- `Grok-Desktop-1.0.1-Windows-Portable-x64.exe`

---

## [0.8.x] — 历史版本

- 多会话、排队与引导、计划面板雏形、Diff 卡片、权限模式、MCP / Skills / 插件、中英界面、壁纸等基础能力。

（更早细节见 Git 历史。）

---

[1.0.5]: https://github.com/luofanglei1-ctrl/grok-desktop/releases/tag/v1.0.5
[1.0.4]: https://github.com/luofanglei1-ctrl/grok-desktop/releases/tag/v1.0.4
[1.0.3]: https://github.com/luofanglei1-ctrl/grok-desktop/releases/tag/v1.0.3
[1.0.2]: https://github.com/luofanglei1-ctrl/grok-desktop/releases/tag/v1.0.2
[1.0.1]: https://github.com/luofanglei1-ctrl/grok-desktop/releases/tag/v1.0.1

