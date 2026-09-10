// src/background/main.js
// Global state owner: toolbar toggle + icon/title sync. State lives in
// chrome.storage.local (single object); content scripts re-render themselves.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/settings.js';
import { iconPathsFor } from '../shared/icons.js';

console.debug(STRINGS.swStartedDebug);

function refreshToolbar(settings) {
  const dark = settings.state === 'dark';
  chrome.action.setIcon({ path: iconPathsFor(settings.state) });
  chrome.action.setTitle({ title: dark ? STRINGS.stateTitleDark : STRINGS.stateTitleLight });
}

chrome.action.onClicked.addListener(async () => {
  const current = await loadSettings();
  await saveSettings({ state: current.state === 'dark' ? 'light' : 'dark' });
});

loadSettings().then(refreshToolbar);
subscribeSettings(refreshToolbar);
