# Grok Desktop v1.0.5 版本更新说明

**发布日期：** 2026-07-22  
**维护者：** luofanglei · 1551180125@qq.com  
**仓库：** https://github.com/luofanglei1-ctrl/grok-desktop  

---

## 下载

| 文件 | 说明 |
|------|------|
| `Grok-Desktop-1.0.5-Windows-Setup-x64.exe` | **推荐** Windows 安装包 |
| `Grok-Desktop-1.0.5-Windows-Portable-x64.exe` | Windows 便携版 |

使用前请安装并登录官方 Grok CLI：`grok login`。

---

## 本版本修复

### 发送失败错误信息可读

- 修复 `session:prompt` 失败时提示 `Error invoking remote method …: [object Object]`
- ACP JSON-RPC 错误转为标准 `Error`，IPC 与界面展示真实原因（超时、会话失效、API 错误等）
- 主进程 / 渲染进程统一错误序列化与文案提取

### 继承 1.0.4

- 退出再打开不再重复弹出「任务/目标完成」
- 深色 / 普通主题、上下文用量、静默压缩等

---

## 升级说明

1. 托盘右键「退出」关闭旧版本  
2. 安装 Setup 或替换便携版  
3. 若发送仍失败，横幅会显示具体原因，便于排查  

---

**完整变更：** [CHANGELOG.md](../CHANGELOG.md)
