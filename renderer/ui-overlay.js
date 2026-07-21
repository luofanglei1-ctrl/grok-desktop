/**
 * Grok Desktop overlay UI — Bootstrap 5 Modal / Toast / Offcanvas / Dropdown.
 * All surfaces are fixed/absolute (document flow never shifts).
 *
 * Requires: bootstrap.bundle.min.js loaded first (window.bootstrap).
 */
/* global bootstrap */
(function (global) {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function bsReady() {
    return typeof bootstrap !== "undefined" && bootstrap.Modal;
  }

  // ── Modal instance cache ──
  const modalCache = new Map();
  function getModal(el, opts) {
    if (!el || !bsReady()) return null;
    let inst = bootstrap.Modal.getInstance(el);
    if (!inst) inst = new bootstrap.Modal(el, opts || { backdrop: true, keyboard: true });
    modalCache.set(el.id || el, inst);
    return inst;
  }

  // ── Toast ──
  /**
   * @param {string} text
   * @param {"warn"|"error"|"ok"|"info"|string} [kind]
   * @param {{ delay?: number }} [opts]
   */
  function showToast(text, kind = "warn", opts = {}) {
    let host = $("toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      host.className = "toast-container position-fixed top-0 end-0 p-3";
      host.style.zIndex = "11000";
      document.body.appendChild(host);
    }

    const delay = opts.delay ?? (kind === "error" ? 8000 : 4500);
    const theme =
      kind === "error"
        ? "text-bg-danger"
        : kind === "ok"
          ? "text-bg-success"
          : kind === "info"
            ? "text-bg-primary"
            : "text-bg-warning";

    const el = document.createElement("div");
    el.className = `toast align-items-center border-0 ${theme}`;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body"></div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>`;
    el.querySelector(".toast-body").textContent = text;
    host.appendChild(el);

    if (bsReady() && bootstrap.Toast) {
      const t = new bootstrap.Toast(el, { autohide: true, delay });
      el.addEventListener("hidden.bs.toast", () => el.remove());
      t.show();
      // Cap stack
      while (host.children.length > 5) {
        const first = host.firstElementChild;
        if (!first || first === el) break;
        const old = bootstrap.Toast.getInstance(first);
        if (old) old.hide();
        else first.remove();
      }
    } else {
      // Fallback without BS
      el.classList.add("show");
      setTimeout(() => el.remove(), delay);
    }
    return el;
  }

  // ── App dialog (prompt / confirm) via Bootstrap Modal ──
  /**
   * @returns {Promise<string|null>}
   */
  function askModal({
    title = "提示",
    message = "",
    defaultValue = "",
    placeholder = "",
    okLabel = "确定",
    cancelLabel = "取消",
    input = true,
    danger = false,
  } = {}) {
    return new Promise((resolve) => {
      const root = $("app-modal");
      const titleEl = $("app-modal-title");
      const msgEl = $("app-modal-msg");
      const inputEl = $("app-modal-input");
      const inputWrap = $("app-modal-input-wrap");
      const okBtn = $("app-modal-ok");
      const cancelBtn = $("app-modal-cancel");

      if (!root || !okBtn) {
        if (input) resolve(window.prompt(message || title, defaultValue));
        else resolve(window.confirm(message || title) ? "1" : null);
        return;
      }

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        okBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        const inst = getModal(root);
        if (inst) inst.hide();
        else root.classList.remove("show");
        resolve(value);
      };

      if (titleEl) titleEl.textContent = title;
      if (msgEl) {
        msgEl.textContent = message || "";
        msgEl.classList.toggle("d-none", !message);
      }
      okBtn.textContent = okLabel;
      if (cancelBtn) cancelBtn.textContent = cancelLabel;
      okBtn.className = "btn " + (danger ? "btn-danger" : "btn-primary");

      if (input && inputEl) {
        if (inputWrap) inputWrap.classList.remove("d-none");
        inputEl.classList.remove("d-none");
        inputEl.value = defaultValue ?? "";
        inputEl.placeholder = placeholder || "";
      } else if (inputEl) {
        if (inputWrap) inputWrap.classList.add("d-none");
        inputEl.classList.add("d-none");
        inputEl.value = "";
      }

      okBtn.onclick = () => finish(input ? String(inputEl?.value ?? "") : "1");
      if (cancelBtn) cancelBtn.onclick = () => finish(null);

      const onHidden = () => {
        root.removeEventListener("hidden.bs.modal", onHidden);
        if (!settled) finish(null);
      };
      root.addEventListener("hidden.bs.modal", onHidden);

      const onKey = (e) => {
        if (e.key === "Enter" && input && document.activeElement === inputEl) {
          e.preventDefault();
          finish(String(inputEl.value ?? ""));
        }
      };
      root.addEventListener("keydown", onKey);

      const inst = getModal(root, { backdrop: true, keyboard: true, focus: true });
      if (inst) {
        inst.show();
      } else {
        root.classList.add("show");
        root.style.display = "block";
      }

      requestAnimationFrame(() => {
        if (input && inputEl) {
          inputEl.focus();
          inputEl.select();
        } else {
          okBtn.focus();
        }
      });
    });
  }

  async function askText(opts) {
    const v = await askModal({ ...opts, input: true });
    if (v == null) return null;
    const t = String(v).trim();
    return t || null;
  }

  async function askConfirm(opts) {
    const v = await askModal({
      okLabel: "确定",
      cancelLabel: "取消",
      ...opts,
      input: false,
    });
    return v != null;
  }

  // ── Setup modal ──
  function showSetup() {
    const el = $("setup-modal");
    if (!el) return;
    const inst = getModal(el, { backdrop: "static", keyboard: false });
    if (inst) inst.show();
    else {
      el.classList.add("show");
      el.style.display = "block";
    }
  }

  function hideSetup() {
    const el = $("setup-modal");
    if (!el) return;
    const inst = bootstrap.Modal?.getInstance(el);
    if (inst) inst.hide();
    else {
      el.classList.remove("show");
      el.style.display = "none";
    }
  }

  // ── Plan Offcanvas ──
  function setPlanOpen(on) {
    const el = $("plan-offcanvas") || $("plan-panel");
    if (!el) return false;
    if (el.classList.contains("offcanvas") && bsReady() && bootstrap.Offcanvas) {
      let inst = bootstrap.Offcanvas.getInstance(el);
      if (!inst) inst = new bootstrap.Offcanvas(el, { backdrop: true, scroll: true });
      if (on) inst.show();
      else inst.hide();
      return true;
    }
    el.classList.toggle("hidden", !on);
    el.classList.toggle("show", !!on);
    return true;
  }

  function isPlanOpen() {
    const el = $("plan-offcanvas") || $("plan-panel");
    if (!el) return false;
    if (el.classList.contains("offcanvas")) return el.classList.contains("show");
    return !el.classList.contains("hidden");
  }

  // ── Lightbox modal ──
  function openLightbox(src) {
    const el = $("lightbox-modal");
    const img = $("lightbox-img");
    if (img) img.src = src || "";
    if (el && bsReady()) {
      getModal(el, { backdrop: true, keyboard: true })?.show();
      return;
    }
    // legacy fallback
    let box = $("lightbox");
    if (!box) {
      box = document.createElement("div");
      box.id = "lightbox";
      box.className = "hidden";
      box.innerHTML = "<img alt='' />";
      box.onclick = () => box.classList.add("hidden");
      document.body.appendChild(box);
    }
    box.querySelector("img").src = src;
    box.classList.remove("hidden");
  }

  // ── Permission floating (Bootstrap toast-style card, fixed layer) ──
  function getPermLayer() {
    let layer = $("perm-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "perm-layer";
      layer.className = "perm-layer";
      document.body.appendChild(layer);
    }
    layer.classList.remove("d-none", "hidden");
    return layer;
  }

  /**
   * @param {object} req
   * @param {(optionId: string) => Promise<void>} onRespond
   * @param {{ needApprove: string, selected: string, fail: string, allowOnce: string, reject: string, toolDefault: string }} labels
   */
  function showPermissionCard(req, onRespond, labels) {
    const layer = getPermLayer();
    const card = document.createElement("div");
    card.className = "card border-warning shadow-lg perm-bs-card";
    card.dataset.reqId = String(req.id || "");

    const title = req.toolCall?.title || req.toolCall?.kind || labels.toolDefault || "Tool";
    let detail = "";
    try {
      const raw = req.toolCall?.rawInput || req.toolCall?.input;
      detail = raw ? (typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)) : "";
    } catch {
      detail = "";
    }

    card.innerHTML = `
      <div class="card-body">
        <h6 class="card-title text-warning mb-1"></h6>
        <p class="card-text small text-secondary mb-2"></p>
        <pre class="perm-detail small mb-3 d-none"></pre>
        <div class="perm-actions d-flex flex-wrap gap-2"></div>
      </div>`;
    card.querySelector(".card-title").textContent = labels.needApprove || "需要批准";
    card.querySelector(".card-text").textContent = title;
    const pre = card.querySelector("pre");
    if (detail) {
      pre.textContent = detail.slice(0, 4000);
      pre.classList.remove("d-none");
    }

    const actions = card.querySelector(".perm-actions");
    const options = req.options?.length
      ? req.options
      : [
          { optionId: "allow_once", name: labels.allowOnce || "允许一次" },
          { optionId: "reject_once", name: labels.reject || "拒绝" },
        ];

    const removeCard = () => {
      card.remove();
      if (!layer.children.length) layer.classList.add("d-none", "hidden");
    };

    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      const oid = opt.optionId || opt.kind || "";
      const isAllow = /allow/i.test(oid) || /allow|允许|批准/i.test(opt.name || "");
      btn.className = "btn btn-sm " + (isAllow ? "btn-primary" : "btn-outline-secondary");
      btn.textContent = opt.name || oid;
      btn.onclick = async () => {
        actions.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          await onRespond(oid);
          showToast(`${labels.selected || ""}${opt.name || oid}`, "ok");
          removeCard();
        } catch (err) {
          showToast(`${labels.fail || ""}${err.message || err}`, "error");
          actions.querySelectorAll("button").forEach((b) => (b.disabled = false));
        }
      };
      actions.appendChild(btn);
    }

    layer.appendChild(card);
    return card;
  }

  // ── Context menu (Bootstrap dropdown-menu positioned fixed) ──
  function hideSessionCtx() {
    const menu = $("session-ctx");
    if (menu) {
      menu.classList.add("d-none", "hidden");
      menu.classList.remove("show");
    }
  }

  function showSessionCtx(x, y) {
    const menu = $("session-ctx");
    if (!menu) return;
    menu.classList.remove("d-none", "hidden");
    menu.classList.add("show");
    menu.style.position = "fixed";
    menu.style.zIndex = "10900";
    const pad = 8;
    menu.style.visibility = "hidden";
    menu.style.display = "block";
    const w = menu.offsetWidth || 168;
    const h = menu.offsetHeight || 140;
    let left = x;
    let top = y;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
    menu.style.left = `${Math.max(pad, left)}px`;
    menu.style.top = `${Math.max(pad, top)}px`;
    menu.style.visibility = "visible";
  }

  // ── Update toast strip (Bootstrap toast sticky) ──
  function showUpdateBanner(text) {
    const el = $("update-banner");
    const textEl = $("update-banner-text");
    if (textEl && text) textEl.textContent = text;
    if (!el) return;
    el.classList.remove("d-none", "hidden");
    // ensure fixed
    el.classList.add("show");
  }

  function hideUpdateBanner() {
    const el = $("update-banner");
    if (el) {
      el.classList.add("d-none", "hidden");
      el.classList.remove("show");
    }
  }

  global.GrokUI = {
    showToast,
    askModal,
    askText,
    askConfirm,
    showSetup,
    hideSetup,
    setPlanOpen,
    isPlanOpen,
    openLightbox,
    showPermissionCard,
    getPermLayer,
    hideSessionCtx,
    showSessionCtx,
    showUpdateBanner,
    hideUpdateBanner,
    getModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
