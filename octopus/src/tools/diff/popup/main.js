// src/tools/diff/popup/main.js — 启动器:一键打开工作页(ADR-0005;http 预览态降级禁用)
const btn = document.getElementById('diff-open');
const tabs = globalThis.chrome?.tabs;
const url = globalThis.chrome?.runtime?.getURL?.('diff.html');
if (btn && (!tabs?.create || !url)) {
  btn.disabled = true; // 预览降级:无 chrome API 时不可点(与 pace 弹窗的 data-preview 同语言)
  document.body?.setAttribute('data-preview', '');
}
btn?.addEventListener('click', () => {
  if (tabs?.create && url) tabs.create({ url });
});
