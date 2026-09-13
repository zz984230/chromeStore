// src/content/engine/fetchCss.js
// Cross-origin stylesheet recovery (M2-BEHAVIOR §5): cssRules of cross-origin
// sheets throw, so the text is fetched (same-origin directly from the page,
// cross-origin via the background service worker which holds
// host_permissions) and re-inserted as a cloned <style> for scanning.

const RELATIVE_URL_RE = /url\((?!['"]?(?:data:|https?:|\/\/))(['"]?)([^'")]*)\1\)/g;

export function absolutizeUrls(css, baseUrl) {
  return css.replace(RELATIVE_URL_RE, (match, q, path) => {
    try { return `url(${q}${new URL(path, baseUrl).href}${q})`; } catch { return match; }
  });
}

export function shouldFetch(href) {
  if (!href) return false;
  let abs = href;
  if (href.startsWith('//')) abs = `https:${href}`;
  if (!/^https?:/i.test(abs)) return false;
  const relative = abs.replace(/^.*:\/\//i, '');
  const notFont = !/font\.|font-|\/font/i.test(abs) && !/fonts\.|fonts-|\/fonts/i.test(abs);
  return abs.endsWith('.css') || notFont;
}

async function sendViaRuntime(href) {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'nv-engine-fetch-css', href }, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false });
      else resolve(res ?? { ok: false });
    });
  });
}

export async function fetchRemoteCss(href, { fetchImpl = (...a) => fetch(...a), sendToBackground = sendViaRuntime } = {}) {
  if (!shouldFetch(href)) return null;
  const abs = href.startsWith('//') ? `https:${href}` : href;
  // Node tests have no `document`; no document is treated as cross-origin
  // (background proxy path) per the controller resolution.
  if (typeof document !== 'undefined' && new URL(abs, document.location.href).origin === document.location.origin) {
    try {
      const response = await fetchImpl(abs, { cache: 'default' });
      if (response?.ok) {
        let content = await response.text();
        if (content.includes('\x00')) {
          const buffer = await response.clone().arrayBuffer();
          content = buffer ? new TextDecoder('utf-16').decode(buffer) : content;
        }
        if (content.includes('<!DOCTYPE html>')) return null;
        return content;
      }
    } catch { /* fall through to background proxy */ }
  }
  const viaBg = await sendToBackground(abs);
  if (viaBg?.ok && viaBg.content && !viaBg.content.includes('<!DOCTYPE html>')) return viaBg.content;
  return null;
}
