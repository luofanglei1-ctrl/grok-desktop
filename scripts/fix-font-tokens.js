const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "..", "renderer", "styles.css");
let css = fs.readFileSync(p, "utf8");
const before = (css.match(/font-size:\s*[0-9.]+px/g) || []).length;

const pairs = [
  [22, "var(--fs-2xl)"],
  [16, "var(--fs-title)"],
  [15, "var(--fs-xl)"],
  [14.5, "var(--fs-chat)"],
  [14, "var(--fs-lg)"],
  [13.5, "var(--fs-base)"],
  [13, "var(--fs-base)"],
  [12.5, "var(--fs-md)"],
  [12, "var(--fs-md)"],
  [11.5, "var(--fs-sm)"],
  [11, "var(--fs-sm)"],
  [10.5, "var(--fs-xs)"],
  [10, "var(--fs-xs)"],
  [9, "var(--fs-2xs)"],
];

for (const [n, tok] of pairs) {
  const num = String(n).replace(".", "\\.");
  const re = new RegExp("font-size:\\s*" + num + "px", "g");
  css = css.replace(re, "font-size: " + tok);
}

// Chat body
css = css.replace(
  /\.turn \.body \{\s*\n\s*font-size: var\(--fs-lg\);/,
  ".turn .body {\n  font-size: var(--fs-chat);",
);
css = css.replace(
  /\.turn \.body \{\s*font-size: var\(--fs-lg\);/,
  ".turn .body {\n  font-size: var(--fs-chat);",
);

// Drop redundant media font overrides on .turn .body
css = css.replace(
  /@media \(min-width: 1920px\) \{\s*\.turn \.body \{ font-size: [^}]+\}\s*\}\s*/g,
  "",
);
css = css.replace(
  /@media \(min-width: 2560px\) \{\s*\.turn \.body \{ font-size: [^}]+\}\s*\}\s*/g,
  "",
);

// Title headings
css = css.replace(
  /#chat-title, \.page-header h1 \{\s*\n\s*margin: 0; font-size: var\(--fs-\w+\);/,
  "#chat-title, .page-header h1 {\n  margin: 0; font-size: var(--fs-title);",
);

fs.writeFileSync(p, css);
const after = css.match(/font-size:\s*[0-9.]+px/g) || [];
const vars = (css.match(/font-size:\s*var\(--fs/g) || []).length;
console.log(JSON.stringify({ before, after: after.length, leftover: after, vars }, null, 2));
