# GrokUI API reference

Loaded by `renderer/ui-overlay.js` after Bootstrap. Global: `window.GrokUI`.

## Toast

```js
GrokUI.showToast(text, kind?, { delay? })
// kind: "warn" | "error" | "ok" | "info"
// Host: #toast-host (Bootstrap .toast-container)
```

## Modal dialogs

```js
await GrokUI.askModal({
  title, message, defaultValue, placeholder,
  okLabel, cancelLabel, input: true|false, danger: true|false,
}) // → string | null

await GrokUI.askText({ title, message, defaultValue, placeholder }) // trimmed string | null
await GrokUI.askConfirm({ title, message, danger }) // boolean
```

Markup: `#app-modal` Bootstrap Modal in `index.html`.

## Setup

```js
GrokUI.showSetup()  // #setup-modal, static backdrop
GrokUI.hideSetup()
```

## Plan drawer

```js
GrokUI.setPlanOpen(true|false)  // #plan-offcanvas Offcanvas
GrokUI.isPlanOpen()
```

## Lightbox

```js
GrokUI.openLightbox(src)  // #lightbox-modal
```

## Permission

```js
GrokUI.showPermissionCard(req, async (optionId) => { ... }, {
  needApprove, selected, fail, allowOnce, reject, toolDefault,
})
```

Layer: `#perm-layer` (fixed, no reflow).

## Session context menu

```js
GrokUI.showSessionCtx(clientX, clientY)
GrokUI.hideSessionCtx()
```

Menu: `#session-ctx` (dropdown-menu fixed).

## Update banner

```js
GrokUI.showUpdateBanner(text)
GrokUI.hideUpdateBanner()
```

## Low-level

```js
GrokUI.getModal(element, opts)  // bootstrap.Modal instance
```
