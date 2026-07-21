# Grok Desktop 主题切换设计文档

| 项 | 内容 |
|----|------|
| 文档版本 | 1.0 |
| 状态 | P0 已实现（颜色 token 抽离 + 深色/普通切换） |
| 适用版本 | 基于 1.0.2+ 代码基线 |
| 分支建议 | `dev` |
| 维护者 | luofanglei |
| 相关规范 | `.grok/skills/grok-desktop-ui/SKILL.md` |

---

## 1. 背景

当前 Grok Desktop 仅提供**深色主题**，颜色集中在 `renderer/styles.css` 的 CSS 变量与 `bootstrap-theme.css` 中。用户需要在深色之外增加**普通（浅色）主题**，并在设置中可切换、可持久。

约束：

- 技术栈：Electron + vanilla renderer + Bootstrap 5 + GrokUI  
- 禁止引入 React/Vue 等新框架  
- 弹层与表单继续走组件库；颜色走 design token  
- 不改变布局体系（侧栏宽、内容宽、字号阶梯、多分辨率逻辑）

---

## 2. 目标

### 2.1 功能目标

| ID | 目标 | 优先级 |
|----|------|--------|
| T1 | 支持 **深色 / 普通（浅色）** 两套主题 | P0 |
| T2 | 设置 → 外观 中可选择，**即时预览** | P0 |
| T3 | 写入桌面设置，**重启后保持** | P0 |
| T4 | 主壳、对话、输入区、设置、Modal/Toast/Offcanvas 均可读可用 | P0 |
| T5 | 默认仍为深色，兼容老用户 | P0 |
| T6 | 硬编码暗色清理、Diff 浅色、壁纸组合优化 | P1 |
| T7 | 跟随系统主题（`prefers-color-scheme`） | P2 |

### 2.2 非目标（本期不做）

- 第三套「高对比 / OLED」主题  
- 按壁纸自动取色  
- 在线下载主题包  

---

## 3. 现状分析

| 模块 | 现状 | 影响 |
|------|------|------|
| `styles.css` `:root` | 全套暗色 token | 扩展 light 覆盖即可 |
| `html data-bs-theme` | 固定 `dark` | 需与产品主题同步 |
| `bootstrap-theme.css` | 仅 dark 桥接 | 需补 light |
| `settings.js` | 已有 `theme: "dark"` | 字段可直接用 |
| 设置 UI | 无主题下拉 | 需新增 |
| 部分组件 | 写死 `#0a0a0c` 等 | 浅色需改变量或补丁 |

**结论：** 采用「**双套 CSS 变量 + `data-theme` 切换**」成本最低、与现架构一致。

---

## 4. 总体架构

```text
┌──────────────────────────────────────────────┐
│  设置 → 外观 → 界面主题                        │
│  [深色 ▾] / [普通（浅色）]   form-select       │
└────────────────────┬─────────────────────────┘
                     │ change（即时）/ 保存设置
                     ▼
              applyTheme(mode)
        ┌────────────┼────────────┐
        ▼            ▼            ▼
 html[data-theme]  data-bs-theme  settings.json
  dark | light    dark | light   theme: "..."
        │            │
        ▼            ▼
   styles.css   bootstrap-theme.css
   （产品壳）    （Modal/Toast/Offcanvas）
        │
        ▼
  window background（可选 IPC）
```

### 4.1 单一开关

| 属性 | 值 | 作用 |
|------|-----|------|
| `html[data-theme]` | `dark` \| `light` | 产品 CSS 变量 |
| `html[data-bs-theme]` | `dark` \| `light` | Bootstrap 5.3 组件 |

两值**始终一致**，由 `applyTheme()` 统一写入。

### 4.2 设置字段

```ts
// src/settings.js DEFAULT_DESKTOP
theme: "dark" | "light"   // 默认 "dark"
```

存储路径：桌面配置目录 `settings.json`（与密度、缩放等并列）。

---

## 5. 设计令牌（Design Tokens）

### 5.1 语义 Token 清单

