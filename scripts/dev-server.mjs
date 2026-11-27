import crypto from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

import { buildUserscript, readBase64DataUri } from "./build.mjs";

const PORT = Number(process.env.PORT || 4174);

export function createDevLoaderScript({ port = PORT } = {}) {
  const bundleUrl = `http://127.0.0.1:${port}/dist/todoist-keyboard-addons.user.js`;
  const iconDataUri = readBase64DataUri("icons/icon-48.png", "image/png");

  return `// ==UserScript==
// @name         Todoist Keyboard Add-ons (Local Dev)
// @namespace    todoist-keyboard-addons#dev
// @version      0.0.1-dev
// @description  Live local dev loader for Todoist Keyboard Add-ons (fetches a fresh build on every page load via GM_xmlhttpRequest, bypassing Tampermonkey @require caching).
// @match        *://app.todoist.com/*
// @icon         ${iconDataUri}
// @run-at       document-start
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  const DEV_URL = ${JSON.stringify(bundleUrl)};

  if (typeof GM_xmlhttpRequest !== "function") {
    console.error("[todoist-kbd dev] GM_xmlhttpRequest is unavailable. Check @grant metadata.");
    return;
  }

  function findPageScriptNonce() {
    const htmlNonce = document.documentElement?.getAttribute("data-csp-nonce");
    if (htmlNonce) return htmlNonce;
    const scripts = document.querySelectorAll("script[nonce]");
    for (const el of scripts) {
      const nonce = el.nonce || el.getAttribute("nonce");
      if (nonce) return nonce;
    }
    return "";
  }

  function setupGmBridge(suffix) {
    const reqEvent = "tka-dev-req-" + suffix;
    const resEvent = "tka-dev-res-" + suffix;
    const changeEvent = "tka-dev-change-" + suffix;
    const menuEvent = "tka-dev-menu-" + suffix;
    const NOT_FOUND = Symbol("not-found");

    document.addEventListener(reqEvent, (ev) => {
      if (!ev || typeof ev.detail !== "string") return;
      let msg;
      try {
        msg = JSON.parse(ev.detail);
      } catch {
        return;
      }

      if (msg.op === "get") {
        const val =
          typeof GM_getValue === "function"
            ? GM_getValue(msg.key, NOT_FOUND)
            : NOT_FOUND;
        const payload =
          val === NOT_FOUND
            ? JSON.stringify({ found: false })
            : JSON.stringify({ found: true, value: val });
        document.dispatchEvent(new CustomEvent(resEvent, { detail: payload }));
        return;
      }

      if (msg.op === "set") {
        if (typeof GM_setValue === "function") {
          GM_setValue(msg.key, msg.value);
        }
        return;
      }

      if (msg.op === "listen") {
        if (typeof GM_addValueChangeListener === "function") {
          GM_addValueChangeListener(msg.key, (name, oldVal, newVal, remote) => {
            document.dispatchEvent(
              new CustomEvent(changeEvent, {
                detail: JSON.stringify({
                  cid: msg.cid,
                  name,
                  oldVal,
                  newVal,
                  remote,
                }),
              }),
            );
          });
        }
        return;
      }

      if (msg.op === "menu") {
        if (typeof GM_registerMenuCommand === "function") {
          GM_registerMenuCommand(msg.label, () => {
            document.dispatchEvent(
              new CustomEvent(menuEvent, { detail: String(msg.mid) }),
            );
          });
        }
      }
    });

    return { reqEvent, resEvent, changeEvent, menuEvent };
  }

  function buildBridgedBundle(source, ackEventName, bridge) {
    return (
      "(function () {\\n" +
      "  document.dispatchEvent(new Event(" + JSON.stringify(ackEventName) + "));\\n" +
      "  var _reqEvent = " + JSON.stringify(bridge.reqEvent) + ";\\n" +
      "  var _resEvent = " + JSON.stringify(bridge.resEvent) + ";\\n" +
      "  var _changeEvent = " + JSON.stringify(bridge.changeEvent) + ";\\n" +
      "  var _menuEvent = " + JSON.stringify(bridge.menuEvent) + ";\\n" +
      "  var _changeCbs = new Map();\\n" +
      "  var _menuCbs = new Map();\\n" +
      "  var _nextId = 1;\\n" +
      "  var _lastRes = null;\\n" +
      "  document.addEventListener(_resEvent, function (ev) {\\n" +
      "    if (ev && typeof ev.detail === 'string') _lastRes = ev.detail;\\n" +
      "  });\\n" +
      "  document.addEventListener(_changeEvent, function (ev) {\\n" +
      "    if (!ev || typeof ev.detail !== 'string') return;\\n" +
      "    var data = JSON.parse(ev.detail);\\n" +
      "    var cb = _changeCbs.get(data.cid);\\n" +
      "    if (cb) cb(data.name, data.oldVal, data.newVal, data.remote);\\n" +
      "  });\\n" +
      "  document.addEventListener(_menuEvent, function (ev) {\\n" +
      "    if (!ev || typeof ev.detail !== 'string') return;\\n" +
      "    var cb = _menuCbs.get(Number(ev.detail));\\n" +
      "    if (cb) cb();\\n" +
      "  });\\n" +
      "  var GM_getValue = function (key, fallback) {\\n" +
      "    _lastRes = null;\\n" +
      "    document.dispatchEvent(new CustomEvent(_reqEvent, { detail: JSON.stringify({ op: 'get', key: key }) }));\\n" +
      "    if (!_lastRes) return fallback;\\n" +
      "    var parsed = JSON.parse(_lastRes);\\n" +
      "    return parsed.found ? parsed.value : fallback;\\n" +
      "  };\\n" +
      "  var GM_setValue = function (key, value) {\\n" +
      "    document.dispatchEvent(new CustomEvent(_reqEvent, { detail: JSON.stringify({ op: 'set', key: key, value: value }) }));\\n" +
      "  };\\n" +
      "  var GM_addValueChangeListener = function (key, cb) {\\n" +
      "    var cid = _nextId++;\\n" +
      "    _changeCbs.set(cid, cb);\\n" +
      "    document.dispatchEvent(new CustomEvent(_reqEvent, { detail: JSON.stringify({ op: 'listen', key: key, cid: cid }) }));\\n" +
      "    return cid;\\n" +
      "  };\\n" +
      "  var GM_registerMenuCommand = function (label, cb) {\\n" +
      "    var mid = _nextId++;\\n" +
      "    _menuCbs.set(mid, cb);\\n" +
      "    document.dispatchEvent(new CustomEvent(_reqEvent, { detail: JSON.stringify({ op: 'menu', label: label, mid: mid }) }));\\n" +
      "    return mid;\\n" +
      "  };\\n" +
      source +
      "\\n})();\\n//# sourceURL=" + DEV_URL
    );
  }

  function executeBundle(source) {
    const suffix = Math.random().toString(36).slice(2);
    const ackEventName = "tka-dev-exec-" + suffix;
    const bridge = setupGmBridge(suffix);
    let executed = false;

    document.addEventListener(
      ackEventName,
      () => {
        executed = true;
      },
      { once: true },
    );

    const bridgedSource = buildBridgedBundle(source, ackEventName, bridge);
    const nonce = findPageScriptNonce();
    const errors = [];

    // Strategy 1: GM_addElement('script', ...) with page CSP nonce (CSP + Trusted Types safe)
    if (typeof GM_addElement === "function") {
      try {
        const attrs = { textContent: bridgedSource };
        if (nonce) attrs.nonce = nonce;
        const el = GM_addElement("script", attrs);
        if (el && typeof el.remove === "function") el.remove();
        if (executed) return "GM_addElement";
      } catch (err) {
        errors.push(err);
      }
    }

    // Strategy 2: Direct <script nonce="..."> DOM injection
    try {
      const s = document.createElement("script");
      if (nonce) s.setAttribute("nonce", nonce);
      s.textContent = bridgedSource;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      if (executed) return "script-nonce";
    } catch (err) {
      errors.push(err);
    }

    // Strategy 3: Fallback to sandbox Function() when CSP allows unsafe-eval
    try {
      new Function(
        "GM_getValue",
        "GM_setValue",
        "GM_addValueChangeListener",
        "GM_registerMenuCommand",
        "unsafeWindow",
        "exportFunction",
        source + "\\n//# sourceURL=" + DEV_URL,
      )(
        typeof GM_getValue === "function" ? GM_getValue : undefined,
        typeof GM_setValue === "function" ? GM_setValue : undefined,
        typeof GM_addValueChangeListener === "function"
          ? GM_addValueChangeListener
          : undefined,
        typeof GM_registerMenuCommand === "function"
          ? GM_registerMenuCommand
          : undefined,
        typeof unsafeWindow !== "undefined" ? unsafeWindow : window,
        typeof exportFunction === "function" ? exportFunction : undefined,
      );
      return "Function";
    } catch (err) {
      errors.push(err);
    }

    throw errors[0] || new Error("Blocked by page Content Security Policy");
  }

  GM_xmlhttpRequest({
    method: "GET",
    url: DEV_URL + "?t=" + Date.now(),
    nocache: true,
    onload(res) {
      if (res.status !== 200) {
        console.error("[todoist-kbd dev] Failed to fetch dev bundle:", res.status, DEV_URL);
        return;
      }
      const buildHash =
        res.responseHeaders?.match(/^x-tka-build-hash:\\s*(.+)$/im)?.[1]?.trim() ||
        "unknown";
      try {
        const mode = executeBundle(res.responseText);
        console.info(
          "[todoist-kbd dev] Loaded fresh build (" +
            buildHash +
            ", " +
            res.responseText.length +
            "B via " +
            mode +
            ") from " +
            DEV_URL,
        );
      } catch (err) {
        console.error("[todoist-kbd dev] Failed to execute dev bundle:", err);
      }
    },
    onerror(err) {
      console.warn(
        "[todoist-kbd dev] Local dev server is not reachable at " +
          DEV_URL +
          ". Run \`npm run dev\`.",
        err,
      );
    },
  });
})();
`;
}

