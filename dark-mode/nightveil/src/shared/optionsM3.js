// src/shared/optionsM3.js
// M3 选项页的控件表与纯辅助（渲染在 src/options/main.js；本模块 node --test 直测）。
import { STRINGS } from './strings.js';

export const SECTION_ORDER = ['sec-themes', 'sec-options', 'sec-usercss', 'sec-engine', 'sec-exclusion', 'sec-inclusion', 'sec-schedule'];
export const sectionKeyOf = (sectionId) => sectionId.slice('sec-'.length);

export const FLASHGUARD_MODES = [
  { value: 'simple-dark', label: STRINGS.guardModeSimpleLabel },
  { value: 'hide', label: STRINGS.guardModeHideLabel },
  { value: 'brightness', label: STRINGS.guardModeBrightnessLabel },
];

export function parseHostList(text) {
  const list = String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  return [...new Set(list)];
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// 主题三席卡片（M3+ 首屏）：themeId 值域与席位 UI 的映射。
export const SEAT_CARDS = [
  { themeId: 'adaptive', title: STRINGS.themeSeatEngineLabel, desc: STRINGS.themeSeatEngineDesc },
  { themeId: 'classic', title: STRINGS.themeSeatClassicLabel, desc: STRINGS.themeSeatClassicDesc },
  { themeId: 'custom', title: STRINGS.themeSeatCustomLabel, desc: STRINGS.themeSeatCustomDesc },
];
