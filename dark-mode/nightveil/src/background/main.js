// src/background/main.js
// Global state owner: toolbar toggle + icon/title sync, the site-list context
// menu, and per-site toolbar behavior in inclusion mode. State lives in
// chrome.storage.local (single object); content scripts re-render themselves.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/settings.js';
import { iconPathsFor } from '../shared/icons.js';
import { hostnameFromUrl, menuClickPatch, toolbarClickPatch } from '../shared/actions.js';
import { hostnameInList } from '../shared/scope.js';

const MENU_ID = 'nv-site-list';

console.debug(STRINGS.swStartedDebug);

function refreshToolbar(settings) {
  const dark = settings.state === 'dark';
  chrome.action.setIcon({ path: iconPathsFor(settings.state) });
  chrome.action.setTitle({ title: dark ? STRINGS.stateTitleDark : STRINGS.stateTitleLight });
}

let menuTitle = '';
function refreshMenu(settings) {
  const title = settings.inclusionMode ? STRINGS.menuIncludeSite : STRINGS.menuExcludeSite;
  if (title === menuTitle) return;
  menuTitle = title;
  // recreate (not update) so the menu also exists on a fresh service worker
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title, contexts: ['page'] });
  });
}

chrome.runtime.onInstalled.addListener(() => { loadSettings().then(refreshMenu); });
chrome.runtime.onStartup.addListener(() => { loadSettings().then(refreshMenu); });

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const patch = menuClickPatch(await loadSettings(), tab?.url);
  if (patch) await saveSettings(patch);
});

chrome.action.onClicked.addListener(async (tab) => {
  const before = await loadSettings();
  await saveSettings(toolbarClickPatch(before, tab?.url));
  if (before.inclusionMode && before.perSiteToggle && tab?.id && tab.url) {
    // per-tab title feedback; v1: no navigation-follow updates (backlog)
    const now = await loadSettings();
    const on = hostnameInList(hostnameFromUrl(tab.url), now.inclusionList);
    chrome.action.setTitle({ tabId: tab.id, title: on ? STRINGS.stateTitleSiteOn : STRINGS.stateTitleSiteOff });
  }
});

loadSettings().then(refreshToolbar);
chrome.runtime.onStartup.addListener(() => {
  loadSettings().then(refreshToolbar);
});
subscribeSettings((s) => { refreshToolbar(s); refreshMenu(s); });
