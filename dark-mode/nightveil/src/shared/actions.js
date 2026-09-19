// src/shared/actions.js
// Pure decision helpers for background-initiated settings changes.
// Background wires chrome APIs around these; matching logic stays testable.
import { normalizeHostname, hostnameInList } from './scope.js';

export function hostnameFromUrl(url) {
  try { return normalizeHostname(new URL(url).hostname); } catch { return null; }
}

// M3 §1.4：菜单三态判定。亮色态 + 色温开 → 色温排除入口顶替暗色排除入口；
// dark 态永远走 include/exclude（原版 common.js:192-226 分支）。
export function menuSpec(settings) {
  if (settings.state === 'light' && settings.colorTemperature?.enabled) {
    return { mode: 'color-temp' };
  }
  return { mode: 'site' };
}

// Context-menu click: add the page's host to the active mode's list. Never
// removes — faithful to the original's missing un-exclude entry (BACKLOG).
export function menuClickPatch(settings, url) {
  const host = hostnameFromUrl(url);
  if (!host) return null;
  if (menuSpec(settings).mode === 'color-temp') {
    const ct = settings.colorTemperature ?? {};
    const list = ct.excludedHosts ?? [];
    if (list.some((h) => normalizeHostname(h) === host)) return null;
    return { colorTemperature: { ...ct, excludedHosts: [...list, host] } };
  }
  const key = settings.inclusionMode ? 'inclusionList' : 'exclusionList';
  const list = settings[key] ?? [];
  if (hostnameInList(host, list)) return null;
  return { [key]: [...list, host] };
}
