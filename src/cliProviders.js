/**
 * Grok CLI provider manager (ccswitch-style).
 * Reads/writes [model.<id>] sections and [models]/[endpoints] in ~/.grok/config.toml.
 */
const fs = require("fs");
const path = require("path");
const { grokHome } = require("./sessions");

const PRESETS = [
  {
    id: "xai-official",
    name: "xAI 官方",
    model: "grok-4",
    base_url: "https://api.x.ai/v1",
    api_backend: "responses",
    context_window: 1000000,
    description: "官方 xAI API",
  },
  {
    id: "openai-compat",
    name: "OpenAI 兼容中转",
    model: "grok-4",
    base_url: "https://api.example.com/v1",
    api_backend: "chat_completions",
    context_window: 1000000,
    description: "第三方 OpenAI 兼容中转（改 base_url 与 api_key）",
  },
  {
    id: "sub2api-style",
    name: "Sub2API / 聚合中转",
    model: "grok-4.5",
    base_url: "https://api.example.com/v1",
    api_backend: "responses",
    context_window: 1000000,
    description: "聚合 API 中转，映射上游模型名",
  },
];

function configPath() {
  return path.join(grokHome(), "config.toml");
}

function readRaw() {
  const file = configPath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  } catch {
    /* ignore */
  }
  return "";
}

function writeRaw(text) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // backup last good config
  try {
    if (fs.existsSync(file)) {
      const bak = path.join(grokHome(), "config.toml.bak");
      fs.copyFileSync(file, bak);
    }
  } catch {
    /* ignore */
  }
  const out = text.endsWith("\n") ? text : text + "\n";
  fs.writeFileSync(file, out, "utf8");
}

