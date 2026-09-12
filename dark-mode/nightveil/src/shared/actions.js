// src/shared/actions.js
// Pure decision helpers for background-initiated settings changes.
// Background wires chrome APIs around these; matching logic stays testable.
import { normalizeHostname, hostnameInList } from './scope.js';

export function hostnameFromUrl(url) {
  try { return normalizeHostname(new URL(url).hostname); } catch { return null; }
}

// Context-menu click: add the page's host to the active mode's list. Never
// removes — faithful to the original's missing un-exclude entry (BACKLOG).
export function menuClickPatch(settings, url) {
  const host = hostnameFromUrl(url);
  if (!host) return null;
  const key = settings.inclusionMode ? 'inclusionList' : 'exclusionList';
  const list = settings[key] ?? [];
  if (hostnameInList(host, list)) return null;
  return { [key]: [...list, host] };
}

// Toolbar click: global toggle; in inclusion mode + per-site toggle it flips
// the current host in the inclusion list instead. Removal drops the host and
// any parent entry governing it; sibling/child entries stay (D4).
export function toolbarClickPatch(settings, url) {
  if (!(settings.inclusionMode && settings.perSiteToggle)) {
    return { state: settings.state === 'dark' ? 'light' : 'dark' };
  }
  const host = hostnameFromUrl(url);
  if (!host) return { state: settings.state === 'dark' ? 'light' : 'dark' };
  const list = settings.inclusionList ?? [];
  if (!hostnameInList(host, list)) return { inclusionList: [...list, host] };
  const kept = list.filter((e) => {
    const ne = normalizeHostname(e);
    return !(host === ne || host.endsWith(`.${ne}`));
  });
  return { inclusionList: kept };
}
