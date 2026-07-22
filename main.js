const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  Notification,
  Tray,
  nativeImage,
  net,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const {
  listSessions,
  loadHistoryPreview,
  findSession,
  grokHome,
  ensureSessionSummary,
  renameSession,
  deleteSessionDir,
} = require("./src/sessions");
const { AcpClient } = require("./src/acp");
const { buildFileChange } = require("./src/diff");
const { searchSessions } = require("./src/search");
const plugins = require("./src/plugins");
const skills = require("./src/skills");
const settings = require("./src/settings");
const memory = require("./src/memory");
const mcp = require("./src/mcp");
const { commandExists, defaultCwd, spawnCli } = require("./src/platform");
const brand = require("./src/brand");
const notified = require("./src/notified");
const cliProviders = require("./src/cliProviders");

let mainWindow = null;
/** @type {Map<string, { client: import('./src/acp').AcpClient, meta: object|null, cwd: string, lastUsed: number }>} */
const agents = new Map();
/** Currently focused session id (UI active tab). */
let activeSessionId = null;
/** @type {object|null} */
let activeSessionMeta = null;
/** Per-open generation to cancel stale openSession results for a given request. */
let openGeneration = 0;
/** Max parallel agent processes (LRU dispose when exceeded). */
const MAX_AGENTS = 6;

function resolveGrokCli() {
  return plugins.resolveGrokCli();
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  send("log", line);
}

/**
 * Ensure IPC handlers always throw real Error instances with a string message.
 * Plain objects become "[object Object]" on the renderer side.
 */
function asIpcError(err) {
  if (err instanceof Error) return err;
  if (err == null) return new Error("Unknown error");
  if (typeof err === "string") return new Error(err);
  if (typeof err === "object") {
    const raw = err.message || err.msg || err.error || err.detail || err.reason;
    let msg =
      typeof raw === "string"
        ? raw
        : raw != null
          ? (() => {
              try {
                return JSON.stringify(raw);
              } catch {
                return String(raw);
              }
            })()
          : null;
    if (!msg) {
      try {
        msg = JSON.stringify(err);
      } catch {
        msg = String(err);
      }
    }
    return new Error(msg);
  }
  return new Error(String(err));
}

function errorMessage(err) {
  return asIpcError(err).message;
}

function send(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch {
    /* ignore */
  }
}

function pathToDataUrl(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    // cap ~8MB for UI
    if (buf.length > 8 * 1024 * 1024) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".svg"
                ? "image/svg+xml"
                : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function mediaFingerprint(dataUrl, filePath, extra) {
  if (extra) return String(extra);
  if (filePath) {
    try {
      return `path:${path.resolve(filePath).toLowerCase()}`;
    } catch {
      return `path:${String(filePath).replace(/\\/g, "/").toLowerCase()}`;
    }
  }
  const s = String(dataUrl || "");
  const m = s.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) {
    const b = m[2];
    return `b64:${m[1]}:${b.length}:${b.slice(0, 40)}:${b.slice(-20)}`;
  }
  return s.slice(0, 96);
}

function mediaForRenderer(media) {
  if (!media) return null;
  if (media.kind === "base64" && media.data) {
    const dataUrl = `data:${media.mimeType || "image/png"};base64,${media.data}`;
    return {
      kind: "dataUrl",
      dataUrl,
      mimeType: media.mimeType,
      fingerprint:
        media.fingerprint ||
        mediaFingerprint(dataUrl, null, null),
    };
  }
  if (media.kind === "path" && media.path) {
    const dataUrl = pathToDataUrl(media.path);
    const fp = mediaFingerprint(dataUrl, media.path, media.fingerprint);
    if (!dataUrl) return { kind: "path", path: media.path, mimeType: media.mimeType, fingerprint: fp };
    return {
      kind: "dataUrl",
      dataUrl,
      path: media.path,
      mimeType: media.mimeType,
      fingerprint: fp,
    };
  }
  return media;
}

// Prefer .ico on Windows (taskbar / window), PNG elsewhere — all from assets/
const APP_ICON = (() => {
  const ico = path.join(__dirname, "assets", "icon.ico");
  const png = path.join(__dirname, "assets", "icon.png");
  if (process.platform === "win32" && fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(ico)) return ico;
  return undefined;
})();

/** @type {import('electron').Tray | null} */
let appTray = null;
/** When true, next close really quits (from tray menu / app.quit) */
let isQuitting = false;

/**
 * closeBehavior from desktop settings:
 * - "tray" (default): window close → hide to system tray
 * - "quit": window close → exit app
 */
