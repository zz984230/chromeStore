// src/shared/actions.js
// Pure decision helpers for background-initiated settings changes.
// Background wires chrome APIs around these; matching logic stays testable.
import { normalizeHostname, hostnameInList, siteDarkActive } from './scope.js';

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

// Q4 真话化：当前标签页的生效状态 = 站点暗色是否生效（scope.js siteDarkActive）。
// 直接委托：final-review 裁决——工具栏图标必须与页面变暗行为按构造相等，不许两份判定漂移。
export function tabEffectiveDark(settings, hostname) {
  return siteDarkActive(settings, hostname);
}

// 站点行删除：摘除该 host 及管辖它的父条目，兄弟/子条目保留（D4，M1b
// toolbarClickPatch 先例）——父条目管辖时按精确等值过滤会变成无操作死按钮。
export function removeHostFromList(list, host) {
  return list.filter((e) => {
    const ne = normalizeHostname(e);
    return !(host === ne || host.endsWith('.' + ne));
  });
}
