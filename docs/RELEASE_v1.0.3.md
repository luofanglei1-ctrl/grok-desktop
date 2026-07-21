# Grok Desktop v1.0.3 版本更新说明

**发布日期：** 2026-07-22  
**维护者：** luofanglei · 1551180125@qq.com  
**仓库：** https://github.com/luofanglei1-ctrl/grok-desktop  

---

## 下载

| 文件 | 说明 |
|------|------|
| `Grok-Desktop-1.0.3-Windows-Setup-x64.exe` | **推荐** Windows 安装包 |
| `Grok-Desktop-1.0.3-Windows-Portable-x64.exe` | Windows 便携版 |

使用前请安装并登录官方 Grok CLI：`grok login`（[x.ai/cli](https://x.ai/cli)）。

---

## 本版本亮点

### 主题

- **深色 / 普通（浅色）** 可切换（设置 → 外观）
- 颜色已抽离为 design token，布局与字号阶梯不变

### 上下文与压缩（对齐官方 CLI）

- 对话顶栏展示 **ctx 用量**（按当前模型窗口估算，如 2M 的 85% ≈ 1.7M）
- **自动压缩**：达到阈值（默认 85%，读自 CLI `config.toml`）时自动 `/compact`
- **手动压缩**：顶栏按钮 / 设置；支持可选「保留说明」
- 压缩与 `/context` 为**系统调用**，不再往对话里插入命令气泡

### UI

- 思考过程完整展示（可折叠）
- 长消息折叠优化
- 滚动条无箭头、两头圆角
- 浅色主题选中态与对话卡片可读性优化

### 继承 1.0.2

- 关闭默认进托盘；托盘右键退出
- 完成后系统通知（去重、不重复打扰）
- 计划 / 目标模式、+ 菜单等

---

## 升级说明

1. 托盘右键「退出」关闭旧版本  
2. 运行 Setup 覆盖安装，或替换便携版  
3. 在 **设置 → 外观** 确认主题；**自动压缩** 默认开启  

---

**完整变更：** [CHANGELOG.md](../CHANGELOG.md)  
**主题设计：** [THEME-SWITCH-DESIGN.md](./THEME-SWITCH-DESIGN.md)