function getCloseBehavior() {
  try {
    const desk = settings.readDesktopSettings();
    const v = String(desk.closeBehavior || "tray").toLowerCase();
    return v === "quit" ? "quit" : "tray";
  } catch {
    return "tray";
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  // Tip balloon only first hide this session
  try {
    if (appTray && process.platform === "win32" && !appTray._didHideTip) {
      appTray._didHideTip = true;
      appTray.displayBalloon?.({
        title: "Grok Desktop",
        content: "已最小化到托盘。任务完成会在这里提示；右键图标可退出。",
        iconType: "info",
      });
    }
  } catch {
    /* ignore */
  }
}

function createTray() {
  if (appTray) return appTray;
  let image = null;
  try {
    if (APP_ICON && fs.existsSync(APP_ICON)) {
      image = nativeImage.createFromPath(APP_ICON);
      if (process.platform === "win32" && !image.isEmpty()) {
        // Tray looks better at 16/32
        const size = image.getSize();
        if (size.width > 32) {
          image = image.resize({ width: 16, height: 16 });
        }
      }
    }
  } catch {
    image = null;
  }
  if (!image || image.isEmpty()) {
    // 1x1 fallback so Tray still works
    image = nativeImage.createEmpty();
  }
  appTray = new Tray(image);
  appTray.setToolTip("Grok Desktop");
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  appTray.setContextMenu(contextMenu);
  appTray.on("double-click", () => showMainWindow());
  appTray.on("click", () => {
    // Windows: single click show
    if (process.platform === "win32") showMainWindow();
  });
  return appTray;
}

function destroyTray() {
  try {
    appTray?.destroy();
  } catch {
    /* ignore */
  }
  appTray = null;
}

/** Debounce main-process done notifications */
const _mainNotifyAt = new Map();

function isMainWindowVisible() {
  try {
    return !!(
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized()
    );
  } catch {
    return false;
  }
}

/**
 * OS notification + tray balloon when window is hidden (minimize-to-tray).
 * Prefer main-process notify so it still works when renderer is backgrounded.
 * Durable key (notifyKey) prevents re-notify after app restart.
 */
function notifyTaskDoneMain({
  sessionId,
  title,
  body,
  kind = "turn", // turn | error | goal
  notifyKey = null, // durable unique id for this completion event
} = {}) {
  try {
    const desk = settings.readDesktopSettings();
    if (desk.notifyOnDone === false) return { ok: false, reason: "disabled" };
  } catch {
    /* default allow */
  }

  const sid = sessionId || activeSessionId || "x";
  // Durable: same completion never notifies again (incl. after relaunch)
  const durable =
    notifyKey ||
    `${kind}:${sid}:${String(title || "")}:${String(body || "").slice(0, 120)}`;

  // In-process debounce FIRST (do not claim yet — avoid burning the key without showing)
  const now = Date.now();
  const memKey = `${sid}:${kind}:${durable}`;
  if (now - (_mainNotifyAt.get(memKey) || 0) < 2000) {
    return { ok: false, reason: "debounced" };
  }

  if (!notified.claim(durable)) {
    log(`notify skip (already shown): ${String(durable).slice(0, 100)}`);
    return { ok: false, reason: "already-notified" };
  }
  _mainNotifyAt.set(memKey, now);
  log(`notify claim ok → ${String(durable).slice(0, 100)} file=${notified.filePath?.() || "?"}`);

  const meta =
    getAgentEntry(sid)?.meta ||
    (sid === activeSessionId ? activeSessionMeta : null);
  const sessTitle =
    meta?.title || meta?.summary || (sid && sid !== "x" ? String(sid).slice(0, 8) : "会话");

  const nTitle =
    title ||
    (kind === "error"
      ? "任务出错"
      : kind === "goal"
        ? "目标已完成"
        : "任务已完成");
  const nBody =
    body ||
    (kind === "error"
      ? `「${sessTitle}」执行失败`
      : kind === "goal"
        ? `目标「${sessTitle}」已完成`
        : `「${sessTitle}」的对话任务已完成`);

  // Single user-visible alert only (never Notification + balloon together)
  let notifOk = false;
  const windowVisible = isMainWindowVisible();

  try {
    if (process.platform === "win32") {
      try {
        app.setAppUserModelId(brand.appUserModelId || "com.luofanglei.grok-desktop");
      } catch {
        /* ignore */
      }
    }
    if (Notification.isSupported()) {
      let icon = undefined;
      try {
        if (APP_ICON && fs.existsSync(APP_ICON)) {
          icon = nativeImage.createFromPath(APP_ICON);
          if (icon.isEmpty()) icon = undefined;
        }
      } catch {
        icon = undefined;
      }
      const n = new Notification({
        title: String(nTitle),
        body: String(nBody),
        silent: false,
        icon,
        timeoutType: "default",
      });
      n.on("click", () => showMainWindow());
      n.on("show", () => log(`notify show: ${String(nTitle).slice(0, 40)}`));
      n.on("failed", (_e, err) => log(`notify failed: ${err}`));
      n.show();
      notifOk = true;
      log(`notifyTaskDoneMain Notification: ${nTitle}`);
    }
  } catch (err) {
    log(`notifyTaskDoneMain Notification error: ${err.message}`);
  }

  // Tray balloon ONLY if OS toast unavailable (avoid double tip when tray-minimized)
  if (!notifOk) {
    try {
      if (appTray && !windowVisible && process.platform === "win32") {
        appTray.displayBalloon({
          title: String(nTitle),
          content: String(nBody),
          iconType: kind === "error" ? "error" : "info",
        });
        log(`notifyTaskDoneMain balloon fallback: ${nTitle}`);
        notifOk = true;
      }
    } catch (err) {
      log(`notifyTaskDoneMain balloon error: ${err.message}`);
    }
  }

  // In-app toast ONLY if OS notification failed (never both — was showing twice)
  if (!notifOk && windowVisible && mainWindow && !mainWindow.isDestroyed()) {
    try {
      send("app:toast", {
        text: nBody,
        kind: kind === "error" ? "error" : "ok",
        notifyKey: durable,
      });
    } catch {
      /* ignore */
    }
  }

  return { ok: notifOk || true, title: nTitle, body: nBody, notifyKey: durable };
}

/** Primary display metrics for layout / UI-scale decisions in the renderer. */
function getDisplayInfoPayload() {
  try {
    const d = screen.getPrimaryDisplay();
    const work = d.workAreaSize || d.size || {};
    return {
      width: work.width || d.size?.width || 1280,
      height: work.height || d.size?.height || 800,
      scaleFactor: d.scaleFactor || 1,
      bounds: d.bounds || null,
    };
  } catch {
    return { width: 1280, height: 800, scaleFactor: 1, bounds: null };
  }
}

/**
 * Default window size from primary display work area.
 * - laptop / 1080p: ~1080×700 (legacy feel)
 * - 1920: ~70% work area, capped
 * - 2K / 4K: larger start, still leaves room for other apps
 */
function computeDefaultWindowBounds() {
  const info = getDisplayInfoPayload();
  const ww = info.width || 1280;
  const wh = info.height || 800;

  let width = 1080;
  let height = 700;
  if (ww >= 3800) {
    // 4K-class
    width = Math.min(1600, Math.round(ww * 0.48));
    height = Math.min(1000, Math.round(wh * 0.72));
  } else if (ww >= 2500) {
    // 2K-class
    width = Math.min(1440, Math.round(ww * 0.55));
    height = Math.min(900, Math.round(wh * 0.7));
  } else if (ww >= 1800) {
    // 1080p / 1920
    width = Math.min(1280, Math.round(ww * 0.68));
    height = Math.min(820, Math.round(wh * 0.75));
  } else {
    width = Math.min(1080, Math.max(900, Math.round(ww * 0.9)));
    height = Math.min(700, Math.max(560, Math.round(wh * 0.85)));
  }

  width = Math.max(800, Math.min(width, ww - 40));
  height = Math.max(520, Math.min(height, wh - 40));
  return { width, height, workWidth: ww, workHeight: wh };
}

function createWindow() {
  const bounds = computeDefaultWindowBounds();
  log(`window default ${bounds.width}x${bounds.height} (work ${bounds.workWidth}x${bounds.workHeight})`);

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 520,
    title: "Grok Desktop",
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    backgroundColor: "#0b0b0c",
    show: false,
    // No default Electron menu bar (File/Edit/View…)
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  // Remove top menu bar: File / Edit / View / Window / Help
  try {
    Menu.setApplicationMenu(null);
    if (typeof mainWindow.setMenu === "function") {
      mainWindow.setMenu(null);
    }
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(true);
  } catch (err) {
    log(`remove menu bar: ${err.message}`);
  }

  mainWindow.once("ready-to-show", () => {
    try {
      Menu.setApplicationMenu(null);
      if (typeof mainWindow.setMenu === "function") mainWindow.setMenu(null);
      mainWindow.setMenuBarVisibility(false);
    } catch {
      /* ignore */
    }
    mainWindow.show();
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Close button: tray (default) or quit — from settings.closeBehavior
  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    if (getCloseBehavior() === "quit") return; // allow default close → quit
    e.preventDefault();
    hideToTray();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Notify renderer when display metrics change (move to 4K monitor, DPI change)
  try {
    screen.on("display-metrics-changed", () => {
      send("display:metrics", getDisplayInfoPayload());
    });
  } catch {
    /* ignore */
  }

  // Any window.open / target=_blank → system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    // Keep app on file:// UI; open external http(s) outside
    if (/^https?:\/\//i.test(url)) {
      e.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // Native right-click: 复制 / 粘贴 / 剪切 / 全选（输入框与选中文本）
  mainWindow.webContents.on("context-menu", (_e, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切", enabled: params.editFlags?.canCut !== false },
        { role: "copy", label: "复制", enabled: params.editFlags?.canCopy !== false },
        { role: "paste", label: "粘贴", enabled: params.editFlags?.canPaste !== false },
        { role: "selectAll", label: "全选" },
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      template.push({ role: "copy", label: "复制" });
      template.push({
        label: "复制并粘贴到输入框",
        click: () => {
          mainWindow.webContents.send("chat:insert-text", params.selectionText);
        },
      });
    } else {
      // empty area in chat — still offer paste into composer when possible
      template.push({
        label: "粘贴到输入框",
        click: () => {
          mainWindow.webContents.send("chat:paste-request");
        },
      });
    }
    if (!template.length) return;
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

/** Strip heavy file bodies before sending diff to renderer. */
function toDiffEvent(change) {
  if (!change) return null;
  const { before, after, ...light } = change;
  return light;
}

function getAgentEntry(sessionId) {
  if (!sessionId) return null;
  return agents.get(sessionId) || null;
}

function getAgent(sessionId) {
  return getAgentEntry(sessionId)?.client || null;
}

function activeAgent() {
  return getAgent(activeSessionId);
}

function touchAgent(sessionId) {
  const e = getAgentEntry(sessionId);
  if (e) e.lastUsed = Date.now();
}

function disposeAgent(sessionId) {
  const e = agents.get(sessionId);
  if (!e) return;
  try {
    e.client.dispose();
  } catch {
    /* ignore */
  }
  agents.delete(sessionId);
  if (activeSessionId === sessionId) {
    activeSessionId = null;
  }
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  send("session:status", {
    state: "disconnected",
    detail: "助手已关闭",
    sessionId,
  });
}

function disposeAllAgents() {
  for (const id of [...agents.keys()]) disposeAgent(id);
}

function evictLruAgents(keepId) {
  while (agents.size > MAX_AGENTS) {
    let victim = null;
    let oldest = Infinity;
    for (const [id, e] of agents) {
      // Never kill the agent we're opening, the focused one, or one mid-prompt
      if (id === keepId || id === activeSessionId) continue;
      if (e.busy) continue;
      if (e.lastUsed < oldest) {
        oldest = e.lastUsed;
        victim = id;
      }
    }
    if (!victim) {
      // Prefer idle non-active; only as last resort skip busy ones entirely
      for (const id of agents.keys()) {
        if (id === keepId || id === activeSessionId) continue;
        if (agents.get(id)?.busy) continue;
        victim = id;
        break;
      }
    }
    if (!victim) {
      // All slots protected (busy/active) — allow exceeding MAX temporarily
      log(`agent pool full (${agents.size}/${MAX_AGENTS}); all busy/active, skip eviction`);
      break;
    }
    log(`evict agent ${victim.slice(0, 8)}… (max ${MAX_AGENTS})`);
    disposeAgent(victim);
  }
}

function wireAcpEvents(client, sessionIdHint) {
  const { localizeAll } = require("./src/commands-zh");
  const sid = () => client.sessionId || sessionIdHint || null;

  const withSid = (payload) => ({ ...payload, sessionId: sid() });

  client.on("messageChunk", (text) =>
    send("chat:chunk", withSid({ kind: "assistant", text })),
  );
  client.on("thoughtChunk", (text) =>
    send("chat:chunk", withSid({ kind: "thought", text })),
  );
  client.on("toolCall", (payload) => {
    const full = {
      phase: "start",
      ...payload,
      title: payload.title || payload.kind || "tool",
      status: payload.status || "running",
    };
    send("chat:tool", withSid(full));
    // File-change / diff preview for write-like tools (light payload, no full file bodies)
    try {
      const change = buildFileChange(full, client.cwd);
      if (change) send("chat:diff", withSid(toDiffEvent(change)));
    } catch (err) {
      log(`diff build failed: ${err.message}`);
    }
  });
  client.on("toolCallUpdate", (payload) => {
    const full = {
      phase: "update",
      ...payload,
      title: payload.title || "tool",
      status: payload.status || "updated",
    };
    send("chat:tool", withSid(full));
    try {
      const change = buildFileChange(full, client.cwd);
      if (change) send("chat:diff", withSid({ ...toDiffEvent(change), status: full.status }));
    } catch {
      /* ignore */
    }
  });
  client.on("permissionRequest", (req) => send("chat:permission", withSid(req)));
  client.on("mediaContent", (media) => {
    const m = mediaForRenderer(media);
    if (m) send("chat:media", withSid(m));
  });
  client.on("commands", (list) => {
    send("commands:update", withSid({ commands: localizeAll(list) }));
  });
  client.on("mode", (mode) => send("session:mode", withSid({ mode })));
  client.on("model", (modelId) => send("session:model", withSid({ modelId })));
  // Official goal mode progress (GoalUpdated session notifications)
  client.on("goal", (goal) => send("session:goal", withSid({ goal })));
  client.on("plan", (update) => send("session:plan", withSid(update || {})));
  client.on("exit", (code) => {
    const id = sid();
    send(
      "session:status",
      withSid({ state: "disconnected", detail: `agent 已退出 (${code})` }),
    );
    if (id) agents.delete(id);
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  });
  client.on("error", (err) =>
    send("session:status", withSid({ state: "error", detail: err.message })),
  );
}

/**
 * Create a fresh ACP client for cwd (not yet mapped to a session id).
 */
async function createClient(cwd) {
  const env = { ...process.env };
  if (memory.isEnabledInConfig()) env.GROK_MEMORY = "1";
  const desk = settings.readDesktopSettings();
  const cliPath = resolveGrokCli();
  if (!commandExists(cliPath)) {
    throw new Error(
      `未找到 Grok CLI：${cliPath}。请先安装并登录官方 Grok CLI，或设置 GROK_CLI 为完整路径。`,
    );
  }
  const client = new AcpClient({
    cliPath,
    cwd,
    env,
    log,
    experimentalMemory: memory.isEnabledInConfig(),
  });
  client.setAutoApprove(desk.autoApprove !== false);
  await client.start();
  return client;
}

/**
 * Ensure an agent process exists for sessionId (reuses if still alive).
 */
async function ensureAgent(sessionId, cwd) {
  const existing = getAgentEntry(sessionId);
  if (existing?.client?.started && existing.client.proc && existing.client.sessionId === sessionId) {
    // cwd change on same session is rare; keep process if alive
    touchAgent(sessionId);
    return existing.client;
  }
  if (existing) disposeAgent(sessionId);

  evictLruAgents(sessionId);
  const client = await createClient(cwd);
  wireAcpEvents(client, sessionId);
  agents.set(sessionId, {
    client,
    meta: null,
    cwd,
    lastUsed: Date.now(),
    busy: false,
  });
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  return client;
}

function registerAgent(sessionId, client, cwd, meta) {
  // if another entry held this client under a temp key, clean up
  for (const [id, e] of agents) {
    if (e.client === client && id !== sessionId) agents.delete(id);
  }
  agents.set(sessionId, {
    client,
    meta: meta || null,
    cwd,
    lastUsed: Date.now(),
    busy: false,
  });
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
}

// Linux taskbar / .desktop StartupWMClass friendliness
app.setName("Grok Desktop");
if (process.platform === "linux" && fs.existsSync(APP_ICON)) {
  // Helps some desktops associate the running window with our icon
  app.whenReady().then(() => {
    try {
      if (app.dock?.setIcon) app.dock.setIcon(APP_ICON);
    } catch {
      /* ignore */
    }
  });
}

app.whenReady().then(() => {
  // Windows: required for Notification Center to show Electron app toasts
  try {
    if (process.platform === "win32") {
      app.setAppUserModelId(brand.appUserModelId || "com.luofanglei.grok-desktop");
    }
  } catch (err) {
    log(`setAppUserModelId failed: ${err.message}`);
  }
  // Sync login item from saved desktop settings (packaged builds only are reliable)
  try {
    const desk = settings.readDesktopSettings();
    if (typeof desk.openAtLogin === "boolean") {
      applyOpenAtLogin(desk.openAtLogin);
    }
  } catch {
    /* ignore */
  }
  // Pin durable notify log under Electron userData
  try {
    notified.setBaseDir(app.getPath("userData"));
    log(`notified-events → ${notified.filePath()}`);
  } catch (e) {
    log(`notified setBaseDir: ${e.message}`);
  }
  // Remove default top menu before first window (File/Edit/View…)
  try {
    Menu.setApplicationMenu(null);
  } catch {
    /* ignore */
  }
  createTray();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", (e) => {
  // With tray close, window hide does not fire all-closed the same way;
  // only quit when user chose quit or tray Exit.
  if (process.platform === "darwin") return;
  if (!isQuitting && getCloseBehavior() === "tray") {
    // Keep process alive for tray
    return;
  }
  disposeAllAgents();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  isQuitting = true;
  destroyTray();
  disposeAllAgents();
});

// ── Sessions ───────────────────────────────────────────

ipcMain.handle("sessions:list", async (_e, { limit } = {}) => {
  try {
    return listSessions({ limit: limit || 200 });
  } catch (err) {
    log(`sessions:list ${err.message}`);
    return [];
  }
});

ipcMain.handle("sessions:rename", async (_e, { sessionId, title }) => {
  return renameSession(sessionId, title);
});

ipcMain.handle("sessions:delete", async (_e, { sessionId }) => {
  disposeAgent(sessionId);
  // prefer CLI delete, fallback to dir rm
  try {
    await new Promise((resolve, reject) => {
      const child = spawnCli(resolveGrokCli(), ["sessions", "delete", sessionId], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let err = "";
      child.stderr.on("data", (d) => {
        err += d.toString();
      });
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
      child.on("error", reject);
    });
    return { ok: true, id: sessionId };
  } catch (err) {
    log(`sessions delete CLI failed, fallback: ${err.message}`);
    return deleteSessionDir(sessionId);
  }
});

ipcMain.handle("sessions:searchContent", async (_e, { query, limit } = {}) => {
  try {
    return searchSessions(query, { limit: limit || 40 });
  } catch (err) {
    log(`sessions:searchContent ${err.message}`);
    return [];
  }
});

ipcMain.handle("agents:list", async () => ({
  openIds: [...agents.keys()],
  activeSessionId,
}));

ipcMain.handle("agents:close", async (_e, { sessionId } = {}) => {
  if (sessionId) disposeAgent(sessionId);
  return { ok: true, openIds: [...agents.keys()] };
});

ipcMain.handle("sessions:history", async (_e, { sessionId }) => {
  try {
    const s = findSession(sessionId);
    if (!s) return { error: "not found", session: null, messages: [], assets: [] };
    const messages = loadHistoryPreview(s.dir, { maxMessages: 40, maxChars: 2800 });
    // Session images from assets/ + images/ (with mtime for timeline placement)
    const assets = [];
    const seenPaths = new Set();
    const pushImg = (full, name) => {
      if (seenPaths.has(full)) return;
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || st.size < 32 || st.size > 12_000_000) return;
        const dataUrl = pathToDataUrl(full);
        if (!dataUrl) return;
        seenPaths.add(full);
        assets.push({
          name,
          path: full,
          dataUrl,
          mtimeMs: st.mtimeMs,
        });
      } catch {
        /* skip */
      }
    };
    for (const sub of ["assets", "images"]) {
      const dir = path.join(s.dir, sub);
      if (!fs.existsSync(dir)) continue;
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names.slice(0, 60)) {
        pushImg(path.join(dir, name), name);
      }
    }
    assets.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));
    return { session: s, messages, assets };
  } catch (err) {
    return { error: err.message, session: null, messages: [], assets: [] };
  }
});

/**
 * Focus an already-live agent without reconnect noise.
 * soft: true → no "connecting" status (instant tab switch).
 */
ipcMain.handle("session:activate", async (_e, { sessionId } = {}) => {
  if (!sessionId) return { ok: false, error: "no sessionId" };
  const live = getAgent(sessionId);
  if (!(live?.started && live.proc && live.sessionId === sessionId)) {
    return { ok: false, live: false };
  }
  let s = findSession(sessionId) || getAgentEntry(sessionId)?.meta || null;
  activeSessionId = sessionId;
  activeSessionMeta = s;
  touchAgent(sessionId);
  const models =
    extractModels(live.lastSessionMeta, live) ||
    extractModels({ models: live.lastModels }, live);
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  return {
    ok: true,
    live: true,
    session: s,
    commands: live.availableCommands || [],
    models,
    openIds: [...agents.keys()],
    currentModelId: live.currentModelId || models?.currentModelId || null,
  };
});

ipcMain.handle("session:open", async (_e, { sessionId, soft } = {}) => {
  const gen = ++openGeneration;
  let s = findSession(sessionId);
  // retry once — summary may appear slightly after create
  if (!s) {
    await new Promise((r) => setTimeout(r, 250));
    s = findSession(sessionId);
  }
  if (!s) throw new Error("磁盘上找不到该会话（可点刷新后再试）");
  const cwd = s.cwd && fs.existsSync(s.cwd) ? s.cwd : defaultCwd();
  log(`open session ${sessionId} cwd=${cwd} soft=${!!soft}`);
  activeSessionId = sessionId;
  activeSessionMeta = s;

  // Fast path: agent already live — never emit "connecting" (kills product feel on tab switch)
  const live = getAgent(sessionId);
  if (live?.started && live.proc && live.sessionId === sessionId) {
    touchAgent(sessionId);
    const entry = getAgentEntry(sessionId);
    if (entry) entry.meta = s;
    const { localizeAll } = require("./src/commands-zh");
    const commands = live.availableCommands || [];
    if (commands.length && !soft) {
      send("commands:update", {
        sessionId,
        commands: localizeAll(commands),
      });
    }
    const models =
      extractModels(live.lastSessionMeta, live) ||
      extractModels({ models: live.lastModels }, live);
    if (models && !soft) send("session:models", { ...models, sessionId });
    // Only broadcast ready when not soft — soft switches stay silent
    if (!soft) {
      send("session:status", {
        state: "ready",
        detail: "已连接",
        session: s,
        sessionId,
      });
    }
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
    return {
      ok: true,
      session: s,
      reused: true,
      commands,
      models,
      openIds: [...agents.keys()],
    };
  }

  send("session:status", {
    state: "connecting",
    detail: "连接助手…",
    session: s,
    sessionId,
  });

  try {
    const client = await ensureAgent(sessionId, cwd);
    if (gen !== openGeneration) return { ok: false, cancelled: true };
    const loaded = await client.loadSession(sessionId);
    if (gen !== openGeneration) return { ok: false, cancelled: true };
    const entry = getAgentEntry(sessionId);
    if (entry) entry.meta = s;
    activeSessionMeta = s;
    if (client.availableCommands?.length) {
      const { localizeAll } = require("./src/commands-zh");
      send("commands:update", {
        sessionId,
        commands: localizeAll(client.availableCommands),
      });
    }
    const models = extractModels(loaded, client) || extractModels(client.lastSessionMeta, client);
    if (models) send("session:models", { ...models, sessionId });
    send("session:status", {
      state: "ready",
      detail: "已恢复",
      session: s,
      sessionId,
    });
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
    return {
      ok: true,
      session: s,
      commands: client.availableCommands || [],
      models,
      openIds: [...agents.keys()],
    };
  } catch (err) {
    log(`session:open failed: ${err.message}`);
    // one reconnect retry
    try {
      disposeAgent(sessionId);
      const client = await ensureAgent(sessionId, cwd);
      if (gen !== openGeneration) return { ok: false, cancelled: true };
      await client.loadSession(sessionId);
      activeSessionMeta = s;
      activeSessionId = sessionId;
      send("session:status", {
        state: "ready",
        detail: "已恢复（重试）",
        session: s,
        sessionId,
      });
      send("agents:update", { openIds: [...agents.keys()], activeSessionId });
      return { ok: true, session: s, retried: true, openIds: [...agents.keys()] };
    } catch (err2) {
      send("session:status", {
        state: "error",
        detail: err2.message,
        session: s,
        sessionId,
      });
      throw err2;
    }
  }
});

ipcMain.handle("session:new", async (_e, { cwd } = {}) => {
  const workDir = cwd && fs.existsSync(cwd) ? cwd : defaultCwd();
  log(`new session cwd=${workDir}`);
  send("session:status", { state: "connecting", detail: "创建会话…" });
  try {
    evictLruAgents(null);
    const client = await createClient(workDir);
    const res = await client.newSession();
    const sid = res.sessionId;
    wireAcpEvents(client, sid);
    // Immediately index so it shows in the sidebar
    activeSessionMeta = ensureSessionSummary({
      id: sid,
      cwd: workDir,
      title: "新对话",
    });
    activeSessionId = sid;
    registerAgent(sid, client, workDir, activeSessionMeta);
    const models = extractModels(res);
    if (models) send("session:models", { ...models, sessionId: sid });
    send("session:status", {
      state: "ready",
      detail: "新对话",
      session: activeSessionMeta,
    });
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
    return {
      ok: true,
      session: activeSessionMeta,
      models,
      openIds: [...agents.keys()],
    };
  } catch (err) {
    send("session:status", { state: "error", detail: err.message });
    throw err;
  }
});

/**
 * prompt: { text?: string, images?: [{ mimeType, dataBase64 }], sessionId?: string }
 */
ipcMain.handle("session:prompt", async (_e, payload = {}) => {
  const sid = payload.sessionId || activeSessionId;
  const client = getAgent(sid);
  if (!client || !client.sessionId) throw new Error("没有活动会话");
  const entry = getAgentEntry(sid);
  if (entry?.busy) {
    throw new Error("该会话仍在处理上一轮，请稍候或使用队列");
  }
  touchAgent(sid);
  const text = payload.text || "";
  const images = Array.isArray(payload.images) ? payload.images : [];
  const blocks = [];
  for (const img of images) {
    if (!img?.dataBase64) continue;
    blocks.push({
      type: "image",
      mimeType: img.mimeType || "image/png",
      data: img.dataBase64,
    });
  }
  if (text) blocks.push({ type: "text", text });
  if (!blocks.length) throw new Error("消息为空");

  const meta = entry?.meta || (sid === activeSessionId ? activeSessionMeta : null);
  if (entry) entry.busy = true;
  entry.promptSeq = (entry.promptSeq || 0) + 1;
  const promptSeq = entry.promptSeq;
  // Only real user prompts (not openSession) may fire "任务已完成"
  entry.userPromptActive = true;
  const promptStartedAt = Date.now();
  // Fingerprint user text so the same completion never re-notifies after relaunch
  const userText = blocks
    .map((b) => (typeof b === "string" ? b : b?.text || ""))
    .join("\n")
    .slice(0, 200);
  const textFp = `${userText.length}:${userText.slice(0, 40)}:${userText.slice(-20)}`;
  send("session:status", {
    state: "working",
    detail: "思考中…",
    session: meta,
    sessionId: sid,
  });
  try {
    await client.prompt(blocks);
    if (entry) {
      entry.busy = false;
      entry.userPromptActive = false;
    }
    send("session:status", {
      state: "ready",
      detail: "就绪",
      session: meta,
      sessionId: sid,
    });
    // Durable key includes user-text fingerprint (stable across restarts for same turn content)
    // + prompt start time so *new* identical messages can still notify once each run
    if (entry?.userPromptActive === false) {
      notifyTaskDoneMain({
        sessionId: sid,
        kind: "turn",
        notifyKey: `turn-done:${sid}:${textFp}:${promptStartedAt}`,
        title: "任务已完成",
        body: `「${meta?.title || meta?.summary || sid.slice(0, 8)}」的对话任务已完成`,
      });
    }
    return { ok: true, sessionId: sid };
  } catch (err) {
    if (entry) {
      entry.busy = false;
      entry.userPromptActive = false;
    }
    const ipcErr = asIpcError(err);
    const msg = ipcErr.message;
    log(`session:prompt failed sid=${sid}: ${msg}`);
    send("session:status", {
      state: "error",
      detail: msg,
      session: meta,
      sessionId: sid,
    });
    // Don't notify cancel/abort as error popup noise
    if (!/cancel|abort|中断|停止|disposed/i.test(msg)) {
      notifyTaskDoneMain({
        sessionId: sid,
        kind: "error",
        notifyKey: `turn-err:${sid}:${textFp}:${msg.slice(0, 60)}`,
        title: "任务出错",
        body: `「${meta?.title || sid.slice(0, 8)}」：${msg.slice(0, 120)}`,
      });
    }
    throw ipcErr;
  }
});

ipcMain.handle("session:cancel", async (_e, { sessionId } = {}) => {
  const sid = sessionId || activeSessionId;
  const entry = getAgentEntry(sid);
  getAgent(sid)?.cancel();
  // 停止后必须清 busy，否则插话/发送会被「仍在处理」卡住
  if (entry) entry.busy = false;
  const meta = entry?.meta || null;
  send("session:status", {
    state: "ready",
    detail: "已停止",
    session: meta,
    sessionId: sid,
  });
  return { ok: true, sessionId: sid };
});

// ── Dialogs / files ────────────────────────────────────

ipcMain.handle("dialog:pickDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:pickFiles", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return [];
  const out = [];
  for (const p of result.filePaths) {
    let preview = "";
    let size = 0;
    try {
      const st = fs.statSync(p);
      size = st.size;
      if (st.size < 200_000) {
        const buf = fs.readFileSync(p);
        // only text-ish
        const sample = buf.slice(0, 4000).toString("utf8");
        if (!sample.includes("\u0000")) preview = sample;
      }
    } catch {
      /* ignore */
    }
    out.push({
      path: p,
      name: path.basename(p),
      size,
      preview,
    });
  }
  return out;
});

/** Files and/or folders for composer attach (plan-mode menu). */
ipcMain.handle("dialog:pickFilesOrDirs", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "openDirectory", "multiSelections"],
  });
  if (result.canceled) return [];
  const out = [];
  for (const p of result.filePaths) {
    let preview = "";
    let size = 0;
    let isDir = false;
    try {
      const st = fs.statSync(p);
      size = st.size;
      isDir = st.isDirectory();
      if (!isDir && st.size < 200_000) {
        const buf = fs.readFileSync(p);
        const sample = buf.slice(0, 4000).toString("utf8");
        if (!sample.includes("\u0000")) preview = sample;
      }
    } catch {
      /* ignore */
    }
    out.push({
      path: p,
      name: path.basename(p),
      size,
      preview,
      isDir,
    });
  }
  return out;
});

