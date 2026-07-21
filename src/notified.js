/**
 * Durable "already notified" log — avoid re-toasting / OS notify on app restart
 * for the same completion event.
 */
const fs = require("fs");
const path = require("path");
const { appConfigDir } = require("./platform");

const FILE = path.join(appConfigDir(), "notified-events.json");
const MAX_KEYS = 400;

function load() {
  try {
    if (!fs.existsSync(FILE)) return { keys: [] };
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { keys: Array.isArray(j.keys) ? j.keys.map(String) : [] };
  } catch {
    return { keys: [] };
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    let keys = Array.isArray(data.keys) ? data.keys.map(String) : [];
    if (keys.length > MAX_KEYS) keys = keys.slice(-MAX_KEYS);
    fs.writeFileSync(FILE, JSON.stringify({ keys, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {
    /* ignore */
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
  save(data);
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
  save(data);
  return true;
}

function clear() {
  save({ keys: [] });
}

module.exports = { has, mark, claim, clear, load, FILE };
