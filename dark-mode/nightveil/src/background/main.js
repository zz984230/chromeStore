// src/background/main.js
// Global state owner: icon/title sync and the site-list context menu. State
// lives in chrome.storage.local (single object); content scripts re-render
// themselves.
import { STRINGS } from '../shared/strings.js';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/settings.js';
import { iconPathsFor } from '../shared/icons.js';
import { menuSpec, menuClickPatch, hostnameFromUrl, tabEffectiveDark } from '../shared/actions.js';
import { alarmStatePatch, syncAlarms } from '../shared/schedule.js';

const MENU_ID = 'nv-site-list';

console.debug(STRINGS.swStartedDebug);

// Q4 真话化：图标/标题按「每个标签页的生效状态」显示。全局兜底（不带 tabId）先
// 铺一次，覆盖无 URL 的 tab 与尚未追踪的新 tab；随后全量扫描，对每个有 URL 的
// tab 叠加 per-tab 覆盖（M1 的全量刷新路径，存储变更时照旧全扫）。
function refreshToolbar(settings) {
  const dark = settings.state === 'dark';
  chrome.action.setIcon({ path: iconPathsFor(settings.state) });
  chrome.action.setTitle({ title: dark ? STRINGS.stateTitleDark : STRINGS.stateTitleLight });
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) applyTabState(tab.id, tab.url, settings);
  });
}

// 单个 tab 的图标/标题 = 该 tab 的生效状态（per-tab 覆盖优先于全局兜底）。
function applyTabState(tabId, url, settings) {
  if (!url) return; // 无 URL（内部页/权限不可见）→ 跳过本 tab；已设置过的 per-tab 覆盖会保留至下次可见 URL 导航（自愈）
  const siteDark = tabEffectiveDark(settings, hostnameFromUrl(url));
  chrome.action.setIcon({ tabId, path: iconPathsFor(siteDark ? 'dark' : 'light') });
  chrome.action.setTitle({ tabId, title: siteDark ? STRINGS.stateTitleSiteOn : STRINGS.stateTitleSiteOff });
}

// 事件驱动的单 tab 刷新：只取该 tab、只读一次设置，绝不全量 query。
async function refreshTabIcon(tabId) {
  const [settings, tab] = await Promise.all([loadSettings(), chrome.tabs.get(tabId).catch(() => null)]);
  if (tab) applyTabState(tab.id, tab.url, settings); // tab 已关闭 → 静默放弃
}

// 导航改变 tab 的 URL/加载状态 → 该 tab 的生效状态可能翻转。
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url !== undefined || info.status !== undefined) refreshTabIcon(tabId);
});
// 切换标签页 → 把该 tab 的图标刷成它自己的生效状态。
chrome.tabs.onActivated.addListener(({ tabId }) => { refreshTabIcon(tabId); });

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
