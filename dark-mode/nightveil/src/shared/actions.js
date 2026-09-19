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

// Q4 真话化：当前标签页的生效状态——全局 dark 且该站点未被作用域排除。
// hostname 为 null（内部页）：排除模式按生效、包含模式按不在表（与 popup 站点行的可作用域判定对齐，
// 但注意 popup 用 http(s) 门控 hostname 为 null；这里 null 语义=不可作用域页）。
export function tabEffectiveDark(settings, hostname) {
  if (settings.state !== 'dark') return false;
  if (!hostname) return !settings.inclusionMode;
  return settings.inclusionMode
    ? hostnameInList(hostname, settings.inclusionList ?? [])
    : !hostnameInList(hostname, settings.exclusionList ?? []);
}
