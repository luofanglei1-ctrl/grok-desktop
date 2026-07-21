# Grok Desktop v1.0.2 版本更新说明

**发布日期：** 2026-07-21  
**维护者：** luofanglei· 1551180125@qq.com  
**仓库：** https://github.com/luofanglei1-ctrl/grok-desktop  

---

## 下载

| 文件 | 说明 |
|------|------|
| `Grok-Desktop-1.0.2-Windows-Setup-x64.exe` | **推荐** Windows 安装包 |
| `Grok-Desktop-1.0.2-Windows-Portable-x64.exe` | Windows 便携版 |

使用前请安装并登录官方 Grok CLI：`grok login`（[x.ai/cli](https://x.ai/cli)）。

---

## 本版本更新

### 关闭与托盘

- **默认**：点击窗口关闭按钮 → **最小化到系统托盘**（不退出）。
- **设置 → 关闭窗口时** 可改为 **直接退出**。
- **托盘右键菜单**：显示主窗口、**退出**。
- 单击 / 双击托盘图标可恢复主窗口。

### 界面

- 去掉顶部 **File / Edit / View / Window / Help** 菜单栏。
- 安装包 / 快捷方式使用 `assets` 中的 Grok 图标。

### 继承 1.0.1 能力

- `+` 菜单（附件、任务 / 计划 / 目标模式）
- 计划模式、目标模式
- 完成后系统通知、开机自启
- 多分辨率与界面缩放

---

## 升级说明

1. 关闭正在运行的 Grok Desktop（托盘右键「退出」）。  
2. 运行安装包覆盖安装，或替换便携版。  
3. 在 **设置 → 关闭窗口时** 确认偏好。  

---

**完整变更：** [CHANGELOG.md](../CHANGELOG.md)  
**维护者：** [ABOUT.md](./ABOUT.md)
