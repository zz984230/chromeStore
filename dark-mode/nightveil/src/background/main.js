// src/background/main.js
// Global state owner: icon/title sync and the site-list context menu. State
// lives in chrome.storage.local (single object); content scripts re-render
// themselves.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/settings.js';
import { iconPathsFor } from '../shared/icons.js';
import { menuSpec, menuClickPatch } from '../shared/actions.js';
import { alarmStatePatch, syncAlarms } from '../shared/schedule.js';

const MENU_ID = 'nv-site-list';

console.debug(STRINGS.swStartedDebug);

function refreshToolbar(settings) {
  const dark = settings.state === 'dark';
  chrome.action.setIcon({ path: iconPathsFor(settings.state) });
  chrome.action.setTitle({ title: dark ? STRINGS.stateTitleDark : STRINGS.stateTitleLight });
}

let menuTitle = '';
let menuIsColorTemp = false;
function refreshMenu(settings) {
  const spec = menuSpec(settings);
  const isCt = spec.mode === 'color-temp';
  const title = isCt ? STRINGS.menuExcludeColorTemp
    : settings.inclusionMode ? STRINGS.menuIncludeSite : STRINGS.menuExcludeSite;
  if (title === menuTitle && isCt === menuIsColorTemp) return;
  menuTitle = title; menuIsColorTemp = isCt;
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

loadSettings().then((s) => { refreshToolbar(s); refreshMenu(s); });
chrome.runtime.onStartup.addListener(() => {
  loadSettings().then(refreshToolbar);
});
subscribeSettings((s) => { refreshToolbar(s); refreshMenu(s); syncAlarms(s); });

// Cross-origin stylesheet proxy for the adaptive engine (M2a): content
// scripts are page-CORS-bound; the SW holds host_permissions so it can read
// any sheet the page could load (M2-BEHAVIOR §5).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'nv-engine-fetch-css' || !/^https?:/i.test(msg.href ?? '')) return false;
  fetch(msg.href, { cache: 'default' })
    .then((r) => r.text())
    .then((content) => sendResponse({ ok: true, content }))
    .catch(() => sendResponse({ ok: false }));
  return true; // async sendResponse
});

// ---- M3 Schedule（M3-BEHAVIOR §3）：一次性 alarm，触发即走 saveSettings 全链 ----

// state 写入会经 subscribeSettings 再次 syncAlarms —— 触发后自动重排次日。
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    const patch = alarmStatePatch(alarm.name);
    if (patch) saveSettings(patch);
  });
  chrome.runtime.onStartup.addListener(() => { loadSettings().then(syncAlarms); });
  chrome.runtime.onInstalled.addListener(() => { loadSettings().then(syncAlarms); });
}
loadSettings().then(syncAlarms);
