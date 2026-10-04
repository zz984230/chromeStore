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

// M2-BEHAVIOR §1: which side owns a site's colors under the adaptive engine —
// respect → a usable site theme wins; ignore → the engine always;
// skip-compatible → the engine, except on compatible-marked sites. `site` is
// the matched site theme, null when none applies or the user disabled it.
export function engineOwnsSite(policy, site) {
  if (!site) return true;
  if (policy === 'ignore') return true;
  if (policy === 'respect') return false;
  return Boolean(site.compatible);
}
