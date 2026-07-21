const fs = require("fs");
const path = require("path");
const { grokHome } = require("./sessions");
const { appConfigDir, spawnCli } = require("./platform");
const { resolveGrokCli } = require("./plugins");

const DESKTOP_SETTINGS = path.join(appConfigDir(), "settings.json");

const DEFAULT_DESKTOP = {
  showThinking: true,
  density: "comfortable", // comfortable | compact
  /**
   * UI scale for multi-resolution (1920 / 2K / 4K)
   * auto | 100 | 110 | 125 | 150
   */
  uiScale: "auto",
  enterToSend: true,
  theme: "dark",
  autoApprove: true, // product default: skip permission prompts
  /** Session ids that were open as tabs last time */
  openTabs: [],
  /** Last focused session id */
  lastActiveId: null,
  /** 聊天背景：none | aurora | ember | ocean | mist | custom */
  wallpaper: "none",
  /** 自定义壁纸绝对路径 */
  wallpaperPath: null,
  /** 背景压暗 0–80 */
  wallpaperDim: 45,
  /** 后台会话完成时系统通知 */
  notifyOnDone: true,
  /** 开机自启（登录时启动） */
  openAtLogin: false,
  /**
   * 点击窗口关闭按钮的行为
   * tray = 最小化到系统托盘（默认）
   * quit = 直接退出应用
   */
  closeBehavior: "tray",
  /** 启动时检查 GitHub 更新 */
  checkUpdates: true,
  /** 是否已完成首次环境引导 */
  setupDismissed: false,
  /** 界面语言 zh | en */
  locale: "zh",
  /**
   * 访问模式（产品化权限）
   * safe = 审批 · balanced = 智能 · full = 完全访问
   */
  accessMode: "full",
  /**
   * Desktop-side auto-compact when estimated context reaches threshold.
   * Threshold % is read from CLI config.toml [session] auto_compact_threshold_percent (default 85).
   * Official agent also auto-compacts; this mirrors that behavior over ACP with UI feedback.
   */
  autoCompact: true,
};

function configPath() {
  return path.join(grokHome(), "config.toml");
}

