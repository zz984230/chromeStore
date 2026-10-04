// src/shared/flashGuard.js
// 防白闪完整版的纯决策面（M3-BEHAVIOR §2；CSS 字面来自原版 inject.css:1-55）。
// nightveil 用内容脚本注入 <style> 文本实现（等价于原版 document_start 常驻
// CSS + html 属性切换：注入即生效、移除即消失，无需属性间接层）。
export const GUARD_MODES = ['simple-dark', 'hide', 'brightness'];

// mode CSS。bg 仅用于 html 背景（R2 拍板：simple/hide 的 html 背景沿用 nightveil
// M1 已接受的调色板感知版本；`*` 级规则与 brightness 模式字面照抄原版）。
export function guardCssFor(mode, bg) {
  if (mode === 'brightness') {
    return 'html { height: 100vh !important; color-scheme: dark !important; filter: brightness(0.25) !important; }';
  }
  const base = `html { filter: none !important; height: 100vh !important; transition: none !important; color-scheme: dark !important; background-color: ${bg} !important; }`;
  if (mode === 'hide') return `${base}\nhtml * { display: none !important; }`;
  return `${base}\nhtml * { color: #eeeeee !important; border-color: #555555 !important; background-color: #292929 !important; }\n`
    + 'html video, html input, html textarea { border-color: transparent !important; background-color: transparent !important; }';
}

// 挂载判定（§2.3）：总开关 × 仅顶层帧 × recheck 渲染不重挂。
export function shouldArmGuard(settings, { isTopFrame, isRecheckRender }) {
  if (!settings.flashGuard?.enabled) return false;
  if (!isTopFrame) return false;
  if (isRecheckRender) return false;
  return true;
}