export function createDevServer({ port = PORT, log = false } = {}) {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || "/").split("?")[0];

    if (urlPath === "/dev-loader.user.js") {
      const addr = server.address();
      const activePort = addr && typeof addr === "object" ? addr.port : port;
      const loader = createDevLoaderScript({ port: activePort });
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      });
      res.end(loader);
      return;
    }

    if (urlPath === "/dist/todoist-keyboard-addons.user.js") {
      try {
        const { bundle } = buildUserscript({ write: true, log: false });
        const hash = crypto
          .createHash("sha256")
          .update(bundle)
          .digest("hex")
          .slice(0, 8);
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*",
          "X-Tka-Build-Hash": hash,
        });
        res.end(bundle);
        if (log) {
          console.log(
            `[dev] Served fresh build (${hash}, ${bundle.length} bytes)`,
          );
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Build failed: ${err.message}`);
        if (log) {
          console.error("[dev] Build failed:", err);
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  return server;
}

function startServer() {
  const server = createDevServer({ port: PORT, log: true });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(
      `Todoist Keyboard Add-ons dev server listening at http://127.0.0.1:${PORT}/`,
    );
    console.log(
      `  1-click Tampermonkey dev loader: http://127.0.0.1:${PORT}/dev-loader.user.js`,
    );
    console.log(
      `  Live-rebuilt userscript bundle:  http://127.0.0.1:${PORT}/dist/todoist-keyboard-addons.user.js`,
    );
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