| Token | 语义 | 深色（当前） | 普通/浅色（建议） |
|-------|------|--------------|-------------------|
| `--bg` | 主背景 | `#09090b` | `#f4f4f5` |
| `--bg-elev` | 抬升背景 | `#111114` | `#ffffff` |
| `--side` | 侧栏 | `#0c0c0f` | `#fafafa` |
| `--panel` | 卡片/面板 | `#141418` | `#ffffff` |
| `--hover` | 悬停 | `#1c1c22` | `#f0f0f3` |
| `--active` | 按下/选中 | `#24242c` | `#e4e4e7` |
| `--line` | 主分割线 | `#27272f` | `#e4e4e7` |
| `--line-soft` | 弱分割线 | `#1e1e26` | `#ececef` |
| `--text` | 主文字 | `#fafafa` | `#18181b` |
| `--muted` | 次要文字 | `#a1a1aa` | `#52525b` |
| `--dim` | 更弱文字 | `#71717a` | `#71717a` |
| `--accent` | 品牌强调 | `#8b5cf6` | `#7c3aed` |
| `--accent-soft` | 强调浅底 | `rgba(139,92,246,.15)` | `rgba(124,58,237,.12)` |
| `--accent-2` | 次强调 | `#6366f1` | `#6366f1` |
| `--ok` | 成功 | `#4ade80` | `#16a34a` |
| `--warn` | 警告 | `#fbbf24` | `#d97706` |
| `--err` | 错误 | `#fb7185` | `#e11d48` |
| `--composer-bg` | 输入区 | `rgba(20,20,24,.96)` | `#ffffff` |
| `--composer-border` | 输入边框 | `#2e2e36` | `#e4e4e7` |
| `--menu-bg` | 下拉/加号菜单 | `#16161c` | `#ffffff` |
| `--code-bg` | 代码/路径块 | `#0a0a0c` | `#f4f4f5` |
| `--scrollbar-thumb` | 滚动条 | `#2e2e36` | `#d4d4d8` |
| `--scrollbar-thumb-hover` | 滚动条悬停 | `#4b4b55` | `#a1a1aa` |
| `--user-bubble` | 用户气泡 | 紫半透明 | 淡紫底 |
| `--asst-bubble` | 助手气泡 | 近透明 | 白底 |
| `--shadow` | 阴影 | 重黑影 | 浅灰影 |

### 5.2 布局 Token（两主题共用）

| Token | 说明 |
|-------|------|
| `--side-w` / `--content` / `--page-pad-x` | 布局宽度与边距 |
| `--fs-*` / `--font-scale` | 字号阶梯与缩放 |
| `--radius` / `--font` / `--mono` | 圆角与字体 |

**原则：** 主题切换**只改颜色与表面**，不改布局与字号体系。

### 5.3 对比度要求

- 正文与背景：优先满足 **WCAG AA**（约 4.5:1）  
- 浅色下强调色略加深（`#7c3aed`），避免紫在白底上过飘  
- 壁纸 + 浅色：P1 可提高默认压暗，保证字可读  

---

## 6. 界面与交互

### 6.1 入口

**路径：** 设置 → 外观（`panel-appearance`）

**位置：** 密度、缩放之前（主题优先于细节）。

### 6.2 控件规格

| 项 | 规格 |
|----|------|
| 容器 | 现有 `.scard` / `.scard-row` |
| 控件 | `select.form-select.form-select-sm`（Bootstrap） |
| id | `set-theme` |
| 选项 | `value="dark"` / `value="light"` |

### 6.3 文案（i18n）

| Key | 中文 | English |
|-----|------|---------|
| `settings.theme` | 界面主题 | Theme |
| `settings.themeDesc` | 深色或普通（浅色）模式 | Dark or light (normal) mode |
| `settings.theme.dark` | 深色 | Dark |
| `settings.theme.light` | 普通（浅色） | Light |
| `settings.appearanceLead` | 主题、界面密度、聊天背景 | Theme, density, and chat wallpaper |

### 6.4 交互流程

```text
打开设置 → 外观
  → 下拉显示当前 theme（默认 dark）
  → 用户选择「普通（浅色）」
      → applyTheme("light")          // 立即换肤
      → saveDesktopSettings({ theme: "light" })
  → 重启应用 → 仍为 light

选择「深色」同理
```

- **即时预览**：`change` 即生效  
- **无整页刷新**、无布局跳动  
- 「保存设置」再次写入，保证与其它项一致  

---

## 7. 技术设计