/**
 * Set ACP session mode (plan / default). Official CLI: Shift+Tab, /plan.
 * modeId: "plan" | "default" | "code" | agent-specific
 */
ipcMain.handle("session:setMode", async (_e, { modeId, sessionId } = {}) => {
  const sid = sessionId || activeSessionId;
  const client = getAgent(sid);
  if (!client || !client.sessionId) throw new Error("没有活动会话");
  const id = String(modeId || "").trim();
  if (!id) throw new Error("modeId 为空");
  try {
    const res = await client.setMode(id);
    send("session:mode", { sessionId: sid, modeId: id });
    return { ok: true, modeId: id, result: res || null };
  } catch (err) {
    // Fallback: inject /plan or /plan-off via slash when set_mode unsupported
    log(`session:setMode ACP failed (${err.message}); try slash fallback`);
    throw err;
  }
});

ipcMain.handle("permission:respond", async (_e, { id, optionId, sessionId } = {}) => {
  // Prefer hinted session, then active, then any agent that has this request pending
  let client = getAgent(sessionId || activeSessionId);
  if (!client) {
    for (const e of agents.values()) {
      if (e.client.pendingPermissions?.has?.(id)) {
        client = e.client;
        break;
      }
    }
  }
  if (!client) return { ok: false };
  const ok = client.respondPermission(id, optionId);
  return { ok };
});

