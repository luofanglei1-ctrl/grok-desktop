# Grok Desktop v1.0.1 版本更新说明

**发布日期：** 2026-07-21  
**维护者：** 罗方磊（luofanglei）· [1551180125@qq.com](mailto:1551180125@qq.com)  
**仓库：** https://github.com/luofanglei1-ctrl/grok-desktop  

---

## 下载

| 文件 | 说明 |
|------|------|
| `Grok-Desktop-1.0.1-Windows-Setup-x64.exe` | **推荐** Windows 安装包（开始菜单 / 桌面快捷方式） |
| `Grok-Desktop-1.0.1-Windows-Portable-x64.exe` | Windows 便携版（免安装） |

> 使用前请先安装并登录官方 Grok CLI：`grok --version` / `grok login`（[x.ai/cli](https://x.ai/cli)）

---

## 本版本亮点

### 1. 「+」添加菜单

- 输入框左侧 **+**，菜单在按钮**上方**展开（不挡输入）。
- **文件和文件夹 / 图片**：附加到本轮对话。
- **任务模式 / 计划模式 / 目标**：一键切换工作方式。
- **访问权限**：快速进入设置。

### 2. 计划模式（对齐官方 CLI）

- 对应官方 `/plan` 与 ACP `session/set_mode`。
- 侧边 **计划面板**（Offcanvas，不挤压对话布局）。
- 输入框上方模式芯片提示当前为计划模式。

### 3. 目标模式（对齐官方 CLI）

- 对应官方 `/goal`（开始 / 暂停 / 恢复 / 状态 / 清除）。
- **点「+ → 目标」后，直接在对话框输入目标并发送**，无需再弹二次输入框。
- 目标进行中：在输入框**标签**上操作  
  **状态 · 暂停 · 恢复 · 清除**（鼠标悬停显示完整名称）。
- 实时接收 `goal_updated` 进度。

### 4. 完成后系统通知

- 对话一轮结束，或**目标完成 / 受阻**时：
  - 弹出 **系统通知**
  - 应用内 **Toast** 提示
- 设置中可关闭「完成后通知」。
- 点击系统通知可回到应用窗口。

### 5. 开机自启

- **设置 → 开机自启**：登录系统时自动启动 Grok Desktop。
- 安装包运行更稳定；开发模式受系统限制可能不一致。

### 6. 多分辨率与字号

- 适配 **1080p / 2K / 4K**：侧栏、对话宽度、字号自动调整。
- **设置 → 界面缩放**：自动 / 100% / 110% / 125% / 150%。

### 7. 浮层 UI（不挤布局）

- 弹窗、提示、抽屉基于 **Bootstrap 5 + GrokUI**。
- Modal / Toast / Offcanvas 均为浮层，打开时不改变主界面布局。

### 8. 环境页（你的信息）

- **设置 → 环境** 展示维护者信息（`src/brand.js`）：
  - 罗方磊 · @luofanglei1-ctrl · 1551180125@qq.com
  - 项目仓库 / Issues / Releases

---

## 修复

- 对话结束时因状态竞态导致**不弹出完成通知**的问题。
- Windows 下通过 `AppUserModelId` 改善系统通知显示。
- 目标操作收敛到输入框标签，避免加号菜单过长。

---

## 升级说明

1. 关闭正在运行的 Grok Desktop。  
2. 运行安装包覆盖安装，或替换便携版文件。  
3. 首次打开确认 **设置 → 完成后通知 / 开机自启** 是否符合习惯。  
4. CLI 与登录仍使用本机官方 `grok`，桌面版不替代登录。

---

## 已知说明

- 未做商业代码签名时，Windows SmartScreen 可能提示「未知发布者」，请确认安装包来自本仓库 Release。
- 系统通知依赖 Windows 通知权限；「专注助手」可能拦截。
- 开发模式（`npm start` / `electron .`）下系统通知可能不如安装包稳定。

---

## English summary

**Grok Desktop v1.0.1** adds a composer **+ menu**, official-style **Plan** and **Goal** modes (type goals in the chat box), **OS completion notifications**, **open at login**, multi-resolution UI scaling, Bootstrap/GrokUI overlays, and maintainer branding for **luofanglei / luofanglei1-ctrl**.

---

**完整变更记录：** [CHANGELOG.md](../CHANGELOG.md)  
**项目说明：** [README.md](../README.md)  
**关于维护者：** [ABOUT.md](./ABOUT.md)