### 7.1 CSS 结构（`styles.css`）

```css
/* 深色（默认） */
:root,
html[data-theme="dark"] {
  /* 表 5.1 深色列 */
  color-scheme: dark;
}

/* 普通 / 浅色 */
html[data-theme="light"] {
  /* 表 5.1 浅色列 */
  color-scheme: light;
}

/* 布局 token 与字号：两主题共用 */
:root {
  --side-w: ...;
  --fs-base: ...;
}

/* 组件补丁：仅处理无法纯靠变量覆盖的区域 */
html[data-theme="light"] .turn.user .body { ... }
html[data-theme="light"] .dropdown-menu-dark { /* 映射为浅色表面 */ }
html[data-theme="light"] .offcanvas.text-bg-dark { ... }
```

### 7.2 Bootstrap 桥接（`bootstrap-theme.css`）

| 选择器 | 内容 |
|--------|------|
| `[data-bs-theme="dark"]` | 保持现有映射 |
| `[data-bs-theme="light"]` | body/border/primary/modal/offcanvas 对齐浅色 token |

保证 Modal、Toast、Offcanvas、form-control 与壳一致。

### 7.3 应用逻辑（`app.js`）

```js
/**
 * @param {"dark"|"light"} theme
 */
function applyTheme(theme) {
  const mode = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-bs-theme", mode);
  desktopSettings.theme = mode;
  // 可选：主进程窗口背景，避免闪黑/闪白
  grokDesktop.setWindowBackground?.(
    mode === "light" ? "#f4f4f5" : "#09090b"
  );
}
```

**调用点：**

| 时机 | 行为 |
|------|------|
| Boot / `getSettings` | `applyTheme(desktopSettings.theme \|\| "dark")` |
| `#set-theme` change | 预览 + `saveDesktopSettings({ theme })` |
| 保存设置 | 写入完整 settings 含 `theme` |
| 填充设置表单 | `#set-theme` 选中当前值 |

### 7.4 主进程（可选 P0）

```js
// IPC: app:setWindowBackground
mainWindow.setBackgroundColor(color)
```

Preload 暴露：`setWindowBackground(color)`。

### 7.5 持久化

| 项 | 说明 |
|----|------|
| 键 | `theme` |
| 合法值 | `"dark"` \| `"light"` |
| 非法值 | 回退 `"dark"` |
| 文件 | `appConfigDir()/settings.json` |

---

## 8. 适配面清单

| 界面 | 适配方式 | 阶段 |
|------|----------|------|
| 侧栏 / 会话列表 / 导航 | token | P0 |
| 主聊天区 / 顶栏 | token | P0 |
| 用户/助手气泡 | token + 少量补丁 | P0 |
| 输入框 / 工具条 | `--composer-*` | P0 |
| + 菜单 / 下拉 | `--menu-bg` + BS light | P0 |
| 设置 scard / 表单 | token + form-select | P0 |
| 计划 / 目标 Offcanvas | BS light + token | P0 |
| Modal / Toast | BS theme | P0 |
| 滚动条 | `--scrollbar-*` | P0 |
| Diff / 代码高亮 | 浅底 + 现有高亮或微调 | P1 |
| 壁纸 + 浅色 | 压暗策略 | P1 |
| 硬编码色扫尾 | 改为 var | P1 |
| 跟随系统 | 第三选项 `system` | P2 |

---

## 9. 实现分期

### P0（本期交付）

1. `styles.css`：light 全套颜色 token + 必要组件补丁  
2. `bootstrap-theme.css`：light 桥接  
3. `app.js`：`applyTheme` + boot / 设置读写  
4. `index.html` + `i18n`：主题下拉  
5. （推荐）窗口背景色 IPC  

**验收：** 见第 11 节 P0 项。

### P1

- 硬编码色替换为变量  
- Diff / highlight 浅色可读性  
- 浅色 + 壁纸默认 dim 策略  

### P2

- 选项「跟随系统」  
- `theme: "system"` + `matchMedia('(prefers-color-scheme: dark)')` 监听  

---

## 10. 文件变更清单（实现时）