ipcMain.handle("permission:setAutoApprove", async (_e, on) => {
  for (const e of agents.values()) {
    e.client.setAutoApprove(!!on);
  }
  try {
    settings.writeDesktopSettings({ autoApprove: !!on });
  } catch {
    /* ignore */
  }
  return { ok: true };
});

ipcMain.handle("dialog:pickImages", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
  });
  if (result.canceled) return [];
  const out = [];
  for (const p of result.filePaths) {
    const dataUrl = pathToDataUrl(p);
    if (!dataUrl) continue;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    out.push({
      path: p,
      name: path.basename(p),
      mimeType: m?.[1] || "image/png",
      dataBase64: m?.[2] || "",
      dataUrl,
    });
  }
  return out;
});

ipcMain.handle("file:readImage", async (_e, filePath) => {
  const dataUrl = pathToDataUrl(filePath);
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return {
    path: filePath,
    name: path.basename(filePath),
    mimeType: m?.[1] || "image/png",
    dataBase64: m?.[2] || "",
    dataUrl,
  };
});

ipcMain.handle("shell:openPath", async (_e, p) => {
  if (p) return shell.openPath(p);
});

ipcMain.handle("shell:showItem", async (_e, p) => {
  if (p) shell.showItemInFolder(p);
});

// ── Settings / models ──────────────────────────────────

