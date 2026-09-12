// src/shared/scope.js
// Where dark may apply: global state × (inclusion mode ? inclusion list :
// exclusion list). Hostnames compare after normalizeHostname; a list entry
// covers the entry domain itself and all its subdomains (dot-boundary suffix).
export function normalizeHostname(hostname) {
  return String(hostname ?? '').trim().toLowerCase().replace(/^www\./, '');
}

export function hostnameInList(hostname, list) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return (list ?? []).some((entry) => {
    const e = normalizeHostname(entry);
    if (!e) return false;
    return host === e || host.endsWith(`.${e}`);
  });
}

export function siteDarkActive(settings, hostname) {
  if (settings.state !== 'dark') return false;
  return settings.inclusionMode
    ? hostnameInList(hostname, settings.inclusionList)
    : !hostnameInList(hostname, settings.exclusionList);
}
