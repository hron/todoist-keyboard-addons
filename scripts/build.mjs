import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const DIST_DIR = path.join(ROOT, "dist");
const OUTPUT_FILE = path.join(DIST_DIR, "todoist-keyboard-addons.user.js");

// Ordered modules — each module may use standard ES import/export syntax for
// direct testing, which this bundler strips cleanly into one IIFE.
const MODULE_ORDER = [
  "defaults.js",
  "pointer-capture-shim.js",
  "storage.js",
  "drag.js",
  "parent-label.js",
  "shortcuts.js",
  "settings-ui.js",
  "settings-modal.js",
  "settings-page.js",
  "main.js",
];

export function readBase64DataUri(relPath, mimeType) {
  const fullPath = path.join(ROOT, relPath);
  const bytes = fs.readFileSync(fullPath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function stripModuleSyntax(source) {
  // Remove relative import statements (single or multi-line)
  let out = source.replace(
    /^import\s+(?:[\s\S]*?\s+from\s+)?["']\.\/[^"']+["'];?\s*\n?/gm,
    "",
  );
  // Strip leading `export ` from declarations (`export function`, `export const`, `export async function`, etc.)
  out = out.replace(
    /^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm,
    "",
  );
  // Remove standalone `export { ... };` blocks if any
  out = out.replace(/^export\s+\{[\s\S]*?\};?\s*\n?/gm, "");
  return out.trim();
}

function buildHeader(pkg, iconDataUri) {
  const repo =
    process.env.GITHUB_REPOSITORY || pkg.repository?.url || pkg.repository || "";
  const repoSlug =
    typeof repo === "string"
      ? repo
          .replace(/^https?:\/\/github\.com\//, "")
          .replace(/\.git$/, "")
          .replace(/^\/+|\/+$/g, "")
      : "";

  const lines = [
    "// ==UserScript==",
    "// @name         Todoist Keyboard Add-ons",
    repoSlug
      ? `// @namespace    https://github.com/${repoSlug}`
      : "// @namespace    todoist-keyboard-addons",
    `// @version      ${pkg.version}`,
    "// @description  Extra keyboard shortcuts and quality-of-life features for Todoist",
    "// @match        *://app.todoist.com/*",
    `// @icon         ${iconDataUri}`,
    "// @run-at       document-start",
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// @grant        GM_addValueChangeListener",
    "// @grant        GM_registerMenuCommand",
    "// @grant        unsafeWindow",
  ];

  if (repoSlug) {
    const releaseUrl = `https://github.com/${repoSlug}/releases/latest/download/todoist-keyboard-addons.user.js`;
    lines.push(`// @homepageURL  https://github.com/${repoSlug}`);
    lines.push(`// @downloadURL  ${releaseUrl}`);
    lines.push(`// @updateURL    ${releaseUrl}`);
  }

  lines.push("// ==/UserScript==");
  return lines.join("\n");
}

export function buildUserscript({ write = true, log = false } = {}) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const iconDataUri = readBase64DataUri("icons/icon-48.png", "image/png");
  const parentLabelPreviewDataUri = readBase64DataUri(
    "docs/screenshot-parent-label.png",
    "image/png",
  );

  const header = buildHeader(pkg, iconDataUri);
  const assetsBlock = [
    "// ---- Embedded assets ------------------------------------------------------",
    `const PREVIEW_ASSETS = {`,
    `  showParentTask: ${JSON.stringify(parentLabelPreviewDataUri)},`,
    `};`,
  ].join("\n");

  const chunks = [assetsBlock];
  for (const file of MODULE_ORDER) {
    const raw = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
    const stripped = stripModuleSyntax(raw);
    chunks.push(`// ==== ${file} ====\n${stripped}`);
  }

  const body = chunks.join("\n\n");
  const indentedBody = body
    .split("\n")
    .map((line) => (line.length ? `  ${line}` : ""))
    .join("\n");

  const bundle = `${header}\n\n(function () {\n  "use strict";\n\n${indentedBody}\n})();\n`;

  if (write) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, bundle, "utf8");
    if (log) {
      const kb = (Buffer.byteLength(bundle, "utf8") / 1024).toFixed(1);
      console.log(`Built ${path.relative(ROOT, OUTPUT_FILE)} (${kb} KB)`);
    }
  }

  return { bundle, version: pkg.version, iconDataUri };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  buildUserscript({ write: true, log: true });
}
