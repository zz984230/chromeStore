// src/shared/icons.js
// Toolbar icon path mapping (pure — shared with tests and the service worker).
export function iconPathsFor(state) {
  const set = state === 'dark' ? 'dark' : 'light';
  return {
    16: `icons/${set}/16.png`,
    32: `icons/${set}/32.png`,
    48: `icons/${set}/48.png`,
    64: `icons/${set}/64.png`,
  };
}