function parseTomlValue(raw) {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  // strip inline comments for unquoted
  if (!(v.startsWith('"') || v.startsWith("'"))) {
    v = v.replace(/\s+#.*$/, "").trim();
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
    return v.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

function formatTomlValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value ?? "");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Split TOML into ordered blocks: { type: 'preamble'| 'section', name, body }
 * body includes the [header] line for sections.
 */
function splitToml(text) {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let cur = { type: "preamble", name: "", lines: [] };

  const flush = () => {
    if (cur.lines.length || cur.type === "preamble") {
      blocks.push({
        type: cur.type,
        name: cur.name,
        body: cur.lines.join("\n"),
      });
    }
  };

  for (const line of lines) {
    const m = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (m) {
      flush();
      cur = { type: "section", name: m[1].trim(), lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  flush();
  // drop empty trailing preamble-only if file was empty
  if (blocks.length === 1 && blocks[0].type === "preamble" && !blocks[0].body.trim()) {
    return [];
  }
  return blocks;
}

function joinBlocks(blocks) {
  if (!blocks.length) return "";
  return blocks
    .map((b) => b.body)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function parseSectionKv(body) {
  const out = {};
  for (const line of String(body || "").split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) continue;
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    out[m[1]] = parseTomlValue(m[2]);
  }
  return out;
}

function renderSection(name, kv) {
  const lines = [`[${name}]`];
  for (const [k, v] of Object.entries(kv)) {
    if (v === undefined || v === null || v === "") continue;
    lines.push(`${k} = ${formatTomlValue(v)}`);
  }
  return lines.join("\n");
}

function maskKey(key) {
  const s = String(key || "");
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function sanitizeId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function providerFromKv(id, kv, defaultId) {
  const apiKey = kv.api_key != null ? String(kv.api_key) : "";
  return {
    id,
    name: kv.name != null ? String(kv.name) : id,
    model: kv.model != null ? String(kv.model) : "",
    base_url: kv.base_url != null ? String(kv.base_url) : "",
    description: kv.description != null ? String(kv.description) : "",
    api_backend: kv.api_backend != null ? String(kv.api_backend) : "responses",
    context_window:
      typeof kv.context_window === "number"
        ? kv.context_window
        : kv.context_window
          ? Number(kv.context_window) || null
          : null,
    supports_backend_search: kv.supports_backend_search === true,
    hasApiKey: !!apiKey,
    api_key_masked: maskKey(apiKey),
    active: defaultId === id,
  };
}

function listProviders() {
  const text = readRaw();
  const blocks = splitToml(text);
  const modelsKv = parseSectionKv(
    blocks.find((b) => b.type === "section" && b.name === "models")?.body || "",
  );
  const endpointsKv = parseSectionKv(
    blocks.find((b) => b.type === "section" && b.name === "endpoints")?.body || "",
  );
  const defaultId = modelsKv.default != null ? String(modelsKv.default) : null;
  const webSearch = modelsKv.web_search != null ? String(modelsKv.web_search) : null;
  const effort =
    modelsKv.default_reasoning_effort != null
      ? String(modelsKv.default_reasoning_effort)
      : null;

  const providers = [];
  for (const b of blocks) {
    if (b.type !== "section") continue;
    const m = b.name.match(/^model\.(.+)$/);
    if (!m) continue;
    const id = m[1];
    const kv = parseSectionKv(b.body);
    providers.push(providerFromKv(id, kv, defaultId));
  }

  // sort: active first, then name
  providers.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), "zh");
  });

  return {
    configPath: configPath(),
    defaultModel: defaultId,
    webSearchModel: webSearch,
    defaultReasoningEffort: effort,
    xaiApiBaseUrl:
      endpointsKv.xai_api_base_url != null ? String(endpointsKv.xai_api_base_url) : "",
    providers,
    presets: PRESETS,
  };
}

function getProvider(id, { includeSecret = false } = {}) {
  const text = readRaw();
  const blocks = splitToml(text);
  const modelsKv = parseSectionKv(
    blocks.find((b) => b.type === "section" && b.name === "models")?.body || "",
  );
  const defaultId = modelsKv.default != null ? String(modelsKv.default) : null;
  const section = `model.${id}`;
  const block = blocks.find((b) => b.type === "section" && b.name === section);
  if (!block) return null;
  const kv = parseSectionKv(block.body);
  const p = providerFromKv(id, kv, defaultId);
  if (includeSecret) {
    p.api_key = kv.api_key != null ? String(kv.api_key) : "";
  }
  return p;
}

function upsertSection(text, sectionName, kv) {
  const blocks = splitToml(text);
  const body = renderSection(sectionName, kv);
  const idx = blocks.findIndex((b) => b.type === "section" && b.name === sectionName);
  if (idx >= 0) {
    blocks[idx] = { type: "section", name: sectionName, body };
  } else {
    blocks.push({ type: "section", name: sectionName, body });
  }
  return joinBlocks(blocks);
}

function deleteSection(text, sectionName) {
  const blocks = splitToml(text).filter(
    (b) => !(b.type === "section" && b.name === sectionName),
  );
  return joinBlocks(blocks);
}

function readSectionKv(text, sectionName) {
  const blocks = splitToml(text);
  const b = blocks.find((x) => x.type === "section" && x.name === sectionName);
  return parseSectionKv(b?.body || "");
}

function switchProvider(id) {
  const sid = sanitizeId(id);
  if (!sid) throw new Error("供应商 id 无效");
  const text = readRaw();
  const section = `model.${sid}`;
  if (!splitToml(text).some((b) => b.type === "section" && b.name === section)) {
    throw new Error(`供应商不存在：${sid}`);
  }
  const modelsKv = { ...readSectionKv(text, "models") };
  modelsKv.default = sid;
  // Keep web_search on the same provider id (ccswitch-style one-shot enable)
  modelsKv.web_search = sid;
  let next = upsertSection(text, "models", modelsKv);

  // Optionally sync global endpoint to provider base_url
  const pKv = readSectionKv(next, section);
  if (pKv.base_url) {
    const ep = { ...readSectionKv(next, "endpoints") };
    ep.xai_api_base_url = String(pKv.base_url);
    next = upsertSection(next, "endpoints", ep);
  }

  writeRaw(next);
  return listProviders();
}

function saveProvider(payload = {}) {
  const isNew = !!payload.isNew;
  const id = sanitizeId(payload.id);
  if (!id) throw new Error("请填写供应商 ID（英文数字）");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    throw new Error("ID 仅允许小写字母、数字、点、下划线、连字符");
  }

  let text = readRaw();
  const section = `model.${id}`;
  const exists = splitToml(text).some((b) => b.type === "section" && b.name === section);
  if (isNew && exists) throw new Error(`供应商已存在：${id}`);
  if (!isNew && !exists) throw new Error(`供应商不存在：${id}`);

  const prev = exists ? readSectionKv(text, section) : {};
  const nextKv = { ...prev };

  if (payload.name != null) nextKv.name = String(payload.name).trim() || id;
  if (payload.model != null) nextKv.model = String(payload.model).trim();
  if (payload.base_url != null) nextKv.base_url = String(payload.base_url).trim();
  if (payload.description != null) nextKv.description = String(payload.description).trim();
  if (payload.api_backend != null) nextKv.api_backend = String(payload.api_backend).trim();
  if (payload.context_window != null && payload.context_window !== "") {
    const n = Number(payload.context_window);
    if (Number.isFinite(n) && n > 0) nextKv.context_window = Math.floor(n);
  }
  if (payload.supports_backend_search != null) {
    nextKv.supports_backend_search = !!payload.supports_backend_search;
  }
  // api_key: empty / "••••" means keep
  if (payload.api_key != null && String(payload.api_key).trim() !== "") {
    const k = String(payload.api_key).trim();
    if (!/^•+$/.test(k) && k !== prev.api_key) {
      nextKv.api_key = k;
    }
  }
  if (!nextKv.model) throw new Error("请填写上游模型名 model");
  if (!nextKv.base_url) throw new Error("请填写 Base URL");

  text = upsertSection(text, section, nextKv);

  if (payload.makeDefault || (isNew && !readSectionKv(text, "models").default)) {
    const modelsKv = { ...readSectionKv(text, "models") };
    modelsKv.default = id;
    modelsKv.web_search = id;
    text = upsertSection(text, "models", modelsKv);
    const ep = { ...readSectionKv(text, "endpoints") };
    ep.xai_api_base_url = String(nextKv.base_url);
    text = upsertSection(text, "endpoints", ep);
  }

  writeRaw(text);
  return listProviders();
}

function deleteProvider(id) {
  const sid = sanitizeId(id);
  if (!sid) throw new Error("id 无效");
  let text = readRaw();
  const section = `model.${sid}`;
  if (!splitToml(text).some((b) => b.type === "section" && b.name === section)) {
    throw new Error(`供应商不存在：${sid}`);
  }
  text = deleteSection(text, section);
  const modelsKv = { ...readSectionKv(text, "models") };
  if (String(modelsKv.default || "") === sid) {
    // pick another model section if any
    const nextId =
      splitToml(text)
        .map((b) => (b.type === "section" ? b.name.match(/^model\.(.+)$/) : null))
        .find(Boolean)?.[1] || null;
    if (nextId) {
      modelsKv.default = nextId;
      modelsKv.web_search = nextId;
    } else {
      delete modelsKv.default;
      delete modelsKv.web_search;
    }
    text = upsertSection(text, "models", modelsKv);
  }
  writeRaw(text);
  return listProviders();
}

function updateEndpoints(patch = {}) {
  let text = readRaw();
  const ep = { ...readSectionKv(text, "endpoints") };
  if (patch.xaiApiBaseUrl != null || patch.xai_api_base_url != null) {
    ep.xai_api_base_url = String(
      patch.xaiApiBaseUrl ?? patch.xai_api_base_url ?? "",
    ).trim();
  }
  text = upsertSection(text, "endpoints", ep);
  writeRaw(text);
  return listProviders();
}

function openConfigDir() {
  return path.dirname(configPath());
}

module.exports = {
  PRESETS,
  configPath,
  listProviders,
  getProvider,
  switchProvider,
  saveProvider,
  deleteProvider,
  updateEndpoints,
  openConfigDir,
  maskKey,
  sanitizeId,
};
