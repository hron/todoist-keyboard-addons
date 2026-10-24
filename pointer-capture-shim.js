// Runs in the page's own world (see manifest.json), not the content script's.
//
// Todoist's drag library calls setPointerCapture() on pointerdown. For the
// synthetic drag in content.js, Firefox throws NotFoundError until the tab has
// seen a real mouse press, which aborts the drag. Capture isn't needed there
// (content.js sends the later events to <body> itself), so ignore that error.
const setPointerCapture = Element.prototype.setPointerCapture;

Element.prototype.setPointerCapture = function (pointerId) {
  try {
    return setPointerCapture.call(this, pointerId);
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
};