| 文件 | 变更 |
|------|------|
| `renderer/styles.css` | dark/light token + 补丁 |
| `renderer/bootstrap-theme.css` | light 桥接 |
| `renderer/app.js` | `applyTheme`、设置联动 |
| `renderer/index.html` | 外观主题 `select` |
| `renderer/i18n.js` | 中英文案 |
| `src/settings.js` | 确认 `theme` 默认与校验（已有字段） |
| `main.js` / `preload.js` | 可选窗口背景 IPC |
| `.grok/skills/grok-desktop-ui/` | 实现后补充「双主题」约定（可选） |

---

## 11. 验收标准

### P0 必过

- [ ] 设置中可切换 **深色 / 普通（浅色）**，切换后 **1 帧内**可见换肤  
- [ ] 重启后主题与上次一致  
- [ ] 默认打开为 **深色**  
- [ ] 侧栏、对话、输入框、设置页无大块未换肤区域  
- [ ] Modal / Toast / Offcanvas 与主题一致  
- [ ] 布局宽度、字号阶梯、缩放逻辑与切换前一致  
- [ ] 无新增前端框架、无 CDN  

### P1

- [ ] 无明显残留纯黑/纯白硬编码块  
- [ ] Diff 在浅色下可读  

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 硬编码暗色残留 | 浅色下「一块黑」 | P0 覆盖主路径；P1 全量扫 |
| `dropdown-menu-dark` 写死 | 菜单仍黑 | light 下覆盖 BS 变量或条件 class |
| 壁纸过亮/过暗 | 字看不清 | 浅色时提高默认 dim 或提示 |
| 曾实现又撤销 | 半套 CSS 冲突 | 按本文档干净实现，避免残留 `theme-light` 半状态 |
| Toast 与系统通知 | 与主题无关 | 不改通知逻辑，仅样式跟随 BS |

---

## 13. 测试计划

| 用例 | 步骤 | 期望 |
|------|------|------|
| 默认深色 | 新用户 / 无 theme 字段 | 深色界面 |
| 切到普通 | 外观选浅色 | 即时浅色 |
| 持久化 | 选浅色 → 重启 | 仍浅色 |
| 切回深色 | 选深色 | 即时深色 |
| 浮层 | 浅色下打开计划/目标/确认框 | 浮层为浅色表面 |
| 布局 | 切换前后对比侧栏与对话宽 | 无变化 |
| 缩放 | 浅色 + 125% 缩放 | 主题与缩放独立生效 |
| 中英 | 切换语言 | 主题选项文案正确 |

---

## 14. 与现有模块关系

| 模块 | 关系 |
|------|------|
| 多分辨率 / uiScale | 独立；theme 不改 layout token |
| 壁纸 | 共用对话区；浅色时注意对比度 |
| 托盘 / 关闭行为 | 无耦合 |
| 完成通知 | 无耦合；Toast 样式随 BS theme |
| GrokUI | 不新增 API；依赖 `data-bs-theme` |

---

## 15. 开放问题

| # | 问题 | 建议默认 |
|---|------|----------|
| 1 | 普通主题文案用「普通」还是「浅色」？ | **普通（浅色）** 双写 |
| 2 | 是否 P0 就做跟随系统？ | **否**，P2 |
| 3 | 浅色下壁纸默认 dim 是否提高？ | P1，如从 45 → 55 |
| 4 | Diff 语法高亮是否两套？ | P1，先浅底够用即可 |

---

## 16. 附录：伪代码

### 16.1 应用主题

```js
function applyTheme(theme) {
  const mode = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-bs-theme", mode);
  desktopSettings.theme = mode;
  grokDesktop.setWindowBackground?.(
    mode === "light" ? "#f4f4f5" : "#09090b"
  );
}
```

### 16.2 设置变更

```js
$("set-theme")?.addEventListener("change", () => {
  const mode = $("set-theme").value === "light" ? "light" : "dark";
  applyTheme(mode);
  void grokDesktop.saveDesktopSettings({ theme: mode });
});
```

### 16.3 CSS 骨架

```css
:root, html[data-theme="dark"] { /* dark tokens */ }
html[data-theme="light"] { /* light tokens */ }
```

---

## 17. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-07-21 | 初稿：双主题 P0/P1/P2 方案 |

---

**下一步：** 评审通过后在 `dev` 分支按 **P0** 实现；需要色值微调时先改本文表 5.1 再动代码。