ipcMain.handle("settings:get", async () => {
  const all = settings.getAllSettings();
  const models = await settings.listModels();
  return { ...all, models };
});

/**
 * Apply / read OS login-item (open at login / 开机自启).
 * Windows: registry Run key; macOS: Login Items; Linux: often limited.
 */
function applyOpenAtLogin(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      // Keep false so user sees the window on boot (not only tray)
      openAsHidden: false,
      path: process.execPath,
      args: [],
    });
    return true;
  } catch (err) {
    log(`setLoginItemSettings failed: ${err.message}`);
    return false;
  }
}

function getOpenAtLoginState() {
  try {
    const s = app.getLoginItemSettings();
    return {
      openAtLogin: !!s.openAtLogin,
      openAsHidden: !!s.openAsHidden,
      wasOpenedAtLogin: !!s.wasOpenedAtLogin,
      executableWillLaunchAtLogin: !!s.executableWillLaunchAtLogin,
    };
  } catch {
    return { openAtLogin: false };
  }
}

ipcMain.handle("settings:saveDesktop", async (_e, partial) => {
  const next = settings.writeDesktopSettings(partial || {});
  if (partial && Object.prototype.hasOwnProperty.call(partial, "openAtLogin")) {
    applyOpenAtLogin(!!partial.openAtLogin);
    // Persist actual OS state if apply failed to clear mismatch
    const osState = getOpenAtLoginState();
    if (!!osState.openAtLogin !== !!partial.openAtLogin) {
      // Still store user intent; UI can re-sync from get
      log(
        `openAtLogin intent=${!!partial.openAtLogin} os=${!!osState.openAtLogin}`,
      );
    }
  }
  return next;
});

