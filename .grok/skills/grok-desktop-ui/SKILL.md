---
name: grok-desktop-ui
description: >
  Grok Desktop 页面与 UI 开发规范：必须使用项目 UI 组件库（Bootstrap 5 + GrokUI + 设计 token），
  禁止用裸原生 HTML 控件拼页面。弹窗/提示/抽屉必须用浮层（Modal/Toast/Offcanvas），不得挤占文档流布局。
  Use when: editing grok-desktop renderer, building settings/pages, adding buttons/forms/dialogs/toasts,
  "页面开发", "UI 组件", "弹窗", "Bootstrap", "GrokUI", or any UI work under grok-desktop/.
  Also use when the user runs /grok-desktop-ui.
---

# Grok Desktop UI Skill

You are implementing UI for **Grok Desktop** (Electron + vanilla renderer).  
**UI component library is mandatory.** Do not ship raw native markup as the visual layer.

## Stack (source of truth)

| Layer | Path / API |
|--------|------------|
| Bootstrap 5 CSS/JS | `renderer/vendor/bootstrap/` |
| Dark theme bridge | `renderer/bootstrap-theme.css` |
| App design tokens | `renderer/styles.css` (`--fs-*`, `--side-w`, `--content`, colors) |
| Overlay API | `renderer/ui-overlay.js` → `window.GrokUI` |
| Shell markup | `renderer/index.html` |
| Logic | `renderer/app.js` (wire events; prefer GrokUI for overlays) |

Load order is already:

```text
bootstrap.min.css → bootstrap-theme.css → styles.css
… body …
bootstrap.bundle.min.js → ui-overlay.js → i18n.js → app.js
```

Do not break this order. Do not use CDN (CSP: `default-src 'self'`).

## Hard rules

1. **No bare controls for product UI**  
   Do not introduce plain unstyled:
   - `<button>` without Bootstrap classes  
   - `<input>` / `<select>` without `form-control` / `form-select`  
   - Hand-rolled modal/dialog/confirm/prompt that sits in document flow  

2. **Prefer library primitives**

   | Need | Use |
   |------|-----|
   | Primary / secondary / danger button | `btn btn-primary` / `btn-outline-secondary` / `btn-danger` (+ `btn-sm`) |
   | Text field | `form-control form-control-sm` |
   | Select | `form-select form-select-sm` |
   | Switch / check | `form-check form-switch` |
   | Card block | `card` / `card-body` / `card-title` |
   | Badge | `badge text-bg-*` |
   | List group | `list-group list-group-item` |
   | Tabs | `nav nav-tabs` + `tab-pane` |
   | Alert inline (rare) | `alert alert-*` |
   | Prompt / confirm | `GrokUI.askModal` / `askText` / `askConfirm` → Bootstrap **Modal** |
   | Toast / banner | `GrokUI.showToast(text, kind)` → Bootstrap **Toast** |
   | Side panel (e.g. plan) | Bootstrap **Offcanvas** + `GrokUI.setPlanOpen` |
   | Image preview | `GrokUI.openLightbox` |
   | Permission ask | `GrokUI.showPermissionCard` (fixed layer) |
   | Context menu | `#session-ctx` dropdown-menu + `GrokUI.showSessionCtx` |

3. **Overlays must not reflow layout**  
   - Dialogs: Modal (fixed)  
   - Notices: Toast container (fixed)  
   - Drawers: Offcanvas  
   - Never inject full-width “popup rows” into `#thread-inner` for temporary UI  
   - Never open plan as a flex sibling that shrinks the chat column  

4. **Design tokens**  
   - Type: `var(--fs-xs|sm|md|base|lg|chat|title|2xl)`  
   - Layout: `var(--side-w)`, `var(--content)`, `var(--page-pad-x)`  
   - Colors: existing CSS vars (`--accent`, `--text`, …) or Bootstrap dark theme vars  
   - Do not hardcode random px font sizes for new UI  

5. **Project legacy classes**  
   Shell still uses product classes (`.btn-new`, `.session-row`, `.turn`, …).  
   - **New** settings cards, dialogs, forms, toolbars → Bootstrap first  
   - When touching legacy buttons, prefer migrating to `btn btn-*` if low risk  
   - Keep Electron bridge: only `window.grokDesktop` / preload APIs for IPC  

