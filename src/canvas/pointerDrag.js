/**
 * Follows a pointer on `window` until it is released or cancelled.
 *
 * A drag that starts on a handle must end on `pointerup` (commit) or on `pointercancel` (the system
 * took the touch: palm rejection, a notification, a gesture), otherwise the listeners stay on the
 * window and the next movement keeps editing the model. One AbortController removes all listeners.
 *
 * @param {{onMove: (e: PointerEvent) => void, onEnd: (e: PointerEvent) => void, onCancel?: (e: PointerEvent) => void}} handlers
 * @returns {() => void} abort function (silently stops the drag, calling no handler)
 */
export function trackPointerDrag({ onMove, onEnd, onCancel }) {
  const controller = new AbortController();
  const { signal } = controller;
  window.addEventListener('pointermove', onMove, { signal });
  window.addEventListener(
    'pointerup',
    (e) => {
      controller.abort();
      onEnd(e);
    },
    { signal }
  );
  window.addEventListener(
    'pointercancel',
    (e) => {
      controller.abort();
      (onCancel || onEnd)(e);
    },
    { signal }
  );
  return () => controller.abort();
}