function readDesktopSettings() {
  try {
    if (fs.existsSync(DESKTOP_SETTINGS)) {
      return { ...DEFAULT_DESKTOP, ...JSON.parse(fs.readFileSync(DESKTOP_SETTINGS, "utf8")) };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_DESKTOP };
}

function writeDesktopSettings(partial) {
  const next = { ...readDesktopSettings(), ...partial };
  fs.mkdirSync(path.dirname(DESKTOP_SETTINGS), { recursive: true });
  fs.writeFileSync(DESKTOP_SETTINGS, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Minimal TOML get for flat keys under [section] */
function readTomlValue(text, section, key) {
  const re = new RegExp(
    `\\[${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?(?=\\n\\[|$)`,
  );
  const m = text.match(re);
  if (!m) return null;
  const block = m[0];
  const line = block.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m"));
  if (!line) return null;
  let v = line[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function upsertTomlValue(text, section, key, value) {
  let body = text || "";
  const sectionRe = new RegExp(
    `(\\[${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][^\\[]*)`,
  );
  const rendered =
    typeof value === "boolean"
      ? String(value)
      : typeof value === "number"
        ? String(value)
        : `"${String(value).replace(/"/g, '\\"')}"`;

  if (!sectionRe.test(body)) {
    body = body.trimEnd() + `\n\n[${section}]\n${key} = ${rendered}\n`;
    return body;
  }

  body = body.replace(sectionRe, (block) => {
    const keyRe = new RegExp(`^(\\s*${key}\\s*=\\s*).+$`, "m");
    if (keyRe.test(block)) {
      return block.replace(keyRe, `$1${rendered}`);
    }
    // insert after section header line
    return block.replace(/(\[[^\]]+\]\n)/, `$1${key} = ${rendered}\n`);
  });
  return body;
}

function readGrokConfigSummary() {
  const file = configPath();
  let text = "";
  try {
    text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  } catch {
    text = "";
  }
  const thrRaw = readTomlValue(text, "session", "auto_compact_threshold_percent");
  let autoCompactThreshold = 85;
  if (thrRaw != null && thrRaw !== "") {
    const n = Number(thrRaw);
    if (Number.isFinite(n) && n > 0 && n <= 100) autoCompactThreshold = n;
  }
  return {
    path: file,
    raw: text,
    permissionMode: readTomlValue(text, "ui", "permission_mode") || "default",
    yolo: readTomlValue(text, "ui", "yolo") === true,
    compactMode: readTomlValue(text, "ui", "compact_mode") === true,
    defaultModel: readTomlValue(text, "models", "default") || null,
    autoUpdate: readTomlValue(text, "cli", "auto_update"),
    /** Official [session] auto_compact_threshold_percent (percent of model context_window) */
    autoCompactThreshold,
  };
}

function updateGrokConfig(patch = {}) {
  const file = configPath();
  let text = "";
  try {
    text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  } catch {
    text = "";
  }

  if (patch.permissionMode != null) {
    text = upsertTomlValue(text, "ui", "permission_mode", patch.permissionMode);
  }
  if (patch.yolo != null) {
    text = upsertTomlValue(text, "ui", "yolo", !!patch.yolo);
  }
  if (patch.compactMode != null) {
    text = upsertTomlValue(text, "ui", "compact_mode", !!patch.compactMode);
  }
  if (patch.defaultModel != null && patch.defaultModel !== "") {
    text = upsertTomlValue(text, "models", "default", patch.defaultModel);
  }
  if (patch.autoUpdate != null) {
    text = upsertTomlValue(text, "cli", "auto_update", !!patch.autoUpdate);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.endsWith("\n") ? text : text + "\n", "utf8");
  return readGrokConfigSummary();
}

/**
 * Built-in context windows aligned with official Grok CLI runtime
 * (session signals.contextWindowTokens), not the sometimes-stale models_cache.
 * Custom / unknown models fall through to config → cache → 200k.
 */
const KNOWN_MODEL_CONTEXT_WINDOWS = {
  grok: 1_000_000,
  "grok-latest": 1_000_000,
  "grok-4.3": 1_000_000,
  "grok-4.5": 1_000_000,
  "grok-4.5-latest": 1_000_000,
  "grok-4.20-0309-non-reasoning": 1_000_000,
  "grok-4.20-0309-reasoning": 1_000_000,
  "grok-4.20-multi-agent-0309": 1_000_000,
  "grok-4.20-non-reasoning": 1_000_000,
  "grok-4.20-reasoning": 1_000_000,
  "grok-build": 256_000,
  "grok-build-0.1": 256_000,
  "grok-build-latest": 256_000,
  "composer-2.5": 256_000,
  "grok-composer": 256_000,
  "grok-composer-2.5-fast": 256_000,
  "grok-imagine": 256_000,
  "grok-imagine-edit": 256_000,
  "grok-imagine-image": 256_000,
  "grok-imagine-image-quality": 256_000,
  "grok-imagine-video": 256_000,
  "grok-imagine-video-1.5": 256_000,
};

/** Official Grok default when a new custom model omits context_window. */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Parse all [model.<id>] context_window values from config.toml. */
function readConfigModelContextWindows(text) {
  const map = Object.create(null);
  if (!text) return map;
  // [model.foo] or [model."foo-bar"]
  const sectionRe = /\[model\.(?:"([^"]+)"|([^\]]+))\]([\s\S]*?)(?=\n\[|$)/g;
  let m;
  while ((m = sectionRe.exec(text)) !== null) {
    const id = (m[1] || m[2] || "").trim();
    if (!id) continue;
    const block = m[3] || "";
    const cw = block.match(/^\s*context_window\s*=\s*(\d+)\s*$/m);
    if (cw) {
      const n = Number(cw[1]);
      if (Number.isFinite(n) && n > 0) map[id] = n;
    }
  }
  return map;
}

function readModelsCacheContextWindows() {
  const map = Object.create(null);
  try {
    const file = path.join(grokHome(), "models_cache.json");
    if (!fs.existsSync(file)) return map;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const models = data?.models || {};
    for (const [id, entry] of Object.entries(models)) {
      const n = Number(
        entry?.info?.context_window ??
          entry?.context_window ??
          entry?.info?.contextWindow,
      );
      if (Number.isFinite(n) && n > 0) map[id] = n;
    }
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * Resolve context window for a model id (tokens).
 * Priority: config.toml [model.id] → known CLI defaults → family heuristics
 * → models_cache → name patterns → 200k (official custom-model default).
 */
function resolveContextWindowForModel(modelId, opts = {}) {
  const id = String(modelId || "").trim();
  if (!id) return DEFAULT_CONTEXT_WINDOW;

  const configMap =
    opts.configMap ||
    (() => {
      try {
        const file = configPath();
        const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
        return readConfigModelContextWindows(text);
      } catch {
        return Object.create(null);
      }
    })();

  if (configMap[id] > 0) return configMap[id];

  if (KNOWN_MODEL_CONTEXT_WINDOWS[id] > 0) {
    return KNOWN_MODEL_CONTEXT_WINDOWS[id];
  }

  const lower = id.toLowerCase();
  // Family heuristics matching CLI runtime (e.g. grok-4.5 → 1M)
  if (
    /^grok-4\.5/.test(lower) ||
    /^grok-4\.3/.test(lower) ||
    /^grok-4\.20/.test(lower) ||
    lower === "grok" ||
    lower === "grok-latest" ||
    /sub2api/.test(lower)
  ) {
    return 1_000_000;
  }

  const cacheMap = opts.cacheMap || readModelsCacheContextWindows();
  if (cacheMap[id] > 0) return cacheMap[id];

  if (/2m|2000k|2000000/.test(lower)) return 2_000_000;
  if (/1m|1000k|1000000/.test(lower)) return 1_000_000;
  if (/512k/.test(lower)) return 512_000;
  if (/256k/.test(lower)) return 256_000;
  if (/200k/.test(lower)) return 200_000;
  if (/128k/.test(lower)) return 128_000;
  if (/64k/.test(lower)) return 64_000;

  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Enrich a model list entry with contextWindow (for Desktop UI / ACP bridge).
 */
function enrichModelWithContextWindow(model, opts = {}) {
  const modelId = model?.modelId || model?.id || model?.name || "";
  const existing = Number(
    model?.contextWindow ??
      model?.context_window ??
      model?._meta?.contextWindow ??
      model?._meta?.context_window ??
      model?.info?.context_window,
  );

  let configMap = opts.configMap;
  if (!configMap) {
    try {
      const file = configPath();
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      configMap = readConfigModelContextWindows(text);
    } catch {
      configMap = Object.create(null);
    }
  }

  // Explicit [model.id] context_window in config.toml always wins
  if (configMap[modelId] > 0) {
    return {
      ...model,
      modelId: modelId || model?.modelId,
      contextWindow: configMap[modelId],
    };
  }

  const resolved = resolveContextWindowForModel(modelId, { ...opts, configMap });
  // No config override: take the larger of resolver (known CLI / family) and ACP
  // meta so stale models_cache 256k never under-reports CLI's 1M for grok-4.5.
  let contextWindow = resolved;
  if (Number.isFinite(existing) && existing > 0) {
    contextWindow = Math.max(existing, resolved);
  }
  return {
    ...model,
    modelId: modelId || model?.modelId,
    contextWindow,
  };
}

function listModels() {
  return new Promise((resolve) => {
    const cli = resolveGrokCli();
    const child = spawnCli(cli, ["models"], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", () => {
      let configMap = Object.create(null);
      let cacheMap = Object.create(null);
      try {
        const file = configPath();
        const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
        configMap = readConfigModelContextWindows(text);
      } catch {
        /* ignore */
      }
      cacheMap = readModelsCacheContextWindows();
      const opts = { configMap, cacheMap };

      const models = [];
      let defaultModel = null;
      for (const line of out.split("\n")) {
        const def = line.match(/Default model:\s*(\S+)/i);
        if (def) defaultModel = def[1];
        const m = line.match(/^\s*[\*\-]\s+(\S+)/);
        if (m) {
          const id = m[1];
          models.push(
            enrichModelWithContextWindow(
              {
                id,
                modelId: id,
                isDefault: /\*/.test(line) || id === defaultModel,
              },
              opts,
            ),
          );
        }
      }
      resolve({ models, defaultModel, raw: out });
    });
    child.on("error", () => resolve({ models: [], defaultModel: null, raw: "" }));
  });
}

function getAllSettings() {
  return {
    desktop: readDesktopSettings(),
    grok: readGrokConfigSummary(),
    grokHome: grokHome(),
    desktopSettingsPath: DESKTOP_SETTINGS,
  };
}

module.exports = {
  DESKTOP_SETTINGS,
  DEFAULT_CONTEXT_WINDOW,
  KNOWN_MODEL_CONTEXT_WINDOWS,
  readDesktopSettings,
  writeDesktopSettings,
  readGrokConfigSummary,
  updateGrokConfig,
  listModels,
  getAllSettings,
  configPath,
  resolveContextWindowForModel,
  enrichModelWithContextWindow,
  readConfigModelContextWindows,
  readModelsCacheContextWindows,
};
