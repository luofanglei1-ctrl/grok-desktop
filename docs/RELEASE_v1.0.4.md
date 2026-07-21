# Grok Desktop v1.0.4 版本更新说明

**发布日期：** 2026-07-22  
**维护者：** luofanglei · 1551180125@qq.com  
**仓库：** https://github.com/luofanglei1-ctrl/grok-desktop  

---

## 下载

| 文件 | 说明 |
|------|------|
| `Grok-Desktop-1.0.4-Windows-Setup-x64.exe` | **推荐** Windows 安装包 |
| `Grok-Desktop-1.0.4-Windows-Portable-x64.exe` | Windows 便携版 |

使用前请安装并登录官方 Grok CLI：`grok login`。

---

## 本版本修复

### 完成提示不再在重开时重复

- 退出软件再打开时，**不会再弹出**上一次的「任务已完成 / 目标已完成」
- 完成记录写入本机配置目录，跨重启去重
- 仅在新一轮对话真正结束后提示；重连会话 / 恢复目标状态不会误弹

### 继承 1.0.3

- 深色 / 普通（浅色）主题
- 上下文用量条、自动/手动压缩（静默）
- 思考过程完整展示、托盘关闭等

---

## 升级说明

1. 托盘右键「退出」关闭旧版本  
2. 安装 Setup 或替换便携版  
3. 发一轮新对话验证：完成时提示一次；退出再打开不再弹旧提示  

---

**完整变更：** [CHANGELOG.md](../CHANGELOG.md)
