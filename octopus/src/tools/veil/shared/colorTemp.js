// src/shared/colorTemp.js
// 色温层纯决策面（M3-BEHAVIOR §1）。CSS 字面来自原版 inject.css:59-79；
// 变量名按 nightveil 前缀约定改为 --nv-ct-*（内部实现细节，行为不变）。
import { normalizeHostname } from './scope.js';

export const COLORTEMP_STYLE_ID = 'nv-colortemp';
export const COLORTEMP_ATTR = 'data-nv-colortemp';
export const COLORTEMP_OVERLAY_CLASS = 'nv-colortemp-overlay';

export const COLORTEMP_CSS = `html[data-nv-colortemp] .nv-colortemp-overlay {
  border: 0 !important; top: -10% !important; margin: 0 !important; opacity: 1 !important;
  padding: 0 !important; right: -10% !important; width: 120% !important; height: 120% !important;
  outline: none !important; display: block !important; position: fixed !important; border-radius: 0 !important;
  box-shadow: none !important; text-shadow: none !important; z-index: 2147483647 !important;
  pointer-events: none !important; transition: opacity 0.1s !important; mix-blend-mode: multiply !important;
  background: rgba(var(--nv-ct-red), var(--nv-ct-green), var(--nv-ct-blue), var(--nv-ct-opacity)) !important;
}`;

// 排除表精确等值匹配（去 www.、大小写归一；无子域通配）——§10-2。
export function colorTempExcluded(settings, hostname) {
  const host = normalizeHostname(hostname);
  return (settings.colorTemperature?.excludedHosts ?? [])
    .some((h) => normalizeHostname(h) === host);
}

// 挂载判定（§1.2 / §10-1）：亮色态默认渲染；dark 态仅「包含模式未命中」
// 分支保留（原版 inject.js:824/847-849 分支结构——排除命中/规则排除不重建）。
export function shouldRenderColorTemp(settings, hostname) {
  const ct = settings.colorTemperature;
  if (!ct?.enabled) return false;
  if (colorTempExcluded(settings, hostname)) return false;
  if (settings.state === 'light') return true;
  if (settings.state !== 'dark') return false;
  if (!settings.inclusionMode) return false;
  const host = normalizeHostname(hostname);
  return !(settings.inclusionList ?? []).some((h) => normalizeHostname(h) === host);
}