ipcMain.handle("settings:getOpenAtLogin", async () => getOpenAtLoginState());

ipcMain.handle("settings:setOpenAtLogin", async (_e, enabled) => {
  const ok = applyOpenAtLogin(!!enabled);
  settings.writeDesktopSettings({ openAtLogin: !!enabled });
  return { ok, ...getOpenAtLoginState() };
});

/** 内置壁纸绝对路径（打包后在 app 目录 assets/wallpapers） */
ipcMain.handle("wallpaper:list", async () => {
  const dir = path.join(__dirname, "assets", "wallpapers");
  const presets = [
    { id: "xmark", name: "X 标志", file: "wp-x-mark.jpg" },
    { id: "rocket", name: "火箭", file: "wp-rocket.jpg" },
    { id: "orbit", name: "轨道", file: "wp-orbit.jpg" },
    { id: "space", name: "SPACE", file: "wp-space-type.jpg" },
    { id: "stack", name: "多级箭体", file: "wp-stack.jpg" },
  ];
  return presets.map((p) => {
    const full = path.join(dir, p.file);
    const thumb = path.join(dir, p.file.replace(/\.jpg$/i, "-thumb.jpg"));
    return {
      id: p.id,
      name: p.name,
      path: fs.existsSync(full) ? full : null,
      thumbPath: fs.existsSync(thumb) ? thumb : fs.existsSync(full) ? full : null,
    };
  });
});