6. **i18n**  
   User-visible strings: `data-i18n` + `renderer/i18n.js` keys, or `t("key")` in JS.

## Implementation checklist (every UI change)

```
- [ ] Used Bootstrap / GrokUI for controls & overlays
- [ ] No layout-shifting popup (no in-flow “modal” blocks)
- [ ] Dark theme still works (data-bs-theme="dark")
- [ ] Tokens for type/spacing where applicable
- [ ] Wired through GrokUI if overlay/toast/modal
- [ ] No CDN; no new heavy UI framework without request
```

## GrokUI API (use these, don’t reimplement)

```js
GrokUI.showToast(text, "warn"|"error"|"ok"|"info")
GrokUI.askModal({ title, message, input, defaultValue, placeholder, okLabel, cancelLabel, danger })
GrokUI.askText({ title, message, defaultValue, placeholder })
GrokUI.askConfirm({ title, message, danger })
GrokUI.showSetup() / GrokUI.hideSetup()
GrokUI.setPlanOpen(true|false)
GrokUI.openLightbox(src)
GrokUI.showPermissionCard(req, onRespond, labels)
GrokUI.showSessionCtx(x, y) / GrokUI.hideSessionCtx()
GrokUI.showUpdateBanner(text) / GrokUI.hideUpdateBanner()
```

In `app.js`, prefer:

```js
function appendBanner(text, kind) {
  GrokUI.showToast(text, kind || "warn");
}
// askText / askConfirm already delegate to GrokUI when present
```

## Patterns: do / don’t

### Buttons

```html
<!-- DO -->
<button type="button" class="btn btn-primary btn-sm">保存</button>
<button type="button" class="btn btn-outline-secondary btn-sm">取消</button>

<!-- DON’T -->
<button type="button" style="padding:8px">保存</button>
```

### Forms

```html
<!-- DO -->
<label class="form-label">模型</label>
<select class="form-select form-select-sm" id="set-model"></select>
<input class="form-control form-control-sm" type="text" />

<!-- DON’T -->
<input type="text" />
<select></select>
```

### Modal (markup already in index.html `#app-modal`)

```js
// DO
await GrokUI.askText({ title: "重命名", defaultValue: old });

// DON’T
window.prompt("重命名", old); // broken in Electron
document.body.innerHTML += '<div class="my-modal">...' // in-flow junk
```

### Toast

```js
// DO
GrokUI.showToast("已保存", "ok");
GrokUI.showToast(err.message, "error");

// DON’T
ui.inner.appendChild(document.createElement("div")).textContent = "已保存";
```

### New settings section

```html
<div class="scard">
  <div class="scard-row">
    <div>
      <div class="scard-title" data-i18n="...">标题</div>
      <div class="scard-desc" data-i18n="...">说明</div>
    </div>
    <select class="form-select form-select-sm" id="...">...</select>
  </div>
</div>
```

Use existing settings shell (`.scard`, `.settings-panel`). Controls inside → Bootstrap.

## Extending the library

If a pattern is missing:

1. Prefer Bootstrap component from vendored 5.3  
2. Add a thin helper on `GrokUI` in `ui-overlay.js` (not a one-off in `app.js`)  
3. Theme tokens in `bootstrap-theme.css`  
4. Document the helper in this skill’s `references/ui-api.md`  

Do **not** add React/Vue/another kit unless the user explicitly asks.

## Files to read before big UI work

- `renderer/ui-overlay.js` — overlay API  
- `renderer/bootstrap-theme.css` — BS dark mapping  
- `renderer/index.html` — Modal / Offcanvas / Toast host markup  
- `references/bootstrap-patterns.md` — copy-paste patterns  
- `references/ui-api.md` — GrokUI signatures  

## Anti-patterns (reject in review)

- `window.prompt` / `window.confirm` for product flows  
- Injecting temporary full-width panels into `.thread-inner` for alerts  
- Absolute paths to CDN Bootstrap  
- New `position: relative` “popup” that grows parent height  
- Inline styles for colors/fonts that ignore design tokens  

## Done definition

A UI task is done only when:

1. Visible controls are Bootstrap-classed (or documented shell exceptions)  
2. Any popup uses GrokUI / Bootstrap overlay primitives  
3. Opening/closing UI does not shift sidebar/thread/composer layout  
4. Dark theme and type tokens still apply  
