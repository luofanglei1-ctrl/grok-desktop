# Bootstrap patterns for Grok Desktop

Theme: `data-bs-theme="dark"` on `<html>`. Tokens in `bootstrap-theme.css`.

## Buttons

```html
<button type="button" class="btn btn-primary btn-sm">主操作</button>
<button type="button" class="btn btn-outline-secondary btn-sm">次要</button>
<button type="button" class="btn btn-danger btn-sm">危险</button>
<button type="button" class="btn btn-outline-primary btn-sm">描边主色</button>
```

Product accent is purple (`#8b5cf6`) via theme bridge.

## Form controls

```html
<label class="form-label small text-secondary">标签</label>
<input type="text" class="form-control form-control-sm" />
<select class="form-select form-select-sm">
  <option>A</option>
</select>
<div class="form-check form-switch">
  <input class="form-check-input" type="checkbox" id="sw1" />
  <label class="form-check-label" for="sw1">开关</label>
</div>
```

## Card

```html
<div class="card border-secondary-subtle">
  <div class="card-body">
    <h6 class="card-title">标题</h6>
    <p class="card-text small text-secondary">说明</p>
    <button type="button" class="btn btn-primary btn-sm">操作</button>
  </div>
</div>
```

## Badge

```html
<span class="badge text-bg-primary">运行中</span>
<span class="badge text-bg-success">完成</span>
<span class="badge text-bg-danger">失败</span>
```

## Modal (structure)

Prefer `#app-modal` + `GrokUI.askModal`. New dedicated modal:

```html
<div class="modal fade" id="my-modal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header border-secondary-subtle">
        <h5 class="modal-title">标题</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">...</div>
      <div class="modal-footer border-secondary-subtle">
        <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">取消</button>
        <button type="button" class="btn btn-primary btn-sm">确定</button>
      </div>
    </div>
  </div>
</div>
```

```js
const el = document.getElementById("my-modal");
bootstrap.Modal.getOrCreateInstance(el).show();
```

## Toast

```js
GrokUI.showToast("已保存", "ok");
// or manual:
// host #toast-host + bootstrap.Toast
```

## Offcanvas

```html
<div class="offcanvas offcanvas-end text-bg-dark" id="my-drawer" tabindex="-1">
  <div class="offcanvas-header border-secondary-subtle">
    <h5 class="offcanvas-title">侧栏</h5>
    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
  </div>
  <div class="offcanvas-body">...</div>
</div>
```

## Settings row (project shell + BS control)

```html
<div class="scard">
  <div class="scard-row">
    <div>
      <div class="scard-title">标题</div>
      <div class="scard-desc">说明</div>
    </div>
    <select class="form-select form-select-sm" id="set-x">...</select>
  </div>
</div>
```

## Type tokens (from styles.css)

| Token | Role |
|--------|------|
| `--fs-xs` / `--fs-sm` | meta, captions |
| `--fs-md` / `--fs-base` | UI body |
| `--fs-lg` / `--fs-chat` | chat / emphasis |
| `--fs-title` / `--fs-2xl` | titles |

```css
.my-label { font-size: var(--fs-sm); color: var(--muted); }
```

## Scrollbars (project UI kit)

Bootstrap 5 无独立滚动条组件；本项目标准写在 `bootstrap-theme.css`：

```html
<!-- 推荐：Bootstrap 溢出工具类 -->
<div class="overflow-auto ui-scroll">…</div>
<div class="overflow-y-auto">…</div>

<!-- 侧栏等密集列表可用更细滚动条 -->
<div class="overflow-auto ui-scroll-sm">…</div>
```

主题 token（随深色/浅色变化）：

- `--scrollbar-thumb` / `--scrollbar-thumb-hover`
- `--bs-scrollbar-size`（10px）/ `--bs-scrollbar-size-sm`（8px）

**禁止**在页面里单独写一套 `::-webkit-scrollbar`。

## Forbidden

- CDN Bootstrap
- `window.prompt` / `window.confirm`
- In-thread temporary “modal” divs that grow the scroll area for chrome UI
