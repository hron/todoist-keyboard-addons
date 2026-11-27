// ---------------------------------------------------------------------------
// Pointer capture shim — runs at @run-at document-start in the page world.
//
// Todoist's drag library calls setPointerCapture() on pointerdown. For our
// synthetic drag, Firefox throws NotFoundError until the tab has seen a real
// mouse press, which aborts the drag. Capture isn't needed there (drag.js
// sends later events to <body> directly), so ignore NotFoundError.
// ---------------------------------------------------------------------------

import { WARN } from "./defaults.js";

export function installPointerCaptureShim() {
  const pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const proto = pageWin?.Element?.prototype;
  if (!proto || typeof proto.setPointerCapture !== "function") return;
  if (proto.__todoistKbdPointerCapturePatched) return;

  const origSetPointerCapture = proto.setPointerCapture;
  const wrapped = function (pointerId) {
    try {
      return origSetPointerCapture.call(this, pointerId);
    } catch (error) {
      if (error && error.name !== "NotFoundError") throw error;
    }
  };

  try {
    // Firefox WebExtension sandboxes enforce Xray vision on unsafeWindow;
    // exportFunction exposes the wrapper cleanly to page JS even under strict CSP.
    if (typeof exportFunction === "function") {
      exportFunction(wrapped, proto, { defineAs: "setPointerCapture" });
    } else {
      proto.setPointerCapture = wrapped;
    }
    proto.__todoistKbdPointerCapturePatched = true;
  } catch (err) {
    WARN("Could not install pointer capture shim:", err);
  }
}
