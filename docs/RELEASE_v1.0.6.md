# Grok Desktop v1.0.6 版本更新说明

**发布日期：** 2026-07-23  
**维护者：** luofanglei · 1551180125@qq.com  
**仓库：** https://github.com/luofanglei1-ctrl/grok-desktop  

---

## 下载

| 文件 | 说明 |
|------|------|
| `Grok-Desktop-1.0.6-Windows-Setup-x64.exe` | **推荐** Windows 安装包 |
| `Grok-Desktop-1.0.6-Windows-Portable-x64.exe` | Windows 便携版 |

使用前请安装并登录官方 Grok CLI：`grok login`。

---

## 本版本新增

### CLI 配置（参考 CC Switch）

- 设置 → **CLI 配置**：管理 Grok CLI 供应商（`~/.grok/config.toml` 的 `[model.*]`）
- **一键启用**切换默认模型与全局 API 端点
- **添加 / 编辑 / 删除**供应商（Base URL、API Key、上游 model、api_backend 等）
- 内置预设：xAI 官方、OpenAI 兼容中转、Sub2API 风格
- 写配置前自动备份 `config.toml.bak`；列表中 API Key 脱敏显示

### 继承 1.0.5

- 发送失败展示真实错误信息（不再 `[object Object]`）
- 完成提示去重、主题、上下文压缩等

---

## 升级说明

1. 托盘右键「退出」关闭旧版本  
2. 安装 Setup 或替换便携版  
3. 打开 **设置 → CLI 配置** 管理供应商  

---

**完整变更：** [CHANGELOG.md](../CHANGELOG.md)
