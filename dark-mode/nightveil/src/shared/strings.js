// src/shared/strings.js
// All runtime user-visible English copy lives here (i18n-ready per ADR-0003).
// Static files (manifest.json, options.html) duplicate two values; the
// strings-source test keeps them locked to this module.
export const STRINGS = Object.freeze({
  extensionName: 'NightVeil',
  extensionDescription: 'A global dark theme for the web.',
  swStartedDebug: '[NightVeil] service worker started',
  contentActiveLog: '[NightVeil] content script active',
  optionsHeading: 'NightVeil Options',
  optionsNote: 'Settings arrive in Milestone 1.',
  stateTitleDark: 'NightVeil — Dark',
  stateTitleLight: 'NightVeil — Light',
});
