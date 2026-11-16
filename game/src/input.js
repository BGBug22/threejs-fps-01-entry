// GULLHAVEN input: one table drives every listener, so a new binding is one
// row. Mouse deltas are scaled by the sensitivity the settings panel owns.
export function createInput(dom, onLockChange) {
  const state = { keys: new Set(), firing: false, zooming: false };
  let locked = false;
  let sensitivity = 1;
  let lookX = 0;
  let lookY = 0;

  const keyHandlers = {
    keydown(event) {
      if (event.repeat) return;
      state.keys.add(event.code);
      if (event.code === 'Tab') event.preventDefault();
    },
    keyup(event) { state.keys.delete(event.code); },
    mousemove(event) {
      if (!locked) return;
      lookX += event.movementX;
      lookY += event.movementY;
    },
  };
  const buttonField = { 0: 'firing', 2: 'zooming' };
  function onMouseButton(event, down) {
    if (!locked) return;
    const field = buttonField[event.button];
    if (field) state[field] = down;
  }
  function onLock() {
    locked = document.pointerLockElement === dom;
    if (!locked) {
      state.firing = false;
      state.zooming = false;
    }
    onLockChange(locked);
  }
  function onContextMenu(event) {
    event.preventDefault();
  }

  for (const [type, handler] of Object.entries(keyHandlers)) document.addEventListener(type, handler);
  document.addEventListener('mousedown', (event) => onMouseButton(event, true));
  document.addEventListener('mouseup', (event) => onMouseButton(event, false));
  document.addEventListener('pointerlockchange', onLock);
  dom.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    requestLock() {
      try {
        const p = dom.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* pointer lock unavailable */ }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    isLocked() {
      return locked;
    },
    setSensitivity(value) {
      sensitivity = Math.max(0.3, Math.min(2, value));
    },
    get sensitivity() { return sensitivity; },
    takeLook() {
      const out = { x: lookX * sensitivity, y: lookY * sensitivity };
      lookX = 0;
      lookY = 0;
      return out;
    },
  };
}
