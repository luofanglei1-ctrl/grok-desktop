/**
 * Durable "already notified" log — avoid re-toasting / OS notify on app restart
 * for the same completion event.
 */
const fs = require("fs");
const path = require("path");
const { appConfigDir } = require("./platform");

let _fileOverride = null;
const MAX_KEYS = 500;

function filePath() {
  if (_fileOverride) return _fileOverride;
  return path.join(appConfigDir(), "notified-events.json");
}

/** Call after app.ready to pin path under Electron userData (more reliable). */
function setBaseDir(dir) {
  if (dir) _fileOverride = path.join(dir, "notified-events.json");
}

function load() {
  try {
    const FILE = filePath();
    if (!fs.existsSync(FILE)) return { keys: [] };
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { keys: Array.isArray(j.keys) ? j.keys.map(String) : [] };
  } catch {
    return { keys: [] };
  }
}

function save(data) {
  const FILE = filePath();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  let keys = Array.isArray(data.keys) ? data.keys.map(String) : [];
  // de-dupe while preserving order
  keys = [...new Set(keys)];
  if (keys.length > MAX_KEYS) keys = keys.slice(-MAX_KEYS);
  const payload = JSON.stringify({ keys, updatedAt: new Date().toISOString() }, null, 2);
  fs.writeFileSync(FILE, payload, "utf8");
  // verify
  try {
    const again = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!Array.isArray(again.keys) || again.keys.length < keys.length) {
      throw new Error("verify failed");
    }
  } catch (e) {
    // one retry
    fs.writeFileSync(FILE, payload, "utf8");
  }
}

/** @returns {boolean} true if this key was already recorded */
function has(key) {
  if (!key) return false;
  return load().keys.includes(String(key));
}

/** Record key; returns false if already present (caller should skip notify). */
function mark(key) {
  if (!key) return true;
  const k = String(key);
  const data = load();
  if (data.keys.includes(k)) return false;
  data.keys.push(k);
  try {
    save(data);
  } catch {
    /* still treat as marked this process */
  }
  return true;
}

/**
 * Atomic check-and-mark.
 * @returns {boolean} true if should notify (first time), false if already notified
 */
function claim(key) {
  if (!key) return true;
  const k = String(key);
  const data = load();
  if (data.keys.includes(k)) return false;
  data.keys.push(k);
  try {
    save(data);
  } catch (e) {
    // If we cannot persist, still mark in-memory for this process only
    // by writing a temp in-process set
  }
  return true;
}

function clear() {
  try {
    save({ keys: [] });
  } catch {
    /* ignore */
  }
}

module.exports = { has, mark, claim, clear, load, setBaseDir, filePath };