ipcMain.handle("settings:saveGrok", async (_e, partial) => {
  return settings.updateGrokConfig(partial || {});
});

// ── CLI providers (ccswitch-style) ─────────────────────

ipcMain.handle("cli:providers:list", async () => cliProviders.listProviders());
ipcMain.handle("cli:providers:get", async (_e, { id, includeSecret } = {}) => {
  return cliProviders.getProvider(id, { includeSecret: !!includeSecret });
});
ipcMain.handle("cli:providers:switch", async (_e, { id } = {}) => {
  try {
    return { ok: true, ...cliProviders.switchProvider(id) };
  } catch (err) {
    return { ok: false, error: asIpcError(err).message };
  }
});
ipcMain.handle("cli:providers:save", async (_e, payload = {}) => {
  try {
    return { ok: true, ...cliProviders.saveProvider(payload) };
  } catch (err) {
    return { ok: false, error: asIpcError(err).message };
  }
});
ipcMain.handle("cli:providers:delete", async (_e, { id } = {}) => {
  try {
    return { ok: true, ...cliProviders.deleteProvider(id) };
  } catch (err) {
    return { ok: false, error: asIpcError(err).message };
  }
});
ipcMain.handle("cli:providers:endpoints", async (_e, patch = {}) => {
  try {
    return { ok: true, ...cliProviders.updateEndpoints(patch) };
  } catch (err) {
    return { ok: false, error: asIpcError(err).message };
  }
});
ipcMain.handle("cli:providers:open-dir", async () => {
  const dir = cliProviders.openConfigDir();
  try {
    await shell.openPath(dir);
  } catch {
    /* ignore */
  }
  return { ok: true, path: dir, configPath: cliProviders.configPath() };
});

// ── Plugins ────────────────────────────────────────────

ipcMain.handle("plugins:listInstalled", async () => plugins.listInstalled());
ipcMain.handle("plugins:listAvailable", async () => {
  const r = await plugins.listAvailable();
  return Array.isArray(r) ? r : r;
});
ipcMain.handle("plugins:install", async (_e, spec) => plugins.installPlugin(spec));
ipcMain.handle("plugins:uninstall", async (_e, name) => plugins.uninstallPlugin(name));
ipcMain.handle("plugins:enable", async (_e, name) => plugins.enablePlugin(name));
ipcMain.handle("plugins:disable", async (_e, name) => plugins.disablePlugin(name));
ipcMain.handle("plugins:details", async (_e, name) => plugins.pluginDetails(name));

// ── Skills ─────────────────────────────────────────────

ipcMain.handle("skills:list", async () => skills.listSkills());
ipcMain.handle("skills:read", async (_e, name) => skills.readSkill(name));
ipcMain.handle("skills:create", async (_e, payload) => skills.createSkill(payload || {}));
ipcMain.handle("skills:open", async (_e, skillPath) => {
  if (skillPath) return shell.openPath(skillPath);
});

// ── Memory ─────────────────────────────────────────────

ipcMain.handle("memory:list", async () => memory.listMemoryFiles());
ipcMain.handle("memory:read", async (_e, filePath) => memory.readMemoryFile(filePath));
ipcMain.handle("memory:write", async (_e, { path: filePath, content }) =>
  memory.writeMemoryFile(filePath, content),
);
ipcMain.handle("memory:append", async (_e, payload) => memory.appendNote(payload || {}));
ipcMain.handle("memory:setEnabled", async (_e, enabled) => memory.setEnabled(!!enabled));
ipcMain.handle("memory:clear", async () => memory.clearMemory());

ipcMain.handle("commands:list", async (_e, { sessionId } = {}) => {
  const { localizeAll } = require("./src/commands-zh");
  const client = getAgent(sessionId || activeSessionId);
  const raw = client?.availableCommands || [];
  return { commands: localizeAll(raw) };
});

