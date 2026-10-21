// src/tools/diff/shared/strings.js — 对比工具动态文案单源(静态骨架字面量在 diff.html,与 popup 惯例一致);数字自 GUARDS 组合
import { GUARDS } from './guards.js';

export const DIFF_STRINGS = Object.freeze({
  hint: '在两栏各粘贴一段文本，点「对比」',
  identical: '两栏一致',
  diffCount: '{n} 处差异',
  degraded: '差异过大，已按整块呈现（公共首尾除外）',
  sideLeft: '左栏',
  sideRight: '右栏',
  fmtJson: 'JSON',
  tooManyLines: `{side}超出规模：单栏最多 ${GUARDS.MAX_LINES} 行`,
  tooManyBytes: `{side}超出规模：单栏最多 ${GUARDS.MAX_UTF16} 个字符（UTF-16 码元计）`,
  expandedLines: `{side}归一化后超限：展开超过 ${GUARDS.MAX_LINES} 行，无法对比`,
  expandedBytes: `{side}归一化后超限：展开超过 ${GUARDS.MAX_UTF16} 个字符，无法对比`,
  syntaxFail: '{side}不是合法 {fmt}{pos}',
  unsupportedFail: '{side}的 {fmt} 用法超出支持子集：{detail}',
  readFileFail: '读取文件失败，请重试',
  adoptLeft: '→ 以左为准',
  adoptRight: '← 以右为准',
});
