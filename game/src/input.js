// Keyboard, mouse and pointer lock. It never touches the simulation: it reports keys,
// mouse deltas and clicks, and main.js decides what they mean. Right mouse is the zoom
// (aim-down-sights) hold; B opens the requisition menu; E is use (plant / defuse / pick up).
export function createInput(dom, onLockChange) {
  const state = { keys: new Set(), firing: false, zooming: false };
  let locked = false;
  let sensitivity = 1;
  let lookX = 0;
  let lookY = 0;

  // One table drives every listener, so adding a binding is one row, not
  // another stray addEventListener somewhere down the file. Keys are tracked
  // in a set (main.js reads them by code); mouse buttons map to the two
  // held states through the button table below.
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
    // Sensitivity scales the raw mouse deltas: 1 is the tuned default,
    // 0.3 is slow and steady, 2 is flick-fast. The settings panel owns it.
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