ipcMain.handle("session:export", async (_e, { sessionId } = {}) => {
  const id = sessionId || activeSessionMeta?.id || activeSessionId || activeAgent()?.sessionId;
  if (!id) throw new Error("没有可导出的会话");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出会话",
    defaultPath: `grok-session-${id.slice(0, 8)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  await new Promise((resolve, reject) => {
    const child = spawnCli(resolveGrokCli(), ["export", id, result.filePath], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `export exit ${code}`)),
    );
    child.on("error", reject);
  });
  return { ok: true, path: result.filePath };
});

ipcMain.handle("session:run-slash", async (_e, { command, args, sessionId } = {}) => {
  const sid = sessionId || activeSessionId;
  const client = getAgent(sid);
  if (!client || !client.sessionId) throw new Error("请先打开会话");
  const cmd = String(command || "").replace(/^\//, "");
  if (!cmd) throw new Error("空命令");
  const text = args ? `/${cmd} ${args}` : `/${cmd}`;
  const meta = getAgentEntry(sid)?.meta || activeSessionMeta;
  send("session:status", {
    state: "working",
    detail: `/${cmd}…`,
    session: meta,
    sessionId: sid,
  });
  try {
    await client.prompt(text);
    send("session:status", {
      state: "ready",
      detail: "就绪",
      session: meta,
      sessionId: sid,
    });
    return { ok: true };
  } catch (err) {
    const ipcErr = asIpcError(err);
    log(`session:run-slash failed: ${ipcErr.message}`);
    send("session:status", {
      state: "error",
      detail: ipcErr.message,
      session: meta,
      sessionId: sid,
    });
    throw ipcErr;
  }
});

ipcMain.handle("mcp:list", async () => mcp.listMcp());
ipcMain.handle("mcp:remove", async (_e, name) => mcp.removeMcp(name));
ipcMain.handle("mcp:doctor", async () => mcp.doctorMcp());
ipcMain.handle("mcp:add", async (_e, { name, command, args }) =>
  mcp.addMcp(name, command, args || []),
);

function mapModelForUi(m) {
  const modelId = m.modelId || m.id;
  const enriched = settings.enrichModelWithContextWindow({
    modelId,
    id: modelId,
    name: m.name || modelId,
    description: m.description || "",
    contextWindow: m.contextWindow ?? m.context_window,
    context_window: m.context_window ?? m.contextWindow,
    _meta: m._meta || null,
    info: m.info || null,
  });
  return {
    modelId: enriched.modelId || modelId,
    name: enriched.name || modelId,
    description: enriched.description || "",
    contextWindow: enriched.contextWindow,
    _meta: enriched._meta || null,
  };
}

function extractModels(payload, client) {
  if (!payload) return null;
  const models = payload.models || payload;
  const available = models.availableModels || models.available || [];
  if (!available.length && !models.currentModelId) return null;
  return {
    currentModelId:
      models.currentModelId || client?.currentModelId || null,
    availableModels: available.map((m) => mapModelForUi(m)),
  };
}

ipcMain.handle("models:list", async (_e, { sessionId } = {}) => {
  const client = getAgent(sessionId || activeSessionId);
  // Prefer live session models; fall back to `grok models`
  if (client?.sessionId) {
    const fromCli = await settings.listModels();
    const live = client.lastModels?.availableModels;
    if (live?.length) {
      return {
        currentModelId:
          client.currentModelId || client.lastModels?.currentModelId || fromCli.defaultModel,
        availableModels: live.map((m) => mapModelForUi(m)),
      };
    }
    return {
      currentModelId: client.currentModelId || fromCli.defaultModel,
      availableModels: (fromCli.models || []).map((m) => mapModelForUi(m)),
    };
  }
  const fromCli = await settings.listModels();
  return {
    currentModelId: fromCli.defaultModel,
    availableModels: (fromCli.models || []).map((m) => mapModelForUi(m)),
  };
});

ipcMain.handle("models:set", async (_e, modelId, sessionId) => {
  // support both (modelId) and ({ modelId, sessionId })
  let mid = modelId;
  let sid = sessionId;
  if (modelId && typeof modelId === "object") {
    mid = modelId.modelId;
    sid = modelId.sessionId;
  }
  const client = getAgent(sid || activeSessionId);
  if (!client || !client.sessionId) throw new Error("请先打开一个会话");
  if (!mid) throw new Error("缺少 modelId");
  const res = await client.setModel(mid);
  // persist default for next sessions
  try {
    settings.updateGrokConfig({ defaultModel: mid });
  } catch {
    /* ignore */
  }
  send("session:model", { modelId: mid, sessionId: client.sessionId });
  return { ok: true, modelId: mid, result: res };
});

const DESKTOP_VERSION = require("./package.json").version;

ipcMain.handle("app:info", async () => ({
  grokHome: grokHome(),
  grokCli: resolveGrokCli(),
  version: app.getVersion(),
  desktopVersion: DESKTOP_VERSION,
  memoryEnabled: memory.isEnabledInConfig(),
  openAgents: agents.size,
  display: getDisplayInfoPayload(),
}));

ipcMain.handle("app:displayInfo", async () => getDisplayInfoPayload());

/** 环境诊断：CLI 是否存在、是否像已登录 */
ipcMain.handle("app:diagnose", async () => {
  const cli = resolveGrokCli();
  const cliExists = commandExists(cli);
  const home = grokHome();
  const authPath = path.join(home, "auth.json");
  let loggedIn = false;
  let authHint = "未找到登录凭据";
  try {
    if (fs.existsSync(authPath)) {
      const st = fs.statSync(authPath);
      if (st.size > 20) {
        loggedIn = true;
        authHint = "已检测到登录凭据";
      }
    }
  } catch {
    authHint = "无法读取登录状态";
  }
  let cliVersion = null;
  if (cliExists) {
    try {
      cliVersion = await new Promise((resolve) => {
        const child = spawnCli(cli, ["--version"], {
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        child.stdout?.on("data", (d) => {
          out += d.toString();
        });
        child.stderr?.on("data", (d) => {
          out += d.toString();
        });
        const t = setTimeout(() => {
          try {
            child.kill("SIGTERM");
          } catch {
            /* ignore */
          }
          resolve(out.trim() || null);
        }, 4000);
        child.on("close", () => {
          clearTimeout(t);
          resolve((out || "").trim().split("\n")[0] || null);
        });
      });
    } catch {
      cliVersion = null;
    }
  }
  return {
    ok: cliExists && loggedIn,
    cli,
    cliExists,
    cliVersion,
    grokHome: home,
    authPath,
    loggedIn,
    authHint,
    desktopVersion: DESKTOP_VERSION,
    installHint: cliExists
      ? null
      : "请先安装官方 Grok CLI：curl -fsSL https://x.ai/cli/install.sh | bash",
    loginHint: loggedIn ? null : "在终端执行：grok login  （或 grok login --oauth）",
  };
});

/** 打开外部链接 / 路径 */
ipcMain.handle("shell:openExternal", async (_e, url) => {
  if (url) await shell.openExternal(String(url));
  return { ok: true };
});

/** 系统通知（渲染进程也可调用；托盘隐藏时同样走 balloon 兜底） */
ipcMain.handle("app:notify", async (_e, { title, body, urgency, kind, notifyKey, sessionId } = {}) => {
  try {
    const r = notifyTaskDoneMain({
      title: title || "Grok Desktop",
      body: body || "",
      kind: kind || "turn",
      sessionId: sessionId || activeSessionId,
      notifyKey: notifyKey || null,
    });
    return { ok: r?.ok !== false, ...(r || {}) };
  } catch (err) {
    log(`app:notify error: ${err.message}`);
    return { ok: false, reason: err.message };
  }
});

/** Renderer: claim a durable notify key (toast once across restarts) */
ipcMain.handle("notify:claim", async (_e, key) => {
  if (!key) return { ok: true, first: true };
  const first = notified.claim(String(key));
  return { ok: true, first };
});

ipcMain.handle("notify:has", async (_e, key) => ({
  ok: true,
  has: key ? notified.has(String(key)) : false,
}));

/**
 * 检查 GitHub 是否有更新（对比 tag / name 中的版本号）
 */
ipcMain.handle("app:brand", async () => ({ ...brand, version: DESKTOP_VERSION }));

ipcMain.handle("app:setWindowBackground", async (_e, color) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && color) {
      mainWindow.setBackgroundColor(String(color));
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
});

ipcMain.handle("app:checkUpdate", async () => {
  const current = DESKTOP_VERSION;
  const api = `https://api.github.com/repos/${brand.githubRepo}/releases/latest`;
  try {
    const data = await new Promise((resolve, reject) => {
      const req = net.request({ url: api, method: "GET" });
      req.setHeader("User-Agent", "grok-desktop");
      req.setHeader("Accept", "application/vnd.github+json");
      let body = "";
      req.on("response", (res) => {
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
    const tag = String(data.tag_name || data.name || "").replace(/^v/i, "");
    const newer = tag && compareSemver(tag, current) > 0;
    return {
      ok: true,
      current,
      latest: tag || null,
      hasUpdate: !!newer,
      url: data.html_url || brand.releasesUrl,
      name: data.name || tag,
    };
  } catch (err) {
    return {
      ok: false,
      current,
      latest: null,
      hasUpdate: false,
      error: err.message || String(err),
      url: brand.releasesUrl,
    };
  }
});

function compareSemver(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
